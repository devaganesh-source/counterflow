import os

import boto3
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")


def lambda_handler(event, context):
    table = dynamodb.Table(os.environ["TABLE_NAME"])

    run_id = event["runId"]
    order_id = event["orderId"]

    pk = f"RUN#{run_id}#ORDER#{order_id}"

    response = table.query(
        KeyConditionExpression=Key("PK").eq(pk)
    )

    items = response.get("Items", [])

    order_item = next(
        (
            item
            for item in items
            if item.get("SK") == "ORDER"
        ),
        None,
    )

    charge_items = [
        item
        for item in items
        if item.get("SK", "").startswith("CHARGE#")
    ]

    expected_amount = int(
        (order_item or {}).get("amount", 0)
    )

    actual_charge_count = len(charge_items)

    actual_charged = sum(
        int(item.get("amount", 0))
        for item in charge_items
    )

    overcharge = max(
        actual_charged - expected_amount,
        0,
    )

    charge_ids = [
        item.get("chargeId")
        for item in charge_items
        if item.get("chargeId")
    ]

    invariant_passed = (
        actual_charge_count <= 1
    )

    return {
        "name": "ChargeAtMostOnce",
        "status": (
            "PASSED"
            if invariant_passed
            else "FAILED"
        ),
        "expectedChargeCount": 1,
        "actualChargeCount": actual_charge_count,
        "expectedAmount": expected_amount,
        "actualCharged": actual_charged,
        "overcharge": overcharge,
        "chargeIds": charge_ids,
        "runId": run_id,
        "orderId": order_id,
    }