"""Compain API service. Run with: uvicorn compain.main:app --host 0.0.0.0 --port 8080"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session as DbSession

from . import backup as backup_mod
from . import settings as cfg
from .config import Settings, load_settings
from .db import init_db, make_engine, make_session_factory
from .deps import get_db
from .models import User
from .routes import admin, auth, characters, chats, export, help, legal, media
from .security import hash_password
from .loginguard import LoginGuard
from .ws import Hub, router as ws_router

log = logging.getLogger("compain")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(app.state.engine)
        ensure_admin(app)
        task = asyncio.create_task(backup_scheduler(app))
        yield
        task.cancel()

    app = FastAPI(title="Compain", version="1.7.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)
    app.state.hub = Hub()
    app.state.login_guard = LoginGuard()

    app.include_router(auth.router)
    app.include_router(characters.router)
    app.include_router(chats.router)
    app.include_router(admin.router)
    app.include_router(media.router)
    app.include_router(media.users_router)
    app.include_router(export.router)
    app.include_router(legal.router)
    app.include_router(help.router)
    app.include_router(ws_router)

    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/", response_class=HTMLResponse)
    def index():
        return FileResponse(static_dir / "index.html", media_type="text/html", headers={"Cache-Control": "no-cache"})

    # Installable web app (PWA): the manifest and the service worker must live at the root.
    @app.get("/manifest.webmanifest", include_in_schema=False)
    def manifest():
        return FileResponse(static_dir / "manifest.webmanifest", media_type="application/manifest+json")

    @app.get("/sw.js", include_in_schema=False)
    def service_worker():
        return FileResponse(static_dir / "sw.js", media_type="text/javascript",
                            headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})

    @app.get("/api/health")
    def health(db: DbSession = Depends(get_db)):
        db.execute(text("SELECT 1"))
        return {"status": "ok", "version": app.version}

    return app


def seed_from_environment(app: FastAPI) -> None:
    """On the first start, the environment variables become the initial values of the settings."""
    env: Settings = app.state.settings
    initial = {
        "hosted_daily_limit": env.hosted_daily_limit,
        "hosted_daily_total": env.hosted_daily_total,
        "session_hours": env.session_hours,
        "remember_days": env.remember_days,
        "failed_login_limit": env.failed_login_limit,
        "lock_minutes": env.lock_minutes,
    }
    with app.state.session_factory() as db:
        from .models import ServerSetting

        for key, value in initial.items():
            if db.get(ServerSetting, key) is None:
                cfg.set_values(db, {key: value})
        db.commit()


def ensure_admin(app: FastAPI) -> None:
    """Create the first admin from environment variables, if no admin exists yet."""
    settings: Settings = app.state.settings
    seed_from_environment(app)
    if not settings.admin_password:
        return
    with app.state.session_factory() as db:
        if db.query(User).filter(User.role == "admin").first() is None:
            db.add(User(username=settings.admin_username, role="admin", password_hash=hash_password(settings.admin_password)))
            db.commit()


async def backup_scheduler(app: FastAPI) -> None:
    """Nightly backup at the time set in Server Management. Checks once a minute."""
    settings: Settings = app.state.settings
    while True:
        await asyncio.sleep(60)
        try:
            with app.state.session_factory() as db:
                if backup_mod.due_now(db, datetime.now()):
                    await asyncio.to_thread(backup_mod.run_and_record, settings, db)
                    log.info("nightly backup done")
        except Exception as exc:  # keep the scheduler alive; the status is stored in the settings
            log.warning("nightly backup failed: %s", exc)


app = create_app()
