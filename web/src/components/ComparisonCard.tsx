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

  const buggyHash =
    buggyRun.faultPlan?.hash ?? "Unavailable";

  const fixedHash =
    fixedRun.faultPlan?.hash ?? "Unavailable";

  const sameFault =
    buggyRun.faultPlan?.hash &&
    fixedRun.faultPlan?.hash &&
    buggyRun.faultPlan.hash === fixedRun.faultPlan.hash;

  return (
    <section
      style={{
        marginTop: "32px",
        padding: "28px",
        border: "1px solid #cbd5e1",
        borderRadius: "14px",
        background: "#ffffff",
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        Buggy vs Fixed
      </h2>

      <p>
        Same stored fault snapshot:{" "}
        <strong>
          {sameFault ? "YES" : "NO"}
        </strong>
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr 1fr",
          gap: "12px 24px",
          alignItems: "center",
          marginTop: "24px",
        }}
      >
        <strong></strong>
        <strong>BUGGY</strong>
        <strong>FIXED</strong>

        <span>Fault</span>
        <span>
          {buggyRun.faultPlan?.name ?? "—"}
        </span>
        <span>
          {fixedRun.faultPlan?.name ?? "—"}
        </span>

        <span>Fault hash</span>
        <code title={buggyHash}>
          {buggyHash.slice(0, 10)}...
        </code>
        <code title={fixedHash}>
          {fixedHash.slice(0, 10)}...
        </code>

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
        <strong style={{ color: "#b91c1c" }}>
          UNSAFE
        </strong>

        <strong style={{ color: "#15803d" }}>
          CORRECT UNDER TESTED FAULT
        </strong>
      </div>
    </section>
  );
}

export default ComparisonCard;