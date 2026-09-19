import type {
  InvariantResult,
  Trace,
} from "../api/runs";

interface Props {
  invariant: InvariantResult;
  orderedChargeIds: string[];
  traces: Trace[];
}

function InvariantResultCard({
  invariant,
  orderedChargeIds,
  traces,
}: Props) {
  const failed = invariant.status === "FAILED";

  const chargeIds =
    orderedChargeIds.length > 0
      ? orderedChargeIds
      : invariant.chargeIds;

  const formatMoney = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  const chargeAttempts = traces.filter(
    (trace) =>
      trace.component === "ChargePayment" &&
      trace.phase === "ATTEMPT_STARTED",
  ).length;

  const paymentChargedTrace = traces.find(
    (trace) =>
      trace.operation === "PaymentCharged" &&
      trace.phase === "SIDE_EFFECT_COMMITTED",
  );

  const paymentReusedTrace = traces.find(
    (trace) =>
      trace.operation === "PaymentReused",
  );

  const retryOccurred =
    chargeAttempts > 1 ||
    Boolean(paymentReusedTrace);

  const originalChargeId =
    typeof paymentChargedTrace?.evidence?.chargeId === "string"
      ? paymentChargedTrace.evidence.chargeId
      : chargeIds[0];

  const reusedChargeId =
    typeof paymentReusedTrace?.evidence?.chargeId === "string"
      ? paymentReusedTrace.evidence.chargeId
      : originalChargeId;

  return (
    <section
      style={{
        marginTop: "32px",
        marginBottom: "32px",
        padding: "30px",
        borderRadius: "18px",
        border: failed
          ? "3px solid #dc2626"
          : "3px solid #16a34a",
        background: failed
          ? "#fff1f2"
          : "#f0fdf4",
      }}
    >
      <div
        style={{
          textAlign: "center",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "2px",
            marginBottom: "12px",
            color: failed
              ? "#991b1b"
              : "#166534",
          }}
        >
          {failed
            ? "BUSINESS IMPACT"
            : "RESILIENCE RESULT"}
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: "34px",
            color: failed
              ? "#b91c1c"
              : "#15803d",
          }}
        >
          {failed
            ? "✕ INVARIANT VIOLATED"
            : "✓ INVARIANT HELD"}
        </h2>

        <h3
          style={{
            marginTop: "16px",
            marginBottom: "8px",
            fontSize: "30px",
          }}
        >
          1 ORDER → {invariant.actualChargeCount}{" "}
          {invariant.actualChargeCount === 1
            ? "CHARGE"
            : "CHARGES"}
        </h3>

        {failed ? (
          <p
            style={{
              marginTop: "10px",
              color: "#7f1d1d",
              fontWeight: 700,
            }}
          >
            Duplicate payment side effect detected
          </p>
        ) : (
          <div
            style={{
              marginTop: "16px",
              color: "#166534",
              fontWeight: 700,
              lineHeight: 1.7,
            }}
          >
            {retryOccurred && (
              <div>↻ Retry occurred</div>
            )}

            {paymentReusedTrace && (
              <div>
                ✓ Duplicate side effect prevented
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "24px",
          borderRadius: "14px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          Financial Impact
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "16px 30px",
            fontSize: "18px",
          }}
        >
          <span>Expected amount</span>

          <strong>
            {formatMoney(
              invariant.expectedAmount,
            )}
          </strong>

          <span>Actually charged</span>

          <strong>
            {formatMoney(
              invariant.actualCharged,
            )}
          </strong>

          <span
            style={{
              fontWeight: 800,
              color: failed
                ? "#b91c1c"
                : "#15803d",
            }}
          >
            CUSTOMER OVERCHARGE
          </span>

          <strong
            style={{
              fontSize: "24px",
              color: failed
                ? "#b91c1c"
                : "#15803d",
            }}
          >
            {formatMoney(
              invariant.overcharge,
            )}
          </strong>
        </div>
      </div>

      {!failed && paymentReusedTrace && (
        <section
          style={{
            marginTop: "28px",
            padding: "24px",
            borderRadius: "14px",
            border: "2px solid #16a34a",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "2px",
                color: "#166534",
              }}
            >
              IDEMPOTENCY PROTECTION
            </div>

            <h3
              style={{
                marginBottom: 0,
                fontSize: "24px",
              }}
            >
              Retry handled without another charge
            </h3>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            <div
              style={{
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
              }}
            >
              <strong
                style={{
                  fontSize: "18px",
                }}
              >
                Attempt{" "}
                {paymentChargedTrace?.attempt ?? 1}
              </strong>

              <p
                style={{
                  fontWeight: 700,
                  color: "#15803d",
                }}
              >
                ✓ Charge created
              </p>

              {originalChargeId && (
                <code>
                  {originalChargeId}
                </code>
              )}
            </div>

            <div
              style={{
                padding: "20px",
                borderRadius: "12px",
                border: "2px solid #16a34a",
                background: "#f0fdf4",
              }}
            >
              <strong
                style={{
                  fontSize: "18px",
                }}
              >
                Attempt{" "}
                {paymentReusedTrace.attempt}
              </strong>

              <p
                style={{
                  fontWeight: 700,
                  color: "#15803d",
                }}
              >
                ↻ Existing charge reused
              </p>

              {reusedChargeId && (
                <code>
                  {reusedChargeId}
                </code>
              )}

              <p
                style={{
                  marginBottom: 0,
                  fontWeight: 800,
                  color: "#15803d",
                }}
              >
                ✓ No duplicate side effect
              </p>
            </div>
          </div>
        </section>
      )}

      {failed && (
        <div
          style={{
            marginTop: "28px",
          }}
        >
          <h3
            style={{
              textAlign: "center",
              marginBottom: "20px",
            }}
          >
            Charges Created
          </h3>

          {chargeIds.length === 0 ? (
            <p>No charges found.</p>
          ) : (
            chargeIds.map(
              (chargeId, index) => (
                <div
                  key={`${chargeId}-${index}`}
                  style={{
                    padding: "16px",
                    marginBottom: "12px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border:
                      index > 0
                        ? "2px solid #dc2626"
                        : "1px solid #cbd5e1",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "17px",
                    }}
                  >
                    Charge #{index + 1}
                  </strong>

                  {index > 0 && (
                    <span
                      style={{
                        marginLeft: "12px",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "#fee2e2",
                        color: "#b91c1c",
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      DUPLICATE
                    </span>
                  )}

                  <div
                    style={{
                      marginTop: "8px",
                      fontFamily: "monospace",
                    }}
                  >
                    {chargeId}
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}

      <div
        style={{
          marginTop: "28px",
          padding: "24px",
          borderTop: "1px solid #cbd5e1",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            textAlign: "center",
          }}
        >
          {invariant.name}
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "12px 30px",
            maxWidth: "500px",
            margin: "20px auto",
            fontSize: "18px",
          }}
        >
          <span>Expected</span>

          <strong>
            ≤ {invariant.expectedChargeCount}
          </strong>

          <span>Actual</span>

          <strong>
            {invariant.actualChargeCount}
          </strong>
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: "28px",
            fontWeight: 900,
            color: failed
              ? "#b91c1c"
              : "#15803d",
          }}
        >
          {invariant.status}
        </div>
      </div>
    </section>
  );
}

export default InvariantResultCard;