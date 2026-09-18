import json
import os
import uuid

import boto3
from botocore.exceptions import ClientError


stepfunctions = boto3.client("stepfunctions")

STATE_MACHINE_ARN = os.environ["STATE_MACHINE_ARN"]


def api_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def get_execution_arn(run_id):
    # Example state machine ARN:
    # arn:aws:states:us-east-1:123456789:stateMachine:CheckoutStateMachine-xxx

    prefix, state_machine_name = STATE_MACHINE_ARN.rsplit(":stateMachine:", 1)

    return f"{prefix}:execution:{state_machine_name}:{run_id}"


def start_run(event):
    raw_body = event.get("body") or "{}"

    if isinstance(raw_body, str):
        body = json.loads(raw_body)
    else:
        body = raw_body

    workflow_version = body.get("workflowVersion")
    fault_plan_id = body.get("faultPlanId")

    if workflow_version not in ["buggy", "fixed"]:
        return api_response(
            400,
            {
                "message": "workflowVersion must be 'buggy' or 'fixed'"
            },
        )

    if not fault_plan_id:
        return api_response(
            400,
            {
                "message": "faultPlanId is required"
            },
        )

    run_id = str(uuid.uuid4())

    workflow_input = {
        "runId": run_id,
        "orderId": run_id,
        "workflowVersion": workflow_version,
        "faultPlanId": fault_plan_id,
    }

    stepfunctions.start_execution(
        stateMachineArn=STATE_MACHINE_ARN,
        name=run_id,
        input=json.dumps(workflow_input),
    )

    return api_response(
        202,
        {
            "runId": run_id,
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
            {
                "message": "runId is required"
            },
        )

    execution_arn = get_execution_arn(run_id)

    try:
        execution = stepfunctions.describe_execution(
            executionArn=execution_arn
        )

        result = {
            "runId": run_id,
            "status": execution["status"],
            "statusUrl": f"/runs/{run_id}",
            "startDate": execution["startDate"].isoformat(),
        }

        if execution.get("stopDate"):
            result["stopDate"] = execution["stopDate"].isoformat()

        if execution.get("output"):
            try:
                result["output"] = json.loads(execution["output"])
            except json.JSONDecodeError:
                result["output"] = execution["output"]

        return api_response(200, result)

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

    except json.JSONDecodeError:
        return api_response(
            400,
            {
                "message": "Request body must be valid JSON"
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