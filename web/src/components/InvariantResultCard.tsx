import type {
  InvariantResult,
  Trace,
} from "../api/runs";

interface Props {
  invariant: InvariantResult;
  orderedChargeIds: string[];
  traces: Trace[];
}

function InvariantResultCard({
  invariant,
  orderedChargeIds,
  traces,
}: Props) {
  const failed = invariant.status === "FAILED";

  const chargeIds =
    orderedChargeIds.length > 0
      ? orderedChargeIds
      : invariant.chargeIds;

  const formatMoney = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  const chargeAttempts = traces.filter(
    (trace) =>
      trace.component === "ChargePayment" &&
      trace.phase === "ATTEMPT_STARTED",
  ).length;

  const paymentChargedTrace = traces.find(
    (trace) =>
      trace.operation === "PaymentCharged" &&
      trace.phase === "SIDE_EFFECT_COMMITTED",
  );

  const paymentReusedTrace = traces.find(
    (trace) =>
      trace.operation === "PaymentReused",
  );

  const retryOccurred =
    chargeAttempts > 1 ||
    Boolean(paymentReusedTrace);

  const originalChargeId =
    typeof paymentChargedTrace?.evidence?.chargeId ===
    "string"
      ? paymentChargedTrace.evidence.chargeId
      : chargeIds[0];

  const reusedChargeId =
    typeof paymentReusedTrace?.evidence?.chargeId ===
    "string"
      ? paymentReusedTrace.evidence.chargeId
      : originalChargeId;

  return (
    <section
      className={`cf-invariant-card ${
        failed ? "violated" : "held"
      }`}
    >
      <div className="cf-invariant-heading">
        <div>
          <div className="cf-section-label">
            BUSINESS INVARIANT
          </div>

          <h2>
            {failed
              ? "✕ VIOLATED"
              : "✓ PRESERVED"}
          </h2>
        </div>

        <span
          className={`cf-invariant-status ${
            failed ? "failed" : "passed"
          }`}
        >
          {invariant.status}
        </span>
      </div>

      <div className="cf-charge-story">
        <span>1 ORDER</span>
        <strong>→</strong>
        <span
          className={
            failed
              ? "cf-danger-text"
              : "cf-success-text"
          }
        >
          {invariant.actualChargeCount}{" "}
          {invariant.actualChargeCount === 1
            ? "CHARGE"
            : "CHARGES"}
        </span>
      </div>

      <p className="cf-invariant-description">
        {failed
          ? "Duplicate payment side effect detected."
          : retryOccurred
            ? "Retry completed without creating a duplicate payment side effect."
            : "Payment side effects remained within the required invariant."}
      </p>

      <div className="cf-impact-grid">
        <div className="cf-impact-stat">
          <span>EXPECTED</span>
          <strong>
            {formatMoney(invariant.expectedAmount)}
          </strong>
        </div>

        <div className="cf-impact-stat">
          <span>ACTUALLY CHARGED</span>
          <strong
            className={
              failed ? "cf-danger-text" : ""
            }
          >
            {formatMoney(invariant.actualCharged)}
          </strong>
        </div>

        <div
          className={`cf-impact-stat ${
            failed ? "danger" : "safe"
          }`}
        >
          <span>CUSTOMER OVERCHARGE</span>
          <strong>
            {formatMoney(invariant.overcharge)}
          </strong>
        </div>
      </div>

      <div className="cf-invariant-rule">
        <div>
          <span>INVARIANT</span>
          <strong>{invariant.name}</strong>
        </div>

        <div>
          <span>EXPECTED</span>
          <strong>
            ≤ {invariant.expectedChargeCount}
          </strong>
        </div>

        <div>
          <span>ACTUAL</span>
          <strong
            className={
              failed
                ? "cf-danger-text"
                : "cf-success-text"
            }
          >
            {invariant.actualChargeCount}
          </strong>
        </div>
      </div>

      {failed && chargeIds.length > 0 && (
        <div className="cf-charge-list">
          <div className="cf-section-label">
            COMMITTED PAYMENT SIDE EFFECTS
          </div>

          {chargeIds.map((chargeId, index) => (
            <div
              className={`cf-charge-row ${
                index > 0 ? "duplicate" : ""
              }`}
              key={`${chargeId}-${index}`}
            >
              <div>
                <span>CHARGE #{index + 1}</span>
                <code>{chargeId}</code>
              </div>

              {index > 0 ? (
                <strong>DUPLICATE</strong>
              ) : (
                <strong>ORIGINAL</strong>
              )}
            </div>
          ))}
        </div>
      )}

      {!failed && paymentReusedTrace && (
        <div className="cf-idempotency-proof">
          <div className="cf-section-label">
            IDEMPOTENCY PROTECTION
          </div>

          <h3>
            Retry handled without another charge
          </h3>

          <div className="cf-attempt-grid">
            <div className="cf-attempt-card">
              <span>
                ATTEMPT{" "}
                {paymentChargedTrace?.attempt ?? 1}
              </span>

              <strong>✓ Charge created</strong>

              {originalChargeId && (
                <code>{originalChargeId}</code>
              )}
            </div>

            <div className="cf-attempt-card reused">
              <span>
                ATTEMPT {paymentReusedTrace.attempt}
              </span>

              <strong>↻ Existing charge reused</strong>

              {reusedChargeId && (
                <code>{reusedChargeId}</code>
              )}

              <small>
                ✓ NO DUPLICATE SIDE EFFECT
              </small>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default InvariantResultCard;