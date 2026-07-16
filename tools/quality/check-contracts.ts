import { basename, dirname, join, normalize } from "node:path";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

type JsonRecord = Record<string, unknown>;
type ContractKind =
  | "json-schema"
  | "data-policy"
  | "openapi"
  | "wit"
  | "biscuit-authority"
  | "biscuit-policy";
type CatalogEntry = {
  id: string;
  kind: ContractKind;
  path: string;
  owners: string[];
  consumers: string[];
  compatibility: "additive-v1" | "major-versioned";
  classification: "public" | "internal" | "local" | "personal" | "tenant-private" | "mixed";
  status: "locked";
};
type FixtureMutation = { name: string; path: string; value?: unknown; remove?: boolean };
type FixtureCase = { schema: string; valid: JsonRecord; invalidMutations: FixtureMutation[] };

const failures: string[] = [];
const schemaByName = new Map<string, JsonRecord>();
const validatorByName = new Map<string, ValidateFunction>();
const operationIds = new Set<string>();
const retentionExpectations: Record<string, Record<string, unknown>> = {
  "browser-session": { mode: "fixed", defaultRetention: "P1D", maximumActiveHours: 12 },
  "practices-progress": { mode: "until-delete" },
  "radar-body": { mode: "immediate" },
  "radar-quarantine": { mode: "fixed", defaultRetention: "P7D" },
  "radar-normalized": {
    mode: "fixed",
    defaultRetention: "P90D",
    "configurable.minimum": "P7D",
    "configurable.maximum": "P365D",
  },
  "notebook-content": { mode: "until-delete" },
  "boussole-local": { mode: "until-delete" },
  "sessions-presence": { mode: "fixed", defaultRetention: "P1D" },
  "sessions-content": {
    mode: "fixed",
    defaultRetention: "P90D",
    "configurable.minimum": "P7D",
    "configurable.maximum": "P365D",
  },
  "model-snapshot": { mode: "while-referenced", postReferenceRetention: "P5Y" },
  "spec-package": { mode: "while-referenced", postReferenceRetention: "P5Y" },
  "mission-record": { mode: "fixed", defaultRetention: "P1Y", "configurable.maximum": "P6Y" },
  "operational-log": { mode: "fixed", defaultRetention: "P30D" },
  "proof-artifact": { mode: "while-referenced" },
  "encrypted-backup": { mode: "fixed", defaultRetention: "P35D" },
};
const allowedLocalOperationsByApp: Record<string, string[]> = {
  website: ["CompilePublicCorpus", "PublishStaticCandidate", "InvalidateSearchProjection"],
  practices: [
    "StartPracticeSession",
    "SubmitActivityResponse",
    "RecordSelfAssessment",
    "ExportProgress",
    "DeleteProgress",
    "GetLocalProgress",
    "GetFeedbackExplanation",
  ],
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkArrayBounds(value: unknown, authority: string, pointer = ""): void {
  if (!isRecord(value)) return;
  if (value.type === "array" && value.maxItems === undefined && !pointer.includes("/allOf/")) {
    failures.push(`${authority}#${pointer || "/"}: unbounded array`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (isRecord(child)) checkArrayBounds(child, authority, `${pointer}/${key}`);
    else if (Array.isArray(child)) {
      for (const [index, item] of child.entries())
        checkArrayBounds(item, authority, `${pointer}/${key}/${index}`);
    }
  }
}

function propertyAt(value: unknown, dottedPath: string): unknown {
  let current = value;
  for (const segment of dottedPath.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function safeErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .slice(0, 5)
    .map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`)
    .join("; ");
}

async function scan(pattern: string): Promise<string[]> {
  const paths: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({ cwd: ".", onlyFiles: true }))
    paths.push(path);
  return paths.sort();
}

function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string")
  ) {
    failures.push(`${label}: expected a non-empty string array`);
    return [];
  }
  return value as string[];
}

function mutate(input: JsonRecord, mutation: FixtureMutation): JsonRecord {
  const output = structuredClone(input);
  const segments = mutation.path
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let target: unknown = output;
  for (const segment of segments.slice(0, -1)) {
    if ((!isRecord(target) && !Array.isArray(target)) || !(segment in target)) {
      throw new Error(`mutation path does not exist: ${mutation.path}`);
    }
    target = target[segment as keyof typeof target];
  }
  const key = segments.at(-1);
  if (!key || (!isRecord(target) && !Array.isArray(target)))
    throw new Error(`invalid mutation path: ${mutation.path}`);
  if (mutation.remove) {
    if (Array.isArray(target)) target.splice(Number(key), 1);
    else delete target[key];
  } else {
    target[key as keyof typeof target] = mutation.value as never;
  }
  return output;
}

const rawCatalog = await Bun.file("contracts/catalog.v1.json").json();
if (
  !isRecord(rawCatalog) ||
  rawCatalog.schemaVersion !== "libre-ai.contract-catalog.v1" ||
  !Array.isArray(rawCatalog.contracts)
) {
  failures.push("contracts/catalog.v1.json: invalid catalog envelope");
}
const entries = (
  isRecord(rawCatalog) && Array.isArray(rawCatalog.contracts) ? rawCatalog.contracts : []
) as CatalogEntry[];
const ids = new Set<string>();
const catalogPaths = new Set<string>();
const entryByPath = new Map<string, CatalogEntry>();
const kinds = new Set<ContractKind>([
  "json-schema",
  "data-policy",
  "openapi",
  "wit",
  "biscuit-authority",
  "biscuit-policy",
]);
for (const [index, entry] of entries.entries()) {
  const label = `contracts/catalog.v1.json#/contracts/${index}`;
  if (!isRecord(entry)) {
    failures.push(`${label}: expected object`);
    continue;
  }
  if (typeof entry.id !== "string" || !/^[a-z][a-z0-9-]*-v1$/.test(entry.id))
    failures.push(`${label}: invalid id`);
  else if (ids.has(entry.id)) failures.push(`${label}: duplicate id ${entry.id}`);
  else ids.add(entry.id);
  if (
    typeof entry.path !== "string" ||
    !entry.path.startsWith("contracts/") ||
    normalize(entry.path) !== entry.path ||
    entry.path.includes("..")
  ) {
    failures.push(`${label}: unsafe authority path`);
  } else if (catalogPaths.has(entry.path)) failures.push(`${label}: duplicate path ${entry.path}`);
  else {
    catalogPaths.add(entry.path);
    entryByPath.set(entry.path, entry);
    if (!(await Bun.file(entry.path).exists()))
      failures.push(`${label}: missing authority ${entry.path}`);
  }
  if (!kinds.has(entry.kind)) failures.push(`${label}: unknown kind`);
  stringArray(entry.owners, `${label}/owners`);
  stringArray(entry.consumers, `${label}/consumers`);
  if (!(["additive-v1", "major-versioned"] as const).includes(entry.compatibility))
    failures.push(`${label}: invalid compatibility`);
  if (
    !(["public", "internal", "local", "personal", "tenant-private", "mixed"] as const).includes(
      entry.classification,
    )
  )
    failures.push(`${label}: invalid classification`);
  if (entry.status !== "locked") failures.push(`${label}: contract is not locked`);
}

const managedPaths = (
  await Promise.all([
    scan("contracts/schemas/*.json"),
    scan("contracts/data/*.json"),
    scan("contracts/openapi/*.yaml"),
    scan("contracts/wit/*/world.wit"),
    scan("contracts/authz/*.datalog"),
  ])
).flat();
for (const path of managedPaths) {
  if (!catalogPaths.has(path)) failures.push(`${path}: missing from contract catalog`);
  const kind = entryByPath.get(path)?.kind;
  const validKind =
    (path.startsWith("contracts/schemas/") && kind === "json-schema") ||
    (path.startsWith("contracts/data/") && kind === "data-policy") ||
    (path.startsWith("contracts/openapi/") && kind === "openapi") ||
    (path.startsWith("contracts/wit/") && kind === "wit") ||
    (path.startsWith("contracts/authz/") &&
      (kind === "biscuit-authority" || kind === "biscuit-policy"));
  if (!validKind) failures.push(`${path}: catalog kind does not match authority root`);
}
for (const path of catalogPaths)
  if (!managedPaths.includes(path))
    failures.push(`${path}: catalog path is outside a managed contract root`);

const schemaPaths = managedPaths.filter((path) => path.startsWith("contracts/schemas/"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const path of schemaPaths) {
  try {
    const schema = (await Bun.file(path).json()) as JsonRecord;
    const name = basename(path);
    schemaByName.set(name, schema);
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema")
      failures.push(`${path}: must use JSON Schema 2020-12`);
    if (
      typeof schema.$id !== "string" ||
      schema.$id !== `https://contracts.libre-ai.fr/schemas/${name}`
    )
      failures.push(`${path}: non-canonical $id`);
    if (typeof schema.title !== "string" || schema.title.length === 0)
      failures.push(`${path}: missing title`);
    checkArrayBounds(schema, path);
    ajv.addSchema(schema);
  } catch (error) {
    failures.push(`${path}: cannot add schema: ${String(error)}`);
  }
}
for (const [name, schema] of schemaByName) {
  try {
    const validate = ajv.getSchema(schema.$id as string);
    if (!validate) failures.push(`contracts/schemas/${name}: schema did not compile`);
    else validatorByName.set(name, validate);
  } catch (error) {
    failures.push(`contracts/schemas/${name}: strict compilation failed: ${String(error)}`);
  }
}

const rawFixtures = await Bun.file("contracts/fixtures/schema-fixtures.v1.json").json();
const fixtureCases = (
  isRecord(rawFixtures) &&
  rawFixtures.schemaVersion === "libre-ai.schema-fixtures.v1" &&
  Array.isArray(rawFixtures.cases)
    ? rawFixtures.cases
    : []
) as FixtureCase[];
if (fixtureCases.length === 0)
  failures.push("contracts/fixtures/schema-fixtures.v1.json: no fixtures");
const fixtureNames = new Set<string>();
for (const fixture of fixtureCases) {
  const label = `fixture:${fixture.schema}`;
  if (fixtureNames.has(fixture.schema)) failures.push(`${label}: duplicate fixture`);
  fixtureNames.add(fixture.schema);
  const validate = validatorByName.get(fixture.schema);
  if (!validate) {
    failures.push(`${label}: unknown schema`);
    continue;
  }
  if (!isRecord(fixture.valid) || !validate(fixture.valid))
    failures.push(`${label}: valid fixture rejected: ${safeErrors(validate.errors)}`);
  if (validate(null)) failures.push(`${label}: malformed root accepted`);
  const unexpected = { ...structuredClone(fixture.valid), __unexpected: true };
  if (validate(unexpected)) failures.push(`${label}: root unknown property accepted`);
  if (!Array.isArray(fixture.invalidMutations) || fixture.invalidMutations.length === 0) {
    failures.push(`${label}: missing explicit negative fixture`);
    continue;
  }
  for (const mutation of fixture.invalidMutations) {
    try {
      const invalid = mutate(fixture.valid, mutation);
      if (validate(invalid)) failures.push(`${label}:${mutation.name}: negative fixture accepted`);
    } catch (error) {
      failures.push(`${label}:${mutation.name}: ${String(error)}`);
    }
  }
}
for (const name of schemaByName.keys()) {
  if (name !== "common.v1.schema.json" && !fixtureNames.has(name))
    failures.push(`${name}: missing positive/negative fixture pair`);
}

const retentionValidator = validatorByName.get("retention-policy.v1.schema.json");
for (const path of managedPaths.filter((item) => item.startsWith("contracts/data/"))) {
  try {
    const policy = await Bun.file(path).json();
    if (!retentionValidator?.(policy)) {
      failures.push(`${path}: invalid retention policy: ${safeErrors(retentionValidator?.errors)}`);
      continue;
    }
    if (!isRecord(policy)) {
      failures.push(`${path}: retention policy root must be an object`);
      continue;
    }
    const rules = Array.isArray(policy.rules) ? policy.rules : [];
    const retentionRules = rules.filter(isRecord);
    const ruleIds = retentionRules.map((rule) => rule.id);
    if (new Set(ruleIds).size !== ruleIds.length)
      failures.push(`${path}: duplicate retention rule id`);
    if (new Set(ruleIds).size !== Object.keys(retentionExpectations).length)
      failures.push(`${path}: retention rule inventory diverges from ADR-0002`);
    for (const [ruleId, expected] of Object.entries(retentionExpectations)) {
      const rule = retentionRules.find((candidate) => candidate.id === ruleId);
      if (!rule) {
        failures.push(`${path}: missing ADR-0002 retention rule ${ruleId}`);
        continue;
      }
      for (const [field, expectedValue] of Object.entries(expected)) {
        if (propertyAt(rule, field) !== expectedValue)
          failures.push(`${path}: ${ruleId}.${field} diverges from ADR-0002`);
      }
    }
    const backupRule = rules.find((rule) => isRecord(rule) && rule.id === "encrypted-backup");
    if (!isRecord(backupRule) || backupRule.defaultRetention !== policy.backupExpiry) {
      failures.push(`${path}: backup rule diverges from backup expiry ceiling`);
    }
  } catch (error) {
    failures.push(`${path}: invalid JSON: ${String(error)}`);
  }
}

const appContractReferences = new Set<string>();
for (const path of await scan("docs/apps/*.md")) {
  const text = await Bun.file(path).text();
  for (const match of text.matchAll(/contracts\/[A-Za-z0-9_./-]+/g))
    appContractReferences.add(match[0]);
}
for (const path of appContractReferences)
  if (!(await Bun.file(path).exists()))
    failures.push(`${path}: application references missing contract`);

const yamlApi = (Bun as unknown as { YAML: { parse(text: string): unknown } }).YAML;
const methods = ["get", "post", "put", "patch", "delete"];
for (const path of managedPaths.filter((item) => item.startsWith("contracts/openapi/"))) {
  let document: JsonRecord;
  const text = await Bun.file(path).text();
  try {
    const parsed = yamlApi.parse(text);
    if (!isRecord(parsed)) throw new Error("root is not an object");
    document = parsed;
  } catch (error) {
    failures.push(`${path}: invalid YAML: ${String(error)}`);
    continue;
  }
  if (document.openapi !== "3.1.0") failures.push(`${path}: OpenAPI must be 3.1.0`);
  if (!isRecord(document.info) || document.info.version !== "1.0.0")
    failures.push(`${path}: API major/version mismatch`);
  if (!isRecord(document.paths) || Object.keys(document.paths).length === 0)
    failures.push(`${path}: no paths`);
  if (text.includes("additionalProperties: true"))
    failures.push(`${path}: unbounded additional properties`);

  const domain = document["x-libre-ai-domain"];
  const commands = isRecord(domain) ? stringArray(domain.commands, `${path}: domain commands`) : [];
  const queries = isRecord(domain) ? stringArray(domain.queries, `${path}: domain queries`) : [];
  const localOperations = Array.isArray(document["x-libre-ai-local"])
    ? stringArray(document["x-libre-ai-local"], `${path}: local operations`)
    : [];
  const mappedDomainOperations = new Set<string>();
  const domainMappingCounts = new Map<string, number>();
  const appName = basename(path, ".v1.yaml");
  const allowedLocal = [...(allowedLocalOperationsByApp[appName] ?? [])].sort();
  if (JSON.stringify([...localOperations].sort()) !== JSON.stringify(allowedLocal)) {
    failures.push(`${path}: local operation boundary diverges from the accepted application model`);
  }
  const appPath =
    appName === "auth"
      ? "docs/specifications/IDENTITY-AUTHORIZATION.md"
      : `docs/apps/${appName}.md`;
  if (await Bun.file(appPath).exists()) {
    const spec = await Bun.file(appPath).text();
    for (const [label, actual] of [
      ["Commands", commands],
      ["Queries", queries],
    ] as const) {
      const line = spec.match(new RegExp(`\\*\\*${label}:\\*\\* ([^\\n]+)`))?.[1] ?? "";
      const expected = [...line.matchAll(/`([A-Z][A-Za-z0-9]+)`/g)].map((match) => match[1]).sort();
      if (JSON.stringify([...actual].sort()) !== JSON.stringify(expected))
        failures.push(`${path}: ${label.toLowerCase()} diverge from ${appPath}`);
    }
  } else {
    failures.push(`${path}: missing protocol authority ${appPath}`);
  }

  for (const [route, rawPathItem] of Object.entries(
    (isRecord(document.paths) ? document.paths : {}) as JsonRecord,
  )) {
    if (!route.startsWith("/v1/")) failures.push(`${path}: unversioned route ${route}`);
    if (!isRecord(rawPathItem)) continue;
    for (const method of methods) {
      const rawOperation = rawPathItem[method];
      if (!isRecord(rawOperation)) continue;
      const operationId = rawOperation.operationId;
      if (typeof operationId !== "string" || !/^[a-z][A-Za-z0-9]+$/.test(operationId))
        failures.push(`${path}:${method}:${route}: invalid operationId`);
      else if (operationIds.has(operationId))
        failures.push(`${path}:${method}:${route}: duplicate operationId ${operationId}`);
      else operationIds.add(operationId);
      const declaredMappings = rawOperation["x-libre-ai-operations"];
      const mappings = Array.isArray(declaredMappings)
        ? stringArray(declaredMappings, `${path}:${method}:${route}: domain mappings`)
        : typeof operationId === "string"
          ? [`${operationId.charAt(0).toUpperCase()}${operationId.slice(1)}`]
          : [];
      for (const mapping of mappings) {
        mappedDomainOperations.add(mapping);
        domainMappingCounts.set(mapping, (domainMappingCounts.get(mapping) ?? 0) + 1);
      }
      const stateChangingGet = rawOperation["x-libre-ai-state-changing"] === true;
      if (
        method === "get" &&
        mappings.some((mapping) => commands.includes(mapping)) &&
        !stateChangingGet
      )
        failures.push(`${path}:${method}:${route}: command exposed as a non-state-changing GET`);
      if (
        stateChangingGet &&
        !(path.endsWith("/auth.v1.yaml") && route === "/v1/auth/callback" && method === "get")
      )
        failures.push(`${path}:${method}:${route}: unauthorized state-changing GET exception`);
      if (!isRecord(rawOperation.responses) || Object.keys(rawOperation.responses).length === 0)
        failures.push(`${path}:${method}:${route}: no responses`);
      if (method !== "get") {
        const parameterRefs = (
          Array.isArray(rawOperation.parameters) ? rawOperation.parameters : []
        )
          .filter(isRecord)
          .map((parameter) => parameter.$ref);
        for (const required of [
          "#/components/parameters/IdempotencyKey",
          "#/components/parameters/Revision",
        ]) {
          if (!parameterRefs.includes(required))
            failures.push(`${path}:${method}:${route}: missing ${required}`);
        }
        const security = Array.isArray(rawOperation.security) ? rawOperation.security : [];
        const browserMutation = security.some((item) => isRecord(item) && "sessionCookie" in item);
        if (browserMutation && !parameterRefs.includes("#/components/parameters/CsrfToken"))
          failures.push(`${path}:${method}:${route}: missing CSRF token`);
        if (!isRecord(rawOperation.responses) || !("default" in rawOperation.responses))
          failures.push(`${path}:${method}:${route}: missing refusal response`);
      }
    }
  }

  for (const [mapping, count] of domainMappingCounts) {
    if (count > 1) failures.push(`${path}: domain operation ${mapping} is mapped ${count} times`);
  }
  const declaredDomainOperations = new Set([...commands, ...queries]);
  for (const local of localOperations) {
    if (!declaredDomainOperations.has(local))
      failures.push(`${path}: unknown local operation ${local}`);
  }
  const expectedHttpOperations = [...declaredDomainOperations]
    .filter((operation) => !localOperations.includes(operation))
    .sort();
  const actualHttpOperations = [...mappedDomainOperations].sort();
  if (JSON.stringify(actualHttpOperations) !== JSON.stringify(expectedHttpOperations)) {
    const missing = expectedHttpOperations.filter(
      (operation) => !mappedDomainOperations.has(operation),
    );
    const unknown = actualHttpOperations.filter(
      (operation) => !declaredDomainOperations.has(operation),
    );
    failures.push(
      `${path}: incomplete HTTP domain mapping; missing=[${missing.join(", ")}], unknown=[${unknown.join(", ")}]`,
    );
  }

  for (const match of text.matchAll(/\$ref:\s+(\S+)/g)) {
    const captured = match[1];
    if (!captured) continue;
    const reference = captured.replaceAll(/["']/g, "");
    if (reference.startsWith("#")) continue;
    const fileReference = reference.split("#", 1)[0];
    if (!fileReference) continue;
    const target = normalize(join(dirname(path), fileReference));
    if (!(await Bun.file(target).exists()))
      failures.push(`${path}: unresolved external reference ${reference}`);
    if (!catalogPaths.has(target))
      failures.push(`${path}: external reference is not cataloged: ${target}`);
  }
}

for (const path of managedPaths.filter((item) => item.startsWith("contracts/wit/"))) {
  const text = await Bun.file(path).text();
  const expectedName = basename(dirname(path)).replace(/-v1$/, "");
  if (!text.includes(`package libre-ai:${expectedName}@1.0.0;`))
    failures.push(`${path}: package/version mismatch`);
  if (!text.includes(`world ${expectedName} {`)) failures.push(`${path}: world name mismatch`);
  const executable = text.replaceAll(/\/\/.*$/gm, "");
  if (/\bimport\b/.test(executable)) failures.push(`${path}: host imports are forbidden in v1`);
  if (!executable.includes("export ") || !executable.includes("result<"))
    failures.push(`${path}: missing bounded result export`);
  if (/\b(?:TODO|FIXME|TBD)\b/.test(text)) failures.push(`${path}: unresolved placeholder`);
}

for (const path of managedPaths.filter((item) => item.startsWith("contracts/authz/"))) {
  const text = await Bun.file(path).text();
  const executableLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
  if (entryByPath.get(path)?.kind === "biscuit-authority") {
    for (const required of [
      "user({user});",
      "tenant({tenant});",
      "role({user}, {role});",
      "check if time($time), $time < {expires_at};",
    ]) {
      if (!executableLines.includes(required))
        failures.push(`${path}: authority template misses ${required}`);
    }
    if (executableLines.some((line) => /^(?:allow|deny) if /.test(line)))
      failures.push(`${path}: authority block must not contain authorizer policies`);
    if (text.includes("token_id"))
      failures.push(`${path}: token-supplied revocation identifier forbidden`);
  } else {
    if (executableLines.at(-1) !== "deny if true;")
      failures.push(`${path}: final deny-by-default policy missing`);
    for (const line of executableLines.filter((item) => item.startsWith("allow if "))) {
      for (const fact of [
        "user($user)",
        "tenant($tenant)",
        "resource_tenant($tenant)",
        "role($user,",
      ]) {
        if (!line.includes(fact)) failures.push(`${path}: allow rule misses ${fact}`);
      }
    }
  }
  if (/\b(?:email|password|secret|token_value)\b/i.test(text))
    failures.push(`${path}: sensitive fact name forbidden`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(
  `Contracts verified: ${entries.length} catalog entries, ${fixtureCases.length} schema fixture pairs, ${operationIds.size} HTTP operations`,
);
