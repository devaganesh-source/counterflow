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

    order_confirmed = False
    confirmation_sequence = None
    confirmation_operation = None
    confirmation_component = None

    first_failing_sequence = None
    first_failing_operation = None
    first_failing_component = None

    first_charge_sequence = None
    first_charge_operation = None
    first_charge_component = None

    # Determine the expected order amount from the trace.
    for entry in trace:
        if (
            entry.get("operation") == "OrderCreated"
            and entry.get("orderId") == order_id
            and entry.get("phase") == "SIDE_EFFECT_COMMITTED"
        ):
            evidence = entry.get("evidence", {})

            if evidence.get("amount") is not None:
                expected_amount = int(evidence["amount"])

            break

    # Determine if the order was confirmed.
    for entry in trace:
        if (
            entry.get("operation") == "OrderConfirmed"
            and entry.get("orderId") == order_id
        ):
            order_confirmed = True
            confirmation_sequence = int(entry["sequence"])
            confirmation_operation = entry.get("operation")
            confirmation_component = entry.get("component")
            break

    # Deterministically evaluate the charges
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
                charged_amounts.append(int(amount))

            # Track the very first charge sequence
            if charge_count == 1:
                first_charge_sequence = int(entry["sequence"])
                first_charge_operation = entry.get("operation")
                first_charge_component = entry.get("component")

            # Track if multiple charges occur
            if charge_count > 1 and first_failing_sequence is None:
                first_failing_sequence = int(entry["sequence"])
                first_failing_operation = entry.get("operation")
                first_failing_component = entry.get("component")

    # Fallback only if an OrderCreated amount
    # was not present in the trace.
    if expected_amount is None:
        expected_amount = charged_amounts[0] if charged_amounts else 0

    actual_charged = sum(charged_amounts)
    overcharge = max(actual_charged - expected_amount, 0)

    # Core Logic for Fix 2: Dynamic Expected Rule
    reason = None

    if order_confirmed:
        expected_rule = "= 1"
        passed = charge_count == 1
        if not passed:
            if charge_count > 1:
                reason = "ChargeAtMostOnce violated"
            elif charge_count == 0:
                reason = "Confirmed order violated payment postcondition: exactly one committed payment charge is required"
                first_failing_sequence = confirmation_sequence
                first_failing_operation = confirmation_operation
                first_failing_component = confirmation_component
    else:
        expected_rule = "= 0"
        passed = charge_count == 0
        if not passed:
            reason = "Payment charged but the order was never confirmed"
            first_failing_sequence = first_charge_sequence
            first_failing_operation = first_charge_operation
            first_failing_component = first_charge_component

    return {
        # Deterministic invariant fields from main + Fix 2 additions
        "invariantId": "charge-at-most-once",
        "name": "ChargeAtMostOnce",
        "status": "PASSED" if passed else "FAILED",
        "expected": expected_rule,
        "actual": charge_count,
        "orderId": order_id,
        "orderConfirmed": order_confirmed,
        "firstFailingSequence": first_failing_sequence,
        # Trace-analysis metadata for the UI
        "firstFailingOperation": first_failing_operation,
        "firstFailingComponent": first_failing_component,
        "reason": reason,
        # Business-impact fields for the UI
        "expectedChargeCount": 1 if order_confirmed else 0,
        "actualChargeCount": charge_count,
        "expectedAmount": expected_amount if order_confirmed else 0,
        "actualCharged": actual_charged,
        "overcharge": overcharge,
        "chargeIds": charge_ids,
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
        (
            entry
            for entry in trace
            if int(entry["sequence"]) == first_failing_sequence
        ),
        None,
    )

    return {
        "firstFailingSequence": first_failing_sequence,
        "firstFailingOperation": (
            failing_entry.get("operation") if failing_entry else None
        ),
        "firstFailingComponent": (
            failing_entry.get("component") if failing_entry else None
        ),
        "reason": invariant_result.get("reason", "Invariant violated"),
    }


def lambda_handler(event, context):
    table = dynamodb.Table(os.environ["TABLE_NAME"])

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

    trace_analysis = build_trace_analysis(trace, result)
    result["runId"] = run_id

    # Preserve the contract introduced on main.
    event["invariantResult"] = result
    event["traceAnalysis"] = trace_analysis

    return event