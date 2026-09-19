import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ApiError,
  getRun,
  type RunResponse,
  type WorkflowVersion,
} from "../api/runs";
import TraceItem from "../components/TraceItem";
import RunStateBanner from "../components/RunStateBanner";

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
    | {
        workflowVersion?: WorkflowVersion;
      }
    | null;

  const [run, setRun] =
    useState<RunResponse | null>(null);

  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState<
    "API_UNAVAILABLE" | "NOT_FOUND" | "OTHER" | null
  >(null);

  const workflowVersion =
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

    async function pollRun() {
      try {
        const updatedRun =
          await getRun(currentRunId);

        if (cancelled) return;

        setRun(updatedRun);
        setError("");
        setErrorType(null);

        if (
          TERMINAL_STATUSES.includes(
            updatedRun.status,
          )
        ) {
          navigate(
            `/run/${currentRunId}/result`,
            {
              replace: true,
              state: {
                run: updatedRun,
                workflowVersion,
              },
            },
          );

          return;
        }

        timer = window.setTimeout(
          pollRun,
          2000,
        );
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ApiError) {
          if (err.status === 0) {
            setErrorType("API_UNAVAILABLE");
            setError(
              "CounterFlow API is unavailable.",
            );

            // Temporary outage:
            // keep retrying rather than turning
            // this into a false result.
            timer = window.setTimeout(
              pollRun,
              2000,
            );

            return;
          }

          if (err.status === 404) {
            setErrorType("NOT_FOUND");
            setError("Run not found.");

            // A missing run is not treated
            // as RUNNING or PASSED.
            return;
          }
        }

        setErrorType("OTHER");

        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch run.",
        );

        timer = window.setTimeout(
          pollRun,
          2000,
        );
      }
    }

    pollRun();

    return () => {
      cancelled = true;

      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [navigate, runId, workflowVersion]);

  const importantTraces = useMemo(() => {
    return (run?.traces ?? [])
      .filter(
        (trace) =>
          trace.phase ===
            "SIDE_EFFECT_COMMITTED" ||
          trace.phase === "ATTEMPT_FAILED" ||
          trace.operation ===
            "PaymentReused",
      )
      .sort(
        (a, b) =>
          a.sequence - b.sequence,
      );
  }, [run?.traces]);

  if (!runId) {
    return (
      <main
        style={{
          padding: "40px",
          fontFamily: "Arial",
          maxWidth: "760px",
          margin: "auto",
        }}
      >
        <h1>CounterFlow</h1>

        <section
          style={{
            padding: "24px",
            borderRadius: "14px",
            border: "2px solid #dc2626",
            background: "#fff1f2",
          }}
        >
          <h2
            style={{
              color: "#b91c1c",
            }}
          >
            ✕ Run ID missing
          </h2>

          <p>
            No execution result can be
            determined.
          </p>
        </section>

        <button
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
      </main>
    );
  }

  if (
    errorType === "NOT_FOUND" &&
    !run
  ) {
    return (
      <main
        style={{
          padding: "40px",
          fontFamily: "Arial",
          maxWidth: "760px",
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

        <h1>Run unavailable</h1>

        <section
          style={{
            marginTop: "24px",
            padding: "26px",
            borderRadius: "14px",
            border: "2px solid #dc2626",
            background: "#fff1f2",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 800,
              letterSpacing: "2px",
              color: "#991b1b",
            }}
          >
            RUN NOT FOUND
          </div>

          <h2
            style={{
              color: "#b91c1c",
            }}
          >
            ✕ Run not found
          </h2>

          <p>
            The requested run could not be
            retrieved.
          </p>

          <strong>
            No invariant conclusion can be made.
          </strong>
        </section>

        <button
          onClick={() => navigate("/")}
          style={{
            padding: "10px 18px",
            marginTop: "20px",
            cursor: "pointer",
          }}
        >
          Back to launcher
        </button>
      </main>
    );
  }

  return (
    <main className="cf-live-page">
      <nav className="cf-live-nav">
        <div className="cf-live-brand">
          <span className="cf-live-brand-mark">
            CF
          </span>

          <div>
            <strong>CounterFlow</strong>
            <span>RESILIENCE TESTING</span>
          </div>
        </div>

        <div className="cf-live-status">
          <span className="cf-live-pulse" />
          LIVE EXECUTION
        </div>
      </nav>

      <section className="cf-live-shell">
        <header className="cf-live-hero">
          <div>
            <div className="cf-section-label">
              RESILIENCE TEST IN PROGRESS
            </div>

            <h1>
              Watching the failure unfold.
            </h1>

            <p>
              CounterFlow is following the execution
              trace as the configured fault is injected
              and the workflow responds.
            </p>
          </div>

          <div className="cf-live-running-badge">
            <span className="cf-live-pulse" />
            {run?.status ?? "RUNNING"}
          </div>
        </header>

        <section className="cf-live-context">
          <div>
            <span>RUN ID</span>
            <code>{runId}</code>
          </div>

          <div>
            <span>WORKFLOW</span>
            <strong>
              {(workflowVersion ?? "unknown").toUpperCase()}
            </strong>
          </div>

          <div>
            <span>INJECTED FAULT</span>
            <strong className="cf-live-fault-text">
              Payment acknowledgement lost
            </strong>
          </div>

          <div>
            <span>POLLING</span>
            <strong>2 SECONDS</strong>
          </div>
        </section>

        <section className="cf-live-state">
          <RunStateBanner
            status={run?.status ?? "RUNNING"}
          />
        </section>

        {error && (
          <section className="cf-live-warning">
            <div className="cf-live-warning-icon">
              !
            </div>

            <div>
              <span>
                {errorType === "API_UNAVAILABLE"
                  ? "API UNAVAILABLE"
                  : "POLLING ERROR"}
              </span>

              <strong>{error}</strong>

              <p>
                No invariant conclusion has been made.
                CounterFlow will continue checking the
                execution.
              </p>
            </div>
          </section>
        )}

        <section className="cf-live-trace-panel">
          <div className="cf-live-trace-heading">
            <div>
              <div className="cf-section-label">
                LIVE EXECUTION TRACE
              </div>

              <h2>Failure timeline</h2>

              <p>
                Events appear as the workflow progresses.
                Execution state and business correctness
                are evaluated independently.
              </p>
            </div>

            <div className="cf-live-legend">
              <span className="fault">
                <i />
                INJECTED FAULT
              </span>

              <span className="retry">
                <i />
                RETRY / REUSE
              </span>

              <span className="violation">
                <i />
                VIOLATION
              </span>

              <span className="passed">
                <i />
                INVARIANT PASSED
              </span>
            </div>
          </div>

          <div className="cf-live-trace-list">
            {importantTraces.length === 0 ? (
              <div className="cf-live-waiting">
                <span className="cf-live-pulse" />

                <div>
                  <strong>
                    Waiting for trace events
                  </strong>

                  <p>
                    CounterFlow is polling the
                    execution every 2 seconds.
                  </p>
                </div>
              </div>
            ) : (
              importantTraces.map((trace) => (
                <TraceItem
                  key={trace.sequence}
                  trace={trace}
                />
              ))
            )}
          </div>
        </section>

        <footer className="cf-live-footer">
          <span className="cf-live-pulse" />

          <span>
            Live monitoring · refreshing every 2 seconds
          </span>

          <code>
            {importantTraces.length} TRACE EVENT
            {importantTraces.length === 1
              ? ""
              : "S"}
          </code>
        </footer>
      </section>
    </main>
  );
}

export default LiveRunPage;