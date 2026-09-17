import os
import time
import boto3

from shared.ledger import write_trace

dynamodb = boto3.resource("dynamodb")


def lambda_handler(event, context):
    table = dynamodb.Table(os.environ["TABLE_NAME"])

    run_id = event["runId"]
    order_id = event["orderId"]
    event_id = event["eventId"]

    attempt = event.get("attempt", 1)
    sku = event.get("sku", "demo-product")

    write_trace(
        run_id=run_id,
        component="ReserveInventory",
        operation="ReserveInventory",
        order_id=order_id,
        event_id=event_id,
        attempt=attempt,
        phase="ATTEMPT_STARTED",
        outcome="SUCCESS",
    )

    table.put_item(
        Item={
            "PK": f"RUN#{run_id}#ORDER#{order_id}",
            "SK": f"RESERVATION#{sku}",
            "runId": run_id,
            "orderId": order_id,
            "sku": sku,
            "status": "RESERVED",
            "expiresAt": int(time.time()) + 86400,
        }
    )

    write_trace(
        run_id=run_id,
        component="ReserveInventory",
        operation="InventoryReserved",
        order_id=order_id,
        event_id=event_id,
        attempt=attempt,
        phase="SIDE_EFFECT_COMMITTED",
        outcome="SUCCESS",
        evidence={
            "sku": sku
        },
    )

    event["sku"] = sku

    return event