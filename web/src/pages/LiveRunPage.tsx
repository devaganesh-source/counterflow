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

          <h1
            style={{
              marginBottom: "6px",
            }}
          >
            Live Run
          </h1>
        </div>

        <strong
          style={{
            padding: "8px 14px",
            borderRadius: "20px",
            background: "#dbeafe",
            color: "#1d4ed8",
          }}
        >
          {run?.status ?? "RUNNING"}
        </strong>
      </div>

      <p>
        <strong>Run ID:</strong>{" "}
        {runId}
      </p>

      {workflowVersion && (
        <p>
          <strong>
            Workflow Version:
          </strong>{" "}
          {workflowVersion}
        </p>
      )}

      <p>
        <strong>Fault:</strong>{" "}
        Payment acknowledgement lost
      </p>

      <hr />

      <RunStateBanner
        status={run?.status ?? "RUNNING"}
      />

      {error && (
        <section
          style={{
            marginTop: "24px",
            marginBottom: "24px",
            padding: "22px",
            borderRadius: "14px",
            border: "2px solid #f59e0b",
            background: "#fffbeb",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 800,
              letterSpacing: "2px",
              color: "#92400e",
            }}
          >
            {errorType ===
            "API_UNAVAILABLE"
              ? "API UNAVAILABLE"
              : "POLLING ERROR"}
          </div>

          <h3
            style={{
              marginBottom: "8px",
              color: "#92400e",
            }}
          >
            ⚠ {error}
          </h3>

          <p
            style={{
              marginBottom: 0,
            }}
          >
            No pass/fail conclusion has been
            made. CounterFlow will continue
            checking the execution.
          </p>
        </section>
      )}

      <h3>Execution Timeline</h3>

      {importantTraces.length === 0 ? (
        <p>
          Waiting for trace events...
        </p>
      ) : (
        importantTraces.map(
          (trace) => (
            <TraceItem
              key={trace.sequence}
              trace={trace}
            />
          ),
        )
      )}

      <p
        style={{
          color: "#64748b",
          marginTop: "24px",
        }}
      >
        Live — refreshing every 2 seconds...
      </p>
    </main>
  );
}

export default LiveRunPage;