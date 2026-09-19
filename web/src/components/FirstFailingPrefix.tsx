import type { Trace } from "../api/runs";

interface FirstFailingPrefixProps {
  traces: Trace[];
  firstFailingSequence: number;
  violationReason?: string | null;
}

function FirstFailingPrefix({
  traces,
  firstFailingSequence,
  violationReason,
}: FirstFailingPrefixProps) {
  const prefixTraces = [...traces]
    .filter(
      (trace) =>
        trace.sequence <= firstFailingSequence &&
        (
          trace.operation === "OrderCreated" ||
          trace.operation === "InventoryReserved" ||
          trace.operation === "PaymentCharged" ||
          trace.operation === "InjectedFailure" ||
          trace.operation === "PaymentReused"
        ),
    )
    .sort((a, b) => a.sequence - b.sequence);

  function getTraceDetails(trace: Trace) {
    if (trace.operation === "OrderCreated") {
      return {
        title: "Create Order",
        detail: "OrderCreated",
        icon: "✓",
        kind: "success",
      };
    }

    if (trace.operation === "InventoryReserved") {
      return {
        title: "Reserve Inventory",
        detail: "InventoryReserved",
        icon: "✓",
        kind: "success",
      };
    }

    if (trace.operation === "InjectedFailure") {
      return {
        title: "Fault Injected",
        detail: "Payment acknowledgement lost",
        icon: "⚡",
        kind: "fault",
      };
    }

    if (trace.operation === "PaymentCharged") {
      const firstViolation =
        trace.sequence === firstFailingSequence;

      return {
        title: `Charge Payment — Attempt ${trace.attempt}`,
        detail: "PaymentCharged",
        icon: firstViolation ? "✕" : "✓",
        kind: firstViolation
          ? "violation"
          : "success",
      };
    }

    if (trace.operation === "PaymentReused") {
      return {
        title: `Charge Payment — Attempt ${trace.attempt}`,
        detail: "Existing payment reused",
        icon: "↻",
        kind: "reused",
      };
    }

    return {
      title: trace.component,
      detail: trace.operation,
      icon: "✓",
      kind: "success",
    };
  }

  return (
    <div className="cf-prefix">
      <div className="cf-prefix-intro">
        <p>
          The exact observed execution prefix where the
          invariant changes from valid to violated.
        </p>
      </div>

      <div className="cf-prefix-chain">
        {prefixTraces.map((trace, index) => {
          const details = getTraceDetails(trace);

          const isFirstViolation =
            trace.sequence === firstFailingSequence;

          const chargeId =
            typeof trace.evidence?.chargeId === "string"
              ? trace.evidence.chargeId
              : null;

          return (
            <div
              className="cf-prefix-step-wrapper"
              key={trace.sequence}
            >
              <div
                className={`cf-prefix-step ${details.kind} ${
                  isFirstViolation
                    ? "first-violation"
                    : ""
                }`}
              >
                <div className="cf-prefix-sequence">
                  #{trace.sequence}
                </div>

                <div className="cf-prefix-content">
                  <strong>{details.title}</strong>

                  <span>{details.detail}</span>

                  {chargeId && (
                    <code>{chargeId}</code>
                  )}
                </div>

                <div className="cf-prefix-icon">
                  {details.icon}
                </div>

                {isFirstViolation && (
                  <div className="cf-first-violation-tag">
                    FIRST INVARIANT VIOLATION
                  </div>
                )}
              </div>

              {index < prefixTraces.length - 1 && (
                <div className="cf-prefix-connector" />
              )}
            </div>
          );
        })}
      </div>

      {violationReason && (
        <div className="cf-violation-reason">
          <span>WHY IT FAILED</span>
          <strong>{violationReason}</strong>
        </div>
      )}

      <div className="cf-backend-proof">
        <span>◎</span>
        Failure location supplied by backend trace
        analysis.
      </div>
    </div>
  );
}

export default FirstFailingPrefix;