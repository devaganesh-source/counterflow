import pytest

from services.charge_payment import app as charge_payment


class FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, Item):
        key = (Item["PK"], Item["SK"])
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