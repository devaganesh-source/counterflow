import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  compareRun,
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

  const [compareLoading, setCompareLoading] =
    useState(false);

  const [compareError, setCompareError] =
    useState("");

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

  async function handleCompare() {
    if (!runId || !run) return;

    try {
      setCompareLoading(true);
      setCompareError("");

      const tokenKey =
        `counterflow:compareToken:${runId}`;

      let clientRequestToken =
        sessionStorage.getItem(tokenKey);

      if (!clientRequestToken) {
        clientRequestToken =
          crypto.randomUUID();

        sessionStorage.setItem(
          tokenKey,
          clientRequestToken,
        );
      }

      const comparison = await compareRun(
        runId,
        clientRequestToken,
      );

      const fixedRunId =
        comparison.runId;

      let fixedRun =
        await getRun(fixedRunId);

      const terminalStatuses = [
        "SUCCEEDED",
        "FAILED",
        "TIMED_OUT",
        "ABORTED",
      ];

      let attempts = 0;

      while (
        !terminalStatuses.includes(
          fixedRun.status,
        ) &&
        attempts < 60
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2000),
        );

        fixedRun =
          await getRun(fixedRunId);

        attempts += 1;
      }

      if (
        !terminalStatuses.includes(
          fixedRun.status,
        )
      ) {
        throw new Error(
          "Comparison run is still running. Please try again shortly.",
        );
      }

      navigate(
        `/run/${runId}/compare`,
        {
          state: {
            buggyRun: run,
            fixedRun,
          },
        },
      );
    } catch (err) {
      setCompareError(
        err instanceof Error
          ? err.message
          : "Failed to run fixed comparison.",
      );
    } finally {
      setCompareLoading(false);
    }
  }

  if (!runId) {
    return (
      <main className="cf-result-page">
        <nav className="cf-nav">
          <div className="cf-brand">
            <span className="cf-logo">CF</span>

            <div>
              <strong>CounterFlow</strong>
              <span>Resilience Testing</span>
            </div>
          </div>
        </nav>

        <section className="cf-result-message error">
          <div className="cf-section-label">
            REQUEST ERROR
          </div>

          <h1>Missing run ID</h1>

          <p>
            CounterFlow cannot load an execution result
            without a run identifier.
          </p>

          <button
            className="cf-secondary-button"
            onClick={() => navigate("/")}
          >
            ← Back to launcher
          </button>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="cf-result-page">
        <nav className="cf-nav">
          <div className="cf-brand">
            <span className="cf-logo">CF</span>

            <div>
              <strong>CounterFlow</strong>
              <span>Resilience Testing</span>
            </div>
          </div>
        </nav>

        <section className="cf-result-message error">
          <div className="cf-section-label">
            REQUEST FAILED
          </div>

          <h1>Result unavailable</h1>

          <p>{error}</p>

          <small>
            No resilience result or invariant conclusion
            can be made for this request.
          </small>

          <button
            className="cf-secondary-button"
            onClick={() => navigate("/")}
          >
            ← Back to launcher
          </button>
        </section>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="cf-result-page">
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
            FETCHING RESULT
          </div>
        </nav>

        <section className="cf-result-message loading">
          <div className="cf-section-label">
            EXECUTION ANALYSIS
          </div>

          <h1>Loading result...</h1>

          <p>
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
    <main className="cf-result-page">
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
          ANALYSIS COMPLETE
        </div>
      </nav>

      <header className="cf-result-header">
        <div className="cf-result-topline">
          <div>
            <div className="cf-section-label">
              RESILIENCE TEST RESULT
            </div>

            <h1>Execution analysis</h1>

            <p className="cf-result-subtitle">
              Workflow completion and business correctness
              are evaluated independently.
            </p>
          </div>

          {workflowVersion && (
            <span
              className={`cf-run-badge ${
                workflowVersion === "fixed"
                  ? "fixed"
                  : ""
              }`}
            >
              {workflowVersion.toUpperCase()} RUN
            </span>
          )}
        </div>

        <div className="cf-run-meta">
          <div className="cf-meta-item">
            <span>RUN ID</span>
            <code>{run.runId}</code>
          </div>

          {workflowVersion && (
            <div className="cf-meta-item">
              <span>WORKFLOW VERSION</span>
              <strong>{workflowVersion}</strong>
            </div>
          )}

          <div className="cf-meta-item">
            <span>FAULT PROFILE</span>
            <strong>
              Payment acknowledgement lost
            </strong>
          </div>
        </div>
      </header>

      <section className="cf-result-summary-grid">
        <RunStateBanner status={run.status} />

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
      </section>

      {run.faultPlan && (
        <section className="cf-result-section">
          <div className="cf-result-section-heading">
            <div>
              <div className="cf-section-label">
                FAILURE SCENARIO
              </div>

              <h2>Injected fault</h2>
            </div>

            <span>REPRODUCIBLE</span>
          </div>

          <FaultPlanCard
            faultPlan={run.faultPlan}
          />
        </section>
      )}

      {firstFailingSequence !== null && (
        <section className="cf-result-section">
          <div className="cf-result-section-heading">
            <div>
              <div className="cf-section-label">
                FAILURE LOCALIZATION
              </div>

              <h2>First failing prefix</h2>
            </div>

            <span>BACKEND ANALYSIS</span>
          </div>

          <FirstFailingPrefix
            traces={run.traces ?? []}
            firstFailingSequence={
              firstFailingSequence
            }
            violationReason={violationReason}
          />
        </section>
      )}

      <section className="cf-result-section">
        <div className="cf-result-section-heading">
          <div>
            <div className="cf-section-label">
              EXECUTION TRACE
            </div>

            <h2>Timeline</h2>
          </div>

          <span>
            {importantTraces.length} IMPORTANT EVENTS
          </span>
        </div>

        {importantTraces.length === 0 ? (
          <p className="cf-empty-state">
            No trace events available.
          </p>
        ) : (
          <div className="cf-trace-container">
            {importantTraces.map((trace) => {
              const isFirstViolation =
                firstFailingSequence !== null &&
                trace.sequence ===
                  firstFailingSequence;

              return (
                <TraceItem
                  key={trace.sequence}
                  trace={trace}
                  isFirstViolation={
                    isFirstViolation
                  }
                  violationReason={
                    isFirstViolation
                      ? violationReason
                      : null
                  }
                />
              );
            })}
          </div>
        )}

        {(run.startDate || run.stopDate) && (
          <div className="cf-time-range">
            {run.startDate && (
              <span>
                STARTED
                <strong>
                  {new Date(
                    run.startDate,
                  ).toLocaleString()}
                </strong>
              </span>
            )}

            {run.stopDate && (
              <span>
                FINISHED
                <strong>
                  {new Date(
                    run.stopDate,
                  ).toLocaleString()}
                </strong>
              </span>
            )}
          </div>
        )}
      </section>

      {executionFailed && (
        <section className="cf-execution-warning">
          <div className="cf-section-label">
            EXECUTION FAILURE
          </div>

          <h2>✕ Execution failed</h2>

          <p>
            This execution did not complete successfully.
            It must not be interpreted as a passing
            resilience result.
          </p>
        </section>
      )}

      {workflowVersion === "buggy" && (
        <section className="cf-prove-fix">
          <div>
            <div className="cf-section-label">
              NEXT EXPERIMENT
            </div>

            <h2>Prove the fix.</h2>

            <p>
              Replay the exact stored fault against the
              fixed implementation and compare both
              executions side by side.
            </p>

            <div className="cf-proof-tags">
              <span>SAME FAULT PLAN</span>
              <span>SAME CONDITIONS</span>
              <span>SAME EVIDENCE MODEL</span>
            </div>
          </div>

          <button
            className="cf-compare-button"
            onClick={handleCompare}
            disabled={compareLoading}
          >
            {compareLoading
              ? "Running fixed comparison..."
              : "Compare with Fixed →"}
          </button>

          {compareError && (
            <div className="cf-compare-error">
              ✕ {compareError}
            </div>
          )}
        </section>
      )}

      <div className="cf-result-actions">
        <button
          className="cf-secondary-button"
          onClick={() => navigate("/")}
        >
          ← Start another run
        </button>
      </div>
    </main>
  );
}

export default ResultPage;