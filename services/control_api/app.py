import hashlib
import json
import os
import uuid
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError


dynamodb = boto3.resource("dynamodb")
stepfunctions = boto3.client("stepfunctions")
lambda_client = boto3.client("lambda")

TABLE_NAME = os.environ["TABLE_NAME"]
STATE_MACHINE_ARN = os.environ["STATE_MACHINE_ARN"]
INVARIANT_CHECKER_FUNCTION = os.environ["INVARIANT_CHECKER_FUNCTION"]


def json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)

    raise TypeError(
        f"Object of type {type(value).__name__} "
        "is not JSON serializable"
    )


def api_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(
            body,
            default=json_default,
        ),
    }


def get_execution_arn(run_id):
    prefix, state_machine_name = (
        STATE_MACHINE_ARN.rsplit(
            ":stateMachine:",
            1,
        )
    )

    return (
        f"{prefix}:execution:"
        f"{state_machine_name}:{run_id}"
    )


def start_run(event):
    raw_body = event.get("body") or "{}"

    if isinstance(raw_body, str):
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            return api_response(
                400,
                {
                    "message":
                        "Request body must be valid JSON"
                },
            )
    else:
        body = raw_body

    run_id = str(uuid.uuid4())
    order_id = str(uuid.uuid4())
    event_id = str(uuid.uuid4())

    workflow_input = dict(body)

    workflow_input["runId"] = run_id
    workflow_input["orderId"] = order_id
    workflow_input["eventId"] = event_id

    workflow_input.setdefault(
        "sku",
        "SKU-001",
    )

    # Translate the UI fault profile into
    # the fault plan understood by ChargePayment.
    fault_plan_id = body.get("faultPlanId")

    if fault_plan_id == "payment-ack-lost-v1":
        workflow_input["faultPlan"] = {
            "faults": [
                {
                    "type":
                        "AFTER_SIDE_EFFECT_TIMEOUT",
                    "target":
                        "ChargePayment",
                    "attempt": 1,
                }
            ]
        }
    else:
        # Allows custom fault plans for testing,
        # including Catch-path testing.
        workflow_input.setdefault(
            "faultPlan",
            {},
        )

    execution = stepfunctions.start_execution(
        stateMachineArn=STATE_MACHINE_ARN,
        name=run_id,
        input=json.dumps(workflow_input),
    )

    return api_response(
        202,
        {
            "runId": run_id,
            "orderId": order_id,
            "eventId": event_id,
            "executionArn":
                execution["executionArn"],
            "status": "RUNNING",
            "statusUrl":
                f"/runs/{run_id}",
        },
    )


def run_invariant_checker(
    run_id,
    order_id,
):
    checker_response = lambda_client.invoke(
        FunctionName=
            INVARIANT_CHECKER_FUNCTION,
        InvocationType="RequestResponse",
        Payload=json.dumps(
            {
                "runId": run_id,
                "orderId": order_id,
            }
        ).encode("utf-8"),
    )

    payload = json.loads(
        checker_response["Payload"]
        .read()
        .decode("utf-8")
    )

    if checker_response.get("FunctionError"):
        raise RuntimeError(
            f"Invariant checker failed: {payload}"
        )

    # Main's deterministic invariant checker
    # preserves the result under invariantResult.
    # The fallback keeps compatibility with the
    # older direct-result response.
    return payload.get(
        "invariantResult",
        payload,
    )


def build_fault_plan_info(execution_input):
    fault_plan = execution_input.get(
        "faultPlan",
        {},
    )

    faults = fault_plan.get(
        "faults",
        [],
    )

    if not faults:
        return None

    fault = faults[0]

    # Canonical JSON guarantees that the same
    # fault plan always produces the same hash.
    canonical_plan = json.dumps(
        fault_plan,
        sort_keys=True,
        separators=(",", ":"),
    )

    plan_hash = hashlib.sha256(
        canonical_plan.encode("utf-8")
    ).hexdigest()

    fault_plan_id = execution_input.get(
        "faultPlanId",
        "unknown",
    )

    if (
        fault_plan_id
        == "payment-ack-lost-v1"
    ):
        name = "Payment acknowledgement lost"
    else:
        name = fault_plan_id

    return {
        "name": name,
        "planId": fault_plan_id,
        "type": fault.get("type"),
        "target": fault.get("target"),
        "attempt": fault.get("attempt"),
        "hash": plan_hash,
    }


def build_trace_analysis(invariant):
    if not invariant:
        return None

    first_failing_sequence = (
        invariant.get(
            "firstFailingSequence"
        )
    )

    if first_failing_sequence is None:
        return None

    return {
        "firstFailingSequence":
            first_failing_sequence,
        "firstFailingOperation":
            invariant.get(
                "firstFailingOperation"
            ),
        "firstFailingComponent":
            invariant.get(
                "firstFailingComponent"
            ),
        "reason":
            invariant.get("reason"),
    }


def get_run(event):
    path_parameters = (
        event.get("pathParameters") or {}
    )

    run_id = path_parameters.get("runId")

    if not run_id:
        return api_response(
            400,
            {
                "message":
                    "runId is required"
            },
        )

    execution_arn = get_execution_arn(
        run_id
    )

    try:
        execution = (
            stepfunctions.describe_execution(
                executionArn=execution_arn
            )
        )

    except ClientError as error:
        error_code = (
            error.response["Error"]["Code"]
        )

        if (
            error_code
            == "ExecutionDoesNotExist"
        ):
            return api_response(
                404,
                {
                    "message":
                        "Run not found",
                    "runId": run_id,
                },
            )

        raise

    table = dynamodb.Table(TABLE_NAME)

    trace_result = table.query(
        KeyConditionExpression=(
            Key("PK").eq(
                f"RUN#{run_id}"
            )
            & Key("SK").begins_with(
                "TRACE#"
            )
        )
    )

    traces = trace_result.get(
        "Items",
        [],
    )

    # Read the original workflow input once.
    # This contains the exact fault plan used.
    execution_input = json.loads(
        execution.get("input")
        or "{}"
    )

    fault_plan_info = (
        build_fault_plan_info(
            execution_input
        )
    )

    invariant = None
    trace_analysis = None

    terminal_statuses = {
        "SUCCEEDED",
        "FAILED",
        "TIMED_OUT",
        "ABORTED",
    }

    if execution["status"] in terminal_statuses:
        order_id = execution_input.get(
            "orderId"
        )

        if order_id:
            invariant = (
                run_invariant_checker(
                    run_id,
                    order_id,
                )
            )

            # The backend invariant checker decides
            # the first failing side effect.
            # The frontend only visualizes this result.
            trace_analysis = (
                build_trace_analysis(
                    invariant
                )
            )

    result = {
        "runId": run_id,
        "status": execution["status"],
        "statusUrl":
            f"/runs/{run_id}",
        "startDate":
            execution["startDate"]
            .isoformat(),
        "traces": traces,
        "invariant": invariant,
        "faultPlan": fault_plan_info,
        "traceAnalysis": trace_analysis,
    }

    if execution.get("stopDate"):
        result["stopDate"] = (
            execution["stopDate"]
            .isoformat()
        )

    if execution.get("output"):
        try:
            result["output"] = (
                json.loads(
                    execution["output"]
                )
            )
        except json.JSONDecodeError:
            result["output"] = (
                execution["output"]
            )

    return api_response(
        200,
        result,
    )


def lambda_handler(event, context):
    try:
        method = event.get(
            "httpMethod",
            "",
        )

        if method == "POST":
            return start_run(event)

        if method == "GET":
            return get_run(event)

        return api_response(
            405,
            {
                "message":
                    f"Method {method} not allowed"
            },
        )

    except Exception as error:
        print(
            f"ERROR: {str(error)}"
        )

        return api_response(
            500,
            {
                "message":
                    "Internal server error",
                "error":
                    str(error),
            },
        )