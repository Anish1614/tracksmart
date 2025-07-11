from pydantic import BaseModel

class Context(BaseModel):
    domain: str
    country: str
    city: str
    action: str
    bap_id: str

class SearchRequest(BaseModel):
    context: Context
    message: dict  # Replace with detailed schema as needed

class OnSearchResponse(BaseModel):
    context: Context
    message: dict
