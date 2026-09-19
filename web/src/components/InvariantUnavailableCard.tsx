interface InvariantUnavailableCardProps {
  executionStatus: string;
}

function InvariantUnavailableCard({
  executionStatus,
}: InvariantUnavailableCardProps) {
  const executionFailed = [
    "FAILED",
    "TIMED_OUT",
    "ABORTED",
  ].includes(executionStatus);

  return (
    <section
      style={{
        marginTop: "32px",
        marginBottom: "32px",
        padding: "28px",
        borderRadius: "16px",
        border: "3px solid #f59e0b",
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
        INVARIANT STATUS
      </div>

      <h2
        style={{
          marginBottom: "8px",
          color: "#92400e",
        }}
      >
        ? INVARIANT UNAVAILABLE
      </h2>

      <p
        style={{
          marginBottom: "8px",
          fontWeight: 700,
        }}
      >
        No pass/fail conclusion can be made.
      </p>

      <p style={{ marginBottom: 0 }}>
        {executionFailed
          ? "The workflow execution failed before a reliable invariant result was produced."
          : "The execution completed, but no invariant evaluation was returned by the backend."}
      </p>
    </section>
  );
}

export default InvariantUnavailableCard;
