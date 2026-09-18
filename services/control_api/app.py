import json
import os
import uuid
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError


dynamodb = boto3.resource("dynamodb")
stepfunctions = boto3.client("stepfunctions")

TABLE_NAME = os.environ["TABLE_NAME"]
STATE_MACHINE_ARN = os.environ["STATE_MACHINE_ARN"]


def json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)

    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def api_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=json_default),
    }


def get_execution_arn(run_id):
    # Example:
    # arn:aws:states:us-east-1:123456789:stateMachine:CheckoutStateMachine-xxx

    prefix, state_machine_name = STATE_MACHINE_ARN.rsplit(
        ":stateMachine:",
        1,
    )

    return f"{prefix}:execution:{state_machine_name}:{run_id}"


def start_run(event):
    raw_body = event.get("body") or "{}"

    if isinstance(raw_body, str):
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            return api_response(
                400,
                {"message": "Request body must be valid JSON"},
            )
    else:
        body = raw_body

    run_id = str(uuid.uuid4())
    order_id = str(uuid.uuid4())
    event_id = str(uuid.uuid4())

    # Preserve fields coming from the UI such as:
    # workflowVersion, faultPlanId, faultPlan, etc.
    workflow_input = dict(body)

    workflow_input["runId"] = run_id
    workflow_input["orderId"] = order_id
    workflow_input["eventId"] = event_id

    workflow_input.setdefault("sku", "SKU-001")

    fault_plan_id = body.get("faultPlanId")

    if fault_plan_id == "payment-ack-lost-v1":
        workflow_input["faultPlan"] = {
            "faults": [
                {
                    "type": "AFTER_SIDE_EFFECT_TIMEOUT",
                    "target": "ChargePayment",
                    "attempt": 1,
                }
            ]
        }
    else:
        workflow_input.setdefault("faultPlan", {})

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
            "executionArn": execution["executionArn"],
            "status": "RUNNING",
            "statusUrl": f"/runs/{run_id}",
        },
    )


def get_run(event):
    path_parameters = event.get("pathParameters") or {}
    run_id = path_parameters.get("runId")

    if not run_id:
        return api_response(
            400,
            {"message": "runId is required"},
        )

    execution_arn = get_execution_arn(run_id)

    try:
        execution = stepfunctions.describe_execution(
            executionArn=execution_arn
        )

    except ClientError as error:
        error_code = error.response["Error"]["Code"]

        if error_code == "ExecutionDoesNotExist":
            return api_response(
                404,
                {
                    "message": "Run not found",
                    "runId": run_id,
                },
            )

        raise

    table = dynamodb.Table(TABLE_NAME)

    trace_result = table.query(
        KeyConditionExpression=(
            Key("PK").eq(f"RUN#{run_id}")
            & Key("SK").begins_with("TRACE#")
        )
    )

    traces = trace_result.get("Items", [])

    result = {
        "runId": run_id,
        "status": execution["status"],
        "statusUrl": f"/runs/{run_id}",
        "startDate": execution["startDate"].isoformat(),
        "traces": traces,
    }

    if execution.get("stopDate"):
        result["stopDate"] = execution["stopDate"].isoformat()

    if execution.get("output"):
        try:
            result["output"] = json.loads(execution["output"])
        except json.JSONDecodeError:
            result["output"] = execution["output"]

    return api_response(200, result)


def lambda_handler(event, context):
    try:
        method = event.get("httpMethod", "")

        if method == "POST":
            return start_run(event)

        if method == "GET":
            return get_run(event)

        return api_response(
            405,
            {
                "message": f"Method {method} not allowed"
            },
        )

    except Exception as error:
        print(f"ERROR: {str(error)}")

        return api_response(
            500,
            {
                "message": "Internal server error",
                "error": str(error),
            },
        )