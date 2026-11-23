"""Tests for the features added in v0.2: settings, sign-up, maintenance, card import, unread,
story summary, live sync, backups, speed test and audit log."""

import asyncio
import base64
import json
import struct
import zlib

from fastapi.testclient import TestClient

from compain.main import create_app
from compain.routes.chats import SUMMARY_EVERY, update_summary

from .test_api import ADMIN_PW, USER_PW, auth_headers, create_user, login, make_settings, _stream_events


def make_client(tmp_path, **overrides):
    app = create_app(make_settings(tmp_path, **overrides))
    return app, TestClient(app)


def admin_client(tmp_path, **overrides):
    app, client = make_client(tmp_path, **overrides)
    client.__enter__()
    h = auth_headers(client, "admin", ADMIN_PW)
    return app, client, h


def png_with_card(card: dict) -> bytes:
    """A tiny valid PNG (1x1) with a V2 card in a tEXt chunk, the way character sites store them."""
    def chunk(ctype: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + ctype + body + struct.pack(">I", zlib.crc32(ctype + body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\x00\x00"
    idat = zlib.compress(raw)
    payload = base64.b64encode(json.dumps(card).encode())
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"tEXt", b"chara\x00" + payload)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )


def test_settings_are_validated(tmp_path):
    app, client, h = admin_client(tmp_path)
    assert client.get("/api/admin/settings", headers=h).json()["session_hours"] == 48
    assert client.put("/api/admin/settings", json={"signup_mode": "maybe"}, headers=h).status_code == 422
    assert client.put("/api/admin/settings", json={"backup_time": "25:99"}, headers=h).status_code == 422
    assert client.put("/api/admin/settings", json={"nonsense": 1}, headers=h).status_code == 422
    r = client.put("/api/admin/settings", json={"password_min_length": 16}, headers=h)
    assert r.status_code == 200 and r.json()["password_min_length"] == 16
    client.__exit__(None, None, None)


def test_sign_up_needs_an_invite_code(tmp_path):
    app, client, h = admin_client(tmp_path)
    assert client.post("/api/auth/register", json={"username": "newbie", "password": "long-enough-pass", "invite": "x"}).status_code == 403
    code = client.post("/api/admin/invite-code", headers=h).json()["invite_code"]
    assert client.get("/api/auth/status").json()["signup_open"] is False  # mode is still "closed"
    client.put("/api/admin/settings", json={"signup_mode": "invite"}, headers=h)
    assert client.get("/api/auth/status").json()["signup_open"] is True
    assert client.post("/api/auth/register", json={"username": "newbie", "password": "long-enough-pass", "invite": "wrong"}).status_code == 403
    assert client.post("/api/auth/register", json={"username": "newbie", "password": "short", "invite": code}).status_code == 422
    assert client.post("/api/auth/register", json={"username": "newbie", "password": "long-enough-pass", "invite": code}).status_code == 201
    assert login(client, "newbie", "long-enough-pass").status_code == 200
    client.__exit__(None, None, None)


def test_maintenance_mode_blocks_users_not_admins(tmp_path):
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "alice")
    alice = auth_headers(client, "alice", USER_PW)
    client.put("/api/admin/settings", json={"maintenance_mode": True, "notice": "Back at 23:00"}, headers=h)
    assert client.get("/api/auth/me", headers=alice).status_code == 503
    assert client.get("/api/auth/me", headers=h).status_code == 200
    assert client.get("/api/auth/status").json()["maintenance"] is True
    client.put("/api/admin/settings", json={"maintenance_mode": False}, headers=h)
    assert client.get("/api/auth/me", headers=alice).json()["notice"] == "Back at 23:00"
    client.__exit__(None, None, None)


def test_import_json_v1_v2_text_and_png(tmp_path):
    app, client, h = admin_client(tmp_path)
    v1 = {"name": "Iris Kade", "description": "Airship captain.", "personality": "Strict", "first_mes": "Report!", "tags": ["fantasy"]}
    r = client.post("/api/characters/import", content=json.dumps(v1).encode(), headers={**h, "content-type": "application/json"})
    assert r.status_code == 201, r.text

    v2 = {"spec": "chara_card_v2", "spec_version": "2.0", "data": {"name": "Lord Ashford", "description": "Butler.", "scenario": "Manor", "first_mes": "Good evening.", "tags": "regency, drama"}}
    r = client.post("/api/characters/import", content=json.dumps(v2).encode(), headers={**h, "content-type": "application/json"})
    assert r.status_code == 201
    listed = {c["name"]: c for c in client.get("/api/characters", headers=h).json()}
    assert listed["Lord Ashford"]["tags"] == ["regency", "drama"]
    assert listed["Iris Kade"]["greeting"] == "Report!"

    r = client.post("/api/characters/import", content=b"Sofia is a nosy neighbour.", headers={**h, "x-filename": "sofia_neighbour.txt", "content-type": "text/plain"})
    assert r.status_code == 201 and r.json()["name"] == "sofia neighbour"

    png = png_with_card({"spec": "chara_card_v2", "data": {"name": "Theo Brandt", "description": "Retired pilot."}})
    r = client.post("/api/characters/import", content=png, headers={**h, "x-filename": "theo.png", "content-type": "image/png"})
    assert r.status_code == 201, r.text
    theo = r.json()["id"]
    pic = client.get(f"/api/characters/{theo}/picture", headers=h)
    assert pic.status_code == 200 and pic.content.startswith(b"\x89PNG")

    minor = {"name": "Young", "description": "She is 15 years old."}
    r = client.post("/api/characters/import", content=json.dumps(minor).encode(), headers={**h, "content-type": "application/json"})
    assert r.status_code == 422
    assert client.post("/api/characters/import", content=b"{broken", headers=h).status_code == 422
    client.__exit__(None, None, None)


def test_unread_counts_and_read_marker(tmp_path):
    app, client, h = admin_client(tmp_path)
    cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
    chat = client.post("/api/chats", json={"character_id": cid}, headers=h).json()
    with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "hi"}, headers=h) as r:
        _stream_events(r)
    listed = client.get("/api/chats", headers=h).json()[0]
    assert listed["unread"] == 1
    client.get(f"/api/chats/{chat['id']}", headers=h)
    assert client.get("/api/chats", headers=h).json()[0]["unread"] == 0
    client.__exit__(None, None, None)


def test_story_summary_is_written_after_enough_messages(tmp_path):
    app, client, h = admin_client(tmp_path)
    cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
    chat = client.post("/api/chats", json={"character_id": cid}, headers=h).json()
    from compain.models import Message

    with app.state.session_factory() as db:
        for i in range(SUMMARY_EVERY):
            db.add(Message(chat_id=chat["id"], role="user" if i % 2 == 0 else "assistant", content=f"line {i}"))
        db.commit()
    asyncio.run(update_summary(app.state.session_factory, app.state.settings, chat["id"], "self"))
    detail = client.get(f"/api/chats/{chat['id']}", headers=h).json()
    assert detail["summary"] != ""  # the mock model answers with its test text
    client.__exit__(None, None, None)


def test_live_sync_pushes_a_change_to_open_connections(tmp_path):
    app, client, h = admin_client(tmp_path)
    cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "hello"
        client.post("/api/chats", json={"character_id": cid}, headers=h)
        assert ws.receive_json() == {"type": "chats"}
    client.__exit__(None, None, None)


def test_websocket_refuses_without_login(tmp_path):
    app, client = make_client(tmp_path)
    with client:
        try:
            with client.websocket_connect("/ws") as ws:
                ws.receive_json()
            raised = False
        except Exception:
            raised = True
        assert raised


def test_backup_restore_and_retention(tmp_path):
    app, client, h = admin_client(tmp_path)
    r = client.post("/api/admin/backups/run", headers=h)
    assert r.status_code == 200, r.text
    name = r.json()["name"]
    assert name.startswith("compain-") and name.endswith(".tar.gz")
    assert any(b["name"] == name for b in client.get("/api/admin/backups", headers=h).json())
    assert client.get(f"/api/admin/backups/{name}", headers=h).status_code == 200
    assert client.get("/api/admin/backups/..%2Fsecret", headers=h).status_code == 404
    assert client.post(f"/api/admin/backups/{name}/restore", json={"confirm": "no"}, headers=h).status_code == 422
    assert client.post(f"/api/admin/backups/{name}/restore", json={"confirm": name}, headers=h).status_code == 200
    client.__exit__(None, None, None)


def test_speed_test_and_audit_log(tmp_path):
    app, client, h = admin_client(tmp_path)
    r = client.post("/api/admin/models/speedtest", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["pieces"] > 0 and body["pieces_per_second"] > 0
    assert client.get("/api/admin/settings", headers=h).json()["last_speed_test"]["pieces"] == body["pieces"]
    log = client.get("/api/admin/audit", headers=h).json()
    assert any(entry["action"] == "model.speedtest" for entry in log)
    client.__exit__(None, None, None)


def test_storage_cleanup_removes_unused_pictures(tmp_path):
    app, client, h = admin_client(tmp_path)
    pics = tmp_path / "data" / "pictures"
    pics.mkdir(parents=True, exist_ok=True)
    (pics / "999.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    r = client.post("/api/admin/storage/cleanup", headers=h)
    assert r.status_code == 200 and r.json()["removed"] >= 1
    client.__exit__(None, None, None)


def test_logout_everyone_ends_all_sessions(tmp_path):
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "bob")
    bob = auth_headers(client, "bob", USER_PW)
    assert client.get("/api/auth/me", headers=bob).status_code == 200
    client.post("/api/admin/logout-everyone", headers=h)
    assert client.get("/api/auth/me", headers=bob).status_code == 401
    client.__exit__(None, None, None)


def test_preferences_are_stored_per_user(tmp_path):
    app, client, h = admin_client(tmp_path)
    assert client.get("/api/auth/preferences", headers=h).json() == {}
    r = client.put("/api/auth/preferences", json={"palette": "violet", "ctx": 200}, headers=h)
    assert r.status_code == 200 and r.json() == {"palette": "violet", "ctx": 200}
    assert client.put("/api/auth/preferences", json={"palette": "neon"}, headers=h).status_code == 422
    assert client.put("/api/auth/preferences", json={"admin": True}, headers=h).status_code == 422
    assert client.get("/api/auth/preferences", headers=h).json()["palette"] == "violet"
    client.__exit__(None, None, None)
