# utils.py
import os
import json
import aiofiles
from pymongo import AsyncMongoClient

from resources.logger import Logger, format_exception_info
from settings import BASE_DIR

class ConfigManager:
    def __init__(self):
        self.logger = Logger()
        try:
            self.appRepoPath = os.path.join(BASE_DIR, "appRepo")
        except Exception as e:
            self.logger.error(format_exception_info(e))

    async def getConfig(self, config_name: str) -> dict:
        config = dict()
        try:
            async with aiofiles.open(os.path.join(self.appRepoPath, config_name + ".json"), "r") as json_file:
                content = await json_file.read()
                # print("content", content)
                config = json.loads(content)
                # print("config",config)
        except Exception as e:
            self.logger.error(format_exception_info(e))
        return config

class MongoClient:
    def __init__(self, client: AsyncMongoClient, db_name: str, collection_name: str):
        self.logger = Logger()
        try:
            self.client = client
            self.db = client[db_name]
            # self.collection = self.db[collection_name]
        except Exception as e:
            self.logger.error(format_exception_info(e))

    @classmethod
    async def create(cls):
        logger = Logger()
        try:
            connection_string_template = (
                "mongodb+srv://{user}:{password}@{cluster}/"
            )

            config_manager = ConfigManager()
            mongo_config = await config_manager.getConfig("mongo_config")
            # print(mongo_config)
            user = mongo_config['database_user']
            password = mongo_config['database_password']
            cluster = mongo_config['cluster_address']
            # app_name = mongo_config['app_name']
            db_name = mongo_config['db_name']
            collection_name = mongo_config["collection_name"]

            connection_string = connection_string_template.format(
                user=user,
                password=password,
                cluster=cluster,
                # app_name=app_name
            )

            # Initialize AsyncMongoClient
            client = AsyncMongoClient(connection_string, serverSelectionTimeoutMS=5000)
            # Test connection
            await client.admin.command('ping')
            logger.info("Connected to MongoDB")
            return cls(client, db_name=db_name, collection_name=collection_name)
        except Exception as e:
            logger.error(f"MongoDB connection failed: {format_exception_info(e)}")
            return None

    async def close(self):
        """Close the MongoDB client connection."""
        if self.client:
            self.client.close()
            self.logger.info("MongoDB connection closed")

    async def get_collection(self, collection_name: str):
        """Get a MongoDB collection."""
        return self.db[collection_name]