export type WorkflowVersion = "buggy" | "fixed";

export interface RunResponse {
  runId: string;
  status: string;
  statusUrl: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function startRun(
  workflowVersion: WorkflowVersion
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE_URL}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflowVersion,
      faultPlanId: "payment-ack-lost-v1",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to start resilience test");
  }

  return data;
}