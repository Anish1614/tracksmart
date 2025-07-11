from fastapi import FastAPI, Request
from schemas.beckn import SearchRequest, OnSearchResponse
from registry import lookup_bpps
from broadcaster import broadcast_to_bpps

app = FastAPI()

@app.post("/search")
async def search(request: Request):
    payload = await request.json()
    search_req = SearchRequest(**payload)
    bpps = await lookup_bpps(search_req.context.domain, search_req.context.city)
    responses = await broadcast_to_bpps(bpps, payload)
    # Aggregate responses, add digital signatures, etc.
    return responses  # Or format as per Beckn protocol
