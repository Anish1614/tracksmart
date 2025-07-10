# seed_data.py

import os
import uuid
import boto3
from datetime import datetime

TABLE = os.getenv("TABLE_NAME", "TrackSmartData")
dynamo = boto3.resource("dynamodb")
table = dynamo.Table(TABLE)

def seed_partners():
    partners = [
        {
            "pk": "provider#delhivery",
            "sk": "profile",
            "name": "Delhivery",
            "bpp_uri": "https://mock-delhivery.example.com/track",
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "pk": "provider#local-express",
            "sk": "profile",
            "name": "Local Express",
            "bpp_uri": "https://mock-local.example.com/track",
            "created_at": datetime.utcnow().isoformat()
        }
    ]

    for p in partners:
        print(f"Seeding provider {p['pk']}…")
        table.put_item(Item=p)
    print("Done seeding partners.")

def seed_orders():
    order = {
        "pk": "order#" + str(uuid.uuid4()),
        "sk": "created#" + datetime.utcnow().isoformat(),
        "provider_id": "provider#delhivery",
        "status": "CREATED",
        "created_at": datetime.utcnow().isoformat()
    }
    print(f"Seeding a sample order {order['pk']}…")
    table.put_item(Item=order)
    print("Done seeding orders.")

if __name__ == "__main__":
    seed_partners()
    seed_orders()
