import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.routers import auth, workspace, documents, chat, notes, features, admin

# Setup logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Dynamically initialize database tables on startup
try:
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized successfully.")
except Exception as e:
    logger.critical(f"Database initialization failed: {e}")

# Create FastAPI Instance
app = FastAPI(
    title=settings.APP_NAME,
    description="Nexus Full-Stack AI document-understanding engine API",
    version="1.0.0"
)

# Set CORS Origins
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(workspace.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(notes.router)
app.include_router(features.router)
app.include_router(admin.router)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT
    }

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "message": "Nexus API is online"
    }
