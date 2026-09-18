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
    charge_ids = []
    charged_amounts = []

    expected_amount = None

    first_failing_sequence = None
    first_failing_operation = None
    first_failing_component = None

    # Determine the expected order amount from the trace.
    for entry in trace:
        if (
            entry.get("operation") == "OrderCreated"
            and entry.get("orderId") == order_id
            and entry.get("phase") == "SIDE_EFFECT_COMMITTED"
        ):
            evidence = entry.get("evidence", {})

            if evidence.get("amount") is not None:
                expected_amount = int(
                    evidence["amount"]
                )

            break

    # Deterministically evaluate ChargeAtMostOnce
    # from committed payment side effects.
    for entry in trace:
        if (
            entry.get("operation") == "PaymentCharged"
            and entry.get("orderId") == order_id
            and entry.get("phase") == "SIDE_EFFECT_COMMITTED"
        ):
            charge_count += 1

            evidence = entry.get("evidence", {})

            charge_id = evidence.get("chargeId")
            if charge_id:
                charge_ids.append(charge_id)

            amount = evidence.get("amount")
            if amount is not None:
                charged_amounts.append(
                    int(amount)
                )

            if (
                charge_count > 1
                and first_failing_sequence is None
            ):
                first_failing_sequence = int(
                    entry["sequence"]
                )
                first_failing_operation = (
                    entry.get("operation")
                )
                first_failing_component = (
                    entry.get("component")
                )

    # Fallback only if an OrderCreated amount
    # was not present in the trace.
    if expected_amount is None:
        expected_amount = (
            charged_amounts[0]
            if charged_amounts
            else 0
        )

    actual_charged = sum(
        charged_amounts
    )

    overcharge = max(
        actual_charged - expected_amount,
        0,
    )

    passed = charge_count <= 1

    reason = None

    if not passed:
        reason = (
            "ChargeAtMostOnce violated: "
            "more than one committed payment "
            "charge exists for the order"
        )

    return {
        # Deterministic invariant fields from main
        "invariantId": "charge-at-most-once",
        "name": "ChargeAtMostOnce",
        "status": (
            "PASSED"
            if passed
            else "FAILED"
        ),
        "expected": "<= 1",
        "actual": charge_count,
        "orderId": order_id,
        "firstFailingSequence":
            first_failing_sequence,

        # Trace-analysis metadata for the UI
        "firstFailingOperation":
            first_failing_operation,
        "firstFailingComponent":
            first_failing_component,
        "reason": reason,

        # Business-impact fields for the UI
        "expectedChargeCount": 1,
        "actualChargeCount":
            charge_count,
        "expectedAmount":
            expected_amount,
        "actualCharged":
            actual_charged,
        "overcharge":
            overcharge,
        "chargeIds":
            charge_ids,
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
    table = dynamodb.Table(
        os.environ["TABLE_NAME"]
    )

    run_id = event["runId"]
    order_id = event["orderId"]

    trace = get_trace(
        table,
        run_id,
    )

    result = evaluate_charge_at_most_once(
        trace,
        order_id,
    )

    # Indentation fixed here (4 spaces)
    trace_analysis = build_trace_analysis(trace, result)
    result["runId"] = run_id

    # Preserve the contract introduced on main.
    event["invariantResult"] = result
    event["traceAnalysis"] = trace_analysis

    return event