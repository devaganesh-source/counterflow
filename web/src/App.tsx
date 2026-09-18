import { useState } from "react";
import {
  startRun,
  type RunResponse,
  type WorkflowVersion,
} from "./api/runs";

function App() {
  const [workflowVersion, setWorkflowVersion] =
    useState<WorkflowVersion>("buggy");

  const [run, setRun] = useState<RunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRun() {
    try {
      setLoading(true);
      setError("");
      setRun(null);

      const result = await startRun(workflowVersion);
      setRun(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>CounterFlow</h1>

      <h3>Scenario</h3>
      <p>Checkout Workflow</p>

      <h3>Workflow Version</h3>

      <label>
        <input
          type="radio"
          checked={workflowVersion === "buggy"}
          onChange={() => setWorkflowVersion("buggy")}
        />
        Buggy
      </label>

      <br />

      <label>
        <input
          type="radio"
          checked={workflowVersion === "fixed"}
          onChange={() => setWorkflowVersion("fixed")}
        />
        Fixed
      </label>

      <h3>Fault Profile</h3>
      <p>Payment acknowledgement lost</p>

      <button
        onClick={handleRun}
        disabled={loading}
        style={{ padding: "10px 20px", marginTop: "10px" }}
      >
        {loading ? "Starting..." : "Run resilience test"}
      </button>

      {error && <p>Error: {error}</p>}

      {run && (
        <div style={{ marginTop: "30px" }}>
          <h2>Run Started</h2>
          <p><strong>Run ID:</strong> {run.runId}</p>
          <p><strong>Status:</strong> {run.status}</p>
          <p><strong>Status URL:</strong> {run.statusUrl}</p>
        </div>
      )}
    </main>
  );
}

export default App;