import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

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
  test("v2 has exactly the retained nine endpoint purposes and no implicit security", () => {
    expect(api.openapi).toBe("3.1.0");
    expect(api.info.version).toBe("2.0.0");
    expect(endpoints.map((item) => item.operationId).sort()).toEqual([
      "acceptSpecPackage",
      "createPlanningHandoff",
      "createSpecWorkspace",
      "executePackageCommand",
      "executeSpecCommand",
      "getAcceptedPackage",
      "getHandoff",
      "getSpecView",
      "getSpecWorkspace",
    ]);
    expect(Object.values(api.paths).flatMap(Object.keys)).toHaveLength(9);
    expect(new Set(endpoints.map((item) => `${item.method}:${item.path}`)).size).toBe(9);
    expect(api.components.securitySchemes.sessionCookie).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "__Host-libre_ai_session",
    });
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
    const validate = validator(base + "commandRequest");
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
    const cursor = validator(base + "cursor");
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
