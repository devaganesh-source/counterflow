import { useLocation, useNavigate } from "react-router-dom";
import type { RunResponse } from "../api/runs";
import ComparisonCard from "../components/ComparisonCard";
import TraceComparison from "../components/TraceComparison";

interface ComparisonPageState {
  buggyRun?: RunResponse;
  fixedRun?: RunResponse;
}

function ComparisonPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as ComparisonPageState | null;

  const buggyRun = state?.buggyRun;
  const fixedRun = state?.fixedRun;

  if (!buggyRun || !fixedRun) {
    return (
      <main className="cf-compare-page">
        <header className="cf-compare-header">
          <div className="cf-result-topline">
            <div className="cf-brand">
              <div className="cf-logo">CF</div>

              <div>
                <strong>CounterFlow</strong>
                <span>RESILIENCE TESTING</span>
              </div>
            </div>
          </div>

          <div className="cf-compare-hero">
            <div className="cf-section-label">
              RESILIENCE COMPARISON
            </div>

            <h1>Buggy vs Fixed</h1>

            <p>
              Comparison data is not available yet.
            </p>
          </div>
        </header>

        <section className="cf-compare-empty">
          <div className="cf-compare-empty-icon">!</div>

          <h2>No comparison data</h2>

          <p>
            Run the same stored fault against both workflow
            versions before opening this comparison.
          </p>

          <button
            className="cf-secondary-button"
            onClick={() => navigate("/")}
          >
            ← Back to launcher
          </button>
        </section>
      </main>
    );
  }

  const buggyHash = buggyRun.faultPlan?.hash;
  const fixedHash = fixedRun.faultPlan?.hash;

  const hashesMatch =
    Boolean(buggyHash) &&
    Boolean(fixedHash) &&
    buggyHash === fixedHash;

  return (
    <main className="cf-compare-page">
      <header className="cf-compare-header">
        <div className="cf-result-topline">
          <div className="cf-brand">
            <div className="cf-logo">CF</div>

            <div>
              <strong>CounterFlow</strong>
              <span>RESILIENCE TESTING</span>
            </div>
          </div>

          <div className="cf-analysis-status">
            <span />
            COMPARISON COMPLETE
          </div>
        </div>

        <div className="cf-compare-hero">
          <div className="cf-section-label">
            RESILIENCE TEST RESULT
          </div>

          <h1>Same fault. Different outcome.</h1>

          <p>
            The exact stored failure is replayed against both
            workflow versions to prove whether the fix changes
            business correctness.
          </p>
        </div>

        <div
          className={`cf-snapshot-banner ${
            hashesMatch ? "verified" : "mismatch"
          }`}
        >
          <div className="cf-snapshot-icon">
            {hashesMatch ? "✓" : "!"}
          </div>

          <div>
            <strong>
              {hashesMatch
                ? "Same stored fault verified"
                : "Fault snapshot mismatch"}
            </strong>

            <span>
              {hashesMatch
                ? "Both executions used the same stored fault-plan hash."
                : "The two executions do not have matching fault-plan hashes."}
            </span>
          </div>
        </div>
      </header>

      <ComparisonCard
        buggyRun={buggyRun}
        fixedRun={fixedRun}
      />

      <TraceComparison
        buggyRun={buggyRun}
        fixedRun={fixedRun}
      />

      <section className="cf-compare-conclusion">
        <div>
          <div className="cf-section-label">
            EXPERIMENT CONCLUSION
          </div>

          <h2>
            The retry stayed. The duplicate charge didn't.
          </h2>

          <p>
            Under the same injected payment acknowledgement
            failure, the fixed workflow reuses the existing
            charge instead of committing another payment side
            effect.
          </p>
        </div>

        <div className="cf-conclusion-proof">
          <div>
            <span>BUGGY</span>
            <strong className="cf-danger-text">
              2 charges
            </strong>
          </div>

          <div className="cf-conclusion-arrow">→</div>

          <div>
            <span>FIXED</span>
            <strong className="cf-success-text">
              1 charge
            </strong>
          </div>
        </div>
      </section>

      <div className="cf-compare-actions">
        <button
          className="cf-secondary-button"
          onClick={() =>
            navigate(`/run/${buggyRun.runId}/result`, {
              state: {
                run: buggyRun,
                workflowVersion: "buggy",
              },
            })
          }
        >
          View Buggy Result
        </button>

        <button
          className="cf-primary-button"
          onClick={() =>
            navigate(`/run/${fixedRun.runId}/result`, {
              state: {
                run: fixedRun,
                workflowVersion: "fixed",
              },
            })
          }
        >
          View Fixed Result →
        </button>

        <button
          className="cf-secondary-button"
          onClick={() => navigate("/")}
        >
          Start another test
        </button>
      </div>
    </main>
  );
}

export default ComparisonPage;