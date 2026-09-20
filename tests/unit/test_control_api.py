import os
import json
from datetime import datetime, timezone

from botocore.exceptions import ClientError


# ============================================================
# Test environment
# ============================================================

os.environ.setdefault(
    "STATE_MACHINE_ARN",
    (
        "arn:aws:states:us-east-1:"
        "123456789012:"
        "stateMachine:"
        "CheckoutStateMachine"
    ),
)

os.environ.setdefault(
    "TABLE_NAME",
    "counterflow-test-table",
)

os.environ.setdefault(
    "INVARIANT_CHECKER_FUNCTION",
    "counterflow-test-invariant-checker",
)

# Most tests in this file validate API contracts rather than
# authentication behavior. Run those tests in public demo mode.
# Authentication-specific tests override this value explicitly.
os.environ.setdefault(
    "PUBLIC_DEMO_MODE",
    "true",
)


from services.control_api import app as control_api


# ============================================================
# Fake AWS dependencies
# ============================================================

class FakeStepFunctions:
    def describe_execution(
        self,
        executionArn,
    ):
        return {
            "executionArn": executionArn,
            "status": "SUCCEEDED",
            "startDate": datetime(
                2026,
                9,
                19,
                3,
                0,
                tzinfo=timezone.utc,
            ),
            "stopDate": datetime(
                2026,
                9,
                19,
                3,
                1,
                tzinfo=timezone.utc,
            ),
            "input": json.dumps(
                {
                    "runId": "run_contract_001",
                    "orderId": "order_contract_001",
                    "eventId": "evt_contract_001",
                    "workflowVersion": "buggy",
                    "faultPlanId": "payment-ack-lost-v1",
                    "faultPlan": {
                        "planId": "payment-ack-lost-v1",
                        "planVersion": 1,
                        "workflowVersion": "buggy",
                        "faults": [
                            {
                                "type": (
                                    "AFTER_SIDE_EFFECT_TIMEOUT"
                                ),
                                "target": "ChargePayment",
                                "attempt": 1,
                            }
                        ],
                    },
                }
            ),
            "output": json.dumps(
                {
                    "runId": "run_contract_001",
                    "orderId": "order_contract_001",
                    "status": "CONFIRMED",
                }
            ),
        }


class FakeTable:
    def query(
        self,
        **kwargs,
    ):
        return {
            "Items": [
                {
                    "PK": "RUN#run_contract_001",
                    "SK": "TRACE#00000006",
                    "sequence": 6,
                    "runId": "run_contract_001",
                    "orderId": "order_contract_001",
                    "component": "ChargePayment",
                    "operation": "PaymentCharged",
                    "attempt": 1,
                    "phase": "SIDE_EFFECT_COMMITTED",
                    "outcome": "SUCCESS",
                    "evidence": {
                        "chargeId": "charge_1",
                        "amount": 999,
                    },
                },
                {
                    "PK": "RUN#run_contract_001",
                    "SK": "TRACE#00000009",
                    "sequence": 9,
                    "runId": "run_contract_001",
                    "orderId": "order_contract_001",
                    "component": "ChargePayment",
                    "operation": "PaymentCharged",
                    "attempt": 2,
                    "phase": "SIDE_EFFECT_COMMITTED",
                    "outcome": "SUCCESS",
                    "evidence": {
                        "chargeId": "charge_2",
                        "amount": 999,
                    },
                },
            ]
        }


class FakeDynamoDB:
    def Table(
        self,
        table_name,
    ):
        return FakeTable()


# ============================================================
# GET /runs/{runId} contract tests
# ============================================================

def test_get_run_exposes_frontend_contract(
    monkeypatch,
):
    invariant = {
        "invariantId": "charge-at-most-once",
        "name": "ChargeAtMostOnce",
        "status": "FAILED",
        "expected": "<= 1",
        "actual": 2,
        "orderId": "order_contract_001",
        "firstFailingSequence": 9,
        "firstFailingOperation": "PaymentCharged",
        "firstFailingComponent": "ChargePayment",
        "reason": (
            "ChargeAtMostOnce violated: "
            "more than one committed payment "
            "charge exists for the order"
        ),
        "expectedChargeCount": 1,
        "actualChargeCount": 2,
        "expectedAmount": 999,
        "actualCharged": 1998,
        "overcharge": 999,
        "chargeIds": [
            "charge_1",
            "charge_2",
        ],
    }

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        FakeStepFunctions(),
    )

    monkeypatch.setattr(
        control_api,
        "dynamodb",
        FakeDynamoDB(),
    )

    monkeypatch.setattr(
        control_api,
        "get_execution_arn",
        lambda run_id: (
            "arn:aws:states:us-east-1:"
            "123456789012:execution:"
            f"CheckoutStateMachine:{run_id}"
        ),
    )

    monkeypatch.setattr(
        control_api,
        "run_invariant_checker",
        lambda run_id, order_id: invariant,
    )

    event = {
        "httpMethod": "GET",
        "pathParameters": {
            "runId": "run_contract_001",
        },
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert response["statusCode"] == 200

    body = json.loads(
        response["body"]
    )

    # Core run contract.
    assert body["runId"] == "run_contract_001"
    assert body["status"] == "SUCCEEDED"

    assert body["statusUrl"] == (
        "/runs/run_contract_001"
    )

    # Frontend-required top-level fields.
    assert "traces" in body
    assert "invariant" in body
    assert "faultPlan" in body
    assert "traceAnalysis" in body

    # Trace contract.
    assert len(
        body["traces"]
    ) == 2

    assert (
        body["traces"][0]["operation"]
        == "PaymentCharged"
    )

    assert (
        body["traces"][1]["sequence"]
        == 9
    )

    # Deterministic invariant result.
    returned_invariant = body["invariant"]

    assert (
        returned_invariant["status"]
        == "FAILED"
    )

    assert (
        returned_invariant["expectedChargeCount"]
        == 1
    )

    assert (
        returned_invariant["actualChargeCount"]
        == 2
    )

    assert (
        returned_invariant["expectedAmount"]
        == 999
    )

    assert (
        returned_invariant["actualCharged"]
        == 1998
    )

    assert (
        returned_invariant["overcharge"]
        == 999
    )

    assert (
        returned_invariant["chargeIds"]
        == [
            "charge_1",
            "charge_2",
        ]
    )

    # Backend-determined failing prefix.
    trace_analysis = body["traceAnalysis"]

    assert (
        trace_analysis["firstFailingSequence"]
        == 9
    )

    assert (
        trace_analysis["firstFailingOperation"]
        == "PaymentCharged"
    )

    assert (
        trace_analysis["firstFailingComponent"]
        == "ChargePayment"
    )

    assert (
        trace_analysis["reason"]
        == invariant["reason"]
    )

    # Exact fault used for the run is exposed.
    fault_plan = body["faultPlan"]

    assert (
        fault_plan["type"]
        == "AFTER_SIDE_EFFECT_TIMEOUT"
    )

    assert (
        fault_plan["target"]
        == "ChargePayment"
    )

    assert fault_plan["attempt"] == 1

    # Execution output is preserved too.
    assert (
        body["output"]["status"]
        == "CONFIRMED"
    )


def test_get_run_exposes_fixed_success_contract(
    monkeypatch,
):
    class FixedStepFunctions:
        def describe_execution(
            self,
            executionArn,
        ):
            return {
                "executionArn": executionArn,
                "status": "SUCCEEDED",
                "startDate": datetime(
                    2026,
                    9,
                    19,
                    3,
                    10,
                    tzinfo=timezone.utc,
                ),
                "stopDate": datetime(
                    2026,
                    9,
                    19,
                    3,
                    11,
                    tzinfo=timezone.utc,
                ),
                "input": json.dumps(
                    {
                        "runId": "run_fixed_001",
                        "orderId": "order_fixed_001",
                        "eventId": "evt_fixed_001",
                        "workflowVersion": "fixed",
                        "faultPlanId": "payment-ack-lost-v1",
                        "faultPlan": {
                            "planId": "payment-ack-lost-v1",
                            "planVersion": 1,
                            "workflowVersion": "fixed",
                            "faults": [
                                {
                                    "type": (
                                        "AFTER_SIDE_EFFECT_TIMEOUT"
                                    ),
                                    "target": "ChargePayment",
                                    "attempt": 1,
                                }
                            ],
                        },
                    }
                ),
                "output": json.dumps(
                    {
                        "runId": "run_fixed_001",
                        "orderId": "order_fixed_001",
                        "status": "CONFIRMED",
                    }
                ),
            }

    class FixedTable:
        def query(
            self,
            **kwargs,
        ):
            return {
                "Items": [
                    {
                        "PK": "RUN#run_fixed_001",
                        "SK": "TRACE#00000006",
                        "sequence": 6,
                        "runId": "run_fixed_001",
                        "orderId": "order_fixed_001",
                        "component": "ChargePayment",
                        "operation": "PaymentCharged",
                        "attempt": 1,
                        "phase": "SIDE_EFFECT_COMMITTED",
                        "outcome": "SUCCESS",
                        "evidence": {
                            "chargeId": (
                                "charge_order_fixed_001"
                            ),
                            "amount": 999,
                        },
                    },
                    {
                        "PK": "RUN#run_fixed_001",
                        "SK": "TRACE#00000009",
                        "sequence": 9,
                        "runId": "run_fixed_001",
                        "orderId": "order_fixed_001",
                        "component": "ChargePayment",
                        "operation": "PaymentReused",
                        "attempt": 2,
                        "phase": "ATTEMPT_SUCCEEDED",
                        "outcome": "SUCCESS",
                        "evidence": {
                            "chargeId": (
                                "charge_order_fixed_001"
                            ),
                            "idempotentReplay": True,
                        },
                    },
                ]
            }

    class FixedDynamoDB:
        def Table(
            self,
            table_name,
        ):
            return FixedTable()

    invariant = {
        "invariantId": "charge-at-most-once",
        "name": "ChargeAtMostOnce",
        "status": "PASSED",
        "expected": "<= 1",
        "actual": 1,
        "orderId": "order_fixed_001",
        "firstFailingSequence": None,
        "firstFailingOperation": None,
        "firstFailingComponent": None,
        "reason": None,
        "expectedChargeCount": 1,
        "actualChargeCount": 1,
        "expectedAmount": 999,
        "actualCharged": 999,
        "overcharge": 0,
        "chargeIds": [
            "charge_order_fixed_001"
        ],
    }

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        FixedStepFunctions(),
    )

    monkeypatch.setattr(
        control_api,
        "dynamodb",
        FixedDynamoDB(),
    )

    monkeypatch.setattr(
        control_api,
        "get_execution_arn",
        lambda run_id: (
            "arn:aws:states:us-east-1:"
            "123456789012:execution:"
            f"CheckoutStateMachine:{run_id}"
        ),
    )

    monkeypatch.setattr(
        control_api,
        "run_invariant_checker",
        lambda run_id, order_id: invariant,
    )

    event = {
        "httpMethod": "GET",
        "pathParameters": {
            "runId": "run_fixed_001",
        },
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert response["statusCode"] == 200

    body = json.loads(
        response["body"]
    )

    assert (
        body["runId"]
        == "run_fixed_001"
    )

    assert (
        body["status"]
        == "SUCCEEDED"
    )

    assert len(
        body["traces"]
    ) == 2

    assert (
        body["traces"][0]["operation"]
        == "PaymentCharged"
    )

    assert (
        body["traces"][1]["operation"]
        == "PaymentReused"
    )

    returned_invariant = body["invariant"]

    assert (
        returned_invariant["status"]
        == "PASSED"
    )

    assert (
        returned_invariant["expectedChargeCount"]
        == 1
    )

    assert (
        returned_invariant["actualChargeCount"]
        == 1
    )

    assert (
        returned_invariant["expectedAmount"]
        == 999
    )

    assert (
        returned_invariant["actualCharged"]
        == 999
    )

    assert (
        returned_invariant["overcharge"]
        == 0
    )

    assert (
        returned_invariant["chargeIds"]
        == [
            "charge_order_fixed_001"
        ]
    )

    assert (
        body["traceAnalysis"]
        is None
    )

    fault_plan = body["faultPlan"]

    assert (
        fault_plan["type"]
        == "AFTER_SIDE_EFFECT_TIMEOUT"
    )

    assert (
        fault_plan["target"]
        == "ChargePayment"
    )

    assert (
        fault_plan["attempt"]
        == 1
    )

    assert (
        body["output"]["status"]
        == "CONFIRMED"
    )


# ============================================================
# POST /runs contract tests
# ============================================================

class RecordingStepFunctions:
    def __init__(self):
        self.calls = []

    def start_execution(
        self,
        **kwargs,
    ):
        self.calls.append(
            kwargs
        )

        return {
            "executionArn": (
                "arn:aws:states:"
                "us-east-1:"
                "123456789012:"
                "execution:"
                "CheckoutStateMachine:"
                f"{kwargs['name']}"
            )
        }


def run_post_contract_test(
    monkeypatch,
    workflow_version,
    suffix,
):
    recorder = RecordingStepFunctions()

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        recorder,
    )

    generated_ids = iter(
        [
            f"run_{suffix}",
            f"order_{suffix}",
            f"event_{suffix}",
        ]
    )

    monkeypatch.setattr(
        control_api.uuid,
        "uuid4",
        lambda: next(
            generated_ids
        ),
    )

    event = {
        "httpMethod": "POST",
        "body": json.dumps(
            {
                "workflowVersion": workflow_version,
                "faultPlanId": "payment-ack-lost-v1",
            }
        ),
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert (
        response["statusCode"]
        == 202
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["runId"]
        == f"run_{suffix}"
    )

    assert (
        body["orderId"]
        == f"order_{suffix}"
    )

    assert (
        body["eventId"]
        == f"event_{suffix}"
    )

    assert (
        body["status"]
        == "RUNNING"
    )

    assert (
        body["statusUrl"]
        == f"/runs/run_{suffix}"
    )

    assert len(
        recorder.calls
    ) == 1

    call = recorder.calls[0]

    assert (
        call["stateMachineArn"]
        == control_api.STATE_MACHINE_ARN
    )

    assert (
        call["name"]
        == f"run_{suffix}"
    )

    workflow_input = json.loads(
        call["input"]
    )

    assert (
        workflow_input["runId"]
        == f"run_{suffix}"
    )

    assert (
        workflow_input["orderId"]
        == f"order_{suffix}"
    )

    assert (
        workflow_input["eventId"]
        == f"event_{suffix}"
    )

    assert (
        workflow_input["workflowVersion"]
        == workflow_version
    )

    assert (
        workflow_input["faultPlanId"]
        == "payment-ack-lost-v1"
    )

    assert (
        workflow_input["sku"]
        == "SKU-001"
    )

    expected_fault_plan = {
        "faults": [
            {
                "type": "AFTER_SIDE_EFFECT_TIMEOUT",
                "target": "ChargePayment",
                "attempt": 1,
            }
        ]
    }

    assert (
        workflow_input["faultPlan"]
        == expected_fault_plan
    )

    assert (
        workflow_input["faultPlanHash"]
        == control_api.calculate_fault_plan_hash(
            expected_fault_plan
        )
    )


def test_post_runs_starts_buggy_workflow(
    monkeypatch,
):
    run_post_contract_test(
        monkeypatch,
        workflow_version="buggy",
        suffix="buggy_001",
    )


def test_post_runs_starts_fixed_workflow(
    monkeypatch,
):
    run_post_contract_test(
        monkeypatch,
        workflow_version="fixed",
        suffix="fixed_001",
    )


def test_post_runs_rejects_invalid_json():
    event = {
        "httpMethod": "POST",
        "body": "{not-valid-json",
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert (
        response["statusCode"]
        == 400
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["message"]
        == "Request body must be valid JSON"
    )


def test_post_runs_rejects_missing_workflow_version():
    event = {
        "httpMethod": "POST",
        "body": json.dumps(
            {
                "faultPlanId": "payment-ack-lost-v1",
            }
        ),
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert (
        response["statusCode"]
        == 400
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["message"]
        == "workflowVersion must be buggy or fixed"
    )


def test_post_runs_rejects_invalid_workflow_version():
    event = {
        "httpMethod": "POST",
        "body": json.dumps(
            {
                "workflowVersion": "broken",
                "faultPlanId": "payment-ack-lost-v1",
            }
        ),
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert (
        response["statusCode"]
        == 400
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["message"]
        == "workflowVersion must be buggy or fixed"
    )


def test_get_run_rejects_missing_run_id():
    event = {
        "httpMethod": "GET",
        "pathParameters": {},
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert (
        response["statusCode"]
        == 400
    )


def test_api_rejects_unsupported_method():
    event = {
        "httpMethod": "DELETE",
    }

    response = control_api.lambda_handler(
        event,
        None,
    )

    assert (
        response["statusCode"]
        == 405
    )


# ============================================================
# Compare route tests
# ============================================================

def test_compare_run_copies_exact_fault_plan(
    monkeypatch,
):
    source_fault_plan = {
        "faults": [
            {
                "type": "AFTER_SIDE_EFFECT_TIMEOUT",
                "target": "ChargePayment",
                "attempt": 1,
            }
        ]
    }

    source_hash = (
        control_api.calculate_fault_plan_hash(
            source_fault_plan
        )
    )

    class CompareStepFunctions:
        def __init__(self):
            self.start_calls = []

        def describe_execution(
            self,
            executionArn,
        ):
            return {
                "executionArn": executionArn,
                "input": json.dumps(
                    {
                        "runId": "source_run_001",
                        "orderId": "source_order_001",
                        "workflowVersion": "buggy",
                        "sku": "SKU-999",
                        "faultPlanId": (
                            "payment-ack-lost-v1"
                        ),
                        "faultPlan": (
                            source_fault_plan
                        ),
                    }
                ),
            }

        def start_execution(
            self,
            **kwargs,
        ):
            self.start_calls.append(
                kwargs
            )

            return {
                "executionArn": (
                    "arn:aws:states:"
                    "us-east-1:"
                    "123456789012:"
                    "execution:"
                    "CheckoutStateMachine:"
                    f"{kwargs['name']}"
                )
            }

    recorder = (
        CompareStepFunctions()
    )

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        recorder,
    )

    generated_ids = iter(
        [
            "run_cmp_001",
            "order_cmp_001",
            "evt_cmp_001",
        ]
    )

    monkeypatch.setattr(
        control_api.uuid,
        "uuid4",
        lambda: next(
            generated_ids
        ),
    )

    event = {
        "httpMethod": "POST",
        "resource": (
            "/runs/{runId}/compare"
        ),
        "pathParameters": {
            "runId": "source_run_001"
        },
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 202
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["sourceRunId"]
        == "source_run_001"
    )

    assert (
        body["runId"]
        == "run_cmp_001"
    )

    assert (
        body["workflowVersion"]
        == "fixed"
    )

    assert (
        body["statusUrl"]
        == "/runs/run_cmp_001"
    )

    # Verify the workflow input was copied correctly
    # and the version was forced to fixed.
    assert len(
        recorder.start_calls
    ) == 1

    new_input = json.loads(
        recorder.start_calls[0]["input"]
    )

    assert (
        new_input["runId"]
        == "run_cmp_001"
    )

    assert (
        new_input["orderId"]
        == "order_cmp_001"
    )

    assert (
        new_input["workflowVersion"]
        == "fixed"
    )

    assert (
        new_input["sku"]
        == "SKU-999"
    )

    assert (
        new_input["faultPlanId"]
        == "payment-ack-lost-v1"
    )

    # Assert exact fault-plan parity.
    new_hash = (
        control_api.calculate_fault_plan_hash(
            new_input["faultPlan"]
        )
    )

    assert (
        new_hash
        == source_hash
    )


def test_compare_run_rejects_missing_run_id():
    event = {
        "httpMethod": "POST",
        "resource": (
            "/runs/{runId}/compare"
        ),
        "pathParameters": {},
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 400
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["message"]
        == "runId is required to compare"
    )


def test_compare_run_returns_404_for_missing_source(
    monkeypatch,
):
    class NotFoundStepFunctions:
        def describe_execution(
            self,
            executionArn,
        ):
            error_response = {
                "Error": {
                    "Code": "ExecutionDoesNotExist"
                }
            }

            raise ClientError(
                error_response,
                "DescribeExecution",
            )

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        NotFoundStepFunctions(),
    )

    event = {
        "httpMethod": "POST",
        "resource": (
            "/runs/{runId}/compare"
        ),
        "pathParameters": {
            "runId": "missing_run_123"
        },
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 404
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["message"]
        == "Source run not found"
    )


def test_compare_run_is_idempotent_for_same_client_token(
    monkeypatch,
):
    source_fault_plan = {
        "faults": [
            {
                "type": (
                    "AFTER_SIDE_EFFECT_TIMEOUT"
                ),
                "target": "ChargePayment",
                "attempt": 1,
            }
        ]
    }

    source_hash = (
        control_api.calculate_fault_plan_hash(
            source_fault_plan
        )
    )

    source_input = {
        "runId": "source_run_001",
        "orderId": "source_order_001",
        "eventId": "source_event_001",
        "workflowVersion": "buggy",
        "faultPlanId": (
            "payment-ack-lost-v1"
        ),
        "faultPlan": source_fault_plan,
        "faultPlanHash": source_hash,
        "sku": "SKU-001",
    }

    class IdempotentStepFunctions:
        def __init__(self):
            self.start_calls = []

        def describe_execution(
            self,
            executionArn,
        ):
            # Reading the original Buggy run.
            if executionArn.endswith(
                "source_run_001"
            ):
                return {
                    "executionArn": executionArn,
                    "status": "SUCCEEDED",
                    "input": json.dumps(
                        source_input
                    ),
                }

            return {
                "executionArn": executionArn,
                "status": "SUCCEEDED",
                "input": "{}",
            }

        def start_execution(
            self,
            **kwargs,
        ):
            self.start_calls.append(
                kwargs
            )

            if len(
                self.start_calls
            ) == 1:
                return {
                    "executionArn": (
                        "arn:aws:states:"
                        "us-east-1:"
                        "123456789012:"
                        "execution:"
                        "CheckoutStateMachine:"
                        f"{kwargs['name']}"
                    )
                }

            raise ClientError(
                {
                    "Error": {
                        "Code": (
                            "ExecutionAlreadyExists"
                        ),
                        "Message": (
                            "Execution already exists"
                        ),
                    }
                },
                "StartExecution",
            )

    fake_sf = (
        IdempotentStepFunctions()
    )

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        fake_sf,
    )

    monkeypatch.setattr(
        control_api,
        "get_execution_arn",
        lambda run_id: (
            "arn:aws:states:"
            "us-east-1:"
            "123456789012:"
            "execution:"
            "CheckoutStateMachine:"
            f"{run_id}"
        ),
    )

    event = {
        "httpMethod": "POST",
        "resource": (
            "/runs/{runId}/compare"
        ),
        "pathParameters": {
            "runId": "source_run_001",
        },
        "body": json.dumps(
            {
                "clientRequestToken": (
                    "same-token-001"
                ),
            }
        ),
    }

    first_response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    second_response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        first_response["statusCode"]
        == 202
    )

    assert (
        second_response["statusCode"]
        == 202
    )

    first_body = json.loads(
        first_response["body"]
    )

    second_body = json.loads(
        second_response["body"]
    )

    # Same source run + same token must
    # identify the same comparison run.
    assert (
        first_body["runId"]
        == second_body["runId"]
    )

    assert (
        first_body["orderId"]
        == second_body["orderId"]
    )

    assert (
        first_body["eventId"]
        == second_body["eventId"]
    )

    assert (
        first_body["faultPlanHash"]
        == second_body["faultPlanHash"]
        == source_hash
    )

    assert (
        first_body["workflowVersion"]
        == second_body["workflowVersion"]
        == "fixed"
    )

    # Both attempts used the same Step Functions
    # execution name.
    assert len(
        fake_sf.start_calls
    ) == 2

    assert (
        fake_sf.start_calls[0]["name"]
        == fake_sf.start_calls[1]["name"]
    )


# ============================================================
# Authorization tests
# ============================================================

def test_public_demo_mode_allows_request_without_token(
    monkeypatch,
):
    monkeypatch.setattr(
        control_api,
        "PUBLIC_DEMO_MODE",
        True,
    )

    monkeypatch.setattr(
        control_api,
        "DEMO_TOKEN",
        "",
    )

    class DummyStepFunctions:
        def start_execution(
            self,
            **kwargs,
        ):
            return {
                "executionArn": (
                    "arn:aws:states:"
                    "us-east-1:"
                    "123456789012:"
                    "execution:"
                    "CheckoutStateMachine:"
                    f"{kwargs['name']}"
                )
            }

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        DummyStepFunctions(),
    )

    event = {
        "httpMethod": "POST",
        "path": "/runs",
        "headers": {},
        "body": json.dumps(
            {
                "workflowVersion": "buggy",
                "faultPlanId": (
                    "payment-ack-lost-v1"
                ),
            }
        ),
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 202
    )


def test_protected_mode_fails_closed_without_demo_token(
    monkeypatch,
):
    monkeypatch.setattr(
        control_api,
        "PUBLIC_DEMO_MODE",
        False,
    )

    monkeypatch.setattr(
        control_api,
        "DEMO_TOKEN",
        "",
    )

    event = {
        "httpMethod": "POST",
        "path": "/runs",
        "headers": {},
        "body": json.dumps(
            {
                "workflowVersion": "buggy",
                "faultPlanId": (
                    "payment-ack-lost-v1"
                ),
            }
        ),
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 401
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["message"]
        == "Unauthorized"
    )


def test_post_requires_demo_token_when_configured(
    monkeypatch,
):
    monkeypatch.setattr(
        control_api,
        "PUBLIC_DEMO_MODE",
        False,
    )

    monkeypatch.setattr(
        control_api,
        "DEMO_TOKEN",
        "test-demo-token-1234567890",
    )

    event = {
        "httpMethod": "POST",
        "path": "/runs",
        "headers": {},
        "body": json.dumps(
            {
                "workflowVersion": "buggy",
                "faultPlanId": (
                    "payment-ack-lost-v1"
                ),
            }
        ),
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 401
    )

    body = json.loads(
        response["body"]
    )

    assert (
        body["message"]
        == "Unauthorized"
    )


def test_post_rejects_invalid_demo_token(
    monkeypatch,
):
    monkeypatch.setattr(
        control_api,
        "PUBLIC_DEMO_MODE",
        False,
    )

    monkeypatch.setattr(
        control_api,
        "DEMO_TOKEN",
        "test-demo-token-1234567890",
    )

    event = {
        "httpMethod": "POST",
        "path": "/runs",
        "headers": {
            "x-demo-token": "wrong-token"
        },
        "body": json.dumps(
            {
                "workflowVersion": "buggy",
                "faultPlanId": (
                    "payment-ack-lost-v1"
                ),
            }
        ),
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 401
    )


def test_post_allows_request_with_valid_demo_token(
    monkeypatch,
):
    monkeypatch.setattr(
        control_api,
        "PUBLIC_DEMO_MODE",
        False,
    )

    monkeypatch.setattr(
        control_api,
        "DEMO_TOKEN",
        "test-demo-token-1234567890",
    )

    class DummyStepFunctions:
        def start_execution(
            self,
            **kwargs,
        ):
            return {
                "executionArn": (
                    "arn:aws:states:"
                    "us-east-1:"
                    "123456789012:"
                    "execution:"
                    "CheckoutStateMachine:"
                    f"{kwargs['name']}"
                )
            }

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        DummyStepFunctions(),
    )

    event = {
        "httpMethod": "POST",
        "path": "/runs",
        "headers": {
            "x-demo-token": (
                "test-demo-token-1234567890"
            )
        },
        "body": json.dumps(
            {
                "workflowVersion": "buggy",
                "faultPlanId": (
                    "payment-ack-lost-v1"
                ),
            }
        ),
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 202
    )


def test_bearer_token_is_supported_in_protected_mode(
    monkeypatch,
):
    monkeypatch.setattr(
        control_api,
        "PUBLIC_DEMO_MODE",
        False,
    )

    monkeypatch.setattr(
        control_api,
        "DEMO_TOKEN",
        "test-demo-token-1234567890",
    )

    class DummyStepFunctions:
        def start_execution(
            self,
            **kwargs,
        ):
            return {
                "executionArn": (
                    "arn:aws:states:"
                    "us-east-1:"
                    "123456789012:"
                    "execution:"
                    "CheckoutStateMachine:"
                    f"{kwargs['name']}"
                )
            }

    monkeypatch.setattr(
        control_api,
        "stepfunctions",
        DummyStepFunctions(),
    )

    event = {
        "httpMethod": "POST",
        "path": "/runs",
        "headers": {
            "Authorization": (
                "Bearer "
                "test-demo-token-1234567890"
            )
        },
        "body": json.dumps(
            {
                "workflowVersion": "buggy",
                "faultPlanId": (
                    "payment-ack-lost-v1"
                ),
            }
        ),
    }

    response = (
        control_api.lambda_handler(
            event,
            None,
        )
    )

    assert (
        response["statusCode"]
        == 202
    )