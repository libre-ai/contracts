type JsonRecord = Record<string, unknown>;

export type AuthorizedExecutionOutcome =
  | "graph-valid"
  | "duplicate-step"
  | "duplicate-edge"
  | "entry-missing"
  | "dangling-edge"
  | "route-missing"
  | "route-ambiguous"
  | "unreachable-step"
  | "terminal-unreachable"
  | "terminal-has-outgoing-edge"
  | "cycle-forbidden"
  | "event-valid"
  | "idempotent-duplicate"
  | "duplicate-divergent"
  | "identity-mismatch"
  | "generation-stale"
  | "sequence-invalid"
  | "previous-digest-mismatch"
  | "budget-decreased"
  | "budget-arithmetic-invalid"
  | "decision-valid"
  | "request-expired"
  | "request-replaced"
  | "request-consumed"
  | "choice-unknown"
  | "actor-unauthorized"
  | "revision-stale"
  | "attempt-mismatch"
  | "organization-mismatch"
  | "effect-valid"
  | "emission-duplicate"
  | "emission-divergent"
  | "second-emission-for-attempt"
  | "fencing-stale"
  | "executor-unqualified"
  | "effect-state-unknown"
  | "predecessor-effects-nonterminal"
  | "generation-consumed"
  | "lineage-administratively-closed";

export const authorizedExecutionOutcomes = [
  "graph-valid",
  "duplicate-step",
  "duplicate-edge",
  "entry-missing",
  "dangling-edge",
  "route-missing",
  "route-ambiguous",
  "unreachable-step",
  "terminal-unreachable",
  "terminal-has-outgoing-edge",
  "cycle-forbidden",
  "event-valid",
  "idempotent-duplicate",
  "duplicate-divergent",
  "identity-mismatch",
  "generation-stale",
  "sequence-invalid",
  "previous-digest-mismatch",
  "budget-decreased",
  "budget-arithmetic-invalid",
  "decision-valid",
  "request-expired",
  "request-replaced",
  "request-consumed",
  "choice-unknown",
  "actor-unauthorized",
  "revision-stale",
  "attempt-mismatch",
  "organization-mismatch",
  "effect-valid",
  "emission-duplicate",
  "emission-divergent",
  "second-emission-for-attempt",
  "fencing-stale",
  "executor-unqualified",
  "effect-state-unknown",
  "predecessor-effects-nonterminal",
  "generation-consumed",
  "lineage-administratively-closed",
] as const satisfies readonly AuthorizedExecutionOutcome[];

const authorizedExecutionOutcomeSet = new Set<string>(authorizedExecutionOutcomes);
const authorizedExecutionDomains = new Set(["graph", "causal", "decision", "effect"]);

interface GraphStep {
  stepId: string;
  kind: string;
  outcomeCodes: string[];
}

interface GraphEdge {
  edgeId: string;
  fromStepId: string;
  outcomeCode: string;
  toStepId: string;
}

interface GraphFacts {
  entryStepId: string;
  steps: GraphStep[];
  edges: GraphEdge[];
}

interface BudgetCounters {
  durationSeconds: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  processesStarted: number;
  filesChanged: number;
  changedBytes: number;
}

interface CausalEventFacts {
  id: string;
  eventDigest: string;
  organizationId: string;
  missionId: string;
  planDigest: string;
  graphDigest: string;
  runId: string;
  generation: number;
  sequence: number;
  previousEventDigest: string | null;
  budgetDelta: BudgetCounters;
  budgetTotal: BudgetCounters;
}

interface CollisionFacts {
  id: string;
  sequence: number;
  eventDigest: string;
}

interface DecisionRequestFacts {
  organizationId: string;
  attemptId: string;
  requestDigest: string;
  choiceIds: string[];
  requiredRole: string;
  expectedRevision: number;
  expiresAt: string;
}

interface DecisionResponseFacts {
  organizationId: string;
  attemptId: string;
  requestDigest: string;
  choiceId: string;
  actorRoles: string[];
  expectedRevision: number;
}

interface EffectAttestationFacts {
  organizationId: string;
  generation: number;
  attemptId: string;
  effectId: string;
  effectEmissionId: string;
  emissionDigest: string;
  fencing: number;
  status: string;
}

interface PriorEmissionFacts {
  effectEmissionId: string;
  emissionDigest: string;
}

const budgetKeys = [
  "durationSeconds",
  "toolCalls",
  "inputTokens",
  "outputTokens",
  "processesStarted",
  "filesChanged",
  "changedBytes",
] as const satisfies readonly (keyof BudgetCounters)[];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value as number;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${label} must be a string array`);
  }
  return value;
}

function graphFacts(value: unknown): GraphFacts {
  const graph = requireRecord(value, "graph");
  if (!Array.isArray(graph.steps) || !Array.isArray(graph.edges)) {
    throw new TypeError("graph steps and edges must be arrays");
  }
  return {
    entryStepId: requireString(graph.entryStepId, "graph.entryStepId"),
    steps: graph.steps.map((raw, index) => {
      const step = requireRecord(raw, `graph.steps.${index}`);
      return {
        stepId: requireString(step.stepId, `graph.steps.${index}.stepId`),
        kind: requireString(step.kind, `graph.steps.${index}.kind`),
        outcomeCodes: requireStringArray(step.outcomeCodes, `graph.steps.${index}.outcomeCodes`),
      };
    }),
    edges: graph.edges.map((raw, index) => {
      const edge = requireRecord(raw, `graph.edges.${index}`);
      return {
        edgeId: requireString(edge.edgeId, `graph.edges.${index}.edgeId`),
        fromStepId: requireString(edge.fromStepId, `graph.edges.${index}.fromStepId`),
        outcomeCode: requireString(edge.outcomeCode, `graph.edges.${index}.outcomeCode`),
        toStepId: requireString(edge.toStepId, `graph.edges.${index}.toStepId`),
      };
    }),
  };
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function evaluateGraph(value: unknown): AuthorizedExecutionOutcome {
  const graph = graphFacts(value);
  if (hasDuplicate(graph.steps.map((step) => step.stepId))) return "duplicate-step";
  if (hasDuplicate(graph.edges.map((edge) => edge.edgeId))) return "duplicate-edge";

  const steps = new Map(graph.steps.map((step) => [step.stepId, step]));
  if (!steps.has(graph.entryStepId)) return "entry-missing";
  if (graph.edges.some((edge) => !steps.has(edge.fromStepId) || !steps.has(edge.toStepId))) {
    return "dangling-edge";
  }

  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const step of graph.steps) {
    outgoing.set(step.stepId, []);
    incoming.set(step.stepId, []);
  }
  for (const edge of graph.edges) {
    outgoing.get(edge.fromStepId)?.push(edge);
    incoming.get(edge.toStepId)?.push(edge);
  }

  for (const step of graph.steps) {
    const routes = outgoing.get(step.stepId) ?? [];
    if (step.kind === "terminal" && routes.length > 0) return "terminal-has-outgoing-edge";
    if (step.kind === "terminal") continue;
    for (const outcome of step.outcomeCodes) {
      const count = routes.filter((edge) => edge.outcomeCode === outcome).length;
      if (count === 0) return "route-missing";
      if (count > 1) return "route-ambiguous";
    }
    if (routes.some((edge) => !step.outcomeCodes.includes(edge.outcomeCode))) {
      return "route-ambiguous";
    }
  }

  const terminalIds = new Set(
    graph.steps.filter((step) => step.kind === "terminal").map((step) => step.stepId),
  );
  const canReachTerminal = new Set(terminalIds);
  const reverseQueue = [...terminalIds];
  for (let index = 0; index < reverseQueue.length; index += 1) {
    const current = reverseQueue[index];
    if (current === undefined) continue;
    for (const edge of incoming.get(current) ?? []) {
      if (canReachTerminal.has(edge.fromStepId)) continue;
      canReachTerminal.add(edge.fromStepId);
      reverseQueue.push(edge.fromStepId);
    }
  }
  if (graph.steps.some((step) => !canReachTerminal.has(step.stepId))) {
    return "terminal-unreachable";
  }

  const reachable = new Set([graph.entryStepId]);
  const queue = [graph.entryStepId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === undefined) continue;
    for (const edge of outgoing.get(current) ?? []) {
      if (reachable.has(edge.toStepId)) continue;
      reachable.add(edge.toStepId);
      queue.push(edge.toStepId);
    }
  }
  if (graph.steps.some((step) => !reachable.has(step.stepId))) return "unreachable-step";

  const indegree = new Map(graph.steps.map((step) => [step.stepId, 0]));
  for (const edge of graph.edges) {
    indegree.set(edge.toStepId, (indegree.get(edge.toStepId) ?? 0) + 1);
  }
  const roots = graph.steps
    .filter((step) => indegree.get(step.stepId) === 0)
    .map((step) => step.stepId);
  let visited = 0;
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    if (current === undefined) continue;
    visited += 1;
    for (const edge of outgoing.get(current) ?? []) {
      const next = (indegree.get(edge.toStepId) ?? 0) - 1;
      indegree.set(edge.toStepId, next);
      if (next === 0) roots.push(edge.toStepId);
    }
  }
  return visited === graph.steps.length ? "graph-valid" : "cycle-forbidden";
}

function budgetFacts(value: unknown, label: string): BudgetCounters {
  const record = requireRecord(value, label);
  return Object.fromEntries(
    budgetKeys.map((key) => [key, requireInteger(record[key], `${label}.${key}`)]),
  ) as unknown as BudgetCounters;
}

function causalEventFacts(value: unknown, label: string): CausalEventFacts {
  const event = requireRecord(value, label);
  const previousEventDigest = event.previousEventDigest;
  if (previousEventDigest !== null && typeof previousEventDigest !== "string") {
    throw new TypeError(`${label}.previousEventDigest must be a string or null`);
  }
  return {
    id: requireString(event.id, `${label}.id`),
    eventDigest: requireString(event.eventDigest, `${label}.eventDigest`),
    organizationId: requireString(event.organizationId, `${label}.organizationId`),
    missionId: requireString(event.missionId, `${label}.missionId`),
    planDigest: requireString(event.planDigest, `${label}.planDigest`),
    graphDigest: requireString(event.graphDigest, `${label}.graphDigest`),
    runId: requireString(event.runId, `${label}.runId`),
    generation: requireInteger(event.generation, `${label}.generation`),
    sequence: requireInteger(event.sequence, `${label}.sequence`),
    previousEventDigest,
    budgetDelta: budgetFacts(event.budgetDelta, `${label}.budgetDelta`),
    budgetTotal: budgetFacts(event.budgetTotal, `${label}.budgetTotal`),
  };
}

function sameCausalAuthority(previous: CausalEventFacts, current: CausalEventFacts): boolean {
  return (
    previous.organizationId === current.organizationId &&
    previous.missionId === current.missionId &&
    previous.planDigest === current.planDigest &&
    previous.graphDigest === current.graphDigest &&
    previous.runId === current.runId
  );
}

function evaluateCausal(vector: JsonRecord): AuthorizedExecutionOutcome {
  const previous = causalEventFacts(vector.previous, "previous");
  const current = causalEventFacts(vector.current, "current");
  const collision =
    vector.collision === null
      ? null
      : (requireRecord(vector.collision, "collision") as unknown as CollisionFacts);
  if (collision !== null) {
    const sameId = current.id === collision.id;
    const sameSequence = current.sequence === collision.sequence;
    if (sameId && sameSequence && current.eventDigest === collision.eventDigest) {
      return "idempotent-duplicate";
    }
    if (sameId || sameSequence) return "duplicate-divergent";
  }
  if (!sameCausalAuthority(previous, current)) return "identity-mismatch";
  if (current.generation < previous.generation) return "generation-stale";
  if (current.generation !== previous.generation) return "identity-mismatch";
  if (current.sequence !== previous.sequence + 1) return "sequence-invalid";
  if (current.previousEventDigest !== previous.eventDigest) return "previous-digest-mismatch";
  for (const key of budgetKeys) {
    if (current.budgetTotal[key] < previous.budgetTotal[key]) return "budget-decreased";
    const expected = previous.budgetTotal[key] + current.budgetDelta[key];
    if (!Number.isSafeInteger(expected) || current.budgetTotal[key] !== expected) {
      return "budget-arithmetic-invalid";
    }
  }
  return "event-valid";
}

function decisionRequestFacts(value: unknown): DecisionRequestFacts {
  const request = requireRecord(value, "request");
  return {
    organizationId: requireString(request.organizationId, "request.organizationId"),
    attemptId: requireString(request.attemptId, "request.attemptId"),
    requestDigest: requireString(request.requestDigest, "request.requestDigest"),
    choiceIds: requireStringArray(request.choiceIds, "request.choiceIds"),
    requiredRole: requireString(request.requiredRole, "request.requiredRole"),
    expectedRevision: requireInteger(request.expectedRevision, "request.expectedRevision"),
    expiresAt: requireString(request.expiresAt, "request.expiresAt"),
  };
}

function decisionResponseFacts(value: unknown): DecisionResponseFacts {
  const response = requireRecord(value, "response");
  return {
    organizationId: requireString(response.organizationId, "response.organizationId"),
    attemptId: requireString(response.attemptId, "response.attemptId"),
    requestDigest: requireString(response.requestDigest, "response.requestDigest"),
    choiceId: requireString(response.choiceId, "response.choiceId"),
    actorRoles: requireStringArray(response.actorRoles, "response.actorRoles"),
    expectedRevision: requireInteger(response.expectedRevision, "response.expectedRevision"),
  };
}

function evaluateDecision(vector: JsonRecord): AuthorizedExecutionOutcome {
  const request = decisionRequestFacts(vector.request);
  const response = decisionResponseFacts(vector.response);
  if (response.organizationId !== request.organizationId) return "organization-mismatch";
  if (response.attemptId !== request.attemptId) return "attempt-mismatch";
  if (Date.parse(requireString(vector.now, "now")) > Date.parse(request.expiresAt)) {
    return "request-expired";
  }
  if (requireBoolean(vector.replaced, "replaced")) return "request-replaced";
  if (requireBoolean(vector.consumed, "consumed")) return "request-consumed";
  if (response.requestDigest !== request.requestDigest) return "request-replaced";
  if (!request.choiceIds.includes(response.choiceId)) return "choice-unknown";
  if (!response.actorRoles.includes(request.requiredRole)) return "actor-unauthorized";
  if (response.expectedRevision !== request.expectedRevision) return "revision-stale";
  return "decision-valid";
}

function effectAttestationFacts(value: unknown): EffectAttestationFacts {
  const attestation = requireRecord(value, "attestation");
  return {
    organizationId: requireString(attestation.organizationId, "attestation.organizationId"),
    generation: requireInteger(attestation.generation, "attestation.generation"),
    attemptId: requireString(attestation.attemptId, "attestation.attemptId"),
    effectId: requireString(attestation.effectId, "attestation.effectId"),
    effectEmissionId: requireString(attestation.effectEmissionId, "attestation.effectEmissionId"),
    emissionDigest: requireString(attestation.emissionDigest, "attestation.emissionDigest"),
    fencing: requireInteger(attestation.fencing, "attestation.fencing"),
    status: requireString(attestation.status, "attestation.status"),
  };
}

function evaluateEffect(vector: JsonRecord): AuthorizedExecutionOutcome {
  const attestation = effectAttestationFacts(vector.attestation);
  if (requireBoolean(vector.lineageClosed, "lineageClosed")) {
    return "lineage-administratively-closed";
  }
  if (requireBoolean(vector.generationConsumed, "generationConsumed")) {
    return "generation-consumed";
  }
  if (attestation.generation !== requireInteger(vector.currentGeneration, "currentGeneration")) {
    return "generation-stale";
  }
  if (vector.priorEmission !== null) {
    const prior = requireRecord(
      vector.priorEmission,
      "priorEmission",
    ) as unknown as PriorEmissionFacts;
    if (prior.effectEmissionId === attestation.effectEmissionId) {
      return prior.emissionDigest === attestation.emissionDigest
        ? "emission-duplicate"
        : "emission-divergent";
    }
  }
  if (
    vector.existingAttemptEmissionId !== null &&
    requireString(vector.existingAttemptEmissionId, "existingAttemptEmissionId") !==
      attestation.effectEmissionId
  ) {
    return "second-emission-for-attempt";
  }
  if (attestation.fencing !== requireInteger(vector.activeFencing, "activeFencing")) {
    return "fencing-stale";
  }
  if (!requireBoolean(vector.executorProfileQualified, "executorProfileQualified")) {
    return "executor-unqualified";
  }
  if (attestation.status === "state-unknown") return "effect-state-unknown";
  if (!requireBoolean(vector.predecessorEffectsTerminal, "predecessorEffectsTerminal")) {
    return "predecessor-effects-nonterminal";
  }
  return "effect-valid";
}

export function evaluateAuthorizedExecutionVector(vector: unknown): AuthorizedExecutionOutcome {
  const record = requireRecord(vector, "vector");
  switch (record.domain) {
    case "graph":
      return evaluateGraph(record.graph);
    case "causal":
      return evaluateCausal(record);
    case "decision":
      return evaluateDecision(record);
    case "effect":
      return evaluateEffect(record);
    default:
      throw new TypeError("vector.domain is unknown");
  }
}

function hasExactKeys(record: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

export function authorizedExecutionVectorDocumentFailures(document: unknown): string[] {
  const failures: string[] = [];
  if (!isRecord(document)) return ["document root must be an object"];
  if (!hasExactKeys(document, ["cases", "schemaVersion"])) {
    failures.push("document root has unknown or missing properties");
  }
  if (document.schemaVersion !== "libre-ai.authorized-execution-semantic-vectors.v1") {
    failures.push("document schemaVersion is invalid");
  }
  if (!Array.isArray(document.cases) || document.cases.length < 1 || document.cases.length > 256) {
    failures.push("document cases must contain between 1 and 256 items");
    return failures;
  }

  const ids = new Set<string>();
  const outcomes = new Set<string>();
  for (const [index, rawCase] of document.cases.entries()) {
    const label = `case[${index}]`;
    if (!isRecord(rawCase)) {
      failures.push(`${label} must be an object`);
      continue;
    }
    if (!hasExactKeys(rawCase, ["domain", "expected", "id", "input"])) {
      failures.push(`${label} has unknown properties`);
    }
    if (typeof rawCase.id !== "string" || !/^[a-z0-9-]{1,128}$/.test(rawCase.id)) {
      failures.push(`${label} id is invalid`);
    } else if (ids.has(rawCase.id)) {
      failures.push(`${label} id is duplicated`);
    } else {
      ids.add(rawCase.id);
    }
    if (typeof rawCase.domain !== "string" || !authorizedExecutionDomains.has(rawCase.domain)) {
      failures.push(`${label} domain is invalid`);
      continue;
    }
    if (!isRecord(rawCase.input) || rawCase.input.domain !== rawCase.domain) {
      failures.push(`${label} domain does not match input.domain`);
      continue;
    }
    if (
      typeof rawCase.expected !== "string" ||
      !authorizedExecutionOutcomeSet.has(rawCase.expected)
    ) {
      failures.push(`${label} expected outcome is invalid`);
      continue;
    }
    outcomes.add(rawCase.expected);
    try {
      if (evaluateAuthorizedExecutionVector(rawCase.input) !== rawCase.expected) {
        failures.push(`${label} replay outcome differs from expected`);
      }
    } catch {
      failures.push(`${label} input is structurally invalid`);
    }
  }
  for (const outcome of authorizedExecutionOutcomes) {
    if (!outcomes.has(outcome)) failures.push(`outcome ${outcome} is not covered`);
  }
  return failures;
}

const expectedExecutionRecordRetentionRule = {
  id: "orchestrator-execution-record",
  owner: "agent-orchestrator",
  dataClass: "content-free-authorized-execution-state",
  location: "postgresql",
  mode: "fixed",
  trigger: "creation",
  defaultRetention: "P1Y",
  configurable: { maximum: "P6Y" },
  effectiveRetentionEqualsRule: "mission-record",
};

const expectedExecutionTombstoneRetentionRule = {
  id: "execution-deletion-tombstone",
  owner: "agent-orchestrator",
  dataClass: "content-free-execution-deletion-tombstone",
  location: "postgresql",
  mode: "fixed",
  trigger: "explicit-delete",
  defaultRetention: "P35D",
};

export function retentionPolicyV2Failures(v1Document: unknown, v2Document: unknown): string[] {
  const failures: string[] = [];
  if (!isRecord(v1Document) || !Array.isArray(v1Document.rules)) {
    return ["retention v1 authority is structurally invalid"];
  }
  if (!isRecord(v2Document) || !Array.isArray(v2Document.rules)) {
    return ["retention v2 authority is structurally invalid"];
  }
  if (v2Document.schemaVersion !== "libre-ai.retention-policy.v2") {
    failures.push("retention v2 schemaVersion is invalid");
  }
  if (v2Document.backupExpiry !== v1Document.backupExpiry) {
    failures.push("backup expiry has changed");
  }
  if (
    !Array.isArray(v2Document.restoreOrder) ||
    canonicalJson(v2Document.restoreOrder) !==
      canonicalJson(["execution-deletion-tombstone", "orchestrator-execution-record"])
  ) {
    failures.push("restore order is not tombstone-first");
  }

  const v1Rules = v1Document.rules.filter(isRecord);
  const v2Rules = v2Document.rules.filter(isRecord);
  const v2RulesById = new Map(
    v2Rules
      .filter((rule): rule is JsonRecord & { id: string } => typeof rule.id === "string")
      .map((rule) => [rule.id, rule]),
  );
  if (v2RulesById.size !== v2Rules.length) failures.push("v2 rule ids are invalid or duplicated");
  for (const inheritedRule of v1Rules) {
    if (typeof inheritedRule.id !== "string") {
      failures.push("v1 rule id is invalid");
      continue;
    }
    const successor = v2RulesById.get(inheritedRule.id);
    if (successor === undefined) failures.push("inherited rule is missing");
    else if (canonicalJson(successor) !== canonicalJson(inheritedRule)) {
      failures.push("inherited rule has changed");
    }
  }
  if (v2Rules.length !== v1Rules.length + 2) failures.push("v2 rule inventory is invalid");
  const executionRecordRule = v2RulesById.get("orchestrator-execution-record");
  if (
    executionRecordRule === undefined ||
    canonicalJson(executionRecordRule) !== canonicalJson(expectedExecutionRecordRetentionRule)
  ) {
    failures.push("orchestrator execution record rule is invalid");
  }
  const tombstoneRule = v2RulesById.get("execution-deletion-tombstone");
  if (
    tombstoneRule === undefined ||
    canonicalJson(tombstoneRule) !== canonicalJson(expectedExecutionTombstoneRetentionRule)
  ) {
    failures.push("execution deletion tombstone rule is invalid");
  }
  return failures;
}

const authorizedExecutionDigestFields = new Map<string, readonly string[]>([
  ["execution-graph.v1.schema.json", ["graphDigest"]],
  ["execution-plan-body.v2.schema.json", ["bodyDigest"]],
  ["execution-transfer.v1.schema.json", ["transferDigest"]],
  ["execution-authorization.v2.schema.json", ["authorizationDigest"]],
  ["human-decision-request.v1.schema.json", ["requestDigest"]],
  ["human-decision-response.v1.schema.json", ["responseDigest"]],
  ["step-invocation.v1.schema.json", ["invocationDigest"]],
  ["effect-attestation.v1.schema.json", ["preimageDigest", "signature"]],
  ["orchestrator-event.v3.schema.json", ["eventDigest"]],
]);

function containsProperty(value: unknown, names: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => containsProperty(item, names));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => names.has(key) || containsProperty(child, names),
  );
}

export async function digestVectorDocumentFailures(document: unknown): Promise<string[]> {
  const failures: string[] = [];
  if (!isRecord(document)) return ["digest vector root must be an object"];
  if (!hasExactKeys(document, ["cases", "schemaVersion"])) {
    failures.push("digest vector root has unknown or missing properties");
  }
  if (document.schemaVersion !== "libre-ai.authorized-execution-digest-vectors.v1") {
    failures.push("digest vector schemaVersion is invalid");
  }
  if (!Array.isArray(document.cases) || document.cases.length !== 9) {
    failures.push("digest vector inventory is incomplete");
    if (!Array.isArray(document.cases)) return failures;
  }

  const schemas = new Set<string>();
  const ids = new Set<string>();
  for (const [index, rawCase] of document.cases.entries()) {
    const label = `case[${index}]`;
    if (!isRecord(rawCase)) {
      failures.push(`${label} must be an object`);
      continue;
    }
    if (
      !hasExactKeys(rawCase, [
        "digestField",
        "excludedFields",
        "expectedDigest",
        "id",
        "schema",
        "unsignedPayload",
      ])
    ) {
      failures.push(`${label} has unknown or missing properties`);
    }
    if (typeof rawCase.id !== "string" || !/^[a-z0-9-]{1,128}$/.test(rawCase.id)) {
      failures.push(`${label} id is invalid`);
    } else if (ids.has(rawCase.id)) {
      failures.push(`${label} id is duplicated`);
    } else {
      ids.add(rawCase.id);
    }
    if (typeof rawCase.schema !== "string") {
      failures.push(`${label} schema is invalid`);
      continue;
    }
    const expectedExcludedFields = authorizedExecutionDigestFields.get(rawCase.schema);
    if (expectedExcludedFields === undefined) {
      failures.push(`${label} schema is not in the digest inventory`);
      continue;
    }
    if (schemas.has(rawCase.schema)) failures.push(`${label} schema is duplicated`);
    else schemas.add(rawCase.schema);
    if (
      rawCase.digestField !== expectedExcludedFields[0] ||
      !Array.isArray(rawCase.excludedFields) ||
      canonicalJson(rawCase.excludedFields) !== canonicalJson(expectedExcludedFields)
    ) {
      failures.push(`${label} excluded fields are invalid`);
      continue;
    }
    if (
      !isRecord(rawCase.unsignedPayload) ||
      containsProperty(rawCase.unsignedPayload, new Set(expectedExcludedFields))
    ) {
      failures.push(`${label} unsigned payload contains an excluded field`);
      continue;
    }
    if (
      typeof rawCase.expectedDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(rawCase.expectedDigest)
    ) {
      failures.push(`${label} expected digest is invalid`);
      continue;
    }
    try {
      if ((await sha256Canonical(rawCase.unsignedPayload)) !== rawCase.expectedDigest) {
        failures.push(`${label} digest does not reproduce`);
      }
    } catch {
      failures.push(`${label} unsigned payload is not canonical JSON input`);
    }
  }
  if (schemas.size !== authorizedExecutionDigestFields.size) {
    failures.push("digest vector inventory is incomplete");
  }
  return failures;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new TypeError("canonical numbers must be safe integers");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new TypeError("canonical value must be JSON-compatible");
  const keys = Object.keys(value).sort();
  const properties = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${properties.join(",")}}`;
}

export async function sha256Canonical(value: unknown): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(canonicalJson(value));
  return hasher.digest("hex");
}
