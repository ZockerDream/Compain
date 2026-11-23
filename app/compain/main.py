"""Compain API service. Run with: uvicorn compain.main:app --host 0.0.0.0 --port 8080"""

from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session as DbSession

from .config import Settings, load_settings
from .db import init_db, make_engine, make_session_factory
from .deps import get_db
from .models import User
from .routes import admin, auth, characters, chats, export, media
from .security import hash_password


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(app.state.engine)
        ensure_admin(app)
        yield

    app = FastAPI(title="Compain", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)

    app.include_router(auth.router)
    app.include_router(characters.router)
    app.include_router(chats.router)
    app.include_router(admin.router)
    app.include_router(media.router)
    app.include_router(export.router)

    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/", response_class=HTMLResponse)
    def index():
        return FileResponse(static_dir / "index.html", media_type="text/html")

    @app.get("/api/health")
    def health(db: DbSession = Depends(get_db)):
        db.execute(text("SELECT 1"))
        return {"status": "ok", "version": app.version}

    return app


def ensure_admin(app: FastAPI) -> None:
    """Create the first admin from environment variables, if no admin exists yet."""
    settings: Settings = app.state.settings
    if not settings.admin_password:
        return
    with app.state.session_factory() as db:
        if db.query(User).filter(User.role == "admin").first() is None:
            db.add(
                User(
                    username=settings.admin_username,
                    role="admin",
                    password_hash=hash_password(settings.admin_password),
                )
            )
            db.commit()


app = create_app()
