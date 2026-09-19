import type { FaultPlanInfo } from "../api/runs";

function FaultPlanCard({ faultPlan }: { faultPlan: FaultPlanInfo }) {
  const shortHash =
    faultPlan.hash.length > 8
      ? `${faultPlan.hash.slice(0, 8)}...`
      : faultPlan.hash;

  return (
    <section
      style={{
        marginTop: "28px",
        marginBottom: "28px",
        padding: "24px",
        borderRadius: "14px",
        border: "1px solid #f59e0b",
        background: "#fffbeb",
      }}
    >
      <div style={{ marginBottom: "22px" }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            color: "#92400e",
            marginBottom: "8px",
          }}
        >
          FAULT PLAN
        </div>

        <h2 style={{ margin: "0 0 8px", fontSize: "23px" }}>
          {faultPlan.name}
        </h2>

        <code
          style={{
            display: "inline-block",
            padding: "6px 10px",
            borderRadius: "6px",
            background: "#fef3c7",
            color: "#92400e",
            fontWeight: 600,
          }}
        >
          {faultPlan.type}
        </code>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "150px 1fr",
          gap: "12px 20px",
        }}
      >
        <strong>Target</strong>
        <span>{faultPlan.target}</span>

        <strong>Attempt</strong>
        <span>{faultPlan.attempt}</span>

        <strong>Plan ID</strong>
        <code>{faultPlan.planId}</code>

        <strong>Hash</strong>
        <code title={faultPlan.hash}>{shortHash}</code>
      </div>

      <p
        style={{
          margin: "20px 0 0",
          fontSize: "13px",
          color: "#78716c",
        }}
      >
        This fault definition is attached to the run so the failure scenario
        can be reproduced.
      </p>
    </section>
  );
}

export default FaultPlanCard;
