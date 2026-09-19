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
  let kind = "success";

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
    kind = "reused";
  }

  if (trace.operation === "InjectedFailure") {
    title = "Fault Injection";
    message = "Payment acknowledgement lost";
    icon = "⚡";
    kind = "fault";
  }

  if (trace.operation === "OrderConfirmed") {
    title = "Confirm Order";
    message = "Order confirmed";
  }

  const isFailure = trace.outcome === "FAILURE";

  if (isFailure) {
    kind = "fault";
  }

  if (isFirstViolation) {
    kind = "violation";
    icon = "✕";
  }

  return (
    <article
      className={`cf-trace-item ${kind} ${
        isFirstViolation
          ? "first-violation"
          : ""
      }`}
    >
      <div className="cf-trace-rail">
        <div className="cf-trace-icon">
          {icon}
        </div>
      </div>

      <div className="cf-trace-main">
        <div className="cf-trace-heading">
          <div>
            <span className="cf-trace-sequence">
              #{trace.sequence}
            </span>

            <strong>{title}</strong>
          </div>

          <span className="cf-trace-attempt">
            ATTEMPT {trace.attempt}
          </span>
        </div>

        <div className="cf-trace-message">
          {message}
        </div>

        <div className="cf-trace-evidence">
          {chargeId && (
            <div>
              <span>CHARGE</span>
              <code>{chargeId}</code>
            </div>
          )}

          {faultType && (
            <div>
              <span>FAULT</span>
              <code>{faultType}</code>
            </div>
          )}
        </div>

        {isFirstViolation && violationReason && (
          <div className="cf-trace-violation-reason">
            <span>FIRST FAILING SIDE EFFECT</span>
            <strong>{violationReason}</strong>
          </div>
        )}

        <div className="cf-trace-metadata">
          <span>{trace.component}</span>
          <i />
          <span>{trace.phase}</span>
          <i />
          <span>{trace.outcome}</span>
        </div>
      </div>
    </article>
  );
}

export default TraceItem;