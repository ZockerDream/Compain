"""Tests for 0.4.0: account security (password, deletion, login guard, 2FA, devices), persona and pictures,
chat tools (stop, regenerate, versions, continue, edit, delete, rewind, switch character), likes,
privacy policy and offsite backups."""

import asyncio
import json

from compain import totp
from compain.models import Chat, Message
from compain.routes.chats import Job, ReplyOptions, build_context, stream_reply

from .test_api import ADMIN_PW, USER_PW, _stream_events, auth_headers, create_user, login
from .test_features import admin_client

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f2"
    "bf5d0000000049454e44ae426082"
)


def _stream(client, url, h, body):
    with client.stream("POST", url, json=body, headers=h) as r:
        assert r.status_code == 200, r.read()
        return _stream_events(r)


def _chat(client, h, name="Mara", **extra):
    cid = client.post("/api/characters", json={"name": name, **extra}, headers=h).json()["id"]
    return cid, client.post("/api/chats", json={"character_id": cid}, headers=h).json()


# ---------- account ----------

def test_change_password_keeps_this_device_and_logs_out_the_others(tmp_path):
    app, client, h = admin_client(tmp_path)
    other = auth_headers(client, "admin", ADMIN_PW)
    assert client.post("/api/auth/password", json={"current": "wrong", "new": "x" * 14}, headers=h).status_code == 401
    assert client.post("/api/auth/password", json={"current": ADMIN_PW, "new": "short"}, headers=h).status_code == 422
    assert client.post("/api/auth/password", json={"current": ADMIN_PW, "new": "a-brand-new-password"}, headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=other).status_code == 401
    assert login(client, "admin", "a-brand-new-password").status_code == 200
    client.__exit__(None, None, None)


def test_delete_own_account_removes_everything(tmp_path):
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "erin")
    erin = auth_headers(client, "erin", USER_PW)
    _chat(client, erin, "Erins Figur")
    assert client.post("/api/auth/delete-account", json={"password": USER_PW, "confirm": "nope"}, headers=erin).status_code == 422
    assert client.post("/api/auth/delete-account", json={"password": "wrong", "confirm": "erin"}, headers=erin).status_code == 401
    assert client.post("/api/auth/delete-account", json={"password": USER_PW, "confirm": "erin"}, headers=erin).status_code == 200
    assert login(client, "erin", USER_PW).status_code == 401
    with app.state.session_factory() as db:
        assert db.query(Chat).count() == 0
    # The last admin cannot delete the own account
    assert client.post("/api/auth/delete-account", json={"password": ADMIN_PW, "confirm": "admin"}, headers=h).status_code == 409
    client.__exit__(None, None, None)


def test_wrong_passwords_lock_only_this_address_and_account(tmp_path):
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "frank")
    for _ in range(5):
        login(client, "frank", "wrong-password-xx")
    assert login(client, "frank", USER_PW).status_code == 423
    assert login(client, "admin", ADMIN_PW).status_code == 200  # other accounts are not affected
    client.__exit__(None, None, None)


def test_too_many_attempts_from_one_address(tmp_path):
    app, client, h = admin_client(tmp_path)
    codes = [login(client, f"nobody{i}", "x").status_code for i in range(35)]
    assert 429 in codes
    client.__exit__(None, None, None)


def test_two_factor_login(tmp_path):
    app, client, h = admin_client(tmp_path)
    setup = client.post("/api/auth/2fa/setup", headers=h).json()
    assert setup["qr_svg"].startswith("<svg") and setup["uri"].startswith("otpauth://totp/")
    assert client.post("/api/auth/2fa/enable", json={"code": "000000"}, headers=h).status_code == 422
    r = client.post("/api/auth/2fa/enable", json={"code": totp.now_code(setup["secret"])}, headers=h)
    codes = r.json()["recovery_codes"]
    assert r.status_code == 200 and len(codes) == 8

    first = login(client, "admin", ADMIN_PW).json()
    assert first["mfa_required"] is True
    pending = {"Authorization": f"Bearer {first['token']}"}
    assert client.get("/api/auth/me", headers=pending).status_code == 401
    assert client.post("/api/auth/login/2fa", json={"code": "123456"}, headers=pending).status_code == 401
    assert client.post("/api/auth/login/2fa", json={"code": totp.now_code(setup["secret"])}, headers=pending).status_code == 200
    assert client.get("/api/auth/me", headers=pending).json()["totp_enabled"] is True

    # A recovery code works once
    second = {"Authorization": f"Bearer {login(client, 'admin', ADMIN_PW).json()['token']}"}
    assert client.post("/api/auth/login/2fa", json={"code": codes[0]}, headers=second).status_code == 200
    third = {"Authorization": f"Bearer {login(client, 'admin', ADMIN_PW).json()['token']}"}
    assert client.post("/api/auth/login/2fa", json={"code": codes[0]}, headers=third).status_code == 401

    assert client.post("/api/auth/2fa/disable", json={"password": ADMIN_PW}, headers=pending).status_code == 200
    assert login(client, "admin", ADMIN_PW).json()["mfa_required"] is False
    client.__exit__(None, None, None)


def test_device_list_and_ending_a_device(tmp_path):
    app, client, h = admin_client(tmp_path)
    other = auth_headers(client, "admin", ADMIN_PW)
    devices = client.get("/api/auth/sessions", headers=h).json()
    assert len(devices) >= 2 and sum(d["current"] for d in devices) == 1
    victim = next(d for d in devices if not d["current"])
    assert client.delete(f"/api/auth/sessions/{victim['id']}", headers=h).status_code == 200
    statuses = {client.get("/api/auth/me", headers=x).status_code for x in (h, other)}
    assert 401 in statuses and 200 in statuses
    client.__exit__(None, None, None)


def test_persona_avatar_and_background(tmp_path):
    app, client, h = admin_client(tmp_path)
    r = client.patch("/api/auth/profile", json={"persona_name": "Jay", "persona_description": "A dock worker who owes Mara a favour."}, headers=h)
    assert r.status_code == 200 and r.json()["persona_name"] == "Jay"
    assert client.patch("/api/auth/profile", json={"persona_description": "She is 16 years old"}, headers=h).status_code == 422
    assert client.put("/api/auth/avatar", content=PNG, headers={**h, "content-type": "image/png"}).status_code == 200
    me = client.get("/api/auth/me", headers=h).json()
    assert me["has_avatar"] is True
    assert client.get(f"/api/users/{me['id']}/avatar", headers=h).content.startswith(b"\x89PNG")
    assert client.put("/api/auth/background", content=b"not an image", headers={**h, "content-type": "image/png"}).status_code == 415
    assert client.put("/api/auth/background", content=PNG, headers={**h, "content-type": "image/png"}).status_code == 200
    assert client.get("/api/auth/background", headers=h).status_code == 200
    assert client.put("/api/auth/preferences", json={"bg": "custom", "sound": True}, headers=h).status_code == 200

    cid, chat = _chat(client, h)
    with app.state.session_factory() as db:
        c = db.get(Chat, chat["id"])
        system = build_context(db, c, c.character, 60, persona_name="Jay", persona_description="A dock worker.")[0]["content"]
    assert "The user plays Jay" in system
    client.__exit__(None, None, None)


# ---------- chat tools ----------

def test_regenerate_keeps_versions_and_they_can_be_flipped(tmp_path):
    app, client, h = admin_client(tmp_path)
    cid, chat = _chat(client, h)
    _stream(client, f"/api/chats/{chat['id']}/messages", h, {"content": "Hello"})
    _stream(client, f"/api/chats/{chat['id']}/reply", h, {"mode": "regenerate"})
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    last = msgs[-1]
    assert len(msgs) == 2 and last["variant_count"] == 2 and last["variant_index"] == 1
    r = client.post(f"/api/chats/{chat['id']}/messages/{last['id']}/variant", json={"index": 0}, headers=h)
    assert r.status_code == 200 and r.json()["variant_index"] == 0
    assert client.post(f"/api/chats/{chat['id']}/messages/{last['id']}/variant", json={"index": 5}, headers=h).status_code == 422
    # Regenerate needs a reply of the character at the end
    _stream(client, f"/api/chats/{chat['id']}/messages", h, {"content": "Again"})
    client.delete(f"/api/chats/{chat['id']}/messages/{client.get(f'/api/chats/{chat['id']}', headers=h).json()['messages'][-1]['id']}", headers=h)
    assert client.post(f"/api/chats/{chat['id']}/reply", json={"mode": "regenerate"}, headers=h).status_code == 409
    client.__exit__(None, None, None)


def test_continue_edit_delete_and_rewind(tmp_path):
    app, client, h = admin_client(tmp_path)
    cid, chat = _chat(client, h, greeting="*Rain.* You are late.")
    _stream(client, f"/api/chats/{chat['id']}/reply", h, {"mode": "next"})  # the character goes on
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    assert [m["role"] for m in msgs] == ["assistant", "assistant"]
    _stream(client, f"/api/chats/{chat['id']}/messages", h, {"content": "Sorry, the ferry."})
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    user_msg = msgs[2]
    r = client.patch(f"/api/chats/{chat['id']}/messages/{user_msg['id']}", json={"content": "Sorry, the *bus*."}, headers=h)
    assert r.json()["content"] == "Sorry, the *bus*."
    assert client.delete(f"/api/chats/{chat['id']}/messages/{user_msg['id']}/after", headers=h).json()["removed"] == 1
    _stream(client, f"/api/chats/{chat['id']}/reply", h, {"mode": "next"})  # "edit and resend"
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    assert [m["role"] for m in msgs] == ["assistant", "assistant", "user", "assistant"]
    assert client.delete(f"/api/chats/{chat['id']}/messages/{msgs[0]['id']}", headers=h).status_code == 200
    assert len(client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]) == 3
    client.__exit__(None, None, None)


def test_stop_keeps_the_part_already_written(tmp_path):
    app, client, h = admin_client(tmp_path)
    cid, chat = _chat(client, h)
    job = Job(chat["id"], 1, "self", "send", ReplyOptions(), user_text="Hi")

    async def stop_after_first_piece():
        gen = stream_reply(app.state.settings, job, app.state.session_factory)
        first = await gen.__anext__()
        assert b"delta" in first
        await gen.aclose()  # what happens when the browser closes the connection

    asyncio.run(stop_after_first_piece())
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[1]["content"] and "Streaming works" not in msgs[1]["content"]  # only the first piece
    client.__exit__(None, None, None)


def test_switch_character_in_a_running_chat(tmp_path):
    app, client, h = admin_client(tmp_path)
    mara, chat = _chat(client, h, "Mara", greeting="*Rain.* You are late.")
    iris = client.post("/api/characters", json={"name": "Iris"}, headers=h).json()["id"]
    r = client.patch(f"/api/chats/{chat['id']}", json={"character_id": iris}, headers=h)
    assert r.status_code == 200 and r.json()["character_name"] == "Iris"
    _stream(client, f"/api/chats/{chat['id']}/messages", h, {"content": "Captain?"})
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    assert msgs[0]["character_name"] == "Mara" and msgs[-1]["character_name"] == "Iris"
    with app.state.session_factory() as db:
        c = db.get(Chat, chat["id"])
        context = build_context(db, c, c.character, 60)
    assert "[Mara]: *Rain.* You are late." in json.dumps(context)
    assert "other characters spoke: Mara" in context[0]["content"]
    # Characters of other users that are not public cannot be switched to
    create_user(client, h, "gina")
    gina = auth_headers(client, "gina", USER_PW)
    hidden = client.post("/api/characters", json={"name": "Hidden"}, headers=gina).json()["id"]
    assert client.patch(f"/api/chats/{chat['id']}", json={"character_id": hidden}, headers=h).status_code == 404
    client.__exit__(None, None, None)


# ---------- community, privacy, offsite ----------

def test_likes_and_uses_in_the_community(tmp_path):
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "hank")
    hank = auth_headers(client, "hank", USER_PW)
    a = client.post("/api/characters", json={"name": "Alpha"}, headers=h).json()["id"]
    b = client.post("/api/characters", json={"name": "Beta"}, headers=h).json()["id"]
    for cid in (a, b):
        client.post(f"/api/characters/{cid}/publish", headers=h)
        client.post(f"/api/admin/community/{cid}/review", json={"action": "approve"}, headers=h)
    client.post(f"/api/community/{b}/like", headers=hank)
    client.post(f"/api/community/{b}/like", headers=hank)  # twice counts once
    client.post("/api/chats", json={"character_id": b}, headers=hank)
    listing = client.get("/api/community", headers=hank).json()
    assert [c["name"] for c in listing] == ["Beta", "Alpha"]  # most liked first
    assert listing[0]["likes"] == 1 and listing[0]["liked"] is True and listing[0]["uses"] == 1
    client.delete(f"/api/community/{b}/like", headers=hank)
    after = client.get("/api/community", headers=hank).json()
    assert after[0]["name"] == "Beta" and after[0]["liked"] is False and after[0]["likes"] == 0
    client.__exit__(None, None, None)


def test_privacy_policy_page(tmp_path):
    app, client, h = admin_client(tmp_path)
    assert client.get("/datenschutz").status_code == 503
    (tmp_path / ".datenschutz").write_text("# Datenschutzerklärung\n## Verantwortlicher\nMax", encoding="utf-8")
    assert "<h2>Verantwortlicher</h2>" in client.get("/datenschutz").text
    assert client.get("/api/legal/datenschutz").text.startswith("# Datenschutz")
    client.__exit__(None, None, None)


def test_backup_is_copied_to_the_second_place(tmp_path):
    app, client, h = admin_client(tmp_path)
    (tmp_path / "offsite").mkdir()
    client.put("/api/admin/settings", json={"backup_offsite": True}, headers=h)
    r = client.post("/api/admin/backups/run", headers=h).json()
    assert r["offsite"] and (tmp_path / "offsite" / r["name"]).exists()
    assert client.get("/api/admin/backups-offsite", headers=h).json() == {"configured": True, "writable": True}
    client.__exit__(None, None, None)
