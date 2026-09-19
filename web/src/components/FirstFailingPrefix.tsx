import type { Trace } from "../api/runs";

interface FirstFailingPrefixProps {
  traces: Trace[];
  firstFailingSequence: number;
  violationReason?: string | null;
}

function FirstFailingPrefix({
  traces,
  firstFailingSequence,
  violationReason,
}: FirstFailingPrefixProps) {
  const prefixTraces = [...traces]
    .filter(
      (trace) =>
        trace.sequence <= firstFailingSequence &&
        (
          trace.operation === "OrderCreated" ||
          trace.operation === "InventoryReserved" ||
          trace.operation === "PaymentCharged" ||
          trace.operation === "InjectedFailure" ||
          trace.operation === "PaymentReused"
        ),
    )
    .sort((a, b) => a.sequence - b.sequence);

  function getTraceDetails(trace: Trace) {
    if (trace.operation === "OrderCreated") {
      return {
        title: "Create Order",
        detail: "OrderCreated",
        icon: "✓",
      };
    }

    if (trace.operation === "InventoryReserved") {
      return {
        title: "Reserve Inventory",
        detail: "InventoryReserved",
        icon: "✓",
      };
    }

    if (trace.operation === "InjectedFailure") {
      return {
        title: "Fault Injected",
        detail: "Payment acknowledgement lost",
        icon: "⚡",
      };
    }

    if (trace.operation === "PaymentCharged") {
      return {
        title: `Charge Payment — Attempt ${trace.attempt}`,
        detail: "PaymentCharged",
        icon:
          trace.sequence === firstFailingSequence
            ? "✕"
            : "✓",
      };
    }

    if (trace.operation === "PaymentReused") {
      return {
        title: `Charge Payment — Attempt ${trace.attempt}`,
        detail: "Existing payment reused",
        icon: "↻",
      };
    }

    return {
      title: trace.component,
      detail: trace.operation,
      icon: "✓",
    };
  }

  return (
    <section
      style={{
        marginTop: "32px",
        marginBottom: "32px",
        padding: "28px",
        borderRadius: "16px",
        border: "2px solid #dc2626",
        background: "#fff7f7",
      }}
    >
      <div
        style={{
          marginBottom: "24px",
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
          FAILURE LOCALIZATION
        </div>

        <h2
          style={{
            marginBottom: "6px",
          }}
        >
          First Failing Prefix
        </h2>

        <p
          style={{
            marginTop: 0,
            color: "#64748b",
          }}
        >
          The exact observed execution prefix where the invariant
          changes from valid to violated.
        </p>
      </div>

      {prefixTraces.map((trace) => {
        const details = getTraceDetails(trace);

        const isFirstViolation =
          trace.sequence === firstFailingSequence;

        const chargeId =
          typeof trace.evidence?.chargeId === "string"
            ? trace.evidence.chargeId
            : null;

        return (
          <div
            key={trace.sequence}
            style={{
              padding: "16px",
              marginBottom: "12px",
              borderRadius: "10px",
              border: isFirstViolation
                ? "3px solid #dc2626"
                : "1px solid #cbd5e1",
              background: isFirstViolation
                ? "#fee2e2"
                : "#ffffff",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "55px 1fr auto",
                gap: "14px",
                alignItems: "center",
              }}
            >
              <strong>
                #{trace.sequence}
              </strong>

              <div>
                <strong>
                  {details.title}
                </strong>

                <div
                  style={{
                    marginTop: "4px",
                    color: "#475569",
                  }}
                >
                  {details.detail}
                </div>

                {chargeId && (
                  <code
                    style={{
                      display: "block",
                      marginTop: "8px",
                      wordBreak: "break-all",
                    }}
                  >
                    {chargeId}
                  </code>
                )}
              </div>

              <strong
                style={{
                  fontSize: "22px",
                  color: isFirstViolation
                    ? "#b91c1c"
                    : "#15803d",
                }}
              >
                {details.icon}
              </strong>
            </div>

            {isFirstViolation && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#dc2626",
                  color: "white",
                  textAlign: "center",
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                }}
              >
                ↑ FIRST INVARIANT VIOLATION
              </div>
            )}
          </div>
        );
      })}

      {violationReason && (
        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            borderRadius: "10px",
            background: "#fee2e2",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          {violationReason}
        </div>
      )}

      <p
        style={{
          marginBottom: 0,
          marginTop: "20px",
          fontSize: "13px",
          color: "#64748b",
        }}
      >
        Failure location is supplied by backend trace analysis.
      </p>
    </section>
  );
}

export default FirstFailingPrefix;