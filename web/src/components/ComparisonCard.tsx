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

  const buggyCharges =
    buggyRun.invariant?.actualChargeCount ?? "Unavailable";

  const fixedCharges =
    fixedRun.invariant?.actualChargeCount ?? "Unavailable";

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
    <section className="cf-comparison-card">
      <div className="cf-comparison-heading">
        <div>
          <div className="cf-section-label">
            OUTCOME COMPARISON
          </div>

          <h2>Buggy vs Fixed</h2>

          <p>
            Same failure schedule. Same retry pressure.
            Different business outcome.
          </p>
        </div>

        <span
          className={`cf-fault-match-badge ${
            sameFaultSnapshot
              ? "verified"
              : "mismatch"
          }`}
        >
          {sameFaultSnapshot
            ? "✓ SAME FAULT"
            : "! FAULT MISMATCH"}
        </span>
      </div>

      <div className="cf-outcome-columns">
        <div className="cf-outcome-card buggy">
          <div className="cf-outcome-card-header">
            <div>
              <span>WORKFLOW VERSION</span>
              <h3>BUGGY</h3>
            </div>

            <div className="cf-outcome-icon">✕</div>
          </div>

          <div className="cf-outcome-metrics">
            <div>
              <span>CHARGE ATTEMPTS</span>
              <strong>{buggyAttempts}</strong>
            </div>

            <div>
              <span>COMMITTED CHARGES</span>
              <strong className="cf-danger-text">
                {buggyCharges}
              </strong>
            </div>
          </div>

          <div className="cf-outcome-result">
            <span>BUSINESS INVARIANT</span>

            <strong className="cf-danger-text">
              ✕ {buggyInvariant}
            </strong>

            <small>
              Duplicate payment side effect committed
            </small>
          </div>
        </div>

        <div className="cf-vs-divider">
          <span>VS</span>
        </div>

        <div className="cf-outcome-card fixed">
          <div className="cf-outcome-card-header">
            <div>
              <span>WORKFLOW VERSION</span>
              <h3>FIXED</h3>
            </div>

            <div className="cf-outcome-icon">✓</div>
          </div>

          <div className="cf-outcome-metrics">
            <div>
              <span>CHARGE ATTEMPTS</span>
              <strong>{fixedAttempts}</strong>
            </div>

            <div>
              <span>COMMITTED CHARGES</span>
              <strong className="cf-success-text">
                {fixedCharges}
              </strong>
            </div>
          </div>

          <div className="cf-outcome-result">
            <span>BUSINESS INVARIANT</span>

            <strong className="cf-success-text">
              ✓ {fixedInvariant}
            </strong>

            <small>
              Retry completed without duplicate payment
            </small>
          </div>
        </div>
      </div>

      <div className="cf-fault-proof">
        <div className="cf-fault-proof-heading">
          <div>
            <div className="cf-section-label">
              CONTROLLED EXPERIMENT
            </div>

            <h3>Fault snapshot verification</h3>
          </div>

          <strong
            className={
              sameFaultSnapshot
                ? "cf-success-text"
                : "cf-danger-text"
            }
          >
            {sameFaultSnapshot
              ? "VERIFIED"
              : "MISMATCH"}
          </strong>
        </div>

        <div className="cf-fault-proof-grid">
          <div className="cf-proof-header">
            <span>FAULT PROPERTY</span>
            <strong>BUGGY</strong>
            <strong>FIXED</strong>
          </div>

          <div className="cf-proof-row">
            <span>Plan ID</span>
            <code>
              {buggyFault?.planId ?? "Unavailable"}
            </code>
            <code>
              {fixedFault?.planId ?? "Unavailable"}
            </code>
          </div>

          <div className="cf-proof-row">
            <span>Fault type</span>
            <code>
              {buggyFault?.type ?? "Unavailable"}
            </code>
            <code>
              {fixedFault?.type ?? "Unavailable"}
            </code>
          </div>

          <div className="cf-proof-row">
            <span>Target</span>
            <code>
              {buggyFault?.target ?? "Unavailable"}
            </code>
            <code>
              {fixedFault?.target ?? "Unavailable"}
            </code>
          </div>

          <div className="cf-proof-row">
            <span>Attempt</span>
            <code>
              {buggyFault?.attempt ?? "Unavailable"}
            </code>
            <code>
              {fixedFault?.attempt ?? "Unavailable"}
            </code>
          </div>

          <div className="cf-proof-row">
            <span>SHA-256</span>
            <code title={buggyFault?.hash}>
              {shortHash(buggyFault?.hash)}
            </code>
            <code title={fixedFault?.hash}>
              {shortHash(fixedFault?.hash)}
            </code>
          </div>
        </div>

        <div
          className={`cf-fault-proof-result ${
            sameFaultSnapshot
              ? "verified"
              : "mismatch"
          }`}
        >
          {sameFaultSnapshot ? "✓" : "!"}

          <span>
            {sameFaultSnapshot
              ? "Both executions used the same stored fault snapshot."
              : "Fault snapshots differ. This comparison is not controlled."}
          </span>
        </div>
      </div>
    </section>
  );
}

export default ComparisonCard;