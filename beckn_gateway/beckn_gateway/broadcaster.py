import httpx

async def broadcast_to_bpps(bpps, search_payload):
    responses = []
    async with httpx.AsyncClient() as client:
        for bpp in bpps:
            url = f"{bpp['subscriber_url']}/search"
            try:
                resp = await client.post(url, json=search_payload)
                responses.append(resp.json())
            except Exception as e:
                continue
    return responses
