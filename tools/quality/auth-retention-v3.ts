import Ajv2020 from "ajv/dist/2020";
import schema from "../../contracts/schemas/retention-policy.v3.schema.json";

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

/** Contract conformance only: no deletion, storage grant or authorization is performed. */
export function retentionV3Failures(value: unknown): string[] {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => `${error.instancePath}: ${error.keyword}`);
}

type Decision = "retain" | "delete" | "deny" | "rebuild";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Synthetic vector oracle, not a runtime session validity or SQL concurrency verifier. */
export function evaluateAuthRetention(value: unknown): Decision {
  if (!record(value)) return "deny";
  if (value.kind === "oidc") {
    if (!exactKeys(value, ["kind", "createdAtMs", "expiresAtMs", "nowMs", "consumed"]))
      return "deny";
    const { createdAtMs, expiresAtMs, nowMs, consumed } = value;
    if (
      !timestamp(createdAtMs) ||
      !timestamp(expiresAtMs) ||
      !timestamp(nowMs) ||
      typeof consumed !== "boolean"
    )
      return "deny";
    if (expiresAtMs <= createdAtMs || expiresAtMs - createdAtMs > 600_000 || nowMs < createdAtMs)
      return "deny";
    return consumed || nowMs >= expiresAtMs ? "delete" : "retain";
  }
  if (value.kind === "session-locator") {
    if (
      !exactKeys(value, ["kind", "sourcePresent", "digestCurrent"]) ||
      typeof value.sourcePresent !== "boolean" ||
      typeof value.digestCurrent !== "boolean"
    )
      return "deny";
    return value.sourcePresent && value.digestCurrent ? "retain" : "delete";
  }
  if (value.kind === "membership-projection" || value.kind === "subject-locator") {
    if (
      !exactKeys(value, ["kind", "sourcePresent", "sourceActive", "freshness"]) ||
      typeof value.sourcePresent !== "boolean" ||
      typeof value.sourceActive !== "boolean" ||
      typeof value.freshness !== "string" ||
      !["verified-current", "unknown", "stale"].includes(value.freshness)
    )
      return "deny";
    return value.sourcePresent && value.sourceActive && value.freshness === "verified-current"
      ? "retain"
      : "delete";
  }
  if (value.kind === "restore") {
    const prerequisites = [
      "sessionsDiscarded",
      "oidcDiscarded",
      "locatorsDiscarded",
      "epochsInvalidated",
      "deletionEvidenceReplayed",
      "currentSessionsAuthority",
      "controllerStateAbsent",
      "executionDeletionOrderPreserved",
    ];
    if (!exactKeys(value, ["kind", ...prerequisites])) return "deny";
    return prerequisites.every((key) => value[key] === true) ? "rebuild" : "deny";
  }
  return "deny";
}
