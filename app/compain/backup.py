"""Backups: database dump plus character pictures, stored as one .tar.gz file.

PostgreSQL: pg_dump (plain SQL, with --clean) and psql for restore. Needs the postgresql-client
package in the app image. SQLite (local development only): a copy of the database file.
"""

import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session as DbSession

from . import settings as cfg
from .config import Settings

NAME_RE = re.compile(r"^compain-\d{8}-\d{6}\.tar\.gz$")


def backup_dir(settings: Settings) -> Path:
    path = Path(settings.data_dir) / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _pg_env(url) -> dict:
    env = os.environ.copy()
    if url.password:
        env["PGPASSWORD"] = url.password
    # Never wait forever for a table lock (for example a request that still has a transaction open).
    env["PGOPTIONS"] = "-c lock_timeout=30s"
    return env


def _pg_args(url) -> list[str]:
    args = ["-h", url.host or "localhost", "-p", str(url.port or 5432), "-U", url.username or "postgres"]
    return args + [url.database or "postgres"]


def make_backup(settings: Settings, db: DbSession, include_pictures: bool) -> Path:
    url = make_url(settings.database_url)
    target = backup_dir(settings) / time.strftime("compain-%Y%m%d-%H%M%S.tar.gz")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        if url.get_backend_name().startswith("postgresql"):
            dump = subprocess.run(
                ["pg_dump", "--clean", "--if-exists", "--no-owner", *_pg_args(url)],
                env=_pg_env(url), capture_output=True, check=True,
            )
            (tmp_path / "db.sql").write_bytes(dump.stdout)
        else:
            src = Path(url.database or "compain-dev.db")
            if src.exists():
                shutil.copy(src, tmp_path / "db.sqlite")
        if include_pictures:
            pics = Path(settings.data_dir) / "pictures"
            if pics.exists():
                shutil.copytree(pics, tmp_path / "pictures")
        with tarfile.open(target, "w:gz") as tar:
            for item in tmp_path.iterdir():
                tar.add(item, arcname=item.name)
    return target


def list_backups(settings: Settings) -> list[dict]:
    rows = []
    for f in sorted(backup_dir(settings).glob("compain-*.tar.gz"), reverse=True):
        rows.append({
            "name": f.name,
            "size_mb": round(f.stat().st_size / 1e6, 1),
            "created": datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
        })
    return rows


def backup_path(settings: Settings, name: str) -> Path:
    if not NAME_RE.match(name):
        raise HTTPException(status_code=404, detail="Backup not found")
    path = backup_dir(settings) / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    return path


def restore(settings: Settings, path: Path) -> None:
    url = make_url(settings.database_url)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with tarfile.open(path, "r:gz") as tar:
            tar.extractall(tmp_path, filter="data")
        if url.get_backend_name().startswith("postgresql"):
            sql = tmp_path / "db.sql"
            if not sql.exists():
                raise RuntimeError("The backup has no database dump")
            # A newer pg_dump writes settings an older server does not know. Drop those lines.
            lines = sql.read_bytes().splitlines(keepends=True)
            script = b"".join(l for l in lines if not l.startswith(b"SET transaction_timeout"))
            result = subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "--single-transaction", *_pg_args(url)],
                env=_pg_env(url), input=script, capture_output=True,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr.decode(errors="replace").strip().splitlines()[-1:] or "psql failed")
        else:
            db_file = tmp_path / "db.sqlite"
            if db_file.exists():
                shutil.copy(db_file, url.database or "compain-dev.db")
        pics_src = tmp_path / "pictures"
        if pics_src.exists():
            pics_dst = Path(settings.data_dir) / "pictures"
            shutil.rmtree(pics_dst, ignore_errors=True)
            shutil.copytree(pics_src, pics_dst)


def prune(settings: Settings, keep_days: int) -> int:
    cutoff = datetime.now() - timedelta(days=keep_days)
    removed = 0
    for f in backup_dir(settings).glob("compain-*.tar.gz"):
        if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
            f.unlink()
            removed += 1
    return removed


def due_now(db: DbSession, now: datetime) -> bool:
    """True once per day, at the configured time."""
    if now.strftime("%H:%M") != cfg.get(db, "backup_time"):
        return False
    last = cfg.get(db, "backup_last_run")
    return not last.startswith(now.strftime("%Y-%m-%d"))


def run_and_record(settings: Settings, db: DbSession) -> dict:
    """Make a backup, store the result in the settings, and remove old backups. Used by the button and the nightly job."""
    try:
        path = make_backup(settings, db, include_pictures=cfg.get(db, "backup_include_pictures"))
    except Exception as exc:
        cfg.set_values(db, {"backup_last_status": f"failed: {type(exc).__name__}",
                            "backup_last_run": datetime.now().strftime("%Y-%m-%d %H:%M")})
        db.commit()
        raise
    removed = prune(settings, int(cfg.get(db, "backup_keep_days")))
    cfg.set_values(db, {"backup_last_status": "ok", "backup_last_run": datetime.now().strftime("%Y-%m-%d %H:%M")})
    db.commit()
    return {"name": path.name, "size_mb": round(path.stat().st_size / 1e6, 1), "removed_old": removed}
