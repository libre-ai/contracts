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

const authorityGraph = {
  id: "urn:libre-ai:graph:synthetic-graph-1",
  organizationId: "ten_1234567890abcdef",
  graphDigest: "a".repeat(64),
  steps: [
    {
      kind: "calculation",
      outcomeCodes: ["ready"],
      retryPolicy: { maximumAttempts: 2, retryableOutcomeCodes: ["ready"] },
    },
    {
      kind: "human-decision",
      outcomeCodes: ["approved", "rejected", "no-response"],
      retryPolicy: { maximumAttempts: 1, retryableOutcomeCodes: [] },
      decisionPolicy: {
        choices: [
          { choiceId: "approve", outcomeCode: "approved" },
          { choiceId: "reject", outcomeCode: "rejected" },
        ],
        noResponseOutcomeCode: "no-response",
        requestSchemaRef: { digest: "b".repeat(64) },
        responseSchemaRef: { digest: "c".repeat(64) },
      },
    },
    {
      kind: "external-effect",
      outcomeCodes: ["committed"],
      retryPolicy: { maximumAttempts: 1, retryableOutcomeCodes: [] },
      effectPolicy: { executorProfileDigest: "d".repeat(64) },
    },
    { kind: "terminal", outcomeCodes: [] },
  ],
};

const authorityPlan = {
  organizationId: authorityGraph.organizationId,
  executionGraph: { id: authorityGraph.id, digest: authorityGraph.graphDigest },
  decisionSchemaRefs: [{ digest: "b".repeat(64) }, { digest: "c".repeat(64) }],
  executorProfileRefs: [{ digest: "d".repeat(64) }],
};

function authorityVector(overrides: Record<string, unknown> = {}) {
  return {
    domain: "authority",
    graph: structuredClone(authorityGraph),
    plan: structuredClone(authorityPlan),
    ...overrides,
  };
}

describe("authorized execution authority binding", () => {
  test("accepts exact graph, decision schema and executor profile bindings", () => {
    expect(evaluateAuthorizedExecutionVector(authorityVector())).toBe("authority-valid");
  });

  test("rejects a retry outcome outside the step's closed outcomes", () => {
    const graph = structuredClone(authorityGraph);
    const step = fixtureItem(graph.steps, 0);
    if (step.retryPolicy === undefined) throw new Error("Retry fixture policy is missing");
    step.retryPolicy.retryableOutcomeCodes = ["unknown"];
    expect(evaluateAuthorizedExecutionVector(authorityVector({ graph }))).toBe(
      "graph-policy-invalid",
    );
  });

  test("rejects a decision consequence outside the step's closed outcomes", () => {
    const graph = structuredClone(authorityGraph);
    const decision = fixtureItem(graph.steps, 1);
    if (decision.decisionPolicy === undefined)
      throw new Error("Decision fixture policy is missing");
    fixtureItem(decision.decisionPolicy.choices, 0).outcomeCode = "unknown";
    expect(evaluateAuthorizedExecutionVector(authorityVector({ graph }))).toBe(
      "graph-policy-invalid",
    );
  });

  test("rejects duplicate human-decision choice identities", () => {
    const graph = structuredClone(authorityGraph);
    const decision = fixtureItem(graph.steps, 1);
    if (decision.decisionPolicy === undefined)
      throw new Error("Decision fixture policy is missing");
    fixtureItem(decision.decisionPolicy.choices, 1).choiceId = "approve";
    expect(evaluateAuthorizedExecutionVector(authorityVector({ graph }))).toBe(
      "graph-policy-invalid",
    );
  });

  test("rejects graph, organization, decision schema or executor profile substitution", () => {
    const substitutions = [
      { plan: { ...authorityPlan, organizationId: "ten_0000000000000000" } },
      {
        plan: {
          ...authorityPlan,
          executionGraph: { ...authorityPlan.executionGraph, digest: "f".repeat(64) },
        },
      },
      { plan: { ...authorityPlan, decisionSchemaRefs: [{ digest: "f".repeat(64) }] } },
      { plan: { ...authorityPlan, executorProfileRefs: [{ digest: "f".repeat(64) }] } },
    ];
    for (const substitution of substitutions) {
      expect(evaluateAuthorizedExecutionVector(authorityVector(substitution))).toBe(
        "authority-binding-mismatch",
      );
    }
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
  orchestratorId: "orchestrator-1",
  authorizationDigest: "f".repeat(64),
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

  test("rejects malformed collision facts instead of treating them as absent", () => {
    expect(() =>
      evaluateAuthorizedExecutionVector(
        causalVector({
          collision: {
            id: currentEvent.id,
            sequence: "2",
            eventDigest: currentEvent.eventDigest,
          },
        }),
      ),
    ).toThrow("collision.sequence must be a safe integer");
  });

  test("rejects a changed organization identity", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({ current: { ...currentEvent, organizationId: "organization-2" } }),
      ),
    ).toBe("identity-mismatch");
  });

  test("rejects changed orchestrator or authorization authority", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({ current: { ...currentEvent, orchestratorId: "orchestrator-2" } }),
      ),
    ).toBe("identity-mismatch");
    expect(
      evaluateAuthorizedExecutionVector(
        causalVector({ current: { ...currentEvent, authorizationDigest: "e".repeat(64) } }),
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
  id: "response-1",
  responseDigest: "e".repeat(64),
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
    priorResponse: null,
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

  test("accepts only a digest-identical response replay", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        decisionVector({
          priorResponse: {
            id: decisionResponse.id,
            responseDigest: decisionResponse.responseDigest,
          },
        }),
      ),
    ).toBe("idempotent-duplicate");
    expect(
      evaluateAuthorizedExecutionVector(
        decisionVector({
          priorResponse: { id: decisionResponse.id, responseDigest: "f".repeat(64) },
        }),
      ),
    ).toBe("duplicate-divergent");
  });

  test("rejects non-UTC or malformed evaluation timestamps", () => {
    for (const now of ["tomorrow", "2026-02-30T00:00:00Z", "2026-09-10T13:00:00+01:00"]) {
      expect(() => evaluateAuthorizedExecutionVector(decisionVector({ now }))).toThrow(
        "now must be an ISO 8601 UTC timestamp",
      );
    }
  });

  test("treats the exact expiry instant as expired", () => {
    expect(
      evaluateAuthorizedExecutionVector(decisionVector({ now: decisionRequest.expiresAt })),
    ).toBe("request-expired");
  });
});

const transfer = {
  id: "transfer-1",
  transferDigest: "a".repeat(64),
  organizationId: "organization-1",
  missionId: "mission-1",
  predecessorRunId: "run-1",
  predecessorPlanDigest: "b".repeat(64),
  currentGeneration: 1,
  expectedRevision: 4,
  successorPlanDigest: "c".repeat(64),
  issuedAt: "2026-09-10T10:00:00Z",
  expiresAt: "2026-09-10T10:15:00Z",
};

const transferState = {
  organizationId: transfer.organizationId,
  missionId: transfer.missionId,
  predecessorRunId: transfer.predecessorRunId,
  predecessorPlanDigest: transfer.predecessorPlanDigest,
  currentGeneration: transfer.currentGeneration,
  revision: transfer.expectedRevision,
  successorPlanDigest: transfer.successorPlanDigest,
  generationConsumed: false,
};

function transferVector(overrides: Record<string, unknown> = {}) {
  return {
    domain: "transfer",
    transfer: structuredClone(transfer),
    state: structuredClone(transferState),
    collision: null,
    now: "2026-09-10T10:05:00Z",
    ...overrides,
  };
}

describe("authorized execution generation transfer", () => {
  test("accepts one exact transfer for the active generation", () => {
    expect(evaluateAuthorizedExecutionVector(transferVector())).toBe("transfer-valid");
  });

  test("makes an identical transfer replay idempotent and a divergent reuse quarantined", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        transferVector({
          collision: {
            id: transfer.id,
            currentGeneration: transfer.currentGeneration,
            transferDigest: transfer.transferDigest,
          },
        }),
      ),
    ).toBe("idempotent-duplicate");
    expect(
      evaluateAuthorizedExecutionVector(
        transferVector({
          collision: {
            id: transfer.id,
            currentGeneration: transfer.currentGeneration,
            transferDigest: "f".repeat(64),
          },
        }),
      ),
    ).toBe("duplicate-divergent");
  });

  test("keeps an identical replay idempotent after its generation was consumed", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        transferVector({
          state: { ...transferState, generationConsumed: true },
          collision: {
            id: transfer.id,
            currentGeneration: transfer.currentGeneration,
            transferDigest: transfer.transferDigest,
          },
        }),
      ),
    ).toBe("idempotent-duplicate");
  });

  test("rejects a consumed generation, stale revision or changed successor", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        transferVector({ state: { ...transferState, generationConsumed: true } }),
      ),
    ).toBe("generation-consumed");
    expect(
      evaluateAuthorizedExecutionVector(
        transferVector({ transfer: { ...transfer, expectedRevision: 3 } }),
      ),
    ).toBe("revision-stale");
    expect(
      evaluateAuthorizedExecutionVector(
        transferVector({ transfer: { ...transfer, successorPlanDigest: "f".repeat(64) } }),
      ),
    ).toBe("identity-mismatch");
  });

  test("rejects an expired transfer and malformed transfer timestamps", () => {
    expect(evaluateAuthorizedExecutionVector(transferVector({ now: transfer.expiresAt }))).toBe(
      "transfer-expired",
    );
    expect(() =>
      evaluateAuthorizedExecutionVector(
        transferVector({ transfer: { ...transfer, expiresAt: "2026-02-30T00:00:00Z" } }),
      ),
    ).toThrow("transfer.expiresAt must be an ISO 8601 UTC timestamp");
  });
});

const effectAttestation = {
  organizationId: "organization-1",
  runId: "run-2",
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
    expectedOrganizationId: effectAttestation.organizationId,
    expectedRunId: effectAttestation.runId,
    expectedAttemptId: effectAttestation.attemptId,
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

  test("rejects malformed prior emission facts", () => {
    expect(() =>
      evaluateAuthorizedExecutionVector(
        effectVector({
          priorEmission: {
            effectEmissionId: effectAttestation.effectEmissionId,
            emissionDigest: 7,
          },
        }),
      ),
    ).toThrow("priorEmission.emissionDigest must be a string");
  });

  test("rejects an attestation replayed from another organization, run or attempt", () => {
    expect(
      evaluateAuthorizedExecutionVector(
        effectVector({ attestation: { ...effectAttestation, organizationId: "organization-2" } }),
      ),
    ).toBe("organization-mismatch");
    expect(
      evaluateAuthorizedExecutionVector(
        effectVector({ attestation: { ...effectAttestation, runId: "run-1" } }),
      ),
    ).toBe("identity-mismatch");
    expect(
      evaluateAuthorizedExecutionVector(
        effectVector({ attestation: { ...effectAttestation, attemptId: "attempt-1" } }),
      ),
    ).toBe("attempt-mismatch");
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

  test("binds the committed graph and plan positive fixtures to one authority", async () => {
    const document = (await Bun.file("contracts/fixtures/schema-fixtures.v1.json").json()) as {
      cases: { schema: string; valid: unknown }[];
    };
    const graph = document.cases.find(
      (fixture) => fixture.schema === "execution-graph.v1.schema.json",
    )?.valid;
    const plan = document.cases.find(
      (fixture) => fixture.schema === "execution-plan-body.v2.schema.json",
    )?.valid;

    expect(evaluateAuthorizedExecutionVector({ domain: "authority", graph, plan })).toBe(
      "authority-valid",
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
