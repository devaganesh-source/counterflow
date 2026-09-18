import os
import boto3

dynamodb = boto3.resource("dynamodb")


def get_trace(table, run_id):
    response = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :trace)",
        ExpressionAttributeValues={
            ":pk": f"RUN#{run_id}",
            ":trace": "TRACE#",
        },
    )

    return sorted(
        response.get("Items", []),
        key=lambda item: int(item["sequence"]),
    )


def evaluate_charge_at_most_once(trace, order_id):
    charge_count = 0
    first_failing_sequence = None

    for entry in trace:
        if (
            entry.get("operation") == "PaymentCharged"
            and entry.get("orderId") == order_id
            and entry.get("phase") == "SIDE_EFFECT_COMMITTED"
        ):
            charge_count += 1

            if charge_count > 1 and first_failing_sequence is None:
                first_failing_sequence = int(entry["sequence"])

    passed = charge_count <= 1

    return {
        "invariantId": "charge-at-most-once",
        "name": "ChargeAtMostOnce",
        "status": "PASSED" if passed else "FAILED",
        "expected": "<= 1",
        "actual": charge_count,
        "orderId": order_id,
        "firstFailingSequence": first_failing_sequence,
    }


def lambda_handler(event, context):
    table = dynamodb.Table(os.environ["TABLE_NAME"])

    run_id = event["runId"]
    order_id = event["orderId"]

    trace = get_trace(table, run_id)

    result = evaluate_charge_at_most_once(trace, order_id)

    # Preserve workflow information for later API/UI use
    event["invariantResult"] = result

    return event