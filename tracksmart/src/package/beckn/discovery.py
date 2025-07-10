# src/beckn/discovery.py

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

# Full endpoint URI for discovery
DISCOVER_URI = f"{BECKN_GATEWAY_URL}/discover"

def discover(request_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Forwards the BECKN discovery request to the central gateway.
    :param request_payload: The full BECKN JSON body from the caller.
    :return: The JSON response from the gateway.
    """
    logger.info(f"Forwarding discovery payload to {DISCOVER_URI}")
    try:
        resp = requests.post(
            DISCOVER_URI,
            headers={"Content-Type": "application/json"},
            data=json.dumps(request_payload),
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.error(f"Error calling discovery endpoint: {e}")
        # Return a BECKN‑style error response
        return {
            "context": request_payload.get("context", {}),
            "error": {
                "code": "DISCOVERY_FAILED",
                "message": str(e)
            }
        }
