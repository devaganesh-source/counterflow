import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { startRun, type WorkflowVersion } from "../api/runs";

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
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial",
        maxWidth: "620px",
        margin: "auto",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 800,
          letterSpacing: "2px",
          color: "#475569",
        }}
      >
        COUNTERFLOW
      </div>

      <h1 style={{ marginBottom: "8px" }}>Checkout workflow</h1>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        Run the same failure against buggy and fixed workflow versions.
      </p>

      <section style={{ marginTop: "30px" }}>
        <h3>Workflow</h3>

        <label style={{ display: "block", marginBottom: "10px" }}>
          <input
            type="radio"
            checked={workflowVersion === "buggy"}
            onChange={() => setWorkflowVersion("buggy")}
          />{" "}
          Buggy
        </label>

        <label style={{ display: "block" }}>
          <input
            type="radio"
            checked={workflowVersion === "fixed"}
            onChange={() => setWorkflowVersion("fixed")}
          />{" "}
          Fixed
        </label>
      </section>

      <section style={{ marginTop: "28px" }}>
        <h3>Fault profile</h3>
        <p>Payment acknowledgement lost</p>

        <h3>Fault plan</h3>
        <code>payment-ack-lost-v1</code>
      </section>

      <button
        onClick={handleRun}
        disabled={loading}
        style={{
          padding: "12px 20px",
          marginTop: "32px",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 700,
        }}
      >
        {loading ? "Starting..." : "Run resilience test"}
      </button>

      {error && (
        <p style={{ color: "#b91c1c", marginTop: "18px" }}>
          <strong>Error:</strong> {error}
        </p>
      )}
    </main>
  );
}

export default LauncherPage;
