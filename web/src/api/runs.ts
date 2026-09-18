export type WorkflowVersion = "buggy" | "fixed";

export interface Trace {
  sequence: number;
  timestamp: string;
  component: string;
  operation: string;
  orderId: string;
  eventId: string;
  attempt: number;
  phase: string;
  outcome: string;
  evidence?: Record<string, unknown>;
}

export interface RunResponse {
  runId: string;
  orderId?: string;
  eventId?: string;
  executionArn?: string;
  status: string;
  statusUrl: string;
  startDate?: string;
  stopDate?: string;
  output?: unknown;
  traces?: Trace[];
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
    throw new Error(
      data.message || "Failed to start resilience test"
    );
  }

  return data;
}

export async function getRun(
  runId: string
): Promise<RunResponse> {
  const response = await fetch(
    `${API_BASE_URL}/runs/${runId}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to fetch run"
    );
  }

  return data;
}