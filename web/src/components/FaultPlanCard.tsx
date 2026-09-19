import type { FaultPlanInfo } from "../api/runs";

function FaultPlanCard({
  faultPlan,
}: {
  faultPlan: FaultPlanInfo;
}) {
  const shortHash =
    faultPlan.hash.length > 8
      ? `${faultPlan.hash.slice(0, 8)}...`
      : faultPlan.hash;

  return (
    <div className="cf-fault-card">
      <div className="cf-fault-card-top">
        <div>
          <div className="cf-fault-label">
            <span className="cf-fault-icon">⚡</span>
            FAULT PLAN
          </div>

          <h3>{faultPlan.name}</h3>

          <code className="cf-fault-type">
            {faultPlan.type}
          </code>
        </div>

        <div className="cf-fault-target">
          <span>TARGET</span>
          <strong>{faultPlan.target}</strong>
        </div>
      </div>

      <div className="cf-fault-details">
        <div>
          <span>ATTEMPT</span>
          <strong>{faultPlan.attempt}</strong>
        </div>

        <div>
          <span>PLAN ID</span>
          <code>{faultPlan.planId}</code>
        </div>

        <div>
          <span>SNAPSHOT HASH</span>
          <code title={faultPlan.hash}>
            {shortHash}
          </code>
        </div>
      </div>

      <div className="cf-reproducibility-note">
        <span>✓</span>

        <p>
          Fault definition stored with this run for
          deterministic reproduction and comparison.
        </p>
      </div>
    </div>
  );
}

export default FaultPlanCard;