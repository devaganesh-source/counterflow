import json
import os
import uuid
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")
stepfunctions = boto3.client("stepfunctions")

TABLE_NAME = os.environ["TABLE_NAME"]
STATE_MACHINE_ARN = os.environ["STATE_MACHINE_ARN"]


def json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=json_default),
    }


def execution_arn_for(run_id):
    parts = STATE_MACHINE_ARN.split(":")
    machine_name = parts[-1]

    return (
        f"arn:{parts[1]}:states:{parts[3]}:{parts[4]}"
        f":execution:{machine_name}:{run_id}"
    )


def start_run(event):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})

    run_id = str(uuid.uuid4())
    order_id = str(uuid.uuid4())
    event_id = str(uuid.uuid4())

    workflow_input = dict(body)

    workflow_input["runId"] = run_id
    workflow_input["orderId"] = order_id
    workflow_input["eventId"] = event_id

    workflow_input.setdefault("sku", "SKU-001")
    workflow_input.setdefault("faultPlan", {})

    execution = stepfunctions.start_execution(
        stateMachineArn=STATE_MACHINE_ARN,
        name=run_id,
        input=json.dumps(workflow_input),
    )

    return response(
        202,
        {
            "runId": run_id,
            "orderId": order_id,
            "eventId": event_id,
            "executionArn": execution["executionArn"],
            "status": "RUNNING",
        },
    )


def get_run(event):
    path_parameters = event.get("pathParameters") or {}
    run_id = path_parameters.get("runId")

    if not run_id:
        return response(400, {"error": "runId is required"})

    table = dynamodb.Table(TABLE_NAME)

    trace_result = table.query(
        KeyConditionExpression=
            Key("PK").eq(f"RUN#{run_id}") &
            Key("SK").begins_with("TRACE#")
    )

    traces = trace_result.get("Items", [])

    execution_status = "UNKNOWN"

    try:
        execution = stepfunctions.describe_execution(
            executionArn=execution_arn_for(run_id)
        )
        execution_status = execution["status"]
    except stepfunctions.exceptions.ExecutionDoesNotExist:
        execution_status = "NOT_FOUND"

    return response(
        200,
        {
            "runId": run_id,
            "status": execution_status,
            "traces": traces,
        },
    )


def lambda_handler(event, context):
    method = event.get("httpMethod")

    if method == "POST":
        return start_run(event)

    if method == "GET":
        return get_run(event)

    return response(405, {"error": "Method not allowed"})