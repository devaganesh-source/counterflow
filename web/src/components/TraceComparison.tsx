import type {
  RunResponse,
  Trace,
} from "../api/runs";

interface TraceComparisonProps {
  buggyRun: RunResponse;
  fixedRun: RunResponse;
}

function getRelevantTraces(run: RunResponse) {
  return (run.traces ?? [])
    .filter(
      (trace) =>
        trace.operation === "OrderCreated" ||
        trace.operation === "InventoryReserved" ||
        trace.operation === "PaymentCharged" ||
        trace.operation === "InjectedFailure" ||
        trace.operation === "PaymentReused",
    )
    .sort((a, b) => a.sequence - b.sequence);
}

function getTraceLabel(trace: Trace) {
  if (trace.operation === "OrderCreated") {
    return {
      title: "Create Order",
      message: "Order created",
      icon: "✓",
    };
  }

  if (trace.operation === "InventoryReserved") {
    return {
      title: "Reserve Inventory",
      message: "Inventory reserved",
      icon: "✓",
    };
  }

  if (trace.operation === "PaymentCharged") {
    return {
      title: `Charge attempt ${trace.attempt}`,
      message: "Payment charged",
      icon: "✓",
    };
  }

  if (trace.operation === "InjectedFailure") {
    return {
      title: "Injected failure",
      message: "Payment acknowledgement lost",
      icon: "⚡",
    };
  }

  if (trace.operation === "PaymentReused") {
    return {
      title: `Charge attempt ${trace.attempt}`,
      message: "Existing charge reused",
      icon: "↻",
    };
  }

  return {
    title: trace.component,
    message: trace.operation,
    icon: "✓",
  };
}

function TraceColumn({
  title,
  run,
  mode,
}: {
  title: string;
  run: RunResponse;
  mode: "buggy" | "fixed";
}) {
  const traces = getRelevantTraces(run);

  const firstFailingSequence =
    run.traceAnalysis?.firstFailingSequence ?? null;

  return (
    <section className={`cf-compare-trace-column ${mode}`}>
      <div className="cf-compare-trace-header">
        <div>
          <span>WORKFLOW VERSION</span>
          <h3>{title}</h3>
        </div>

        <div className="cf-compare-trace-status">
          {mode === "buggy"
            ? "INVARIANT FAILED"
            : "INVARIANT PASSED"}
        </div>
      </div>

      <div className="cf-compare-trace-list">
        {traces.map((trace, index) => {
          const display = getTraceLabel(trace);

          const isViolation =
            mode === "buggy" &&
            firstFailingSequence !== null &&
            trace.sequence === firstFailingSequence;

          const isDeduplicated =
            mode === "fixed" &&
            trace.operation === "PaymentReused";

          const isFault =
            trace.operation === "InjectedFailure";

          const chargeId =
            typeof trace.evidence?.chargeId === "string"
              ? trace.evidence.chargeId
              : null;

          const itemClass = isViolation
            ? "violation"
            : isDeduplicated
              ? "deduplicated"
              : isFault
                ? "fault"
                : "normal";

          return (
            <div
              className="cf-compare-trace-step-wrapper"
              key={trace.sequence}
            >
              <div
                className={`cf-compare-trace-step ${itemClass}`}
              >
                <div className="cf-compare-step-marker">
                  {isViolation
                    ? "✕"
                    : isDeduplicated
                      ? "↻"
                      : display.icon}
                </div>

                <div className="cf-compare-step-content">
                  <div className="cf-compare-step-top">
                    <strong>{display.title}</strong>

                    <span>#{trace.sequence}</span>
                  </div>

                  <p>{display.message}</p>

                  {chargeId && (
                    <code>{chargeId}</code>
                  )}

                  {isFault && (
                    <div className="cf-step-badge fault">
                      SAME INJECTED FAULT
                    </div>
                  )}

                  {isViolation && (
                    <div className="cf-step-badge violation">
                      DUPLICATE CHARGE — VIOLATION
                    </div>
                  )}

                  {isDeduplicated && (
                    <div className="cf-step-badge deduplicated">
                      EXISTING CHARGE REUSED — DEDUPLICATED
                    </div>
                  )}
                </div>
              </div>

              {index < traces.length - 1 && (
                <div className="cf-compare-trace-connector">
                  ↓
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`cf-column-verdict ${mode}`}>
        <span>FINAL BUSINESS RESULT</span>

        <strong>
          {mode === "buggy"
            ? "✕ DUPLICATE PAYMENT"
            : "✓ DUPLICATE PREVENTED"}
        </strong>
      </div>
    </section>
  );
}

function TraceComparison({
  buggyRun,
  fixedRun,
}: TraceComparisonProps) {
  return (
    <section className="cf-trace-comparison">
      <div className="cf-trace-comparison-heading">
        <div className="cf-section-label">
          EXECUTION TRACE COMPARISON
        </div>

        <h2>Same failure. Different retry behaviour.</h2>

        <p>
          Follow both executions through the exact point where
          the buggy workflow duplicates the payment and the fixed
          workflow reuses it.
        </p>
      </div>

      <div className="cf-trace-comparison-grid">
        <TraceColumn
          title="BUGGY"
          run={buggyRun}
          mode="buggy"
        />

        <TraceColumn
          title="FIXED"
          run={fixedRun}
          mode="fixed"
        />
      </div>
    </section>
  );
}

export default TraceComparison;