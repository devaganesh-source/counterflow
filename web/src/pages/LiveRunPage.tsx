import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getRun,
  type RunResponse,
  type WorkflowVersion,
} from "../api/runs";
import TraceItem from "../components/TraceItem";

const TERMINAL_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "ABORTED",
];

function LiveRunPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as
    | { workflowVersion?: WorkflowVersion }
    | null;

  const [run, setRun] = useState<RunResponse | null>(null);
  const [error, setError] = useState("");

  const workflowVersion: WorkflowVersion | undefined =
    locationState?.workflowVersion ??
    (runId
      ? (sessionStorage.getItem(
          `counterflow:workflowVersion:${runId}`,
        ) as WorkflowVersion | null) ?? undefined
      : undefined);

  useEffect(() => {
    if (!runId) return;

    const currentRunId = runId;

    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const updatedRun = await getRun(currentRunId);

        if (cancelled) return;

        setRun(updatedRun);
        setError("");

        if (TERMINAL_STATUSES.includes(updatedRun.status)) {
          navigate(`/run/${currentRunId}/result`, {
            replace: true,
            state: {
              run: updatedRun,
              workflowVersion,
            },
          });
          return;
        }

        timer = window.setTimeout(poll, 2000);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch run",
        );

        timer = window.setTimeout(poll, 2000);
      }
    }

    poll();

    return () => {
      cancelled = true;

      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [navigate, runId, workflowVersion]);

  const importantTraces = useMemo(() => {
    const traces = run?.traces ?? [];

    return traces
      .filter(
        (trace) =>
          trace.phase === "SIDE_EFFECT_COMMITTED" ||
          trace.phase === "ATTEMPT_FAILED" ||
          trace.operation === "PaymentReused",
      )
      .sort((a, b) => a.sequence - b.sequence);
  }, [run?.traces]);

  if (!runId) {
    return <p>Missing run ID.</p>;
  }

  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial",
        maxWidth: "900px",
        margin: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <div>
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

          <h1 style={{ marginBottom: "6px" }}>
            Live Run
          </h1>
        </div>

        <strong
          style={{
            padding: "8px 14px",
            borderRadius: "20px",
            background: "#dbeafe",
          }}
        >
          {run?.status ?? "RUNNING"}
        </strong>
      </div>

      <p>
        <strong>Run ID:</strong> {runId}
      </p>

      {workflowVersion && (
        <p>
          <strong>Workflow Version:</strong>{" "}
          {workflowVersion}
        </p>
      )}

      <p>
        <strong>Fault:</strong>{" "}
        Payment acknowledgement lost
      </p>

      <hr />

      <h3>Execution Timeline</h3>

      {importantTraces.length === 0 ? (
        <p>Waiting for trace events...</p>
      ) : (
        importantTraces.map((trace) => (
          <TraceItem
            key={trace.sequence}
            trace={trace}
          />
        ))
      )}

      <p style={{ color: "#64748b" }}>
        Live — refreshing every 2 seconds...
      </p>

      {error && (
        <p style={{ color: "#b91c1c" }}>
          <strong>Polling error:</strong>{" "}
          {error}
        </p>
      )}
    </main>
  );
}

export default LiveRunPage;