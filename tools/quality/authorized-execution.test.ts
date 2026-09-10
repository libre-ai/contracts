import { describe, expect, test } from "bun:test";
import {
  type AuthorizedExecutionOutcome,
  authorizedExecutionVectorDocumentFailures,
  canonicalJson,
  digestVectorDocumentFailures,
  evaluateAuthorizedExecutionVector,
  retentionPolicyV2Failures,
  sha256Canonical,
} from "./authorized-execution";

const validGraph = {
  entryStepId: "prepare",
  steps: [
    { stepId: "prepare", kind: "calculation", outcomeCodes: ["ready"] },
    { stepId: "publish", kind: "external-effect", outcomeCodes: ["committed"] },
    { stepId: "done", kind: "terminal", outcomeCodes: [] },
  ],
  edges: [
    { edgeId: "prepared", fromStepId: "prepare", outcomeCode: "ready", toStepId: "publish" },
    {
      edgeId: "published",
      fromStepId: "publish",
      outcomeCode: "committed",
      toStepId: "done",
    },
  ],
};

function graphVector(graph: unknown) {
  return { domain: "graph", graph };
}

function fixtureItem<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error("Test fixture item is missing");
  return item;
}

describe("authorized execution topology", () => {
  test("accepts one finite closed route to a terminal", () => {
    expect(evaluateAuthorizedExecutionVector(graphVector(validGraph))).toBe("graph-valid");
  });

  test("rejects duplicate step identities before building routes", () => {
    const graph = structuredClone(validGraph);
    fixtureItem(graph.steps, 1).stepId = "prepare";
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("duplicate-step");
  });

  test("rejects duplicate edge identities", () => {
    const graph = structuredClone(validGraph);
    fixtureItem(graph.edges, 1).edgeId = "prepared";
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("duplicate-edge");
  });

  test("rejects an entry that does not resolve", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        graphVector({ ...structuredClone(validGraph), entryStepId: "missing" }),
      ),
    ).toBe("entry-missing");
  });

  test("rejects an edge whose destination does not resolve", () => {
    const graph = structuredClone(validGraph);
    fixtureItem(graph.edges, 1).toStepId = "missing";
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("dangling-edge");
  });

  test("rejects a declared outcome without a route", () => {
    const graph = structuredClone(validGraph);
    graph.edges.pop();
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("route-missing");
  });

  test("rejects two routes for one declared outcome", () => {
    const graph = structuredClone(validGraph);
    graph.edges.push({
      edgeId: "published-again",
      fromStepId: "publish",
      outcomeCode: "committed",
      toStepId: "done",
    });
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("route-ambiguous");
  });

  test("rejects an unreachable step", () => {
    const graph = structuredClone(validGraph);
    graph.steps.push({ stepId: "orphan", kind: "terminal", outcomeCodes: [] });
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("unreachable-step");
  });

  test("rejects a reachable step that cannot reach a terminal", () => {
    const graph = structuredClone(validGraph);
    graph.steps.push({ stepId: "sink", kind: "calculation", outcomeCodes: [] });
    fixtureItem(graph.edges, 1).toStepId = "sink";
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("terminal-unreachable");
  });

  test("rejects an outgoing edge from a terminal", () => {
    const graph = structuredClone(validGraph);
    graph.edges.push({
      edgeId: "terminal-out",
      fromStepId: "done",
      outcomeCode: "again",
      toStepId: "prepare",
    });
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe(
      "terminal-has-outgoing-edge",
    );
  });

  test("rejects a cycle even when every step can still reach a terminal", () => {
    const graph = structuredClone(validGraph);
    fixtureItem(graph.steps, 0).outcomeCodes.push("again");
    graph.edges.push({
      edgeId: "cycle",
      fromStepId: "prepare",
      outcomeCode: "again",
      toStepId: "prepare",
    });
    expect(evaluateAuthorizedExecutionVector(graphVector(graph))).toBe("cycle-forbidden");
  });
});

const zeroBudget = {
  durationSeconds: 0,
  toolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  processesStarted: 0,
  filesChanged: 0,
  changedBytes: 0,
};

const previousEvent = {
  id: "event-1",
  eventDigest: "a".repeat(64),
  organizationId: "organization-1",
  missionId: "mission-1",
  planDigest: "b".repeat(64),
  graphDigest: "c".repeat(64),
  runId: "run-1",
  generation: 1,
  sequence: 1,
  previousEventDigest: null,
  budgetDelta: zeroBudget,
  budgetTotal: zeroBudget,
};

const currentEvent = {
  ...previousEvent,
  id: "event-2",
  eventDigest: "d".repeat(64),
  sequence: 2,
  previousEventDigest: previousEvent.eventDigest,
};

function causalVector(overrides: Record<string, unknown> = {}) {
  return {
    domain: "causal",
    previous: structuredClone(previousEvent),
    current: structuredClone(currentEvent),
    collision: null,
    ...overrides,
  };
}

describe("authorized execution causal events", () => {
  test("accepts the next event with monotone identities and budgets", () => {
    expect(evaluateAuthorizedExecutionVector(causalVector())).toBe("event-valid");
  });

  test("accepts only a byte-identical accepted collision as idempotent", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({
          collision: {
            id: currentEvent.id,
            sequence: currentEvent.sequence,
            eventDigest: currentEvent.eventDigest,
          },
        }),
      ),
    ).toBe("idempotent-duplicate");
  });

  test("quarantines a reused event identity with a divergent digest", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({
          collision: {
            id: currentEvent.id,
            sequence: currentEvent.sequence,
            eventDigest: "e".repeat(64),
          },
        }),
      ),
    ).toBe("duplicate-divergent");
  });

  test("rejects a changed organization identity", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({ current: { ...currentEvent, organizationId: "organization-2" } }),
      ),
    ).toBe("identity-mismatch");
  });

  test("rejects an event from an older generation", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({ current: { ...currentEvent, generation: 0 } }),
      ),
    ).toBe("generation-stale");
  });

  test("rejects a sequence gap", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({ current: { ...currentEvent, sequence: 3 } }),
      ),
    ).toBe("sequence-invalid");
  });

  test("rejects a wrong predecessor digest", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({ current: { ...currentEvent, previousEventDigest: "f".repeat(64) } }),
      ),
    ).toBe("previous-digest-mismatch");
  });

  test("rejects a decreasing budget", () => {
    const previous = structuredClone(previousEvent);
    previous.budgetTotal.toolCalls = 2;
    const current = structuredClone(currentEvent);
    current.budgetTotal.toolCalls = 1;
    expect(evaluateAuthorizedExecutionVector(causalVector({ previous, current }))).toBe(
      "budget-decreased",
    );
  });

  test("rejects budget arithmetic that does not equal previous plus delta", () => {
    const current = structuredClone(currentEvent);
    current.budgetDelta = { ...current.budgetDelta, toolCalls: 1 };
    expect(evaluateAuthorizedExecutionVector(causalVector({ current }))).toBe(
      "budget-arithmetic-invalid",
    );
  });
});

const decisionRequest = {
  organizationId: "organization-1",
  attemptId: "attempt-1",
  requestDigest: "a".repeat(64),
  choiceIds: ["approve", "reject"],
  requiredRole: "mission-approver",
  expectedRevision: 4,
  expiresAt: "2026-09-10T12:00:00Z",
};

const decisionResponse = {
  organizationId: "organization-1",
  attemptId: "attempt-1",
  requestDigest: decisionRequest.requestDigest,
  choiceId: "approve",
  actorRoles: ["mission-approver"],
  expectedRevision: 4,
};

function decisionVector(overrides: Record<string, unknown> = {}) {
  return {
    domain: "decision",
    request: structuredClone(decisionRequest),
    response: structuredClone(decisionResponse),
    now: "2026-09-10T11:00:00Z",
    replaced: false,
    consumed: false,
    ...overrides,
  };
}

describe("authorized human decisions", () => {
  test("accepts one authorized current response", () => {
    expect(evaluateAuthorizedExecutionVector(decisionVector())).toBe("decision-valid");
  });

  test("rejects an expired request", () => {
    expect(evaluateAuthorizedExecutionVector(decisionVector({ now: "2026-09-10T12:00:01Z" }))).toBe(
      "request-expired",
    );
  });

  test("rejects a replaced request", () => {
    expect(evaluateAuthorizedExecutionVector(decisionVector({ replaced: true }))).toBe(
      "request-replaced",
    );
  });

  test("rejects an already consumed request", () => {
    expect(evaluateAuthorizedExecutionVector(decisionVector({ consumed: true }))).toBe(
      "request-consumed",
    );
  });

  test("rejects an undeclared choice", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        decisionVector({ response: { ...decisionResponse, choiceId: "other" } }),
      ),
    ).toBe("choice-unknown");
  });

  test("rejects an actor without the required role", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        decisionVector({ response: { ...decisionResponse, actorRoles: ["viewer"] } }),
      ),
    ).toBe("actor-unauthorized");
  });

  test("rejects a stale mission revision", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        decisionVector({ response: { ...decisionResponse, expectedRevision: 3 } }),
      ),
    ).toBe("revision-stale");
  });

  test("rejects an answer from another attempt", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        decisionVector({ response: { ...decisionResponse, attemptId: "attempt-2" } }),
      ),
    ).toBe("attempt-mismatch");
  });

  test("rejects an answer from another organization", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        decisionVector({ response: { ...decisionResponse, organizationId: "organization-2" } }),
      ),
    ).toBe("organization-mismatch");
  });
});

const effectAttestation = {
  organizationId: "organization-1",
  generation: 2,
  attemptId: "attempt-2",
  effectId: "effect-1",
  effectEmissionId: "emission-2",
  emissionDigest: "a".repeat(64),
  fencing: 2,
  status: "committed",
};

function effectVector(overrides: Record<string, unknown> = {}) {
  return {
    domain: "effect",
    currentGeneration: 2,
    activeFencing: 2,
    generationConsumed: false,
    lineageClosed: false,
    predecessorEffectsTerminal: true,
    executorProfileQualified: true,
    priorEmission: null,
    existingAttemptEmissionId: null,
    attestation: structuredClone(effectAttestation),
    ...overrides,
  };
}

describe("authorized external effects", () => {
  test("accepts a qualified terminal observation on the active generation", () => {
    expect(evaluateAuthorizedExecutionVector(effectVector())).toBe("effect-valid");
  });

  test("returns idempotence for an identical emission delivery", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        effectVector({
          priorEmission: {
            effectEmissionId: effectAttestation.effectEmissionId,
            emissionDigest: effectAttestation.emissionDigest,
          },
        }),
      ),
    ).toBe("emission-duplicate");
  });

  test("quarantines a divergent reuse of an emission identity", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        effectVector({
          priorEmission: {
            effectEmissionId: effectAttestation.effectEmissionId,
            emissionDigest: "b".repeat(64),
          },
        }),
      ),
    ).toBe("emission-divergent");
  });

  test("rejects a second emission identity under one attempt", () => {
    expect(
      evaluateAuthorizedExecutionVector(effectVector({ existingAttemptEmissionId: "emission-1" })),
    ).toBe("second-emission-for-attempt");
  });

  test("rejects stale fencing", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        effectVector({ attestation: { ...effectAttestation, fencing: 1 } }),
      ),
    ).toBe("fencing-stale");
  });

  test("rejects an executor whose bound profile is not qualified", () => {
    expect(
      evaluateAuthorizedExecutionVector(effectVector({ executorProfileQualified: false })),
    ).toBe("executor-unqualified");
  });

  test("blocks an unknown external effect state", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        effectVector({ attestation: { ...effectAttestation, status: "state-unknown" } }),
      ),
    ).toBe("effect-state-unknown");
  });

  test("rejects successor continuity while predecessor effects are non-terminal", () => {
    expect(
      evaluateAuthorizedExecutionVector(effectVector({ predecessorEffectsTerminal: false })),
    ).toBe("predecessor-effects-nonterminal");
  });

  test("rejects a consumed generation", () => {
    expect(evaluateAuthorizedExecutionVector(effectVector({ generationConsumed: true }))).toBe(
      "generation-consumed",
    );
  });

  test("rejects every action after administrative lineage closure", () => {
    expect(evaluateAuthorizedExecutionVector(effectVector({ lineageClosed: true }))).toBe(
      "lineage-administratively-closed",
    );
  });
});

describe("RFC 8785 canonical execution preimages", () => {
  test("sorts object keys recursively without reordering arrays", () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: [3, 2, 1] } })).toBe(
      '{"a":{"x":[3,2,1],"y":true},"z":1}',
    );
  });

  test("produces the hand-checked SHA-256 for a canonical object", async () => {
    expect(await sha256Canonical({ b: 2, a: 1 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });

  test("object order is irrelevant but array order remains authoritative", async () => {
    expect(await sha256Canonical({ b: 2, a: [1, 2] })).toBe(
      await sha256Canonical({ a: [1, 2], b: 2 }),
    );
    expect(await sha256Canonical({ a: [1, 2], b: 2 })).not.toBe(
      await sha256Canonical({ a: [2, 1], b: 2 }),
    );
  });
});

describe("committed authorized execution semantic vectors", () => {
  test("replays every bounded case with its exact closed outcome", async () => {
    const document = (await Bun.file(
      "contracts/fixtures/authorized-execution-v1/semantic-vectors.v1.json",
    ).json()) as {
      schemaVersion: string;
      cases: { id: string; input: unknown; expected: AuthorizedExecutionOutcome }[];
    };

    expect(document.schemaVersion).toBe("libre-ai.authorized-execution-semantic-vectors.v1");
    expect(document.cases.length).toBeGreaterThan(0);
    expect(new Set(document.cases.map((vector) => vector.id)).size).toBe(document.cases.length);
    for (const vector of document.cases) {
      expect(evaluateAuthorizedExecutionVector(vector.input), vector.id).toBe(vector.expected);
    }
    expect(authorizedExecutionVectorDocumentFailures(document)).toEqual([]);
  });

  test("rejects an incomplete outcome inventory", async () => {
    const document = await Bun.file(
      "contracts/fixtures/authorized-execution-v1/semantic-vectors.v1.json",
    ).json();
    document.cases = document.cases.filter(
      (vector: { expected: string }) => vector.expected !== "cycle-forbidden",
    );

    expect(authorizedExecutionVectorDocumentFailures(document)).toContain(
      "outcome cycle-forbidden is not covered",
    );
  });

  test("rejects envelope ambiguity before replay", async () => {
    const document = await Bun.file(
      "contracts/fixtures/authorized-execution-v1/semantic-vectors.v1.json",
    ).json();
    document.cases[0].domain = "effect";
    document.cases[0].unexpected = true;

    expect(authorizedExecutionVectorDocumentFailures(document)).toEqual(
      expect.arrayContaining([
        "case[0] has unknown properties",
        "case[0] domain does not match input.domain",
      ]),
    );
  });
});

describe("execution retention v2", () => {
  async function retentionPolicies() {
    return {
      v1: await Bun.file("contracts/data/retention.v1.json").json(),
      v2: await Bun.file("contracts/data/retention.v2.json").json(),
    };
  }

  test("preserves v1 and adds the two bounded execution rules", async () => {
    const { v1, v2 } = await retentionPolicies();
    expect(retentionPolicyV2Failures(v1, v2)).toEqual([]);
  });

  test("rejects a missing or changed inherited rule", async () => {
    const { v1, v2 } = await retentionPolicies();
    const missing = structuredClone(v2);
    missing.rules = missing.rules.filter((rule: { id: string }) => rule.id !== "operational-log");
    const changed = structuredClone(v2);
    changed.rules.find((rule: { id: string }) => rule.id === "mission-record").defaultRetention =
      "P2Y";

    expect(retentionPolicyV2Failures(v1, missing)).toContain("inherited rule is missing");
    expect(retentionPolicyV2Failures(v1, changed)).toContain("inherited rule has changed");
  });

  test("rejects a missing or overlong execution record rule", async () => {
    const { v1, v2 } = await retentionPolicies();
    const missing = structuredClone(v2);
    missing.rules = missing.rules.filter(
      (rule: { id: string }) => rule.id !== "orchestrator-execution-record",
    );
    const overlong = structuredClone(v2);
    overlong.rules.find(
      (rule: { id: string }) => rule.id === "orchestrator-execution-record",
    ).configurable.maximum = "P7Y";

    expect(retentionPolicyV2Failures(v1, missing)).toContain(
      "orchestrator execution record rule is invalid",
    );
    expect(retentionPolicyV2Failures(v1, overlong)).toContain(
      "orchestrator execution record rule is invalid",
    );
  });

  test("rejects any tombstone lifetime other than the backup ceiling", async () => {
    const { v1, v2 } = await retentionPolicies();
    for (const duration of ["P30D", "P36D"]) {
      const changed = structuredClone(v2);
      changed.rules.find(
        (rule: { id: string }) => rule.id === "execution-deletion-tombstone",
      ).defaultRetention = duration;
      expect(retentionPolicyV2Failures(v1, changed)).toContain(
        "execution deletion tombstone rule is invalid",
      );
    }
  });

  test("rejects restore order that applies execution state before tombstones", async () => {
    const { v1, v2 } = await retentionPolicies();
    v2.restoreOrder.reverse();
    expect(retentionPolicyV2Failures(v1, v2)).toContain("restore order is not tombstone-first");
  });
});

describe("authorized execution digest vectors", () => {
  async function digestVectors() {
    return await Bun.file(
      "contracts/fixtures/authorized-execution-v1/digest-vectors.v1.json",
    ).json();
  }

  test("reproduces all nine RFC 8785 contract preimages", async () => {
    expect(await digestVectorDocumentFailures(await digestVectors())).toEqual([]);
  });

  test("rejects digest and signature fields inside an unsigned payload", async () => {
    const document = await digestVectors();
    document.cases[0].unsignedPayload.graphDigest = "a".repeat(64);
    document.cases.find(
      (vector: { schema: string }) => vector.schema === "effect-attestation.v1.schema.json",
    ).unsignedPayload.signature = "A".repeat(86);

    expect(await digestVectorDocumentFailures(document)).toEqual(
      expect.arrayContaining([
        "case[0] unsigned payload contains an excluded field",
        "case[7] unsigned payload contains an excluded field",
      ]),
    );
  });

  test("rejects an incomplete digest inventory", async () => {
    const document = await digestVectors();
    document.cases.pop();
    expect(await digestVectorDocumentFailures(document)).toContain(
      "digest vector inventory is incomplete",
    );
  });
});
