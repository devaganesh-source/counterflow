import type { Trace } from "../api/runs";

interface TraceItemProps {
  trace: Trace;
  isFirstViolation?: boolean;
  violationReason?: string | null;
}

function TraceItem({
  trace,
  isFirstViolation = false,
  violationReason = null,
}: TraceItemProps) {
  const chargeId =
    typeof trace.evidence?.chargeId === "string"
      ? trace.evidence.chargeId
      : null;

  const faultType =
    typeof trace.evidence?.faultType === "string"
      ? trace.evidence.faultType
      : null;

  let title = trace.component;
  let message = trace.operation;
  let icon = "✓";

  if (trace.operation === "OrderCreated") {
    title = "Create Order";
    message = "Order created";
  }

  if (trace.operation === "InventoryReserved") {
    title = "Reserve Inventory";
    message = "Inventory reserved";
  }

  if (trace.operation === "PaymentCharged") {
    title = "Charge Payment";
    message = "Payment charged";
  }

  if (trace.operation === "PaymentReused") {
    title = "Charge Payment";
    message = "Existing payment reused";
    icon = "↻";
  }

  if (trace.operation === "InjectedFailure") {
    title = "Fault Injection";
    message = "Payment acknowledgement lost";
    icon = "⚡";
  }

  if (trace.operation === "OrderConfirmed") {
    title = "Confirm Order";
    message = "Order confirmed";
  }

  const isFailure = trace.outcome === "FAILURE";

  return (
    <div
      style={{
        padding: "16px",
        marginBottom: "12px",
        borderRadius: "10px",
        border: isFirstViolation
          ? "2px solid #dc2626"
          : isFailure
            ? "1px solid #f59e0b"
            : "1px solid #ddd",
        background: isFirstViolation
          ? "#fff1f2"
          : isFailure
            ? "#fff7ed"
            : "#f8fafc",
        boxShadow: isFirstViolation
          ? "0 0 0 3px rgba(220, 38, 38, 0.08)"
          : "none",
      }}
    >
      {isFirstViolation && (
        <div
          style={{
            display: "inline-block",
            marginBottom: "12px",
            padding: "5px 9px",
            borderRadius: "6px",
            background: "#dc2626",
            color: "white",
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.5px",
          }}
        >
          ⚠ FIRST FAILING SIDE EFFECT
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <strong>
          #{trace.sequence} {title}
        </strong>
        <span>Attempt {trace.attempt}</span>
      </div>

      <p style={{ margin: "8px 0 4px", fontWeight: 600 }}>
        {icon} {message}
      </p>

      {isFirstViolation && violationReason && (
        <p
          style={{
            margin: "10px 0",
            padding: "10px 12px",
            borderRadius: "6px",
            background: "#fee2e2",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          {violationReason}
        </p>
      )}

      {chargeId && (
        <p style={{ margin: "4px 0" }}>
          <strong>Charge:</strong> {chargeId}
        </p>
      )}

      {faultType && (
        <p style={{ margin: "4px 0" }}>
          <strong>Fault:</strong> {faultType}
        </p>
      )}

      <p
        style={{
          margin: "6px 0 0",
          fontSize: "13px",
          color: "#64748b",
        }}
      >
        {trace.component} · {trace.phase} · {trace.outcome}
      </p>
    </div>
  );
}

export default TraceItem;
