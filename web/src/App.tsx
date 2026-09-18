import { useEffect, useState } from "react";
import {
  getRun,
  startRun,
  type RunResponse,
  type Trace,
  type WorkflowVersion,
} from "./api/runs";

const TERMINAL_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "ABORTED",
];

function TraceItem({ trace }: { trace: Trace }) {
  const committed =
    trace.phase === "SIDE_EFFECT_COMMITTED";

  const failed =
    trace.outcome !== "SUCCESS";

  return (
    <div
      style={{
        borderLeft: `4px solid ${
          failed
            ? "#dc2626"
            : committed
            ? "#16a34a"
            : "#2563eb"
        }`,
        padding: "12px 16px",
        marginBottom: "12px",
        background: "#f8fafc",
        borderRadius: "6px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "20px",
        }}
      >
        <strong>{trace.operation}</strong>

        <span>Attempt {trace.attempt}</span>
      </div>

      <div style={{ marginTop: "6px" }}>
        <strong>Component:</strong>{" "}
        {trace.component}
      </div>

      <div>
        <strong>Phase:</strong>{" "}
        {trace.phase}
      </div>

      <div>
        <strong>Outcome:</strong>{" "}
        {trace.outcome}
      </div>

      {trace.evidence &&
        Object.keys(trace.evidence).length > 0 && (
          <pre
            style={{
              background: "#e2e8f0",
              padding: "8px",
              borderRadius: "4px",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(
              trace.evidence,
              null,
              2
            )}
          </pre>
        )}
    </div>
  );
}

function App() {
  const [
    workflowVersion,
    setWorkflowVersion,
  ] = useState<WorkflowVersion>("buggy");

  const [run, setRun] =
    useState<RunResponse | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleRun() {
    try {
      setLoading(true);
      setError("");

      const result =
        await startRun(workflowVersion);

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

    if (
      TERMINAL_STATUSES.includes(run.status)
    ) {
      return;
    }

    const interval = setInterval(
      async () => {
        try {
          const updatedRun =
            await getRun(run.runId);

          setRun(updatedRun);
        } catch (err) {
          console.error(
            "Polling failed:",
            err
          );
        }
      },
      2000
    );

    return () =>
      clearInterval(interval);
  }, [run?.runId, run?.status]);

  if (run) {
    const traces = run.traces ?? [];

    return (
      <main
        style={{
          padding: "40px",
          fontFamily: "Arial",
          maxWidth: "900px",
          margin: "auto",
        }}
      >
        <h1>CounterFlow</h1>

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
          }}
        >
          <h2>Live Run</h2>

          <strong
            style={{
              padding: "8px 14px",
              borderRadius: "20px",
              background:
                run.status === "SUCCEEDED"
                  ? "#dcfce7"
                  : run.status ===
                    "FAILED"
                  ? "#fee2e2"
                  : "#dbeafe",
            }}
          >
            {run.status}
          </strong>
        </div>

        <p>
          <strong>Run ID:</strong>{" "}
          {run.runId}
        </p>

        <p>
          <strong>
            Workflow Version:
          </strong>{" "}
          {workflowVersion}
        </p>

        <p>
          <strong>
            Fault Profile:
          </strong>{" "}
          Payment acknowledgement lost
        </p>

        <hr />

        <h3>Execution Timeline</h3>

        {traces.length === 0 ? (
          <p>
            Waiting for trace events...
          </p>
        ) : (
          traces
            .sort(
              (a, b) =>
                a.sequence - b.sequence
            )
            .map((trace) => (
              <TraceItem
                key={trace.sequence}
                trace={trace}
              />
            ))
        )}

        {!TERMINAL_STATUSES.includes(
          run.status
        ) && (
          <p>
            Live — refreshing every 2
            seconds...
          </p>
        )}

        {run.startDate && (
          <p>
            <strong>Started:</strong>{" "}
            {new Date(
              run.startDate
            ).toLocaleString()}
          </p>
        )}

        {run.stopDate && (
          <p>
            <strong>Finished:</strong>{" "}
            {new Date(
              run.stopDate
            ).toLocaleString()}
          </p>
        )}

        <button
          onClick={() =>
            setRun(null)
          }
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
          checked={
            workflowVersion === "buggy"
          }
          onChange={() =>
            setWorkflowVersion(
              "buggy"
            )
          }
        />
        Buggy
      </label>

      <br />

      <label>
        <input
          type="radio"
          checked={
            workflowVersion === "fixed"
          }
          onChange={() =>
            setWorkflowVersion(
              "fixed"
            )
          }
        />
        Fixed
      </label>

      <h3>Fault Profile</h3>

      <p>
        Payment acknowledgement lost
      </p>

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
          <strong>Error:</strong>{" "}
          {error}
        </p>
      )}
    </main>
  );
}

export default App;