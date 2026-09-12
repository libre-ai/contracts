import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import signingVector from "../../contracts/fixtures/build-brief-v2/vectors.json";
import { canonicalJson } from "./authorized-execution";
import {
  buildBriefDigest,
  type CandidateContext,
  verifyBuildBriefCandidate,
} from "./build-brief-v2";

const apiPath = "contracts/openapi/specifications.v2.yaml";
const fixturePath = "contracts/fixtures/build-brief-api-v2/endpoints.json";
const inventoryPath = "contracts/fixtures/build-brief-api-v2/inherited.json";
interface Operation {
  operationId: string;
  parameters: { $ref: string }[];
  security: { sessionCookie: never[] }[];
  requestBody?: { required: boolean; content: Record<string, { schema: { $ref: string } }> };
  responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }>;
  "x-libre-ai-authority": Record<string, { resource: string; operation: string }>;
  "x-libre-ai-subject-states"?: string[];
}
interface Api {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, Operation>>;
  components: { parameters: Record<string, unknown>; securitySchemes: Record<string, unknown> };
}
interface Mutation {
  path: string[];
  value: unknown;
}
interface Endpoint {
  path: string;
  method: string;
  operationId: string;
  request?: unknown;
  response: unknown;
  successStatus: string;
  invalidRequests: Mutation[];
  invalidResponses: Mutation[];
}

test("Specifications v2 authority and immutable endpoint fixtures exist", async () => {
  expect(await Bun.file(apiPath).exists()).toBe(true);
  expect(await Bun.file(fixturePath).exists()).toBe(true);
});

if (await Bun.file(apiPath).exists()) {
  const api = Bun.YAML.parse(await Bun.file(apiPath).text()) as Api;
  const endpoints = (await Bun.file(fixturePath).json()).endpoints as Endpoint[];
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for await (const path of new Bun.Glob("contracts/schemas/*.json").scan()) {
    ajv.addSchema(await Bun.file(path).json());
  }
  function validator(ref: string) {
    const id = ref.replace("../schemas/", "https://contracts.libre-ai.fr/schemas/");
    const validate = ajv.getSchema(id);
    if (!validate) throw new Error("Fixture references an uncompiled schema");
    return validate;
  }
  function changed(value: unknown, mutation: Mutation): unknown {
    const result = structuredClone(value) as Record<string, unknown>;
    let parent = result;
    for (const key of mutation.path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    const last = mutation.path.at(-1);
    if (!last) throw new Error("Empty mutation path");
    parent[last] = mutation.value;
    return result;
  }
  test("v2 has ten endpoints including explicit subject discovery and no implicit security", () => {
    expect(api.openapi).toBe("3.1.0");
    expect(api.info.version).toBe("2.0.0");
    expect(endpoints.map((item) => item.operationId).sort()).toEqual([
      "acceptSpecPackage",
      "createPlanningHandoff",
      "createSpecWorkspace",
      "executePackageCommand",
      "executeSpecCommand",
      "getAcceptanceSubject",
      "getAcceptedPackage",
      "getHandoff",
      "getSpecView",
      "getSpecWorkspace",
    ]);
    expect(Object.values(api.paths).flatMap(Object.keys)).toHaveLength(10);
    expect(new Set(endpoints.map((item) => `${item.method}:${item.path}`)).size).toBe(10);
    expect(api.components.securitySchemes.sessionCookie).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "__Host-libre_ai_session",
    });
  });
  test("signing subject uses reserved package read and only frozen workspace states", () => {
    const operation = api.paths["/v2/specifications/workspaces/{workspaceId}/acceptance"]?.get;
    expect(operation).toBeDefined();
    expect(operation?.["x-libre-ai-authority"]).toEqual({
      read: { resource: "spec-package", operation: "read" },
    });
    expect(operation?.["x-libre-ai-subject-states"]).toEqual(["submitted", "accepted"]);
  });
  test("discovered canonical subject supplies the exact signed acceptance POST body and revision", () => {
    const discovery = endpoints.find((item) => item.operationId === "getAcceptanceSubject");
    expect(discovery).toBeDefined();
    if (!discovery) throw new Error("Missing discovery fixture");
    const response = discovery.response as {
      data: { body: typeof signingVector.package.body; bodyDigest: string };
      meta: { revision: number };
    };
    expect(buildBriefDigest(response.data.body)).toBe(response.data.bodyDigest);
    expect(canonicalJson(response.data.body)).toBe(signingVector.bodyCanonical);
    expect(response.meta.revision).toBe(7);
    expect(response.data.body.version).toBe(1);
    const workspace = endpoints.find((item) => item.operationId === "getSpecWorkspace")?.response as
      | { data: { id: string } }
      | undefined;
    expect(workspace).toBeDefined();
    expect(response.data.body.id).not.toBe(workspace?.data.id);
    expect(Object.keys(response.data).sort()).toEqual(["body", "bodyDigest"]);
    const receipt = signingVector.package.acceptances[0];
    if (!receipt) throw new Error("Missing signed fixture");
    expect(receipt.statement.subjectDigest).toBe(response.data.bodyDigest);
    const post = { body: response.data.body, acceptance: receipt };
    const ref =
      api.paths[discovery.path]?.post?.requestBody?.content["application/json"]?.schema.$ref;
    if (!ref) throw new Error("Missing actual acceptance request schema");
    expect(validator(ref)(post)).toBe(true);
    const headers = { "If-Match": `"${response.meta.revision}"` };
    expect(headers["If-Match"]).toBe('"7"');
    const assembled = {
      schemaVersion: "libre-ai.spec-package.v2",
      body: post.body,
      bodyDigest: response.data.bodyDigest,
      acceptances: [post.acceptance],
    };
    const bytes = (value: unknown) => Buffer.from(canonicalJson(value));
    const context = signingVector.context as CandidateContext;
    expect(verifyBuildBriefCandidate(bytes(assembled), context)).toEqual([]);
    const altered = structuredClone(assembled);
    altered.body.problem = "Changed after subject discovery";
    expect(verifyBuildBriefCandidate(bytes(altered), context)).toEqual([
      "build-brief.digest-invalid",
    ]);
    altered.bodyDigest = buildBriefDigest(altered.body);
    const acceptance = altered.acceptances[0];
    if (!acceptance) throw new Error("Missing cloned receipt");
    acceptance.statement.subjectDigest = altered.bodyDigest;
    expect(verifyBuildBriefCandidate(bytes(altered), context)).toEqual([
      "build-brief.signature-invalid",
    ]);
  });
  test("approval views cannot use workspace read to bypass package read", () => {
    expect(
      api.paths["/v2/specifications/workspaces/{workspaceId}/views/{view}"]?.get?.[
        "x-libre-ai-authority"
      ],
    ).toEqual({
      read: { resource: "spec-workspace", operation: "read" },
      approvals: { resource: "spec-package", operation: "read" },
    });
  });
  test("every command variant and cursor boundary uses real strict schema validation", () => {
    const base = "https://contracts.libre-ai.fr/schemas/build-brief-api.v2.schema.json#/$defs/";
    const validate = validator(`${base}commandRequest`);
    for (const command of [
      { command: "add-requirement", id: "req_one", text: "Observable", priority: "must" },
      { command: "record-decision", id: "decision_one", decision: "Synthetic decision" },
      { command: "resolve-decision", id: "decision_one", status: "accepted" },
      { command: "attach-contract", contractId: "urn:libre-ai:contract:synthetic" },
      {
        command: "define-acceptance",
        id: "criterion_one",
        observable: "Synthetic outcome",
        evidenceRule: "rule_one",
      },
      { command: "submit-review" },
      { command: "review", status: "rejected" },
      {
        command: "supersede",
        successorPackageId: "urn:libre-ai:spec-package:successor",
        successorPackageVersion: 2,
        successorBodyDigest: "0".repeat(64),
      },
    ]) {
      expect(validate(command)).toBe(true);
      expect(validate({ ...command, execute: true })).toBe(false);
      expect(validate({ ...command, command: "arbitrary" })).toBe(false);
    }
    const cursor = validator(`${base}cursor`);
    expect(cursor("synthetic_cursor-01")).toBe(true);
    for (const invalid of [null, "", "a=", "a".repeat(513)]) expect(cursor(invalid)).toBe(false);
  });
  for (const endpoint of endpoints) {
    test(`OpenAPI request/response contract: ${endpoint.operationId}`, () => {
      const operation = api.paths[endpoint.path]?.[endpoint.method];
      expect(operation).toBeDefined();
      if (!operation) throw new Error("Missing endpoint");
      expect(operation.operationId).toBe(endpoint.operationId);
      expect(operation.security).toEqual([{ sessionCookie: [] }]);
      expect(operation["x-libre-ai-authority"]).toBeDefined();
      const status =
        endpoint.method === "post"
          ? ["400", "401", "403", "404", "405", "409", "412", "413", "415", "422", "503"]
          : endpoint.operationId === "getAcceptanceSubject"
            ? ["400", "401", "403", "404", "405", "409", "503"]
            : ["400", "401", "403", "404", "405", "503"];
      expect(Object.keys(operation.responses).sort()).toEqual(
        [endpoint.successStatus, ...status].sort(),
      );
      const params = operation.parameters.map((item) => item.$ref);
      if (endpoint.method === "post") {
        for (const name of ["IdempotencyKey", "CsrfToken", "Revision"]) {
          expect(params).toContain(`#/components/parameters/${name}`);
        }
        expect(operation.requestBody?.required).toBe(true);
        const ref = operation.requestBody?.content["application/json"]?.schema.$ref;
        if (!ref) throw new Error("Missing request schema");
        const validate = validator(ref);
        expect(validate(endpoint.request)).toBe(true);
        expect(endpoint.invalidRequests.length).toBeGreaterThan(0);
        for (const mutation of endpoint.invalidRequests)
          expect(validate(changed(endpoint.request, mutation))).toBe(false);
      } else expect(operation.requestBody).toBeUndefined();
      const responseRef =
        operation.responses[endpoint.successStatus]?.content["application/json"]?.schema.$ref;
      if (!responseRef) throw new Error("Missing response schema");
      const validate = validator(responseRef);
      expect(validate(endpoint.response)).toBe(true);
      expect(validate({ ...(endpoint.response as object), unexpected: true })).toBe(false);
      expect(endpoint.invalidResponses.length).toBeGreaterThan(0);
      for (const mutation of endpoint.invalidResponses)
        expect(validate(changed(endpoint.response, mutation))).toBe(false);
      for (const code of status) {
        const ref = operation.responses[code]?.content["application/problem+json"]?.schema.$ref;
        if (!ref) throw new Error("Missing refusal schema");
        const refusal = {
          data: null,
          meta: {
            requestId: "req_0123456789abcdef",
            code: `build-brief.http_${code}`,
            message: "Request refused",
          },
        };
        expect(validator(ref)(refusal)).toBe(true);
        expect(
          validator(ref)({ ...refusal, meta: { ...refusal.meta, message: "personal content" } }),
        ).toBe(false);
      }
    });
  }
  const viewCases = (
    await Bun.file("contracts/fixtures/build-brief-api-v2/view-responses.json").json()
  ).cases as { id: string; accepted: boolean; response: unknown }[];
  for (const fixture of viewCases) {
    test(`filtered view response: ${fixture.id}`, () => {
      const ref =
        api.paths["/v2/specifications/workspaces/{workspaceId}/views/{view}"]?.get?.responses["200"]
          ?.content["application/json"]?.schema.$ref;
      if (!ref) throw new Error("Missing actual view response schema");
      expect(validator(ref)(fixture.response)).toBe(fixture.accepted);
    });
  }
  test("full workspace preserves all decision states independently of its filtered view", () => {
    const endpoint = endpoints.find((item) => item.operationId === "getSpecWorkspace");
    if (!endpoint) throw new Error("Missing workspace fixture");
    const ref =
      api.paths[endpoint.path]?.get?.responses["200"]?.content["application/json"]?.schema.$ref;
    if (!ref) throw new Error("Missing actual workspace response schema");
    for (const status of ["open", "accepted", "rejected"]) {
      const response = changed(endpoint.response, {
        path: ["data", "decisions"],
        value: [{ id: "decision_one", status, decision: "Synthetic decision" }],
      });
      expect(validator(ref)(response)).toBe(true);
    }
  });
  test("all inherited contract bytes and catalog records remain exact", async () => {
    const inventory = (await Bun.file(inventoryPath).json()) as {
      hashes: Record<string, string>;
      catalogEntries: unknown[];
    };
    for (const [path, expected] of Object.entries(inventory.hashes)) {
      expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(expected);
    }
    const catalog = (await Bun.file("contracts/catalog.v1.json").json()).contracts as {
      id: string;
    }[];
    for (const entry of inventory.catalogEntries as { id: string }[]) {
      expect(catalog.find((item) => item.id === entry.id)).toEqual(entry);
    }
    for (const entry of catalog.filter(
      (item) => !inventory.catalogEntries.some((old) => (old as { id: string }).id === item.id),
    )) {
      expect(entry).toMatchObject({
        status: "candidate",
        review: { state: "pending-independent-agent-review" },
      });
    }
  });
}
