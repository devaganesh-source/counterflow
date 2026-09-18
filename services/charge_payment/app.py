import os
import time
import uuid
import boto3
from botocore.exceptions import ClientError

from shared.ledger import write_trace
from shared.fault_plan import should_inject_fault

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

    workflow_version = event.get(
        "workflowVersion", event.get("faultPlan", {}).get("workflowVersion", "buggy")
    )

    if workflow_version == "fixed":
        # Deterministic order-scoped payment identity.
        charge_id = f"charge_{order_id}"
        
        charge_item = {
            "PK": f"RUN#{run_id}#ORDER#{order_id}",
            "SK": f"CHARGE#{charge_id}",
            "runId": run_id,
            "orderId": order_id,
            "chargeId": charge_id,
            "amount": amount,
            "status": "CHARGED",
            "expiresAt": int(time.time()) + 86400,
        }
        
        try:
            table.put_item(
                Item=charge_item,
                ConditionExpression=("attribute_not_exists(PK) AND attribute_not_exists(SK)"),
            )
            
            # This invocation actually created the side effect.
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
            
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
                
            # The retry found the payment already committed.
            # Do NOT record another PaymentCharged event.
            write_trace(
                run_id=run_id,
                component="ChargePayment",
                operation="PaymentReused",
                order_id=order_id,
                event_id=event_id,
                attempt=attempt,
                phase="ATTEMPT_SUCCEEDED",
                outcome="SUCCESS",
                evidence={
                    "chargeId": charge_id,
                    "idempotentReplay": True,
                },
            )
            
    else:
        # Existing intentionally buggy implementation.
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

    # Inject deliberate fault after the side effect is committed
    if should_inject_fault(
        event,
        fault_type="AFTER_SIDE_EFFECT_TIMEOUT",
        target="ChargePayment",
        attempt=attempt,
    ):
        write_trace(
            run_id=run_id,
            component="ChargePayment",
            operation="InjectedFailure",
            order_id=order_id,
            event_id=event_id,
            attempt=attempt,
            phase="ATTEMPT_FAILED",
            outcome="FAILURE",
            evidence={
                "faultType": "AFTER_SIDE_EFFECT_TIMEOUT",
                "chargeId": charge_id,
            },
        )
        raise RuntimeError("Injected AFTER_SIDE_EFFECT_TIMEOUT after payment side effect")

    event["chargeId"] = charge_id
    
    # Prevent 'attempt' counter from propagating to ConfirmOrder
    event.pop("attempt", None)

    return event