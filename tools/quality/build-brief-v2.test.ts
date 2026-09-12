import { expect, test } from "bun:test";

const candidatePaths = [
  "contracts/schemas/build-brief-body.v2.schema.json",
  "contracts/schemas/build-brief-acceptance.v2.schema.json",
  "contracts/schemas/spec-package.v2.schema.json",
  "contracts/schemas/agent-handoff.v2.schema.json",
  "contracts/authz/build-brief-v2.datalog",
];

test("Build Brief successor authorities exist only as reviewed-role candidates", async () => {
  const catalog = await Bun.file("contracts/catalog.v1.json").json();
  for (const path of candidatePaths) {
    const entry = catalog.contracts.find((item: { path: string }) => item.path === path);
    expect(entry, path).toBeDefined();
    expect(entry.status).toBe("candidate");
    expect(entry.review.required).toEqual(["architecture", "security", "cryptography"]);
    expect(await Bun.file(path).exists()).toBe(true);
  }
});

import vector from "../../contracts/fixtures/build-brief-v2/vectors.json";
import { canonicalJson } from "./authorized-execution";
import { type CandidateContext, verifyBuildBriefCandidate } from "./build-brief-v2";

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
const context = vector.context as CandidateContext;
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing fixture entry");
  return value;
}

test("a valid detached acceptance and its plan-only handoff verify together", () => {
  expect(verifyBuildBriefCandidate(bytes(vector.package), context, bytes(vector.handoff))).toEqual(
    [],
  );
});

test("content and approval tampering never become accepted by schema validity", () => {
  const changed = structuredClone(vector.package);
  changed.body.problem = "Changed content";
  expect(verifyBuildBriefCandidate(bytes(changed), context)).toContain(
    "build-brief.digest-invalid",
  );
  const changedReceipt = structuredClone(vector.package);
  required(changedReceipt.acceptances[0]).statement.acceptedAt = "2026-09-12T10:03:00Z";
  expect(verifyBuildBriefCandidate(bytes(changedReceipt), context)).toContain(
    "build-brief.signature-invalid",
  );
});

test("context does not trust payload organization, contributors, key or membership", () => {
  for (const changed of [
    { ...context, organization: "ten_ffffffffffffffff" },
    { ...context, contributors: ["different_author"] },
    { ...context, keys: [] },
    { ...context, keys: context.keys.map((key) => ({ ...key, status: "revoked" as const })) },
    { ...context, keys: context.keys.map((key) => ({ ...key, membershipRevision: 8 })) },
    { ...context, keys: context.keys.map((key) => ({ ...key, approver: "different_approver" })) },
    { ...context, policyDigest: "0".repeat(64) },
    { ...context, now: "2026-09-12T09:30:00Z" },
  ])
    expect(verifyBuildBriefCandidate(bytes(vector.package), changed).length).toBeGreaterThan(0);
});

test("handoff must bind a verified receipt and body at the current planning interval", () => {
  for (const changed of [
    { ...vector.handoff, acceptanceDigest: "0".repeat(64) },
    { ...vector.handoff, specPackageDigest: "0".repeat(64) },
    { ...vector.handoff, specPackageVersion: 2 },
    { ...vector.handoff, tenantId: "ten_ffffffffffffffff" },
    { ...vector.handoff, acceptanceCriteria: ["invented_criterion"] },
    { ...vector.handoff, expiresAt: "2026-09-12T10:01:00Z" },
    { ...vector.handoff, capabilities: ["execute"] },
  ])
    expect(
      verifyBuildBriefCandidate(bytes(vector.package), context, bytes(changed)).length,
    ).toBeGreaterThan(0);
});

test("adding a valid detached acceptance does not change content identity", () => {
  const added = structuredClone(vector.package);
  added.acceptances.push(vector.secondAcceptance);
  expect(verifyBuildBriefCandidate(bytes(added), context)).toEqual([]);
  expect(added.bodyDigest).toBe(vector.bodyDigest);
});

test("wire JSON refuses noncanonical, duplicate, surrogate, BOM and excessive inputs", () => {
  for (const raw of [
    new TextEncoder().encode(JSON.stringify(vector.package, null, 2)),
    new TextEncoder().encode('{"schemaVersion":"bad","schemaVersion":"bad"}'),
    new TextEncoder().encode('{"x":"\\ud800"}'),
    Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes(vector.package)]),
    Uint8Array.from([0xff]),
    new Uint8Array(2 * 1024 * 1024 + 1),
  ])
    expect(verifyBuildBriefCandidate(raw, context)).toContain("build-brief.input-invalid");
});

import { createHash, createPublicKey, verify } from "node:crypto";
import negativeVectors from "../../contracts/fixtures/build-brief-v2/negative-vectors.json";
import policyVectors from "../../contracts/fixtures/build-brief-v2/policy-vectors.json";
import { buildBriefDigest } from "./build-brief-v2";

for (const negative of negativeVectors.cases) {
  test(`canonical refusal vector: ${negative.id}`, () => {
    const inputs = structuredClone({ package: vector.package, context, handoff: vector.handoff });
    let parent: unknown = inputs[negative.target as keyof typeof inputs];
    const segments = negative.path.split(".");
    const last = segments.pop();
    for (const segment of segments) parent = (parent as Record<string, unknown>)[segment];
    if (last === undefined) throw new Error("invalid test pointer");
    (parent as Record<string, unknown>)[last] = negative.value;
    expect(
      verifyBuildBriefCandidate(bytes(inputs.package), inputs.context, bytes(inputs.handoff)),
    ).toContain(negative.expected);
  });
}

test("committed canonical preimages, digest oracles and policy pin do not drift", async () => {
  expect(canonicalJson(vector.package.body)).toBe(vector.bodyCanonical);
  expect(buildBriefDigest(vector.package.body)).toBe(vector.bodyDigest);
  expect(canonicalJson(required(vector.package.acceptances[0]).statement)).toBe(
    vector.statementCanonical,
  );
  expect(buildBriefDigest(required(vector.package.acceptances[0]).statement)).toBe(
    vector.statementDigest,
  );
  expect(buildBriefDigest(vector.package.acceptances[0])).toBe(vector.acceptanceDigest);
  const actual = createHash("sha256")
    .update(await Bun.file("contracts/authz/build-brief-v2.datalog").bytes())
    .digest("hex");
  expect(actual).toBe(policyVectors.policyDigest);
  expect(actual).toBe(vector.context.policyDigest);
});

test("detached signature reuses canonical domain separation, not bare digest or content", () => {
  const receipt = required(vector.package.acceptances[0]);
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(required(context.keys[0]).publicKey, "base64url"),
    ]),
    format: "der",
    type: "spki",
  });
  const signature = Buffer.from(receipt.signature, "base64url");
  for (const message of [
    Buffer.from(vector.statementDigest, "hex"),
    Buffer.from(vector.statementCanonical),
    Buffer.concat([Buffer.from("libre-ai.other.v2\0"), Buffer.from(vector.statementDigest, "hex")]),
  ])
    expect(verify(null, message, key, signature)).toBe(false);
});

test("handoff carries every criterion of a schema-valid body beyond the v1 limit", () => {
  const packageValue = structuredClone(vector.package);
  packageValue.body.acceptanceCriteria = Array.from({ length: 101 }, (_, index) => ({
    id: `criterion_${index}`,
    observable: "Observable",
    evidenceRule: "fixture_evidence",
  }));
  const handoff = {
    ...vector.handoff,
    acceptanceCriteria: packageValue.body.acceptanceCriteria.map((item) => item.id),
  };
  // Deliberately stale digest: schema must admit the complete criterion set, then
  // semantic verification must refuse precisely the unresigned changed body.
  expect(verifyBuildBriefCandidate(bytes(packageValue), context, bytes(handoff))).toEqual([
    "build-brief.digest-invalid",
  ]);
});

for (const problem of ["Independent forged content one", "Independent forged content two"]) {
  test(`CRYPTO-P1-01 refuses identity-key forgery: ${problem}`, () => {
    const forged = structuredClone(vector.package);
    const forgedContext = structuredClone(context);
    required(forgedContext.keys).forEach((key) => {
      key.publicKey = Buffer.concat([Buffer.from([1]), Buffer.alloc(31)]).toString("base64url");
    });
    forged.body.problem = problem;
    forged.bodyDigest = buildBriefDigest(forged.body);
    const acceptance = required(forged.acceptances[0]);
    acceptance.statement.subjectDigest = forged.bodyDigest;
    acceptance.signature = Buffer.concat([Buffer.from([1]), Buffer.alloc(63)]).toString(
      "base64url",
    );
    const handoff = {
      ...vector.handoff,
      specPackageDigest: forged.bodyDigest,
      acceptanceDigest: buildBriefDigest(acceptance),
    };
    expect(verifyBuildBriefCandidate(bytes(forged), forgedContext, bytes(handoff))).toEqual([
      "build-brief.signature-invalid",
    ]);
  });
}

import strictVectors from "../../contracts/fixtures/build-brief-v2/strict-ed25519-vectors.json";
import { isBuildBriefPoint, verifyBuildBriefSignature } from "./build-brief-v2";

for (const point of strictVectors.points) {
  test(`strict point admissibility: ${point.id}`, () => {
    expect(isBuildBriefPoint(Buffer.from(point.point, "base64url"))).toBe(point.admissible);
  });
}
for (const signature of strictVectors.signatures) {
  test(`strict Ed25519 cross-runtime vector: ${signature.id}`, () => {
    expect(
      verifyBuildBriefSignature(
        Buffer.from(signature.signature, "base64url"),
        Buffer.from(signature.message, "base64url"),
        Buffer.from(signature.publicKey, "base64url"),
      ),
    ).toBe(signature.accepted);
  });
}
