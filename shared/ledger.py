import os
import time
import boto3
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")


def get_table():
    table_name = os.environ["TABLE_NAME"]
    return dynamodb.Table(table_name)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_next_sequence(run_id: str) -> int:
    table = get_table()

    response = table.update_item(
        Key={
            "PK": f"RUN#{run_id}",
            "SK": "SEQUENCE"
        },
        UpdateExpression="ADD #value :inc",
        ExpressionAttributeNames={
            "#value": "value"
        },
        ExpressionAttributeValues={
            ":inc": 1
        },
        ReturnValues="UPDATED_NEW"
    )

    return int(response["Attributes"]["value"])


def write_trace(
    *,
    run_id: str,
    component: str,
    operation: str,
    order_id: str,
    event_id: str,
    attempt: int,
    phase: str,
    outcome: str,
    evidence=None,
):
    table = get_table()

    sequence = get_next_sequence(run_id)
    timestamp = now_iso()

    item = {
        "PK": f"RUN#{run_id}",
        "SK": f"TRACE#{sequence:08d}",
        "runId": run_id,
        "sequence": sequence,
        "timestamp": timestamp,
        "component": component,
        "operation": operation,
        "orderId": order_id,
        "eventId": event_id,
        "attempt": attempt,
        "phase": phase,
        "outcome": outcome,
        "evidence": evidence or {},
        "expiresAt": int(time.time()) + 86400,
    }

    table.put_item(Item=item)

    return item