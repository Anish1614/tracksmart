# src/beckn/tracking.py

import os
import json
import logging
import requests
from typing import Any, Dict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Base Gateway URL (injected via Lambda environment: BECKN_GATEWAY_URL)
BECKN_GATEWAY_URL = os.getenv("BECKN_GATEWAY_URL")
if not BECKN_GATEWAY_URL:
    raise RuntimeError("Environment variable BECKN_GATEWAY_URL is not set")

# Full endpoint URI for tracking
TRACK_URI = f"{BECKN_GATEWAY_URL}/track"

def track(request_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Forwards the BECKN track request to the central gateway.
    :param request_payload: The full BECKN JSON body from the caller.
    :return: The JSON response from the gateway.
    """
    logger.info(f"Forwarding tracking payload to {TRACK_URI}")
    try:
        resp = requests.post(
            TRACK_URI,
            headers={"Content-Type": "application/json"},
            data=json.dumps(request_payload),
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.error(f"Error calling track endpoint: {e}")
        # Return a BECKN‑style error response
        return {
            "context": request_payload.get("context", {}),
            "error": {
                "code": "TRACKING_FAILED",
                "message": str(e)
            }
        }
