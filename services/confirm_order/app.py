import os
import boto3

from shared.ledger import write_trace

dynamodb = boto3.resource("dynamodb")


def lambda_handler(event, context):
    table = dynamodb.Table(os.environ["TABLE_NAME"])

    run_id = event["runId"]
    order_id = event["orderId"]
    event_id = event["eventId"]

    attempt = event.get("attempt", 1)

    write_trace(
        run_id=run_id,
        component="ConfirmOrder",
        operation="ConfirmOrder",
        order_id=order_id,
        event_id=event_id,
        attempt=attempt,
        phase="ATTEMPT_STARTED",
        outcome="SUCCESS",
    )

    table.update_item(
        Key={
            "PK": f"RUN#{run_id}#ORDER#{order_id}",
            "SK": "ORDER",
        },
        UpdateExpression="SET #status = :status",
        ExpressionAttributeNames={
            "#status": "status",
        },
        ExpressionAttributeValues={
            ":status": "CONFIRMED",
        },
    )

    write_trace(
        run_id=run_id,
        component="ConfirmOrder",
        operation="OrderConfirmed",
        order_id=order_id,
        event_id=event_id,
        attempt=attempt,
        phase="SIDE_EFFECT_COMMITTED",
        outcome="SUCCESS",
        evidence={
            "status": "CONFIRMED",
        },
    )

    event["status"] = "CONFIRMED"

    return event