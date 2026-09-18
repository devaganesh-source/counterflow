import os
import json
from datetime import datetime, timezone

os.environ.setdefault(
    "STATE_MACHINE_ARN",
    "arn:aws:states:us-east-1:123456789012:stateMachine:CheckoutStateMachine",
)
os.environ.setdefault(
    "TABLE_NAME",
    "counterflow-test-table",
)
os.environ.setdefault(
    "INVARIANT_CHECKER_FUNCTION",
    "counterflow-test-invariant-checker",
)

from services.control_api import app as control_api


class FakeStepFunctions:
    def describe_execution(self, executionArn):
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
                                "type":
                                    "AFTER_SIDE_EFFECT_TIMEOUT",
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
    def query(self, **kwargs):
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
    def Table(self, table_name):
        return FakeTable()


def test_get_run_exposes_frontend_contract(monkeypatch):
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

    # Avoid depending on the real state machine ARN.
    monkeypatch.setattr(
        control_api,
        "get_execution_arn",
        lambda run_id: (
            "arn:aws:states:us-east-1:"
            "123456789012:execution:"
            f"CheckoutStateMachine:{run_id}"
        ),
    )

    # This test verifies the Control API contract,
    # not Lambda-to-Lambda invocation itself.
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

    body = json.loads(response["body"])

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
    assert len(body["traces"]) == 2

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

    assert returned_invariant["chargeIds"] == [
        "charge_1",
        "charge_2",
    ]

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
    assert body["output"]["status"] == "CONFIRMED"