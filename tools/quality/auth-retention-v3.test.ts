import { expect, test } from "bun:test";
import { evaluateAuthRetention, retentionV3Failures } from "./auth-retention-v3";

const policy = await Bun.file("contracts/data/retention.v3.json").json();
const inherited = await Bun.file("contracts/data/retention.v2.json").json();

test("accepts candidate and preserves seventeen inherited rules", () => {
  expect(retentionV3Failures(policy)).toEqual([]);
  expect(policy.rules.slice(0, 17)).toEqual(inherited.rules);
  expect(policy.rules).toHaveLength(21);
});

for (const [name, mutate] of [
  [
    "inherited duration",
    (p: typeof policy) => {
      p.rules[0].defaultRetention = "P2D";
    },
  ],
  [
    "unknown history class",
    (p: typeof policy) => {
      p.rules.push({ id: "membership-history" });
    },
  ],
  [
    "OIDC above maximum",
    (p: typeof policy) => {
      p.rules[17].maximumActiveSeconds = 601;
    },
  ],
  [
    "OIDC duration unit confusion",
    (p: typeof policy) => {
      p.rules[17].maximumActiveSeconds = "PT10M";
    },
  ],
  [
    "OIDC post-consumption retention",
    (p: typeof policy) => {
      p.rules[17].postEventRetentionSeconds = 1;
    },
  ],
  [
    "missing consume trigger",
    (p: typeof policy) => {
      p.rules[17].deleteOn = ["expiry"];
    },
  ],
  [
    "wrong dependency",
    (p: typeof policy) => {
      p.rules[18].dependsOn = "mission-record";
    },
  ],
  [
    "projection owner transfer",
    (p: typeof policy) => {
      p.rules[19].sourceOwner = "auth-web";
    },
  ],
  [
    "freshness grace",
    (p: typeof policy) => {
      p.rules[19].freshnessGraceSeconds = 1;
    },
  ],
  [
    "subject independent history",
    (p: typeof policy) => {
      p.rules[20].defaultRetention = "P1D";
    },
  ],
  [
    "backup extension",
    (p: typeof policy) => {
      p.backupExpiry = "P36D";
    },
  ],
  [
    "restore before deletion replay",
    (p: typeof policy) => {
      p.authRestore.replayDeletionEvidence = false;
    },
  ],
  [
    "restore controller state",
    (p: typeof policy) => {
      p.authRestore.controllerState = "restore";
    },
  ],
  [
    "fake approval",
    (p: typeof policy) => {
      p.approvedAt = "2026-09-12T00:00:00Z";
    },
  ],
] as const) {
  test(`rejects ${name}`, () => {
    const changed = structuredClone(policy);
    mutate(changed);
    expect(retentionV3Failures(changed).length).toBeGreaterThan(0);
  });
}

test("OIDC milliseconds: retain before boundary, delete exactly at it and on consume", () => {
  const input = {
    kind: "oidc",
    createdAtMs: 1000,
    expiresAtMs: 1501,
    nowMs: 1500,
    consumed: false,
  };
  expect(evaluateAuthRetention(input)).toBe("retain");
  expect(evaluateAuthRetention({ ...input, nowMs: 1501 })).toBe("delete");
  expect(evaluateAuthRetention({ ...input, consumed: true })).toBe("delete");
  expect(evaluateAuthRetention({ ...input, expiresAtMs: 601000 })).toBe("retain");
  expect(evaluateAuthRetention({ ...input, expiresAtMs: 601001 })).toBe("deny");
});

test("invalid times cannot authorize retention", () => {
  for (const expiresAtMs of [1000, 999, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    expect(
      evaluateAuthRetention({
        kind: "oidc",
        createdAtMs: 1000,
        expiresAtMs,
        nowMs: 1000,
        consumed: false,
      }),
    ).toBe("deny");
  }
  expect(
    evaluateAuthRetention({
      kind: "oidc",
      createdAtMs: 1000,
      expiresAtMs: 2000,
      nowMs: 999,
      consumed: false,
    }),
  ).toBe("deny");
});

test("derived locators cannot outlive source or keep rotated digests", () => {
  const input = { kind: "session-locator", sourcePresent: true, digestCurrent: true };
  expect(evaluateAuthRetention(input)).toBe("retain");
  expect(evaluateAuthRetention({ ...input, sourcePresent: false })).toBe("delete");
  expect(evaluateAuthRetention({ ...input, digestCurrent: false })).toBe("delete");
});

test("membership projection and subject locator require positively verified current source", () => {
  for (const kind of ["membership-projection", "subject-locator"]) {
    expect(
      evaluateAuthRetention({
        kind,
        sourcePresent: true,
        sourceActive: true,
        freshness: "verified-current",
      }),
    ).toBe("retain");
    for (const freshness of ["unknown", "stale"]) {
      expect(
        evaluateAuthRetention({ kind, sourcePresent: true, sourceActive: true, freshness }),
      ).toBe("delete");
    }
    expect(
      evaluateAuthRetention({
        kind,
        sourcePresent: false,
        sourceActive: true,
        freshness: "verified-current",
      }),
    ).toBe("delete");
    expect(
      evaluateAuthRetention({
        kind,
        sourcePresent: true,
        sourceActive: false,
        freshness: "verified-current",
      }),
    ).toBe("delete");
  }
});

test("restore requires every prerequisite; old backup membership never suffices", () => {
  const input = {
    kind: "restore",
    sessionsDiscarded: true,
    oidcDiscarded: true,
    locatorsDiscarded: true,
    membershipProjectionsDiscarded: true,
    epochsInvalidated: true,
    deletionEvidenceReplayed: true,
    currentSessionsAuthority: true,
    controllerStateAbsent: true,
    executionDeletionOrderPreserved: true,
  };
  expect(evaluateAuthRetention(input)).toBe("rebuild");
  for (const key of Object.keys(input).filter((key) => key !== "kind")) {
    expect(evaluateAuthRetention({ ...input, [key]: false })).toBe("deny");
    const absent: Record<string, unknown> = { ...input };
    delete absent[key];
    expect(evaluateAuthRetention(absent)).toBe("deny");
    expect(evaluateAuthRetention({ ...input, [key]: "true" })).toBe("deny");
  }
});

test("unknown, absent and malformed facts fail closed", () => {
  for (const input of [
    null,
    {},
    [],
    { kind: "oidc" },
    { kind: "session-locator", sourcePresent: "true", digestCurrent: true },
    { kind: "restore" },
  ]) {
    expect(evaluateAuthRetention(input)).toBe("deny");
  }
});

test("publishes portable behavioral vectors with positive and refusal outcomes", async () => {
  const vectors: {
    cases: { id: string; input: unknown; expected: "retain" | "delete" | "deny" | "rebuild" }[];
  } = await Bun.file("contracts/fixtures/retention-v3/vectors.json").json();
  expect(vectors.cases.length).toBeGreaterThanOrEqual(30);
  expect(new Set(vectors.cases.map((item) => item.id)).size).toBe(vectors.cases.length);
  for (const item of vectors.cases)
    expect(evaluateAuthRetention(item.input), item.id).toBe(item.expected);
});
