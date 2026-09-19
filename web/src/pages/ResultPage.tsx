import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getRun,
  type RunResponse,
  type WorkflowVersion,
} from "../api/runs";
import FaultPlanCard from "../components/FaultPlanCard";
import InvariantResultCard from "../components/InvariantResultCard";
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
        .filter((trace) => trace.operation === "PaymentCharged")
        .map((trace) => trace.evidence?.chargeId)
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
      <main style={{ padding: "40px", fontFamily: "Arial" }}>
        <h1>CounterFlow</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
        <button onClick={() => navigate("/")}>
          Back to launcher
        </button>
      </main>
    );
  }

  if (!run) {
    return (
      <main style={{ padding: "40px", fontFamily: "Arial" }}>
        <h1>CounterFlow</h1>
        <p>Loading result...</p>
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
          <h1 style={{ marginBottom: "6px" }}>Result</h1>
        </div>

        <strong
          style={{
            padding: "8px 14px",
            borderRadius: "20px",
            background:
              run.status === "SUCCEEDED"
                ? "#dcfce7"
                : run.status === "FAILED"
                  ? "#fee2e2"
                  : "#e2e8f0",
          }}
        >
          {run.status}
        </strong>
      </div>

      <p><strong>Run ID:</strong> {run.runId}</p>

      {workflowVersion && (
        <p><strong>Workflow Version:</strong> {workflowVersion}</p>
      )}

      <p><strong>Fault Profile:</strong> Payment acknowledgement lost</p>

      <hr />

      {run.faultPlan && (
        <FaultPlanCard faultPlan={run.faultPlan} />
      )}

      {run.invariant && (
        <InvariantResultCard
          invariant={run.invariant}
          orderedChargeIds={orderedChargeIds}
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
                isFirstViolation ? violationReason : null
              }
            />
          );
        })
      )}

      {run.startDate && (
        <p>
          <strong>Started:</strong>{" "}
          {new Date(run.startDate).toLocaleString()}
        </p>
      )}

      {run.stopDate && (
        <p>
          <strong>Finished:</strong>{" "}
          {new Date(run.stopDate).toLocaleString()}
        </p>
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
