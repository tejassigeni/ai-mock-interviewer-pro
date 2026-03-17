"""AI Mock Interviewer — FastAPI Backend."""

import os
from dotenv import load_dotenv

# Load .env before anything else
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.connection import init_db
from routes import auth, interview, analytics

# Import all models so they register with Base
from models import user, interview as interview_model, analytics as analytics_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    await init_db()
    print("✅ Database initialized")
    print(f"✅ Gemini API Key: {'configured' if os.getenv('GEMINI_API_KEY') else 'NOT SET'}")
    yield


app = FastAPI(
    title="AI Mock Interviewer",
    description="AI-powered mock interview platform with question generation, answer evaluation, and progress tracking.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend from any origin (for hosting)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(auth.router)
app.include_router(interview.router)
app.include_router(analytics.router)


@app.get("/")
async def root():
    return {"message": "AI Mock Interviewer API", "docs": "/docs"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
