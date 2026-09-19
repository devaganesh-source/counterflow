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

export interface InvariantResult {
  name: string;
  status: "PASSED" | "FAILED";
  expectedChargeCount: number;
  actualChargeCount: number;
  expectedAmount: number;
  actualCharged: number;
  overcharge: number;
  chargeIds: string[];
  runId: string;
  orderId: string;
}

export interface FaultPlanInfo {
  name: string;
  planId: string;
  type: string;
  target: string;
  attempt: number;
  hash: string;
}

export interface TraceAnalysis {
  firstFailingSequence: number | null;
  firstFailingOperation: string | null;
  firstFailingComponent: string | null;
  reason: string | null;
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
  invariant?: InvariantResult | null;
  faultPlan?: FaultPlanInfo | null;
  traceAnalysis?: TraceAnalysis | null;
}

export interface CompareRunResponse {
  sourceRunId: string;
  runId: string;
  orderId: string;
  eventId: string;
  workflowVersion: "fixed";
  executionArn: string;
  status: string;
  statusUrl: string;
  faultPlanHash: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError(
      "CounterFlow API is unavailable. Please try again.",
      0,
    );
  }

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiError(
        "Run not found.",
        404,
      );
    }

    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed with status ${response.status}`;

    throw new ApiError(
      message,
      response.status,
    );
  }

  return data as T;
}

export async function startRun(
  workflowVersion: WorkflowVersion,
): Promise<RunResponse> {
  return requestJson<RunResponse>(
    `${API_BASE_URL}/runs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflowVersion,
        faultPlanId: "payment-ack-lost-v1",
      }),
    },
  );
}

export async function getRun(
  runId: string,
): Promise<RunResponse> {
  return requestJson<RunResponse>(
    `${API_BASE_URL}/runs/${runId}`,
  );
}

export async function compareRun(
  runId: string,
  clientRequestToken: string,
): Promise<CompareRunResponse> {
  return requestJson<CompareRunResponse>(
    `${API_BASE_URL}/runs/${runId}/compare`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientRequestToken,
      }),
    },
  );
}