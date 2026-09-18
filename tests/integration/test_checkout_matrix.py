import pytest
from botocore.exceptions import ClientError

from services.create_order import app as create_order
from services.reserve_inventory import app as reserve_inventory
from services.charge_payment import app as charge_payment
from services.confirm_order import app as confirm_order

from services.invariant_checker.app import (
    evaluate_charge_at_most_once,
    build_trace_analysis,
)


class FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, Item, ConditionExpression=None):
        key = (Item["PK"], Item["SK"])

        # Simulate DynamoDB conditional write used by Fixed payment.
        if ConditionExpression and key in self.items:
            raise ClientError(
                {
                    "Error": {
                        "Code": "ConditionalCheckFailedException",
                        "Message": "Item already exists",
                    }
                },
                "PutItem",
            )

        self.items[key] = Item.copy()
        return {}

    def update_item(
        self,
        Key,
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
    ):
        key = (Key["PK"], Key["SK"])
        item = self.items[key]

        if "#status" in ExpressionAttributeNames:
            item["status"] = ExpressionAttributeValues[":status"]

        return {}


class FakeDynamoDB:
    def __init__(self, table):
        self.table = table

    def Table(self, table_name):
        return self.table


def run_checkout(workflow_version, inject_fault):
    table = FakeTable()
    fake_dynamodb = FakeDynamoDB(table)

    create_order.dynamodb = fake_dynamodb
    reserve_inventory.dynamodb = fake_dynamodb
    charge_payment.dynamodb = fake_dynamodb
    confirm_order.dynamodb = fake_dynamodb

    trace = []

    def fake_write_trace(**kwargs):
        # Match the real shared.ledger.write_trace schema.
        entry = {
            "runId": kwargs["run_id"],
            "orderId": kwargs["order_id"],
            "eventId": kwargs["event_id"],
            "component": kwargs["component"],
            "operation": kwargs["operation"],
            "attempt": kwargs["attempt"],
            "phase": kwargs["phase"],
            "outcome": kwargs["outcome"],
            "evidence": kwargs.get("evidence", {}),
            "sequence": len(trace) + 1,
        }
        trace.append(entry)
        return entry

    create_order.write_trace = fake_write_trace
    reserve_inventory.write_trace = fake_write_trace
    charge_payment.write_trace = fake_write_trace
    confirm_order.write_trace = fake_write_trace

    run_id = f"run_{workflow_version}_{'fault' if inject_fault else 'healthy'}"
    order_id = f"order_{workflow_version}_{'fault' if inject_fault else 'healthy'}"

    faults = []

    if inject_fault:
        faults.append(
            {
                "type": "AFTER_SIDE_EFFECT_TIMEOUT",
                "target": "ChargePayment",
                "attempt": 1,
            }
        )

    event = {
        "runId": run_id,
        "orderId": order_id,
        "eventId": f"evt_{workflow_version}",
        "attempt": 1,
        "sku": "demo-product",
        "workflowVersion": workflow_version,
        "faultPlan": {
            "planId": "payment-ack-lost-v1",
            "planVersion": 1,
            "workflowVersion": workflow_version,
            "faults": faults,
        },
    }

    event = create_order.lambda_handler(event, None)
    event = reserve_inventory.lambda_handler(event, None)

    if inject_fault:
        # Attempt 1 commits its side effect and then fails.
        with pytest.raises(RuntimeError):
            charge_payment.lambda_handler(event.copy(), None)

        # Simulate the Step Functions retry.
        retry_event = event.copy()
        retry_event["attempt"] = 2

        event = charge_payment.lambda_handler(
            retry_event,
            None,
        )
    else:
        event = charge_payment.lambda_handler(event, None)

    event = confirm_order.lambda_handler(event, None)

    pk = f"RUN#{run_id}#ORDER#{order_id}"

    charges = [
        item
        for (item_pk, item_sk), item in table.items.items()
        if item_pk == pk and item_sk.startswith("CHARGE#")
    ]

    invariant_result = evaluate_charge_at_most_once(
        trace,
        order_id,
    )

    trace_analysis = build_trace_analysis(
        trace,
        invariant_result,
    )

    return {
        "event": event,
        "trace": trace,
        "charges": charges,
        "invariant": invariant_result,
        "traceAnalysis": trace_analysis,
    }


@pytest.mark.parametrize(
    (
        "workflow_version",
        "inject_fault",
        "expected_charges",
        "expected_status",
        "expected_failure_sequence",
    ),
    [
        # T-01
        ("buggy", False, 1, "PASSED", None),

        # T-02
        ("buggy", True, 2, "FAILED", 9),

        # T-03
        ("fixed", False, 1, "PASSED", None),

        # T-04
        ("fixed", True, 1, "PASSED", None),
    ],
)
def test_required_checkout_matrix(
    workflow_version,
    inject_fault,
    expected_charges,
    expected_status,
    expected_failure_sequence,
):
    result = run_checkout(
        workflow_version,
        inject_fault,
    )

    assert result["event"]["status"] == "CONFIRMED"

    assert len(result["charges"]) == expected_charges

    assert (
        result["invariant"]["status"]
        == expected_status
    )

    assert (
        result["invariant"]["actual"]
        == expected_charges
    )

    assert (
        result["traceAnalysis"]["firstFailingSequence"]
        == expected_failure_sequence
    )

    if expected_status == "FAILED":
        assert (
            result["traceAnalysis"]["firstFailingOperation"]
            == "PaymentCharged"
        )

        assert (
            result["traceAnalysis"]["firstFailingComponent"]
            == "ChargePayment"
        )

        assert (
            result["traceAnalysis"]["reason"]
            == "ChargeAtMostOnce violated"
        )