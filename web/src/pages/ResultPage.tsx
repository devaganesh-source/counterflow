import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getRun,
  type RunResponse,
  type WorkflowVersion,
} from "../api/runs";
import FaultPlanCard from "../components/FaultPlanCard";
import InvariantResultCard from "../components/InvariantResultCard";
import InvariantUnavailableCard from "../components/InvariantUnavailableCard";
import RunStateBanner from "../components/RunStateBanner";
import FirstFailingPrefix from "../components/FirstFailingPrefix";
import TraceItem from "../components/TraceItem";

function ResultPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as
    | {
        run?: RunResponse;
        workflowVersion?: WorkflowVersion;
      }
    | null;

  const [run, setRun] = useState<RunResponse | null>(
    locationState?.run ?? null,
  );

  const [error, setError] = useState("");

  useEffect(() => {
    if (!runId || run) return;

    getRun(runId)
      .then((result) => {
        setRun(result);
        setError("");
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch result",
        );
      });
  }, [run, runId]);

  const workflowVersion =
    locationState?.workflowVersion ??
    (runId
      ? (sessionStorage.getItem(
          `counterflow:workflowVersion:${runId}`,
        ) as WorkflowVersion | null) ?? undefined
      : undefined);

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

  const orderedChargeIds = useMemo(
    () =>
      importantTraces
        .filter(
          (trace) =>
            trace.operation === "PaymentCharged",
        )
        .map(
          (trace) =>
            trace.evidence?.chargeId,
        )
        .filter(
          (chargeId): chargeId is string =>
            typeof chargeId === "string",
        ),
    [importantTraces],
  );

  const firstFailingSequence =
    run?.traceAnalysis?.firstFailingSequence ?? null;

  const violationReason =
    run?.traceAnalysis?.reason ?? null;

  if (!runId) {
    return <p>Missing run ID.</p>;
  }

  if (error) {
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

        <h1>Result unavailable</h1>

        <section
          style={{
            marginTop: "24px",
            padding: "24px",
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
            REQUEST FAILED
          </div>

          <h2
            style={{
              color: "#b91c1c",
              marginBottom: "8px",
            }}
          >
            ✕ {error}
          </h2>

          <p style={{ marginBottom: 0 }}>
            No resilience result or invariant conclusion
            can be made for this request.
          </p>
        </section>

        <button
          onClick={() => navigate("/")}
          style={{
            marginTop: "20px",
            padding: "10px 18px",
            cursor: "pointer",
          }}
        >
          Back to launcher
        </button>
      </main>
    );
  }

  if (!run) {
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

        <h1>Loading result...</h1>

        <section
          style={{
            marginTop: "24px",
            padding: "22px",
            borderRadius: "14px",
            border: "2px solid #2563eb",
            background: "#eff6ff",
          }}
        >
          <strong
            style={{
              color: "#1d4ed8",
            }}
          >
            RUNNING
          </strong>

          <p style={{ marginBottom: 0 }}>
            Waiting for the latest execution state.
            No invariant conclusion has been made yet.
          </p>
        </section>
      </main>
    );
  }

  const executionFailed = [
    "FAILED",
    "TIMED_OUT",
    "ABORTED",
  ].includes(run.status);

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
            Result
          </h1>
        </div>

        <strong
          style={{
            padding: "8px 14px",
            borderRadius: "20px",
            background:
              run.status === "SUCCEEDED"
                ? "#dcfce7"
                : executionFailed
                  ? "#fee2e2"
                  : "#dbeafe",
            color:
              run.status === "SUCCEEDED"
                ? "#166534"
                : executionFailed
                  ? "#991b1b"
                  : "#1d4ed8",
          }}
        >
          {run.status}
        </strong>
      </div>

      <p>
        <strong>Run ID:</strong>{" "}
        {run.runId}
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
        <strong>
          Fault Profile:
        </strong>{" "}
        Payment acknowledgement lost
      </p>

      <hr />

      <RunStateBanner status={run.status} />

      {run.faultPlan && (
        <FaultPlanCard
          faultPlan={run.faultPlan}
        />
      )}

      {run.invariant ? (
        <InvariantResultCard
          invariant={run.invariant}
          orderedChargeIds={orderedChargeIds}
          traces={run.traces ?? []}
        />
      ) : (
        <InvariantUnavailableCard
          executionStatus={run.status}
        />
      )}

      {firstFailingSequence !== null && (
        <FirstFailingPrefix
          traces={run.traces ?? []}
          firstFailingSequence={firstFailingSequence}
          violationReason={violationReason}
        />
      )}

      <h3>Execution Timeline</h3>

      {importantTraces.length === 0 ? (
        <p>No trace events available.</p>
      ) : (
        importantTraces.map((trace) => {
          const isFirstViolation =
            firstFailingSequence !== null &&
            trace.sequence === firstFailingSequence;

          return (
            <TraceItem
              key={trace.sequence}
              trace={trace}
              isFirstViolation={isFirstViolation}
              violationReason={
                isFirstViolation
                  ? violationReason
                  : null
              }
            />
          );
        })
      )}

      {executionFailed && (
        <section
          style={{
            marginTop: "28px",
            padding: "24px",
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
            EXECUTION FAILURE
          </div>

          <h2
            style={{
              marginBottom: "8px",
              color: "#b91c1c",
            }}
          >
            ✕ Execution failed
          </h2>

          <p style={{ marginBottom: 0 }}>
            This execution did not complete successfully.
            It must not be interpreted as a passing
            resilience result.
          </p>
        </section>
      )}

      {run.startDate && (
        <p>
          <strong>Started:</strong>{" "}
          {new Date(
            run.startDate,
          ).toLocaleString()}
        </p>
      )}

      {run.stopDate && (
        <p>
          <strong>Finished:</strong>{" "}
          {new Date(
            run.stopDate,
          ).toLocaleString()}
        </p>
      )}

      {workflowVersion === "buggy" && (
        <div
          style={{
            marginTop: "32px",
            padding: "24px",
            borderRadius: "14px",
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
          }}
        >
          <h2 style={{ marginTop: 0 }}>
            Compare with Fixed
          </h2>

          <p
            style={{
              color: "#475569",
            }}
          >
            Run the exact same stored fault
            against the fixed workflow and
            compare the results side by side.
          </p>

          <button
            disabled
            title="Waiting for compare backend endpoint"
            style={{
              padding: "12px 20px",
              marginTop: "8px",
              cursor: "not-allowed",
              opacity: 0.65,
              fontWeight: 700,
            }}
          >
            Run same fault against fixed version
          </button>

          <p
            style={{
              marginBottom: 0,
              fontSize: "13px",
              color: "#64748b",
            }}
          >
            Comparison backend is not deployed yet.
          </p>
        </div>
      )}

      <button
        onClick={() => navigate("/")}
        style={{
          padding: "10px 20px",
          marginTop: "20px",
          cursor: "pointer",
        }}
      >
        Start another run
      </button>
    </main>
  );
}

export default ResultPage;