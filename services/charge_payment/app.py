import os
import time
import uuid
import boto3

from shared.ledger import write_trace

dynamodb = boto3.resource("dynamodb")


def lambda_handler(event, context):
    table = dynamodb.Table(os.environ["TABLE_NAME"])

    run_id = event["runId"]
    order_id = event["orderId"]
    event_id = event["eventId"]

    attempt = event.get("attempt", 1)
    amount = event.get("amount", 999)

    # Record invocation attempt
    write_trace(
        run_id=run_id,
        component="ChargePayment",
        operation="ChargePayment",
        order_id=order_id,
        event_id=event_id,
        attempt=attempt,
        phase="ATTEMPT_STARTED",
        outcome="SUCCESS",
    )

    # For now this is intentionally the simple baseline implementation.
    # Later we will modify this into the buggy retry implementation.
    charge_id = f"charge_{uuid.uuid4().hex[:10]}"

    table.put_item(
        Item={
            "PK": f"RUN#{run_id}#ORDER#{order_id}",
            "SK": f"CHARGE#{charge_id}",
            "runId": run_id,
            "orderId": order_id,
            "chargeId": charge_id,
            "amount": amount,
            "status": "CHARGED",
            "expiresAt": int(time.time()) + 86400,
        }
    )

    # This is the important business side effect.
    write_trace(
        run_id=run_id,
        component="ChargePayment",
        operation="PaymentCharged",
        order_id=order_id,
        event_id=event_id,
        attempt=attempt,
        phase="SIDE_EFFECT_COMMITTED",
        outcome="SUCCESS",
        evidence={
            "chargeId": charge_id,
            "amount": amount,
        },
    )

    event["chargeId"] = charge_id

    return event