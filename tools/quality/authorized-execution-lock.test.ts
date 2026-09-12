import { describe, expect, test } from "bun:test";

interface CatalogEntry {
  readonly id: string;
  readonly path: string;
  readonly status: "candidate" | "locked";
  readonly review?: unknown;
}

interface ContractCatalog {
  readonly schemaVersion: string;
  readonly contracts: CatalogEntry[];
}

const authorizedExecutionIds = [
  "effect-attestation-v1",
  "execution-authorization-v2",
  "execution-graph-v1",
  "execution-plan-body-v2",
  "execution-transfer-v1",
  "human-decision-request-v1",
  "human-decision-response-v1",
  "orchestrator-event-v3",
  "retention-policy-schema-v2",
  "retention-policy-v2",
  "step-invocation-v1",
] as const;

const remainingCandidateIds = [
  "agent-handoff-v2",
  "build-brief-acceptance-v2",
  "build-brief-body-v2",
  "build-brief-policy-v2",
  "boussole-method-v3",
  "harness-profile-v2",
  "local-comparison-v3",
  "public-vote-dataset-v3",
  "spec-package-v2",
  "retention-policy-schema-v3",
  "retention-policy-v3",
] as const;

const reviewedAuthorityHashes = {
  "contracts/data/retention.v2.json":
    "1622c32bf106160a524590db42bd0e8a0e7bbbadc2ee1bedd5dbb9bddef9db84",
  "contracts/fixtures/authorized-execution-v1/digest-vectors.v1.json":
    "02e1d78866a0841f8fdb958a7979fe5621452d07e251221cd90334c1c16c9c04",
  "contracts/fixtures/authorized-execution-v1/semantic-vectors.v1.json":
    "d3a63edb3f146abe9061a3af0a9ae1bbb2d8d66f3d67fa34bbf7e859c0d0447e",
  "contracts/schemas/effect-attestation.v1.schema.json":
    "1cba4b8965543ee7e32af283d5769b95df010b79ef3c7a90d0bb8766d23a8952",
  "contracts/schemas/execution-authorization.v2.schema.json":
    "37b6a7a63d0c9604f928a03758ca0f91cdba36f0cf1b2f2af06a969d1bc3d85a",
  "contracts/schemas/execution-graph.v1.schema.json":
    "fb1abf6a75bfc4890e5c08acf43418dfc03719a85944d881baca7da7c3f153b6",
  "contracts/schemas/execution-plan-body.v2.schema.json":
    "cbc47c01b2dd5a3bf01fc210ca087cb3c90dedaef4f84e0213df43609bc5791d",
  "contracts/schemas/execution-transfer.v1.schema.json":
    "443ac48dbd9acb006d7d64f570ae41ce99493579289cab05b7085a23f3690b34",
  "contracts/schemas/human-decision-request.v1.schema.json":
    "6afb4b776dc08d3af967eeb03e88ae3540ad056288012c3882d7fb1dd89f8c4e",
  "contracts/schemas/human-decision-response.v1.schema.json":
    "3e6d854175bb4376c91e12ac9039560fa17f8adc1f91e35310fb895454104e6e",
  "contracts/schemas/orchestrator-event.v3.schema.json":
    "df7b8bc07647a4e1d606c7420e3005290f58ecf95411720f36beb75b5e8d87ea",
  "contracts/schemas/retention-policy.v2.schema.json":
    "1d6b10e39388451faf111ab96c1ab3085a2e3c3226bf469bdf27d3afa3a0208f",
  "contracts/schemas/step-invocation.v1.schema.json":
    "7d2e0cf1331f9f45f0dfaaefe285186589b1471dcf16f39ad5121163f266a14c",
} as const;

async function readCatalog(): Promise<ContractCatalog> {
  return Bun.file("contracts/catalog.v1.json").json();
}

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(path).bytes());
  return hasher.digest("hex");
}

describe("authorized execution Specification Lock", () => {
  test("locks exactly the reviewed eleven-contract family", async () => {
    const catalog = await readCatalog();
    const entriesById = new Map(catalog.contracts.map((entry) => [entry.id, entry]));

    expect(catalog.schemaVersion).toBe("libre-ai.contract-catalog.v1");
    for (const id of authorizedExecutionIds) {
      const entry = entriesById.get(id);
      expect(entry, `${id} must exist in the catalog`).toBeDefined();
      expect(entry?.status, `${id} must be locked`).toBe("locked");
      expect(
        Object.hasOwn(entry ?? {}, "review"),
        `${id} must not retain its satisfied candidate review object`,
      ).toBeFalse();
    }
  });

  test("keeps unrelated candidates and Build Brief successors outside the execution lock", async () => {
    const catalog = await readCatalog();
    const locked = catalog.contracts.filter((entry) => entry.status === "locked");
    const candidates = catalog.contracts
      .filter((entry) => entry.status === "candidate")
      .map((entry) => entry.id)
      .sort();

    expect(locked).toHaveLength(99);
    expect(candidates).toEqual([...remainingCandidateIds].sort());
  });

  test("preserves every reviewed authority and vector byte", async () => {
    for (const [path, expectedHash] of Object.entries(reviewedAuthorityHashes)) {
      expect(await sha256File(path), `${path} changed after specialized review`).toBe(expectedHash);
    }
  });
});
