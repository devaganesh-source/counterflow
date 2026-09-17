from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class WorkflowVersion(str, Enum):
    BUGGY = "buggy"
    FIXED = "fixed"


class TracePhase(str, Enum):
    ATTEMPT_STARTED = "ATTEMPT_STARTED"
    SIDE_EFFECT_COMMITTED = "SIDE_EFFECT_COMMITTED"
    ATTEMPT_FAILED = "ATTEMPT_FAILED"
    ATTEMPT_SUCCEEDED = "ATTEMPT_SUCCEEDED"


class TraceOutcome(str, Enum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"


class TraceEntry(BaseModel):
    runId: str
    sequence: int
    timestamp: str

    component: str
    operation: str

    orderId: str
    eventId: str

    attempt: int

    phase: TracePhase
    outcome: TraceOutcome

    evidence: Dict[str, Any] = Field(default_factory=dict)


class Fault(BaseModel):
    type: str
    target: str
    attempt: int


class FaultPlan(BaseModel):
    planId: str
    planVersion: int
    workflowVersion: WorkflowVersion
    faults: list[Fault]


class InvariantResult(BaseModel):
    invariantId: str
    name: str

    expected: str
    actual: int

    passed: bool

    runId: str
    orderId: Optional[str] = None

    firstFailingSequence: Optional[int] = None