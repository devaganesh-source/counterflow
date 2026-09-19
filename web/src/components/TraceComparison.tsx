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
      message: "PaymentCharged",
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
    <section
      style={{
        flex: 1,
        minWidth: "0",
        padding: "24px",
        borderRadius: "14px",
        border:
          mode === "buggy"
            ? "2px solid #dc2626"
            : "2px solid #16a34a",
        background:
          mode === "buggy"
            ? "#fff7f7"
            : "#f6fff8",
      }}
    >
      <h2
        style={{
          marginTop: 0,
          textAlign: "center",
          color:
            mode === "buggy"
              ? "#b91c1c"
              : "#15803d",
        }}
      >
        {title}
      </h2>

      {traces.map((trace) => {
        const display = getTraceLabel(trace);

        const isViolation =
          mode === "buggy" &&
          firstFailingSequence !== null &&
          trace.sequence === firstFailingSequence;

        const isDeduplicated =
          mode === "fixed" &&
          trace.operation === "PaymentReused";

        const chargeId =
          typeof trace.evidence?.chargeId === "string"
            ? trace.evidence.chargeId
            : null;

        return (
          <div
            key={trace.sequence}
            style={{
              position: "relative",
              padding: "16px",
              marginBottom: "14px",
              borderRadius: "10px",
              border: isViolation
                ? "2px solid #dc2626"
                : isDeduplicated
                  ? "2px solid #16a34a"
                  : "1px solid #cbd5e1",
              background: isViolation
                ? "#fee2e2"
                : isDeduplicated
                  ? "#dcfce7"
                  : "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <strong>{display.title}</strong>

              <span>{display.icon}</span>
            </div>

            <p
              style={{
                margin: "8px 0 4px",
                fontWeight: 700,
              }}
            >
              {display.message}
            </p>

            {chargeId && (
              <code
                style={{
                  display: "block",
                  marginTop: "8px",
                  wordBreak: "break-all",
                }}
              >
                {chargeId}
              </code>
            )}

            {isViolation && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#dc2626",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                ← VIOLATION
              </div>
            )}

            {isDeduplicated && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#16a34a",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                ← DEDUPLICATED
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function TraceComparison({
  buggyRun,
  fixedRun,
}: TraceComparisonProps) {
  return (
    <section
      style={{
        marginTop: "36px",
      }}
    >
      <div
        style={{
          marginBottom: "22px",
        }}
      >
        <h2 style={{ marginBottom: "6px" }}>
          Execution Trace Comparison
        </h2>

        <p
          style={{
            marginTop: 0,
            color: "#64748b",
          }}
        >
          Same failure schedule. Different retry behaviour.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "flex-start",
        }}
      >
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