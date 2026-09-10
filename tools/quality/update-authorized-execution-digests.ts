import { sha256Canonical } from "./authorized-execution";

interface FixtureCase {
  schema: string;
  valid: Record<string, unknown>;
}

const specifications = [
  ["execution-graph-v1", "execution-graph.v1.schema.json", ["graphDigest"]],
  ["execution-plan-body-v2", "execution-plan-body.v2.schema.json", ["bodyDigest"]],
  ["execution-transfer-v1", "execution-transfer.v1.schema.json", ["transferDigest"]],
  ["execution-authorization-v2", "execution-authorization.v2.schema.json", ["authorizationDigest"]],
  ["human-decision-request-v1", "human-decision-request.v1.schema.json", ["requestDigest"]],
  ["human-decision-response-v1", "human-decision-response.v1.schema.json", ["responseDigest"]],
  ["step-invocation-v1", "step-invocation.v1.schema.json", ["invocationDigest"]],
  ["effect-attestation-v1", "effect-attestation.v1.schema.json", ["preimageDigest", "signature"]],
  ["orchestrator-event-v3", "orchestrator-event.v3.schema.json", ["eventDigest"]],
] as const;

const fixtureDocument = (await Bun.file("contracts/fixtures/schema-fixtures.v1.json").json()) as {
  cases: FixtureCase[];
};

const cases = [];
for (const [id, schema, excludedFields] of specifications) {
  const fixture = fixtureDocument.cases.find((candidate) => candidate.schema === schema);
  if (fixture === undefined) throw new Error(`Missing positive fixture for ${schema}`);
  const unsignedPayload = structuredClone(fixture.valid);
  for (const field of excludedFields) {
    if (!(field in unsignedPayload)) throw new Error(`Missing ${field} in ${schema} fixture`);
    delete unsignedPayload[field];
  }
  cases.push({
    id,
    schema,
    digestField: excludedFields[0],
    excludedFields: [...excludedFields],
    unsignedPayload,
    expectedDigest: await sha256Canonical(unsignedPayload),
  });
}

await Bun.write(
  "contracts/fixtures/authorized-execution-v1/digest-vectors.v1.json",
  `${JSON.stringify(
    {
      schemaVersion: "libre-ai.authorized-execution-digest-vectors.v1",
      cases,
    },
    null,
    2,
  )}\n`,
);
