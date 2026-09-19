import type { InvariantResult } from "../api/runs";

interface Props {
  invariant: InvariantResult;
  orderedChargeIds: string[];
}

function InvariantResultCard({ invariant, orderedChargeIds }: Props) {
  const failed = invariant.status === "FAILED";

  const chargeIds =
    orderedChargeIds.length > 0
      ? orderedChargeIds
      : invariant.chargeIds;

  const formatMoney = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  return (
    <section
      style={{
        marginTop: "30px",
        marginBottom: "30px",
        padding: "28px",
        borderRadius: "14px",
        border: failed
          ? "2px solid #dc2626"
          : "2px solid #16a34a",
        background: failed ? "#fff1f2" : "#f0fdf4",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "30px",
            color: failed ? "#b91c1c" : "#15803d",
          }}
        >
          {failed ? "✕ INVARIANT VIOLATED" : "✓ INVARIANT PASSED"}
        </h2>

        <h3
          style={{
            marginTop: "12px",
            marginBottom: 0,
            fontSize: "24px",
          }}
        >
          1 ORDER → {invariant.actualChargeCount}{" "}
          {invariant.actualChargeCount === 1 ? "CHARGE" : "CHARGES"}
        </h3>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "14px 30px",
          fontSize: "17px",
          padding: "16px 0",
        }}
      >
        <span>Expected charge count</span>
        <strong>≤ {invariant.expectedChargeCount}</strong>

        <span>Actual charge count</span>
        <strong>{invariant.actualChargeCount}</strong>

        <span>Expected amount</span>
        <strong>{formatMoney(invariant.expectedAmount)}</strong>

        <span>Actual charged</span>
        <strong>{formatMoney(invariant.actualCharged)}</strong>

        <span>Overcharge</span>
        <strong
          style={{
            color: invariant.overcharge > 0 ? "#b91c1c" : "#15803d",
          }}
        >
          {formatMoney(invariant.overcharge)}
        </strong>
      </div>

      <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #ddd" }} />

      <h3>Charges</h3>

      {chargeIds.length === 0 ? (
        <p>No charges found.</p>
      ) : (
        chargeIds.map((chargeId, index) => (
          <div key={chargeId} style={{ padding: "10px 0" }}>
            <strong>Charge #{index + 1}</strong>
            <div>{chargeId}</div>
          </div>
        ))
      )}

      <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #ddd" }} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <div>
          <strong style={{ fontSize: "18px" }}>{invariant.name}</strong>
          <div>Expected ≤ {invariant.expectedChargeCount}</div>
          <div>Actual {invariant.actualChargeCount}</div>
        </div>

        <strong
          style={{
            fontSize: "24px",
            color: failed ? "#b91c1c" : "#15803d",
          }}
        >
          {invariant.status}
        </strong>
      </div>
    </section>
  );
}

export default InvariantResultCard;
