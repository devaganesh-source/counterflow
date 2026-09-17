import os

os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
os.environ["TABLE_NAME"] = "CounterFlowTest"

from services.create_order import app as create_order
from services.reserve_inventory import app as reserve_inventory
from services.charge_payment import app as charge_payment
from services.confirm_order import app as confirm_order


class FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, Item):
        key = (Item["PK"], Item["SK"])
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


def test_healthy_checkout():
    table = FakeTable()
    fake_dynamodb = FakeDynamoDB(table)

    # Replace AWS DynamoDB with our in-memory fake
    create_order.dynamodb = fake_dynamodb
    reserve_inventory.dynamodb = fake_dynamodb
    charge_payment.dynamodb = fake_dynamodb
    confirm_order.dynamodb = fake_dynamodb

    trace = []

    def fake_write_trace(**kwargs):
        trace.append(kwargs)
        return kwargs

    # Replace ledger writes for this local business-flow test
    create_order.write_trace = fake_write_trace
    reserve_inventory.write_trace = fake_write_trace
    charge_payment.write_trace = fake_write_trace
    confirm_order.write_trace = fake_write_trace

    event = {
        "runId": "run_test_001",
        "orderId": "order_test_001",
        "eventId": "event_test_001",
        "attempt": 1,
        "sku": "demo-product",
    }

    event = create_order.lambda_handler(event, None)
    event = reserve_inventory.lambda_handler(event, None)
    event = charge_payment.lambda_handler(event, None)
    event = confirm_order.lambda_handler(event, None)

    pk = "RUN#run_test_001#ORDER#order_test_001"

    order = table.items[(pk, "ORDER")]

    charges = [
        item
        for (item_pk, item_sk), item in table.items.items()
        if item_pk == pk and item_sk.startswith("CHARGE#")
    ]

    reservations = [
        item
        for (item_pk, item_sk), item in table.items.items()
        if item_pk == pk and item_sk.startswith("RESERVATION#")
    ]

    assert order["status"] == "CONFIRMED"

    assert len(charges) == 1
    assert charges[0]["amount"] == 999

    assert len(reservations) == 1

    assert event["status"] == "CONFIRMED"

    operations = [entry["operation"] for entry in trace]

    assert "OrderCreated" in operations
    assert "InventoryReserved" in operations
    assert "PaymentCharged" in operations
    assert "OrderConfirmed" in operations