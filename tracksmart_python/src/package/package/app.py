# src/app.py

import os
import json
import logging

from beckn.discovery import discover
from beckn.tracking import track

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def build_response(body: dict, status_code: int = 200) -> dict:
    """
    Formats a Lambda proxy integration response for API Gateway.
    """
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps(body)
    }

def lambda_handler(event, context):
    """
    Entry point for Lambda. Routes /discover and /track calls.
    """
    logger.info(f"Received event: {json.dumps(event)}")

    # Extract HTTP method and path
    http_method = event.get("httpMethod")
    path = event.get("path", "")

    # Only POST is supported
    if http_method != "POST":
        return build_response({
            "error": {"code": "METHOD_NOT_ALLOWED", "message": f"{http_method} not supported"}
        }, status_code=405)

    # Parse incoming JSON payload
    try:
        payload = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return build_response({
            "error": {"code": "INVALID_JSON", "message": "Request body is not valid JSON"}
        }, status_code=400)

    # Route based on path
    if path.endswith("/discover"):
        response_body = discover(payload)
        return build_response(response_body)

    elif path.endswith("/track"):
        response_body = track(payload)
        return build_response(response_body)

    else:
        logger.warning(f"Unknown endpoint: {path}")
        return build_response({
            "error": {"code": "INVALID_ENDPOINT", "message": f"Unknown path {path}"}
        }, status_code=404)
