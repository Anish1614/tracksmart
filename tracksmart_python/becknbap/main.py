import asyncio
import httpx
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

from models import (
    Context, Error, AckResponse, Item,
    Catalog, Order, BecknRequest, BecknResponse
)
from resources.logger import Logger, format_exception_info
from resources.utils import MongoClient

logger = Logger()
# MongoDB client initialization
mongo_client = None
db = None

# Lifespan event handler for startup and shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client, db
    # Startup logic
    mongo_client = await MongoClient.create()
    # print(mongo_client)
    if mongo_client is None:
        logger.error("Failed to connect to MongoDB during startup")
    else:
        db = mongo_client.db
        # print(db)
    yield
    # Shutdown logic
    if mongo_client:
        await mongo_client.close()
        logger.info("MongoDB connection closed during shutdown")

app = FastAPI(title="Beckn Provider Platform (BPP) API", lifespan=lifespan)


# Helper function to send callback
async def send_callback(context: Context, message: Dict[str, Any], error: Optional[Error] = None):
    callback_url = context.bap_uri
    if not callback_url:
        return
    response_context = context.model_copy()
    response_context.action = f"on_{context.action}"
    response_context.message_id = str(uuid.uuid4())
    response_context.timestamp = datetime.now(timezone.utc).isoformat() + "Z"
    
    payload = BecknResponse(context=response_context, message=message, error=error)
    async with httpx.AsyncClient() as client:
        try:
            await client.post(callback_url, json=payload.model_dump())
        except Exception as e:
            logger.error(f"Failed to send callback to {callback_url}: {format_exception_info(e)}")

# ACK Response
def create_ack():
    return AckResponse(message={"ack": {"status": "ACK"}})

# Initialize catalog with sample data
async def init_catalog():
    global mongo_client, db
    if mongo_client:
        try:
            catalog_collection = db["catalog"]
            # Clear existing data
            await catalog_collection.delete_many({})
            # Insert sample items
            sample_items = [
                {"id": "item1", "descriptor": {"name": "Product 1"}, "price": {"value": "100", "currency": "INR"}},
                {"id": "item2", "descriptor": {"name": "Product 2"}, "price": {"value": "200", "currency": "INR"}}
            ]
            await catalog_collection.insert_many(sample_items)
            logger.info("Catalog initialized with sample data")
        except Exception as e:
            logger.error(f"Failed to initialize catalog: {format_exception_info(e)}")


app.lifespan = lifespan

# BPP Endpoints
@app.post("/search")
async def search(request: BecknRequest):
    if request.context.action != "search":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Fetch catalog from MongoDB
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    catalog_collection = db["catalog"]
    items = [Item(**item) async for item in catalog_collection.find()]
    catalog = Catalog(items=items)
    asyncio.create_task(send_callback(request.context, {"catalog": catalog.model_dump()}))
    
    return ack

@app.post("/select")
async def select(request: BecknRequest):
    if request.context.action != "select":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Validate selected items
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    selected_items = request.message.get("order", {}).get("items", [])
    catalog_collection = db["catalog"]
    valid_item_ids = {item["id"] async for item in catalog_collection.find({}, {"id": 1})}
    
    for item in selected_items:
        if item.get("id") not in valid_item_ids:
            error = Error(code="INVALID_ITEM", message=f"Item {item.get('id')} not found")
            asyncio.create_task(send_callback(request.context, {}, error))
            return ack
    
    message = {"order": {"items": selected_items}}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack

@app.post("/init")
async def init(request: BecknRequest):
    try:
        if request.context.action != "init":
            raise HTTPException(status_code=400, detail="Invalid action")
        
        # Return ACK
        ack = create_ack()
        
        # Simulate order initialization
        order = request.message.get("order", {})
        message = {"order": order}
        asyncio.create_task(db["Order"].insert_one(message))
        asyncio.create_task(send_callback(request.context, message))
    except Exception as e:
        error = Error(code="", message=format_exception_info(e))
        asyncio.create_task(send_callback(request.context, message, error=error))
        logger.error(format_exception_info(e))
        return AckResponse(message={"ack": {"status": "NACK"}})
    return ack

@app.post("/confirm")
async def confirm(request: BecknRequest):
    if request.context.action != "confirm":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Confirm order and store in MongoDB
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    order_id = str(uuid.uuid4())
    order = Order(
        id=order_id,
        items=request.message.get("order", {}).get("items", []),
        state="Confirmed",
        provider={"id": request.context.bpp_id},
        payment={"status": "Pending"}
    )
    orders_collection = db["orders"]
    await orders_collection.insert_one(order.model_dump())
    message = {"order": order.model_dump()}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack

@app.post("/status")
async def status(request: BecknRequest):
    if request.context.action != "status":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Fetch order status from MongoDB
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    order_id = request.message.get("order", {}).get("id")
    orders_collection = db["orders"]
    order = await orders_collection.find_one({"id": order_id})
    if not order:
        error = Error(code="INVALID_ORDER", message=f"Order {order_id} not found")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    message = {"order": order}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack

@app.post("/track")
async def track(request: BecknRequest):
    if request.context.action != "track":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Simulate order tracking
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    order_id = request.message.get("order", {}).get("id")
    orders_collection = db["orders"]
    order = await orders_collection.find_one({"id": order_id})
    if not order:
        error = Error(code="INVALID_ORDER", message=f"Order {order_id} not found")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    message = {"tracking": {"order_id": order_id, "status": order.get("state", "In Transit")}}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack

@app.post("/cancel")
async def cancel(request: BecknRequest):
    if request.context.action != "cancel":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Cancel order in MongoDB
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    order_id = request.message.get("order", {}).get("id")
    orders_collection = db["orders"]
    result = await orders_collection.update_one(
        {"id": order_id},
        {"$set": {"state": "Cancelled"}}
    )
    if result.matched_count == 0:
        error = Error(code="INVALID_ORDER", message=f"Order {order_id} not found")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    order = await orders_collection.find_one({"id": order_id})
    message = {"order": order}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack

@app.post("/update")
async def update(request: BecknRequest):
    if request.context.action != "update":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Update order in MongoDB
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    order_id = request.message.get("order", {}).get("id")
    orders_collection = db["orders"]
    update_data = request.message.get("order", {})
    result = await orders_collection.update_one(
        {"id": order_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        error = Error(code="INVALID_ORDER", message=f"Order {order_id} not found")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    order = await orders_collection.find_one({"id": order_id})
    message = {"order": order}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack

@app.post("/rating")
async def rating(request: BecknRequest):
    if request.context.action != "rating":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Store rating in MongoDB
    if db is None:
        error = Error(code="INTERNAL_SERVER_ERROR", message="Database not initialized")
        asyncio.create_task(send_callback(request.context, {}, error))
        return ack
    
    rating = request.message.get("rating", {})
    orders_collection = db["orders"]
    order_id = rating.get("order_id")
    if order_id:
        await orders_collection.update_one(
            {"id": order_id},
            {"$set": {"rating": rating}}
        )
    message = {"rating": rating}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack

@app.post("/support")
async def support(request: BecknRequest):
    if request.context.action != "support":
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Return ACK
    ack = create_ack()
    
    # Simulate support response
    message = {"support": {"contact": "support@bpp.com", "phone": "+1234567890"}}
    asyncio.create_task(send_callback(request.context, message))
    
    return ack