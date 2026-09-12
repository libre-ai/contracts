// Authority-fixture verifier, not a product SDK or an implementation admission.
import { createHash, createPublicKey, verify } from "node:crypto";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { canonicalJson } from "./authorized-execution";
import { parseStrictJson } from "./policy-core-raw-inputs";

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const name of [
  "common.v1",
  "build-brief-body.v2",
  "build-brief-acceptance.v2",
  "spec-package.v2",
  "agent-handoff.v2",
]) {
  ajv.addSchema(
    await Bun.file(new URL(`../../contracts/schemas/${name}.schema.json`, import.meta.url)).json(),
  );
}
export interface CandidateContext {
  organization: string;
  now: string;
  policyDigest: string;
  contributors: readonly string[];
  keys: readonly {
    id: string;
    publicKey: string;
    organization: string;
    approver: string;
    membershipRevision: number;
    status: "active" | "revoked";
    validFrom: string;
    validUntil: string;
  }[];
}
interface Body {
  id: string;
  tenantId: string;
  version: number;
  contributors: string[];
  requirements: { id: string }[];
  decisions: { id: string }[];
  risks: { id: string }[];
  acceptanceCriteria: { id: string }[];
}
interface Acceptance {
  statement: {
    schemaVersion: string;
    id: string;
    tenantId: string;
    specPackageId: string;
    specPackageVersion: number;
    subjectDigest: string;
    approverId: string;
    acceptedAt: string;
    membershipRevision: number;
    policyDigest: string;
    signingKeyId: string;
  };
  signature: string;
}
interface Package {
  body: Body;
  bodyDigest: string;
  acceptances: Acceptance[];
}
interface Handoff {
  tenantId: string;
  specPackageId: string;
  specPackageVersion: number;
  specPackageDigest: string;
  acceptanceDigest: string;
  acceptanceCriteria: string[];
  createdAt: string;
  expiresAt: string;
}
export function buildBriefDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function parseWire(raw: Uint8Array): unknown {
  if (raw.byteLength > 2 * 1024 * 1024) throw new Error("input");
  const value = parseStrictJson(raw, 32);
  if (new TextDecoder("utf-8", { fatal: true }).decode(raw) !== canonicalJson(value))
    throw new Error("input");
  return value;
}
function schema(name: string, value: unknown): boolean {
  return ajv.validate(`https://contracts.libre-ai.fr/schemas/${name}.v2.schema.json`, value);
}
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return (
    new Set(a).size === a.length &&
    new Set(b).size === b.length &&
    a.length === b.length &&
    a.every((item) => b.includes(item))
  );
}
export function verifyBuildBriefCandidate(
  raw: Uint8Array,
  context: CandidateContext,
  handoffRaw?: Uint8Array,
): readonly string[] {
  let input: unknown;
  let handoffInput: unknown;
  try {
    input = parseWire(raw);
    if (handoffRaw !== undefined) handoffInput = parseWire(handoffRaw);
  } catch {
    return ["build-brief.input-invalid"];
  }
  if (!schema("spec-package", input)) return ["build-brief.schema-invalid"];
  if (handoffRaw !== undefined && !schema("agent-handoff", handoffInput))
    return ["build-brief.handoff-invalid"];
  const value = input as Package;
  const body = value.body;
  if (buildBriefDigest(body) !== value.bodyDigest) return ["build-brief.digest-invalid"];
  const now = Date.parse(context.now);
  if (
    !Number.isFinite(now) ||
    body.tenantId !== context.organization ||
    !sameSet(body.contributors, context.contributors) ||
    new Set(context.keys.map((key) => key.id)).size !== context.keys.length
  )
    return ["build-brief.context-invalid"];
  for (const items of [body.requirements, body.decisions, body.risks, body.acceptanceCriteria]) {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      return ["build-brief.semantic-invalid"];
  }
  if (new Set(value.acceptances.map((item) => item.statement.id)).size !== value.acceptances.length)
    return ["build-brief.acceptance-invalid"];
  for (const receipt of value.acceptances) {
    const statement = receipt.statement;
    const key = context.keys.find((item) => item.id === statement.signingKeyId);
    const acceptedAt = Date.parse(statement.acceptedAt);
    if (
      statement.tenantId !== body.tenantId ||
      statement.specPackageId !== body.id ||
      statement.specPackageVersion !== body.version ||
      statement.subjectDigest !== value.bodyDigest ||
      statement.policyDigest !== context.policyDigest ||
      !Number.isFinite(acceptedAt) ||
      acceptedAt > now ||
      body.contributors.includes(statement.approverId) ||
      !key ||
      key.status !== "active" ||
      key.organization !== body.tenantId ||
      key.approver !== statement.approverId ||
      key.membershipRevision !== statement.membershipRevision ||
      !Number.isFinite(Date.parse(key.validFrom)) ||
      !Number.isFinite(Date.parse(key.validUntil)) ||
      Date.parse(key.validFrom) > acceptedAt ||
      Date.parse(key.validUntil) <= acceptedAt
    )
      return ["build-brief.acceptance-invalid"];
    try {
      const publicBytes = Buffer.from(key.publicKey, "base64url");
      const signature = Buffer.from(receipt.signature, "base64url");
      if (
        publicBytes.length !== 32 ||
        publicBytes.toString("base64url") !== key.publicKey ||
        signature.length !== 64 ||
        signature.toString("base64url") !== receipt.signature
      )
        return ["build-brief.signature-invalid"];
      const publicKey = createPublicKey({
        key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicBytes]),
        format: "der",
        type: "spki",
      });
      const message = Buffer.concat([
        Buffer.from(statement.schemaVersion, "utf8"),
        Buffer.from([0]),
        Buffer.from(buildBriefDigest(statement), "hex"),
      ]);
      if (!verify(null, message, publicKey, signature)) return ["build-brief.signature-invalid"];
    } catch {
      return ["build-brief.signature-invalid"];
    }
  }
  if (handoffRaw !== undefined) {
    const handoff = handoffInput as Handoff;
    const receipt = value.acceptances.find(
      (item) => buildBriefDigest(item) === handoff.acceptanceDigest,
    );
    const createdAt = Date.parse(handoff.createdAt),
      expiresAt = Date.parse(handoff.expiresAt);
    if (
      handoff.tenantId !== body.tenantId ||
      handoff.specPackageId !== body.id ||
      handoff.specPackageVersion !== body.version ||
      handoff.specPackageDigest !== value.bodyDigest ||
      !sameSet(
        handoff.acceptanceCriteria,
        body.acceptanceCriteria.map((item) => item.id),
      ) ||
      !receipt ||
      !Number.isFinite(createdAt) ||
      !Number.isFinite(expiresAt) ||
      createdAt < Date.parse(receipt.statement.acceptedAt) ||
      createdAt > now ||
      expiresAt <= now ||
      expiresAt <= createdAt
    )
      return ["build-brief.handoff-invalid"];
  }
  return [];
}
