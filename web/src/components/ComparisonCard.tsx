import type { RunResponse } from "../api/runs";

interface ComparisonCardProps {
  buggyRun: RunResponse;
  fixedRun: RunResponse;
}

function countAttempts(run: RunResponse) {
  return (run.traces ?? []).filter(
    (trace) =>
      trace.component === "ChargePayment" &&
      trace.phase === "ATTEMPT_STARTED",
  ).length;
}

function countCharges(run: RunResponse) {
  return (run.traces ?? []).filter(
    (trace) =>
      trace.operation === "PaymentCharged" &&
      trace.phase === "SIDE_EFFECT_COMMITTED",
  ).length;
}

function shortHash(hash?: string) {
  if (!hash) {
    return "Unavailable";
  }

  return hash.length > 12
    ? `${hash.slice(0, 12)}...`
    : hash;
}

function ComparisonCard({
  buggyRun,
  fixedRun,
}: ComparisonCardProps) {
  const buggyAttempts = countAttempts(buggyRun);
  const fixedAttempts = countAttempts(fixedRun);

  const buggyCharges = countCharges(buggyRun);
  const fixedCharges = countCharges(fixedRun);

  const buggyInvariant =
    buggyRun.invariant?.status ?? "UNKNOWN";

  const fixedInvariant =
    fixedRun.invariant?.status ?? "UNKNOWN";

  const buggyFault = buggyRun.faultPlan;
  const fixedFault = fixedRun.faultPlan;

  const samePlanId =
    Boolean(buggyFault?.planId) &&
    buggyFault?.planId === fixedFault?.planId;

  const sameHash =
    Boolean(buggyFault?.hash) &&
    buggyFault?.hash === fixedFault?.hash;

  const sameDefinition =
    buggyFault?.type === fixedFault?.type &&
    buggyFault?.target === fixedFault?.target &&
    buggyFault?.attempt === fixedFault?.attempt;

  const sameFaultSnapshot =
    samePlanId &&
    sameHash &&
    sameDefinition;

  return (
    <section
      style={{
        marginTop: "32px",
        padding: "28px",
        borderRadius: "14px",
        border: "1px solid #cbd5e1",
        background: "#ffffff",
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        Buggy vs Fixed
      </h2>

      <p
        style={{
          color: "#64748b",
          marginBottom: "24px",
        }}
      >
        Both workflow versions are compared under the
        same stored failure schedule.
      </p>

      <section
        style={{
          padding: "20px",
          marginBottom: "28px",
          borderRadius: "12px",
          border: sameFaultSnapshot
            ? "2px solid #16a34a"
            : "2px solid #dc2626",
          background: sameFaultSnapshot
            ? "#f0fdf4"
            : "#fff1f2",
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          Fault Plan Verification
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 1fr",
            gap: "14px 24px",
            alignItems: "center",
          }}
        >
          <strong></strong>
          <strong>BUGGY</strong>
          <strong>FIXED</strong>

          <span>Plan ID</span>
          <code>
            {buggyFault?.planId ?? "Unavailable"}
          </code>
          <code>
            {fixedFault?.planId ?? "Unavailable"}
          </code>

          <span>Fault type</span>
          <code>
            {buggyFault?.type ?? "Unavailable"}
          </code>
          <code>
            {fixedFault?.type ?? "Unavailable"}
          </code>

          <span>Target</span>
          <span>
            {buggyFault?.target ?? "Unavailable"}
          </span>
          <span>
            {fixedFault?.target ?? "Unavailable"}
          </span>

          <span>Attempt</span>
          <span>
            {buggyFault?.attempt ?? "Unavailable"}
          </span>
          <span>
            {fixedFault?.attempt ?? "Unavailable"}
          </span>

          <span>SHA-256</span>
          <code title={buggyFault?.hash}>
            {shortHash(buggyFault?.hash)}
          </code>
          <code title={fixedFault?.hash}>
            {shortHash(fixedFault?.hash)}
          </code>
        </div>

        <div
          style={{
            marginTop: "22px",
            padding: "12px",
            borderRadius: "8px",
            textAlign: "center",
            fontWeight: 800,
            color: sameFaultSnapshot
              ? "#15803d"
              : "#b91c1c",
          }}
        >
          {sameFaultSnapshot
            ? "✓ SAME STORED FAULT SNAPSHOT"
            : "⚠ FAULT SNAPSHOTS DO NOT MATCH"}
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr 1fr",
          gap: "14px 24px",
          alignItems: "center",
        }}
      >
        <strong></strong>
        <strong>BUGGY</strong>
        <strong>FIXED</strong>

        <span>Charge attempts</span>
        <strong>{buggyAttempts}</strong>
        <strong>{fixedAttempts}</strong>

        <span>Committed charges</span>
        <strong>{buggyCharges}</strong>
        <strong>{fixedCharges}</strong>

        <span>Invariant</span>

        <strong
          style={{
            color:
              buggyInvariant === "FAILED"
                ? "#b91c1c"
                : "#15803d",
          }}
        >
          {buggyInvariant}
        </strong>

        <strong
          style={{
            color:
              fixedInvariant === "PASSED"
                ? "#15803d"
                : "#b91c1c",
          }}
        >
          {fixedInvariant}
        </strong>

        <span>Outcome</span>

        <strong
          style={{
            color: "#b91c1c",
          }}
        >
          UNSAFE
        </strong>

        <strong
          style={{
            color: "#15803d",
          }}
        >
          CORRECT UNDER TESTED FAULT
        </strong>
      </div>
    </section>
  );
}

export default ComparisonCard;