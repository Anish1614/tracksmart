# src/beckn/tracking.py

import os
import json
import logging
import requests
import boto3
from boto3.dynamodb.conditions import Key, Attr
from typing import Any, Dict

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# DynamoDB init
TABLE_NAME = os.getenv("TABLE_NAME")
if not TABLE_NAME:
    raise RuntimeError("TABLE_NAME environment variable is missing")

dynamo = boto3.resource("dynamodb")
table = dynamo.Table(TABLE_NAME)

def track(request_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handles BECKN track request by:
    1. Reading bpp_id from the request
    2. Looking up the bpp_uri in DynamoDB
    3. Forwarding the request to the BPP and returning its response
    """
    context = request_payload.get("context", {})
    bpp_id = context.get("bpp_id")

    if not bpp_id:
        return {
            "context": context,
            "error": {
                "code": "INVALID_REQUEST",
                "message": "Missing 'bpp_id' in context"
            }
        }

    try:
        # Fetch BPP URI from DynamoDB
        pk = f"provider#{bpp_id}"
        sk = "profile"

        resp = table.get_item(Key={"pk": pk, "sk": sk})
        item = resp.get("Item")

        if not item or "bpp_uri" not in item:
            return {
                "context": context,
                "error": {
                    "code": "BPP_NOT_FOUND",
                    "message": f"No BPP found for id {bpp_id}"
                }
            }

        bpp_uri = item["bpp_uri"]
        logger.info(f"Forwarding track request to BPP URI: {bpp_uri}")

        # Send to BPP
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            bpp_uri,
            headers=headers,
            data=json.dumps(request_payload),
            timeout=10
        )
        response.raise_for_status()

        return response.json()

    except Exception as e:
        logger.exception("Tracking failed")
        return {
            "context": context,
            "error": {
                "code": "TRACKING_FAILED",
                "message": str(e)
            }
        }
