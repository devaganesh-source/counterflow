interface RunStateBannerProps {
  status: string;
}

function RunStateBanner({
  status,
}: RunStateBannerProps) {
  const failedStatuses = [
    "FAILED",
    "TIMED_OUT",
    "ABORTED",
  ];

  const isFailed = failedStatuses.includes(status);
  const isCompleted = status === "SUCCEEDED";

  const displayState = isFailed
    ? "FAILED"
    : isCompleted
      ? "COMPLETED"
      : "RUNNING";

  const stateClass =
    displayState === "FAILED"
      ? "failed"
      : displayState === "COMPLETED"
        ? "completed"
        : "running";

  return (
    <section className={`cf-state-card ${stateClass}`}>
      <div className="cf-state-icon">
        {displayState === "FAILED"
          ? "✕"
          : displayState === "COMPLETED"
            ? "✓"
            : "↻"}
      </div>

      <div>
        <div className="cf-section-label">
          EXECUTION STATE
        </div>

        <h2>{displayState}</h2>

        {displayState === "RUNNING" && (
          <p>
            Workflow execution is still in progress.
            No invariant conclusion has been made yet.
          </p>
        )}

        {displayState === "COMPLETED" && (
          <p>
            Workflow execution completed successfully.
            Business correctness is evaluated independently.
          </p>
        )}

        {displayState === "FAILED" && (
          <p>
            Workflow execution failed before successful
            completion. This must not be interpreted as a
            passing resilience result.
          </p>
        )}
      </div>
    </section>
  );
}

export default RunStateBanner;