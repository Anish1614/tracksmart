from utils.beckn_client import beckn_post

BECKN_GATEWAY_URL = 'https://sandbox.becknprotocol.io/discover'  # Example

def discover_logistics(search_criteria):
    payload = {
        "context": {
            "domain": "beckn.org/logistics",
            "action": "search",
            "country": "IND",
            "city": "std:080",
            "core_version": "0.9.3",
            "bap_id": "your-bap-id",
            "bap_uri": "http://localhost:5001/beckn/bap/search"
        },
        "message": {
            "intent": {
                "fulfillment": {
                    "start": {"location": {"gps": search_criteria['pickup']}},
                    "end": {"location": {"gps": search_criteria['drop']}}
                }
            }
        }
    }
    return beckn_post(BECKN_GATEWAY_URL, payload)
