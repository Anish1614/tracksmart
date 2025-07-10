import os
import json
import logging
import boto3
from boto3.dynamodb.conditions import Attr
from typing import Any, Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# DynamoDB table
TABLE_NAME = os.getenv("TABLE_NAME")
if not TABLE_NAME:
    raise RuntimeError("TABLE_NAME environment variable is missing")
dynamo = boto3.resource("dynamodb")
table = dynamo.Table(TABLE_NAME)

def discover(request_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fetches BPP providers from DynamoDB and returns a BECKN-style discovery response.
    """
    try:
        # Scan for all provider profiles
        response = table.scan(
            FilterExpression=Attr("pk").begins_with("provider#") & Attr("sk").eq("profile")
        )

        providers = []
        for item in response.get("Items", []):
            providers.append({
                "id": item.get("pk", "").replace("provider#", ""),
                "name": item.get("name", "Unknown"),
                "bpp_uri": item.get("bpp_uri", "")
            })

        return {
            "context": request_payload.get("context", {}),
            "message": { "providers": providers }
        }

    except Exception as e:
        logger.exception("Failed during discovery")
        return {
            "context": request_payload.get("context", {}),
            "error": {
                "code": "DISCOVERY_FAILED",
                "message": str(e)
            }
        }
