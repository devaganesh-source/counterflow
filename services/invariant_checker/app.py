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


def build_trace_analysis(trace, invariant_result):
    first_failing_sequence = invariant_result.get("firstFailingSequence")
    
    if first_failing_sequence is None:
        return {
            "firstFailingSequence": None,
            "firstFailingOperation": None,
            "firstFailingComponent": None,
            "reason": None,
        }

    failing_entry = next(
        (entry for entry in trace if int(entry["sequence"]) == first_failing_sequence), None
    )

    return {
        "firstFailingSequence": first_failing_sequence,
        "firstFailingOperation": (failing_entry.get("operation") if failing_entry else None),
        "firstFailingComponent": (failing_entry.get("component") if failing_entry else None),
        "reason": "ChargeAtMostOnce violated",
    }


def lambda_handler(event, context):
    table = dynamodb.Table(os.environ["TABLE_NAME"])

    run_id = event["runId"]
    order_id = event["orderId"]

    trace = get_trace(table, run_id)

    result = evaluate_charge_at_most_once(trace, order_id)
    trace_analysis = build_trace_analysis(trace, result)

    # Preserve workflow information for later API/UI use
    event["invariantResult"] = result
    event["traceAnalysis"] = trace_analysis

    return event