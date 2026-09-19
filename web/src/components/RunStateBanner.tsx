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

  const isFailed =
    failedStatuses.includes(status);

  const isCompleted =
    status === "SUCCEEDED";

  const displayState = isFailed
    ? "FAILED"
    : isCompleted
      ? "COMPLETED"
      : "RUNNING";

  const background =
    displayState === "FAILED"
      ? "#fee2e2"
      : displayState === "COMPLETED"
        ? "#f0fdf4"
        : "#eff6ff";

  const border =
    displayState === "FAILED"
      ? "#dc2626"
      : displayState === "COMPLETED"
        ? "#16a34a"
        : "#2563eb";

  const textColor =
    displayState === "FAILED"
      ? "#991b1b"
      : displayState === "COMPLETED"
        ? "#166534"
        : "#1d4ed8";

  return (
    <section
      style={{
        marginTop: "24px",
        marginBottom: "28px",
        padding: "22px",
        borderRadius: "14px",
        border: `2px solid ${border}`,
        background,
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "2px",
          color: textColor,
        }}
      >
        EXECUTION STATE
      </div>

      <h2
        style={{
          margin: "8px 0",
          color: textColor,
        }}
      >
        {displayState}
      </h2>

      {displayState === "RUNNING" && (
        <p style={{ marginBottom: 0 }}>
          Workflow execution is still in progress.
          No invariant conclusion has been made yet.
        </p>
      )}

      {displayState === "COMPLETED" && (
        <p style={{ marginBottom: 0 }}>
          Workflow execution completed. The invariant
          result is evaluated separately below.
        </p>
      )}

      {displayState === "FAILED" && (
        <p style={{ marginBottom: 0 }}>
          Workflow execution failed. This run must not
          be interpreted as a passing resilience result.
        </p>
      )}
    </section>
  );
}

export default RunStateBanner;
