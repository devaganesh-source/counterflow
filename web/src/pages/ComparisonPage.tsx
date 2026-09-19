import { useLocation, useNavigate } from "react-router-dom";
import type { RunResponse } from "../api/runs";
import ComparisonCard from "../components/ComparisonCard";
import TraceComparison from "../components/TraceComparison";

interface ComparisonPageState {
  buggyRun?: RunResponse;
  fixedRun?: RunResponse;
}

function ComparisonPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as ComparisonPageState | null;

  const buggyRun = state?.buggyRun;
  const fixedRun = state?.fixedRun;

  if (!buggyRun || !fixedRun) {
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
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "2px",
            color: "#475569",
          }}
        >
          COUNTERFLOW
        </div>

        <h1>Buggy vs Fixed</h1>

        <p style={{ color: "#64748b" }}>
          Comparison data is not available yet.
        </p>

        <p style={{ color: "#64748b" }}>
          A comparison will appear here after the same stored fault
          has been executed against both workflow versions.
        </p>

        <button
          onClick={() => navigate("/")}
          style={{
            padding: "10px 20px",
            marginTop: "20px",
            cursor: "pointer",
          }}
        >
          Back to launcher
        </button>
      </main>
    );
  }

  const buggyHash = buggyRun.faultPlan?.hash;
  const fixedHash = fixedRun.faultPlan?.hash;

  const hashesMatch =
    Boolean(buggyHash) &&
    Boolean(fixedHash) &&
    buggyHash === fixedHash;

  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial",
        maxWidth: "1100px",
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

      <h1 style={{ marginBottom: "8px" }}>
        Buggy vs Fixed
      </h1>

      <p
        style={{
          marginTop: 0,
          color: "#64748b",
        }}
      >
        Compare both workflow versions under the same tested fault.
      </p>

      <section
        style={{
          marginTop: "28px",
          padding: "20px",
          borderRadius: "12px",
          border: hashesMatch
            ? "1px solid #16a34a"
            : "1px solid #dc2626",
          background: hashesMatch
            ? "#f0fdf4"
            : "#fff1f2",
        }}
      >
        <strong>
          Fault snapshot verification
        </strong>

        <p style={{ marginBottom: 0 }}>
          {hashesMatch
            ? "✓ Both runs used the same stored fault-plan hash."
            : "⚠ The two runs do not have matching fault-plan hashes."}
        </p>
      </section>

      <ComparisonCard
        buggyRun={buggyRun}
        fixedRun={fixedRun}
      />

      <TraceComparison
        buggyRun={buggyRun}
        fixedRun={fixedRun}
      />

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "30px",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() =>
            navigate(`/run/${buggyRun.runId}/result`, {
              state: {
                run: buggyRun,
                workflowVersion: "buggy",
              },
            })
          }
          style={{
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          View Buggy Result
        </button>

        <button
          onClick={() =>
            navigate(`/run/${fixedRun.runId}/result`, {
              state: {
                run: fixedRun,
                workflowVersion: "fixed",
              },
            })
          }
          style={{
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          View Fixed Result
        </button>

        <button
          onClick={() => navigate("/")}
          style={{
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          Start another test
        </button>
      </div>
    </main>
  );
}

export default ComparisonPage;