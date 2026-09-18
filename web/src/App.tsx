import { useEffect, useState } from "react";
import {
  getRun,
  startRun,
  type InvariantResult,
  type RunResponse,
  type Trace,
  type WorkflowVersion,
} from "./api/runs";

const TERMINAL_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "ABORTED",
];

function TraceItem({ trace }: { trace: Trace }) {
  const chargeId =
    typeof trace.evidence?.chargeId === "string"
      ? trace.evidence.chargeId
      : null;

  const faultType =
    typeof trace.evidence?.faultType === "string"
      ? trace.evidence.faultType
      : null;

  let title = trace.component;
  let message = trace.operation;
  let icon = "✓";

  if (trace.operation === "OrderCreated") {
    title = "Create Order";
    message = "Order created";
  }

  if (trace.operation === "InventoryReserved") {
    title = "Reserve Inventory";
    message = "Inventory reserved";
  }

  if (trace.operation === "PaymentCharged") {
    title = "Charge Payment";
    message = "Payment charged";
  }

  if (trace.operation === "InjectedFailure") {
    title = "Fault Injection";
    message = "Payment acknowledgement lost";
    icon = "⚠";
  }

  if (trace.operation === "OrderConfirmed") {
    title = "Confirm Order";
    message = "Order confirmed";
  }

  const isFailure = trace.outcome === "FAILURE";

  return (
    <div
      style={{
        padding: "16px",
        marginBottom: "12px",
        borderRadius: "8px",
        border: "1px solid #ddd",
        background: isFailure ? "#fff7ed" : "#f8fafc",
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
        <strong>
          #{trace.sequence} {title}
        </strong>

        <span>Attempt {trace.attempt}</span>
      </div>

      <p
        style={{
          margin: "8px 0 4px",
          fontWeight: 600,
        }}
      >
        {icon} {message}
      </p>

      {chargeId && (
        <p style={{ margin: "4px 0" }}>
          <strong>Charge:</strong> {chargeId}
        </p>
      )}

      {faultType && (
        <p style={{ margin: "4px 0" }}>
          <strong>Fault:</strong> {faultType}
        </p>
      )}

      <p
        style={{
          margin: "6px 0 0",
          fontSize: "13px",
          color: "#64748b",
        }}
      >
        {trace.component} · {trace.phase} · {trace.outcome}
      </p>
    </div>
  );
}

function InvariantResultCard({
  invariant,
  orderedChargeIds,
}: {
  invariant: InvariantResult;
  orderedChargeIds: string[];
}) {
  const failed = invariant.status === "FAILED";

  const chargeIds =
    orderedChargeIds.length > 0
      ? orderedChargeIds
      : invariant.chargeIds;

  const formatMoney = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  return (
    <section
      style={{
        marginTop: "30px",
        marginBottom: "30px",
        padding: "28px",
        borderRadius: "14px",
        border: failed
          ? "2px solid #dc2626"
          : "2px solid #16a34a",
        background: failed
          ? "#fff1f2"
          : "#f0fdf4",
      }}
    >
      <div
        style={{
          textAlign: "center",
          marginBottom: "24px",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "30px",
            color: failed
              ? "#b91c1c"
              : "#15803d",
          }}
        >
          {failed
            ? "✕ INVARIANT VIOLATED"
            : "✓ INVARIANT PASSED"}
        </h2>

        <h3
          style={{
            marginTop: "12px",
            marginBottom: 0,
            fontSize: "24px",
          }}
        >
          1 ORDER → {invariant.actualChargeCount} CHARGES
        </h3>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "14px 30px",
          fontSize: "17px",
          padding: "16px 0",
        }}
      >
        <span>Expected charge count</span>
        <strong>
          ≤ {invariant.expectedChargeCount}
        </strong>

        <span>Actual charge count</span>
        <strong>
          {invariant.actualChargeCount}
        </strong>

        <span>Expected amount</span>
        <strong>
          {formatMoney(invariant.expectedAmount)}
        </strong>

        <span>Actual charged</span>
        <strong>
          {formatMoney(invariant.actualCharged)}
        </strong>

        <span>Overcharge</span>
        <strong
          style={{
            color:
              invariant.overcharge > 0
                ? "#b91c1c"
                : "#15803d",
          }}
        >
          {formatMoney(invariant.overcharge)}
        </strong>
      </div>

      <hr
        style={{
          margin: "24px 0",
          border: 0,
          borderTop: "1px solid #ddd",
        }}
      />

      <h3>Charges</h3>

      {chargeIds.length === 0 ? (
        <p>No charges found.</p>
      ) : (
        chargeIds.map((chargeId, index) => (
          <div
            key={chargeId}
            style={{
              padding: "10px 0",
            }}
          >
            <strong>
              Charge #{index + 1}
            </strong>

            <div>{chargeId}</div>
          </div>
        ))
      )}

      <hr
        style={{
          margin: "24px 0",
          border: 0,
          borderTop: "1px solid #ddd",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <div>
          <strong
            style={{
              fontSize: "18px",
            }}
          >
            {invariant.name}
          </strong>

          <div>
            Expected ≤ {invariant.expectedChargeCount}
          </div>

          <div>
            Actual {invariant.actualChargeCount}
          </div>
        </div>

        <strong
          style={{
            fontSize: "24px",
            color: failed
              ? "#b91c1c"
              : "#15803d",
          }}
        >
          {invariant.status}
        </strong>
      </div>
    </section>
  );
}

function App() {
  const [workflowVersion, setWorkflowVersion] =
    useState<WorkflowVersion>("buggy");

  const [run, setRun] =
    useState<RunResponse | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleRun() {
    try {
      setLoading(true);
      setError("");

      const result =
        await startRun(workflowVersion);

      setRun(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!run?.runId) {
      return;
    }

    if (
      TERMINAL_STATUSES.includes(run.status)
    ) {
      return;
    }

    const interval = setInterval(
      async () => {
        try {
          const updatedRun =
            await getRun(run.runId);

          setRun(updatedRun);
        } catch (err) {
          console.error(
            "Polling failed:",
            err
          );
        }
      },
      2000
    );

    return () =>
      clearInterval(interval);
  }, [run?.runId, run?.status]);

  if (run) {
    const traces = run.traces ?? [];

    const importantTraces = traces.filter(
      (trace) =>
        trace.phase === "SIDE_EFFECT_COMMITTED" ||
        trace.phase === "ATTEMPT_FAILED"
    );

    const sortedImportantTraces = [
      ...importantTraces,
    ].sort(
      (a, b) =>
        a.sequence - b.sequence
    );

    const orderedChargeIds =
      sortedImportantTraces
        .filter(
          (trace) =>
            trace.operation === "PaymentCharged"
        )
        .map(
          (trace) =>
            trace.evidence?.chargeId
        )
        .filter(
          (chargeId): chargeId is string =>
            typeof chargeId === "string"
        );

    return (
      <main
        style={{
          padding: "40px",
          fontFamily: "Arial",
          maxWidth: "900px",
          margin: "auto",
        }}
      >
        <h1>CounterFlow</h1>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <h2>Live Run</h2>

          <strong
            style={{
              padding: "8px 14px",
              borderRadius: "20px",
              background:
                run.status === "SUCCEEDED"
                  ? "#dcfce7"
                  : run.status === "FAILED"
                    ? "#fee2e2"
                    : "#dbeafe",
            }}
          >
            {run.status}
          </strong>
        </div>

        <p>
          <strong>Run ID:</strong>{" "}
          {run.runId}
        </p>

        <p>
          <strong>
            Workflow Version:
          </strong>{" "}
          {workflowVersion}
        </p>

        <p>
          <strong>
            Fault Profile:
          </strong>{" "}
          Payment acknowledgement lost
        </p>

        <hr />

        {run.invariant && (
          <InvariantResultCard
            invariant={run.invariant}
            orderedChargeIds={orderedChargeIds}
          />
        )}

        <h3>Execution Timeline</h3>

        {sortedImportantTraces.length === 0 ? (
          <p>
            Waiting for trace events...
          </p>
        ) : (
          sortedImportantTraces.map(
            (trace) => (
              <TraceItem
                key={trace.sequence}
                trace={trace}
              />
            )
          )
        )}

        {!TERMINAL_STATUSES.includes(
          run.status
        ) && (
          <p>
            Live — refreshing every 2 seconds...
          </p>
        )}

        {run.startDate && (
          <p>
            <strong>Started:</strong>{" "}
            {new Date(
              run.startDate
            ).toLocaleString()}
          </p>
        )}

        {run.stopDate && (
          <p>
            <strong>Finished:</strong>{" "}
            {new Date(
              run.stopDate
            ).toLocaleString()}
          </p>
        )}

        <button
          onClick={() => setRun(null)}
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

  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial",
        maxWidth: "600px",
        margin: "auto",
      }}
    >
      <h1>CounterFlow</h1>

      <h3>Scenario</h3>

      <p>Checkout Workflow</p>

      <h3>Workflow Version</h3>

      <label>
        <input
          type="radio"
          checked={
            workflowVersion === "buggy"
          }
          onChange={() =>
            setWorkflowVersion("buggy")
          }
        />
        {" "}
        Buggy
      </label>

      <br />

      <label>
        <input
          type="radio"
          checked={
            workflowVersion === "fixed"
          }
          onChange={() =>
            setWorkflowVersion("fixed")
          }
        />
        {" "}
        Fixed
      </label>

      <h3>Fault Profile</h3>

      <p>
        Payment acknowledgement lost
      </p>

      <button
        onClick={handleRun}
        disabled={loading}
        style={{
          padding: "10px 20px",
          marginTop: "10px",
          cursor: loading
            ? "not-allowed"
            : "pointer",
        }}
      >
        {loading
          ? "Starting..."
          : "Run resilience test"}
      </button>

      {error && (
        <p>
          <strong>Error:</strong>{" "}
          {error}
        </p>
      )}
    </main>
  );
}

export default App;