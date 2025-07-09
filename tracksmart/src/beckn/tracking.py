from utils.beckn_client import beckn_post

BECKN_GATEWAY_URL = 'http://localhost:5001/beckn/bap/search'

def track_order(order_id):
    payload = {
        "context": {
            "domain": "beckn.org/logistics",
            "action": "track",
            "country": "IND",
            "city": "std:080",
            "core_version": "0.9.3",
            "bap_id": "your-bap-id",
            "bap_uri": "http://localhost:5001/beckn/bap/search"
        },
        "message": {
            "order_id": order_id
        }
    }
    return beckn_post(BECKN_GATEWAY_URL, payload)
