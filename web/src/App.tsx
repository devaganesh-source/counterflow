import { useEffect, useState } from "react";
import {
  getRun,
  startRun,
  type RunResponse,
  type WorkflowVersion,
} from "./api/runs";

const TERMINAL_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "ABORTED",
];

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

      const result = await startRun(workflowVersion);

      setRun(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!run?.runId) {
      return;
    }

    if (TERMINAL_STATUSES.includes(run.status)) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updatedRun = await getRun(run.runId);

        setRun(updatedRun);
      } catch (err) {
        console.error("Polling failed:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [run?.runId, run?.status]);

  if (run) {
    return (
      <main
        style={{
          padding: "40px",
          fontFamily: "Arial",
          maxWidth: "800px",
          margin: "auto",
        }}
      >
        <h1>CounterFlow</h1>

        <h2>Live Run</h2>

        <p>
          <strong>Run ID:</strong> {run.runId}
        </p>

        <p>
          <strong>Workflow Version:</strong>{" "}
          {workflowVersion}
        </p>

        <p>
          <strong>Fault Profile:</strong>{" "}
          Payment acknowledgement lost
        </p>

        <hr />

        <h3>Execution Status</h3>

        <p
          style={{
            fontSize: "24px",
            fontWeight: "bold",
          }}
        >
          {run.status}
        </p>

        {run.startDate && (
          <p>
            <strong>Started:</strong> {run.startDate}
          </p>
        )}

        {run.stopDate && (
          <p>
            <strong>Finished:</strong> {run.stopDate}
          </p>
        )}

        {run.output && (
          <>
            <h3>Output</h3>

            <pre
              style={{
                background: "#f4f4f4",
                padding: "15px",
                overflowX: "auto",
              }}
            >
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </>
        )}

        {!TERMINAL_STATUSES.includes(run.status) && (
          <p>Refreshing run status every 2 seconds...</p>
        )}

        <button
          onClick={() => setRun(null)}
          style={{
            padding: "10px 20px",
            marginTop: "20px",
          }}
        >
          Start another run
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial",
        maxWidth: "600px",
        margin: "auto",
      }}
    >
      <h1>CounterFlow</h1>

      <h3>Scenario</h3>
      <p>Checkout Workflow</p>

      <h3>Workflow Version</h3>

      <label>
        <input
          type="radio"
          checked={workflowVersion === "buggy"}
          onChange={() =>
            setWorkflowVersion("buggy")
          }
        />
        Buggy
      </label>

      <br />

      <label>
        <input
          type="radio"
          checked={workflowVersion === "fixed"}
          onChange={() =>
            setWorkflowVersion("fixed")
          }
        />
        Fixed
      </label>

      <h3>Fault Profile</h3>
      <p>Payment acknowledgement lost</p>

      <button
        onClick={handleRun}
        disabled={loading}
        style={{
          padding: "10px 20px",
          marginTop: "10px",
        }}
      >
        {loading
          ? "Starting..."
          : "Run resilience test"}
      </button>

      {error && (
        <p>
          <strong>Error:</strong> {error}
        </p>
      )}
    </main>
  );
}

export default App;