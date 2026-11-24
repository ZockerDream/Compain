"""API tests. Run from the app folder: python -m pytest -q"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from compain.config import Settings
from compain.main import create_app

ADMIN_PW = "admin-password-long-1"
USER_PW = "user-password-long-1"


def make_settings(tmp_path, **overrides) -> Settings:
    base = dict(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        secret_key="test",
        admin_username="admin",
        admin_password=ADMIN_PW,
        self_hosted_url="mock",
        self_hosted_model="test-model",
        hosted_url="mock",
        hosted_api_key="",
        hosted_model="test-hosted",
        session_hours=48,
        remember_days=365,
        failed_login_limit=5,
        lock_minutes=15,
        hosted_daily_limit=100,
        hosted_daily_total=500,
        data_dir=str(tmp_path / "data"),
        impressum_file=str(tmp_path / ".impressum"),
        datenschutz_file=str(tmp_path / ".datenschutz"),
        offsite_dir=str(tmp_path / "offsite"),
        changelog_file=str(Path(__file__).resolve().parents[2] / "CHANGELOG.md"),
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture()
def client(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as c:
        yield c


def login(client, username, password, remember=False):
    r = client.post("/api/auth/login", json={"username": username, "password": password, "remember": remember})
    return r


def auth_headers(client, username, password, confirm_age=True):
    token = login(client, username, password).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    if confirm_age:
        client.post("/api/auth/confirm-age", json={"adult": True}, headers=headers)
    return headers


def create_user(client, admin_headers, username, password=USER_PW):
    r = client.post("/api/admin/users", json={"username": username, "password": password}, headers=admin_headers)
    assert r.status_code == 201, r.text


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_admin_can_log_in_and_wrong_password_is_refused(client):
    assert login(client, "admin", ADMIN_PW).status_code == 200
    assert login(client, "admin", "wrong-password-xx").status_code == 401


def test_lockout_after_failed_logins(client):
    for _ in range(5):
        login(client, "admin", "wrong-password-xx")
    r = login(client, "admin", ADMIN_PW)
    assert r.status_code == 423


def test_logout_ends_the_session(client):
    headers = auth_headers(client, "admin", ADMIN_PW)
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_user_cannot_use_admin_api(client):
    admin = auth_headers(client, "admin", ADMIN_PW)
    create_user(client, admin, "alice")
    alice = auth_headers(client, "alice", USER_PW)
    assert client.get("/api/admin/users", headers=alice).status_code == 403


def test_adults_only_rule_blocks_minors(client):
    h = auth_headers(client, "admin", ADMIN_PW)
    r = client.post(
        "/api/characters",
        json={"name": "Lena", "description": "She is 15 years old and shy."},
        headers=h,
    )
    assert r.status_code == 422
    r = client.post(
        "/api/characters",
        json={"name": "Lena", "description": "A schoolgirl who sneaks out at night."},
        headers=h,
    )
    assert r.status_code == 422


def test_adult_character_is_allowed(client):
    h = auth_headers(client, "admin", ADMIN_PW)
    r = client.post(
        "/api/characters",
        json={"name": "Mara", "description": "A 34 year old harbour detective."},
        headers=h,
    )
    assert r.status_code == 201


def test_users_edit_only_their_own_characters(client):
    admin = auth_headers(client, "admin", ADMIN_PW)
    create_user(client, admin, "alice")
    create_user(client, admin, "bob")
    alice = auth_headers(client, "alice", USER_PW)
    bob = auth_headers(client, "bob", USER_PW)

    cid = client.post("/api/characters", json={"name": "Mara"}, headers=alice).json()["id"]
    assert client.patch(f"/api/characters/{cid}", json={"name": "Hacked"}, headers=bob).status_code == 403
    assert client.delete(f"/api/characters/{cid}", headers=bob).status_code == 403
    assert client.patch(f"/api/characters/{cid}", json={"name": "Mara II"}, headers=alice).status_code == 200
    # Admins can edit anything
    assert client.patch(f"/api/characters/{cid}", json={"name": "Mara III"}, headers=admin).status_code == 200


def test_community_publish_needs_admin_approval(client):
    admin = auth_headers(client, "admin", ADMIN_PW)
    create_user(client, admin, "alice")
    create_user(client, admin, "bob")
    alice = auth_headers(client, "alice", USER_PW)
    bob = auth_headers(client, "bob", USER_PW)

    cid = client.post("/api/characters", json={"name": "Iris"}, headers=alice).json()["id"]
    client.post(f"/api/characters/{cid}/publish", headers=alice)
    assert client.get("/api/community", headers=bob).json() == []

    client.post(f"/api/admin/community/{cid}/review", json={"action": "approve"}, headers=admin)
    assert [c["name"] for c in client.get("/api/community", headers=bob).json()] == ["Iris"]


def _stream_events(response):
    events = []
    for line in response.iter_lines():
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


def test_chat_streams_a_reply_and_stores_both_messages(client):
    h = auth_headers(client, "admin", ADMIN_PW)
    cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
    chat = client.post("/api/chats", json={"character_id": cid, "model": "self"}, headers=h).json()

    with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "Hello"}, headers=h) as r:
        assert r.status_code == 200
        events = _stream_events(r)

    deltas = [e["delta"] for e in events if "delta" in e]
    assert "".join(deltas).strip()
    assert events[-1].get("done") is True

    detail = client.get(f"/api/chats/{chat['id']}", headers=h).json()
    roles = [m["role"] for m in detail["messages"]]
    assert roles == ["user", "assistant"]


def test_important_messages_are_capped_at_ten(client):
    h = auth_headers(client, "admin", ADMIN_PW)
    cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
    chat = client.post("/api/chats", json={"character_id": cid}, headers=h).json()
    for i in range(11):
        with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": f"m{i}"}, headers=h) as r:
            _stream_events(r)
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    ids = [m["id"] for m in msgs]
    for mid in ids[:10]:
        assert client.patch(f"/api/chats/{chat['id']}/messages/{mid}", json={"important": True}, headers=h).status_code == 200
    assert client.patch(f"/api/chats/{chat['id']}/messages/{ids[10]}", json={"important": True}, headers=h).status_code == 409


def test_own_message_marked_important_reaches_the_prompt(client):
    from compain.models import Chat, Character
    from compain.routes.chats import build_context

    h = auth_headers(client, "admin", ADMIN_PW)
    cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
    chat = client.post("/api/chats", json={"character_id": cid}, headers=h).json()
    with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "My sister Lena died last winter."}, headers=h) as r:
        _stream_events(r)
    mine = [m for m in client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"] if m["role"] == "user"][0]
    r = client.patch(f"/api/chats/{chat['id']}/messages/{mine['id']}", json={"important": True}, headers=h)
    assert r.status_code == 200
    got = client.get(f"/api/chats/{chat['id']}", headers=h).json()
    assert got["important_count"] == 1
    db = client.app.state.session_factory()
    try:
        c = db.get(Chat, chat["id"])
        system = build_context(db, c, db.get(Character, cid), 40, persona_name="Jo")[0]["content"]
    finally:
        db.close()
    assert "Jo: My sister Lena died last winter." in system


def test_hosted_daily_limit_is_enforced_and_admin_can_change_it(tmp_path):
    app = create_app(make_settings(tmp_path, hosted_daily_limit=1))
    with TestClient(app) as client:
        h = auth_headers(client, "admin", ADMIN_PW)
        cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
        chat = client.post("/api/chats", json={"character_id": cid, "model": "hosted"}, headers=h).json()

        with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "one"}, headers=h) as r:
            assert r.status_code == 200
            _stream_events(r)
        assert client.post(f"/api/chats/{chat['id']}/messages", json={"content": "two"}, headers=h).status_code == 429

        # The admin raises the limit in Server Management. The new value applies at once.
        assert client.put("/api/admin/settings", json={"hosted_daily_limit": 5}, headers=h).status_code == 200
        with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "three"}, headers=h) as r:
            assert r.status_code == 200
            _stream_events(r)


def test_self_hosted_is_not_limited(tmp_path):
    app = create_app(make_settings(tmp_path, hosted_daily_limit=0))
    with TestClient(app) as client:
        h = auth_headers(client, "admin", ADMIN_PW)
        cid = client.post("/api/characters", json={"name": "Mara"}, headers=h).json()["id"]
        chat = client.post("/api/chats", json={"character_id": cid, "model": "self"}, headers=h).json()
        for _ in range(3):
            with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "hi"}, headers=h) as r:
                assert r.status_code == 200
                _stream_events(r)


def test_remember_me_gives_a_long_session(client):
    r = login(client, "admin", ADMIN_PW, remember=True)
    assert r.json()["remember"] is True
    assert "expires_at" in r.json()


def test_age_is_asked_once_and_blocks_until_confirmed(client):
    admin = auth_headers(client, "admin", ADMIN_PW)
    create_user(client, admin, "carol")
    carol = auth_headers(client, "carol", USER_PW, confirm_age=False)
    assert client.get("/api/auth/me", headers=carol).json()["age_confirmed"] is False
    r = client.get("/api/characters", headers=carol)
    assert r.status_code == 403 and r.json()["detail"] == "age_confirmation_required"
    assert client.post("/api/auth/confirm-age", json={"adult": True}, headers=carol).status_code == 200
    assert client.get("/api/characters", headers=carol).status_code == 200
    # Asked only once: a new login is already confirmed
    again = auth_headers(client, "carol", USER_PW, confirm_age=False)
    assert client.get("/api/auth/me", headers=again).json()["age_confirmed"] is True


def test_saying_no_logs_out_and_keeps_the_app_closed(client):
    admin = auth_headers(client, "admin", ADMIN_PW)
    create_user(client, admin, "dave")
    dave = auth_headers(client, "dave", USER_PW, confirm_age=False)
    r = client.post("/api/auth/confirm-age", json={"adult": False}, headers=dave)
    assert r.status_code == 403
    assert client.get("/api/auth/me", headers=dave).status_code == 401  # session ended
    dave2 = auth_headers(client, "dave", USER_PW, confirm_age=False)
    assert client.get("/api/chats", headers=dave2).status_code == 403  # still not confirmed
