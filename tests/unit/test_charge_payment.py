import pytest
from botocore.exceptions import ClientError

from services.charge_payment import app as charge_payment


class FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, Item, ConditionExpression=None):
        key = (Item["PK"], Item["SK"])
        
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


class FakeDynamoDB:
    def __init__(self, table):
        self.table = table

    def Table(self, table_name):
        return self.table


def test_payment_commits_charge_then_injects_failure():
    table = FakeTable()
    charge_payment.dynamodb = FakeDynamoDB(table)

    traces = []

    def fake_write_trace(**kwargs):
        traces.append(kwargs)
        return kwargs

    charge_payment.write_trace = fake_write_trace

    event = {
        "runId": "run_fault_test",
        "orderId": "order_fault_test",
        "eventId": "evt_fault_test",
        "attempt": 1,
        "amount": 999,
        "faultPlan": {
            "planId": "payment-ack-lost-v1",
            "planVersion": 1,
            "workflowVersion": "buggy",
            "faults": [
                {
                    "type": "AFTER_SIDE_EFFECT_TIMEOUT",
                    "target": "ChargePayment",
                    "attempt": 1,
                }
            ],
        },
    }

    with pytest.raises(RuntimeError):
        charge_payment.lambda_handler(event, None)

    pk = "RUN#run_fault_test#ORDER#order_fault_test"

    charges = [
        item
        for (item_pk, item_sk), item in table.items.items()
        if item_pk == pk and item_sk.startswith("CHARGE#")
    ]

    assert len(charges) == 1
    assert charges[0]["amount"] == 999

    operations = [entry["operation"] for entry in traces]

    assert "ChargePayment" in operations
    assert "PaymentCharged" in operations
    assert "InjectedFailure" in operations

    payment_trace = next(
        entry for entry in traces
        if entry["operation"] == "PaymentCharged"
    )

    failure_trace = next(
        entry for entry in traces
        if entry["operation"] == "InjectedFailure"
    )

    assert payment_trace["phase"] == "SIDE_EFFECT_COMMITTED"
    assert failure_trace["phase"] == "ATTEMPT_FAILED"
    assert failure_trace["outcome"] == "FAILURE"


def test_fixed_payment_retry_does_not_duplicate_charge():
    table = FakeTable()
    charge_payment.dynamodb = FakeDynamoDB(table)
    
    traces = []
    
    def fake_write_trace(**kwargs):
        traces.append(kwargs)
        return kwargs
        
    charge_payment.write_trace = fake_write_trace
    
    event = {
        "runId": "run_fixed_test",
        "orderId": "order_fixed_test",
        "eventId": "evt_fixed_test",
        "attempt": 1,
        "amount": 999,
        "workflowVersion": "fixed",
        "faultPlan": {
            "planId": "payment-ack-lost-v1",
            "planVersion": 1,
            "workflowVersion": "fixed",
            "faults": [
                {
                    "type": "AFTER_SIDE_EFFECT_TIMEOUT",
                    "target": "ChargePayment",
                    "attempt": 1,
                }
            ],
        },
    }
    
    # Attempt 1 commits payment then fails.
    with pytest.raises(RuntimeError):
        charge_payment.lambda_handler(event.copy(), None)
        
    retry_event = event.copy()
    retry_event["attempt"] = 2
    
    # Attempt 2 should reuse the existing payment.
    result = charge_payment.lambda_handler(retry_event, None)
    
    pk = "RUN#run_fixed_test#ORDER#order_fixed_test"
    charges = [
        item for (item_pk, item_sk), item in table.items.items() 
        if item_pk == pk and item_sk.startswith("CHARGE#")
    ]
    
    assert len(charges) == 1
    assert charges[0]["amount"] == 999
    
    payment_charged = [entry for entry in traces if entry["operation"] == "PaymentCharged"]
    payment_reused = [entry for entry in traces if entry["operation"] == "PaymentReused"]
    
    assert len(payment_charged) == 1
    assert len(payment_reused) == 1
    assert result["chargeId"] == charges[0]["chargeId"]


def test_buggy_payment_retry_creates_duplicate_charge():
    table = FakeTable()
    charge_payment.dynamodb = FakeDynamoDB(table)

    traces = []

    def fake_write_trace(**kwargs):
        traces.append(kwargs)
        return kwargs

    charge_payment.write_trace = fake_write_trace

    event = {
        "runId": "run_buggy_retry",
        "orderId": "order_buggy_retry",
        "eventId": "evt_buggy_retry",
        "attempt": 1,
        "amount": 999,
        "workflowVersion": "buggy",
        "faultPlan": {
            "planId": "payment-ack-lost-v1",
            "planVersion": 1,
            "workflowVersion": "buggy",
            "faults": [
                {
                    "type": "AFTER_SIDE_EFFECT_TIMEOUT",
                    "target": "ChargePayment",
                    "attempt": 1,
                }
            ],
        },
    }

    # Attempt 1 commits a charge, then fails.
    with pytest.raises(RuntimeError):
        charge_payment.lambda_handler(event.copy(), None)

    # Step Functions retry.
    retry_event = event.copy()
    retry_event["attempt"] = 2
    charge_payment.lambda_handler(retry_event, None)

    pk = "RUN#run_buggy_retry#ORDER#order_buggy_retry"
    charges = [
        item for (item_pk, item_sk), item in table.items.items()
        if item_pk == pk and item_sk.startswith("CHARGE#")
    ]

    payment_charged = [entry for entry in traces if entry["operation"] == "PaymentCharged"]

    assert len(charges) == 2
    assert len(payment_charged) == 2
    assert charges[0]["chargeId"] != charges[1]["chargeId"]