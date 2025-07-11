import httpx

REGISTRY_URL = "https://registry.becknprotocol.io/subscribers"

async def lookup_bpps(domain, city):
    params = {"type": "BPP", "domain": domain, "city": city}
    async with httpx.AsyncClient() as client:
        resp = await client.get(REGISTRY_URL, params=params)
        return resp.json()  # List of BPPs with endpoints and keys
