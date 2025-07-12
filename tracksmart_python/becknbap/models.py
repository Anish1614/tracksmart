from pydantic import BaseModel, Field, HttpUrl, field_validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timezone
import uuid

class Context(BaseModel):
    domain: str = Field(..., description="The domain of the transaction, e.g., 'retail'")
    country: str = Field(..., description="Country code, e.g., 'IND'")
    city: str = Field(..., description="City code, e.g., 'std:080'")
    action: str = Field(..., description="The action being performed, e.g., 'search', 'on_search'")
    core_version: str = Field("0.9.3", description="Core API version")
    bap_id: Optional[str] = Field(None, description="BAP identifier")
    bap_uri: Optional[HttpUrl] = Field(None, description="BAP callback URI")
    bpp_id: Optional[str] = Field(None, description="BPP identifier")
    bpp_uri: Optional[HttpUrl] = Field(None, description="BPP URI")
    transaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique transaction ID")
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique message ID")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat() + "Z", description="ISO 8601 timestamp")
    ttl: Optional[str] = Field(None, description="Time to live in ISO 8601 duration format")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() + "Z"
        }

class Error(BaseModel):
    code: str = Field(..., description="Error code, e.g., 'INVALID_REQUEST'")
    message: str = Field(..., description="Human-readable error message")

class Ack(BaseModel):
    status: Literal["ACK", "NACK"] = Field(..., description="Acknowledgment status")

class AckResponse(BaseModel):
    message: Dict[str, Ack] = Field(..., description="Acknowledgment message with status")

class Descriptor(BaseModel):
    name: str = Field(..., description="Name of the item")
    code: Optional[str] = Field(None, description="Code of the item")
    symbol: Optional[str] = Field(None, description="Symbol of the item")
    short_desc: Optional[str] = Field(None, description="Short description")
    long_desc: Optional[str] = Field(None, description="Long description")
    images: Optional[List[str]] = Field(None, description="List of image URLs")

class Price(BaseModel):
    currency: str = Field(..., description="Currency code, e.g., 'INR'")
    value: str = Field(..., description="Price as a string, e.g., '100.00'")

    @field_validator("value")
    def validate_value(cls, v):
        try:
            float(v)
            return v
        except ValueError:
            raise ValueError("Price value must be a valid number as a string")

class Item(BaseModel):
    id: str = Field(..., description="Unique item ID")
    descriptor: Descriptor = Field(..., description="Item descriptor")
    price: Price = Field(..., description="Item price")
    category_id: Optional[str] = Field(None, description="Category ID")
    tags: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")

class Catalog(BaseModel):
    items: List[Item] = Field(..., description="List of items in the catalog")

class Provider(BaseModel):
    id: str = Field(..., description="Provider ID")

class Payment(BaseModel):
    status: str = Field(..., description="Payment status, e.g., 'Pending', 'Paid'")
    amount: Optional[Price] = Field(None, description="Payment amount")
    method: Optional[str] = Field(None, description="Payment method")

class Order(BaseModel):
    id: str = Field(..., description="Unique order ID")
    items: List[Item] = Field(..., description="List of ordered items")
    state: str = Field(..., description="Order state, e.g., 'Confirmed', 'Cancelled'")
    provider: Provider = Field(..., description="Provider details")
    payment: Payment = Field(..., description="Payment details")
    billing: Optional[Dict[str, Any]] = Field(None, description="Billing information")
    fulfillment: Optional[Dict[str, Any]] = Field(None, description="Fulfillment details")

class Tracking(BaseModel):
    order_id: str = Field(..., description="Order ID being tracked")
    status: str = Field(..., description="Tracking status, e.g., 'In Transit'")

class Rating(BaseModel):
    order_id: str = Field(..., description="Order ID being rated")
    value: int = Field(..., ge=1, le=5, description="Rating value (1-5)")
    feedback: Optional[str] = Field(None, description="Feedback text")

class Support(BaseModel):
    contact: str = Field(..., description="Support contact email")
    phone: str = Field(..., description="Support phone number")

class BecknRequest(BaseModel):
    context: Context = Field(..., description="Request context")
    message: Dict[str, Any] = Field(..., description="Request message payload")

class BecknResponse(BaseModel):
    context: Context = Field(..., description="Response context")
    message: Dict[str, Any] = Field(..., description="Response message payload")
    error: Optional[Error] = Field(None, description="Error details, if any")