import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { startRun, type WorkflowVersion } from "../api/runs";
import "../App.css";

function LauncherPage() {
  const navigate = useNavigate();

  const [workflowVersion, setWorkflowVersion] =
    useState<WorkflowVersion>("buggy");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRun() {
    try {
      setLoading(true);
      setError("");

      const result = await startRun(workflowVersion);

      sessionStorage.setItem(
        `counterflow:workflowVersion:${result.runId}`,
        workflowVersion,
      );

      navigate(`/run/${result.runId}`, {
        state: { workflowVersion },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="cf-page">
      <nav className="cf-nav">
        <div className="cf-brand">
          <span className="cf-logo">CF</span>

          <div>
            <strong>CounterFlow</strong>
            <span>Resilience Testing</span>
          </div>
        </div>

        <div className="cf-status">
          <span className="cf-status-dot" />
          SYSTEM READY
        </div>
      </nav>

      <section className="cf-hero">
        <div className="cf-eyebrow">
          DISTRIBUTED SYSTEMS RESILIENCE
        </div>

        <h1>
          Break workflows.
          <br />
          <span>Prove the fix.</span>
        </h1>

        <p className="cf-hero-copy">
          Inject controlled failures into distributed workflows,
          observe their effects, and verify that recovery logic
          preserves critical invariants.
        </p>
      </section>

      <section className="cf-launch-card">
        <div className="cf-card-header">
          <div>
            <span className="cf-section-label">
              TEST SCENARIO
            </span>
            <h2>Checkout Workflow</h2>
          </div>

          <span className="cf-ready-badge">READY</span>
        </div>

        <div className="cf-workflow">
          <div className="cf-workflow-step">
            <span>01</span>
            <strong>CreateOrder</strong>
          </div>

          <div className="cf-connector">→</div>

          <div className="cf-workflow-step">
            <span>02</span>
            <strong>ReserveInventory</strong>
          </div>

          <div className="cf-connector">→</div>

          <div className="cf-workflow-step cf-fault-step">
            <span>03</span>
            <strong>ChargePayment</strong>
            <small>FAULT</small>
          </div>

          <div className="cf-connector">→</div>

          <div className="cf-workflow-step">
            <span>04</span>
            <strong>ConfirmOrder</strong>
          </div>
        </div>

        <div className="cf-config-grid">
          <div className="cf-config-block">
            <span className="cf-section-label">
              WORKFLOW VERSION
            </span>

            <div className="cf-version-selector">
              <button
                type="button"
                className={
                  workflowVersion === "buggy"
                    ? "cf-version active buggy"
                    : "cf-version"
                }
                onClick={() =>
                  setWorkflowVersion("buggy")
                }
              >
                <span className="cf-version-dot" />
                Buggy
              </button>

              <button
                type="button"
                className={
                  workflowVersion === "fixed"
                    ? "cf-version active fixed"
                    : "cf-version"
                }
                onClick={() =>
                  setWorkflowVersion("fixed")
                }
              >
                <span className="cf-version-dot" />
                Fixed
              </button>
            </div>
          </div>

          <div className="cf-config-block">
            <span className="cf-section-label">
              FAULT PROFILE
            </span>

            <div className="cf-fault-profile">
              <div className="cf-fault-icon">⚡</div>

              <div>
                <strong>
                  Payment acknowledgement lost
                </strong>
                <code>payment-ack-lost-v1</code>
              </div>
            </div>
          </div>
        </div>

        <div className="cf-launch-footer">
          <div className="cf-test-info">
            <span>FAULT INJECTION</span>
            <span>INVARIANT CHECKING</span>
            <span>TRACE ANALYSIS</span>
          </div>

          <button
            className="cf-run-button"
            onClick={handleRun}
            disabled={loading}
          >
            {loading ? (
              <>Starting test...</>
            ) : (
              <>Run resilience test <span>→</span></>
            )}
          </button>
        </div>

        {error && (
          <div className="cf-error">
            <strong>Unable to start test</strong>
            <span>{error}</span>
          </div>
        )}
      </section>

      <footer className="cf-footer">
        <span>COUNTERFLOW</span>
        <span>
          Controlled failure injection for distributed systems
        </span>
      </footer>
    </main>
  );
}

export default LauncherPage;