import requests

def beckn_post(url, payload, headers=None):
    headers = headers or {"Content-Type": "application/json"}
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()
