"""1.5.0: the relationship between character and user, and the character assistant."""

import json
import time

from compain.llm import extract_json
from compain.models import Chat
from compain.routes import chats as cm
from compain.routes.chats import _step, build_context

from .test_account_chat import _chat, _stream
from .test_api import USER_PW, auth_headers, create_user
from .test_features import admin_client


def _fake_model(judgement: dict, draft: dict | None = None):
    """A model that answers relationship checks and the character assistant with JSON, and chats with text."""
    calls = []

    async def model(base_url, api_key, model, messages, max_tokens):
        system = messages[0]["content"]
        calls.append(system)
        if "You keep track of how" in system:
            yield "```json\n" + json.dumps(judgement) + "\n```"
        elif "You write characters" in system:
            yield json.dumps(draft or {})
        else:
            yield "*nods* Fine."
    return model, calls


def _wait(cond, seconds=5.0):
    end = time.time() + seconds
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.05)
    return False


def test_extract_json_and_gradual_steps():
    assert extract_json('Sure:\n```json\n{"a": "x}", "b": {"c": 1}}\n```') == {"a": "x}", "b": {"c": 1}}
    assert extract_json("no json here") is None
    assert extract_json('{broken} then {"ok": 2}') == {"ok": 2}
    assert _step(50, 95) == 75 and _step(50, "10") == 25 and _step(50, 60) == 60
    assert _step(90, 400) == 100 and _step(40, "much") == 40 and _step(40, None) == 40


def test_relationship_is_judged_every_few_messages_and_goes_into_the_prompt(tmp_path, monkeypatch):
    model, calls = _fake_model({"trust": 99, "affection": "62", "mood": "curious", "note": "She starts to like you."})
    monkeypatch.setattr(cm, "stream_chat", model)
    app, client, h = admin_client(tmp_path)
    assert client.put("/api/admin/settings", json={"relation_every": 201}, headers=h).status_code == 422
    assert client.put("/api/admin/settings", json={"relation_every": 4}, headers=h).status_code == 200
    _, chat = _chat(client, h, "Mara", greeting="*Rain.* You are late.")
    cid = chat["id"]
    rel = chat["relation"]
    assert rel == {"enabled": True, "set": False, "trust": 50, "affection": 50, "mood": "", "note": "", "new_messages": 1}

    # Not judged yet: nothing about it in the prompt.
    with app.state.session_factory() as db:
        c = db.get(Chat, cid)
        assert "feels about" not in build_context(db, c, c.character, 20)[0]["content"]

    _stream(client, f"/api/chats/{cid}/messages", h, {"content": "Sorry, the storm."})  # 3 messages
    assert not any("You keep track" in c for c in calls)
    _stream(client, f"/api/chats/{cid}/messages", h, {"content": "I brought you tea."})  # 5 messages: due
    assert _wait(lambda: client.get(f"/api/chats/{cid}", headers=h).json()["relation"]["set"])
    rel = client.get(f"/api/chats/{cid}", headers=h).json()["relation"]
    # Trust may move at most 25 points in one check; the number as text is read too.
    assert (rel["trust"], rel["affection"], rel["mood"], rel["note"]) == (75, 62, "curious", "She starts to like you.")
    assert rel["new_messages"] == 0
    judge = [c for c in calls if "You keep track" in c]
    assert len(judge) == 1 and "Mara" in judge[0]

    with app.state.session_factory() as db:
        c = db.get(Chat, cid)
        msgs = build_context(db, c, c.character, 20)
    # The relationship goes right before the reply (not into the system prompt, so the prompt cache holds).
    last = msgs[-1]["content"]
    assert "How Mara feels about the user right now: trust 75/100, affection 62/100, mood: curious." in last
    assert "She starts to like you." in last and "Never mention these numbers." in last
    assert "feels about" not in msgs[0]["content"]


def test_relationship_can_be_set_checked_reset_and_turned_off(tmp_path, monkeypatch):
    model, calls = _fake_model({"trust": 40, "affection": 30, "mood": "hurt", "note": "You lied to her."})
    monkeypatch.setattr(cm, "stream_chat", model)
    app, client, h = admin_client(tmp_path)
    assert client.put("/api/admin/settings", json={"relation_every": 0}, headers=h).status_code == 200
    _, chat = _chat(client, h, "Mara", greeting="Hello.")
    cid = chat["id"]
    for _ in range(3):
        _stream(client, f"/api/chats/{cid}/messages", h, {"content": "Hi."})
    time.sleep(0.2)
    assert not any("You keep track" in c for c in calls)  # 0 = no automatic checks

    rel = client.patch(f"/api/chats/{cid}/relation", json={"trust": 80, "mood": " warm "}, headers=h).json()
    assert (rel["set"], rel["trust"], rel["affection"], rel["mood"]) == (True, 80, 50, "warm")
    assert client.patch(f"/api/chats/{cid}/relation", json={"trust": 101}, headers=h).status_code == 422

    rel = client.post(f"/api/chats/{cid}/relation/check", headers=h).json()
    assert (rel["trust"], rel["affection"], rel["mood"], rel["note"]) == (55, 30, "hurt", "You lied to her.")

    rel = client.delete(f"/api/chats/{cid}/relation", headers=h).json()
    assert (rel["set"], rel["trust"], rel["affection"], rel["mood"], rel["note"]) == (False, 50, 50, "", "")

    client.patch(f"/api/chats/{cid}/relation", json={"trust": 90}, headers=h)
    rel = client.patch(f"/api/chats/{cid}/relation", json={"enabled": False}, headers=h).json()
    assert rel["enabled"] is False and rel["trust"] == 90
    with app.state.session_factory() as db:
        c = db.get(Chat, cid)
        assert "feels about" not in build_context(db, c, c.character, 20)[0]["content"]
    assert client.post(f"/api/chats/{cid}/relation/check", headers=h).status_code == 409

    # Only the owner of the chat.
    create_user(client, h, "bob")
    bob = auth_headers(client, "bob", USER_PW)
    assert client.patch(f"/api/chats/{cid}/relation", json={"trust": 1}, headers=bob).status_code == 404
    assert client.delete(f"/api/chats/{cid}/relation", headers=bob).status_code == 404


def test_unreadable_judgement_is_reported(tmp_path, monkeypatch):
    async def babble(*args, **kwargs):
        yield "She likes you a lot, I think."
    monkeypatch.setattr(cm, "stream_chat", babble)
    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Mara", greeting="Hello.")
    r = client.post(f"/api/chats/{chat['id']}/relation/check", headers=h)
    assert r.status_code == 502 and "could not be read" in r.json()["detail"]
    assert client.get(f"/api/chats/{chat['id']}", headers=h).json()["relation"]["set"] is False


def test_character_assistant_writes_a_draft(tmp_path, monkeypatch):
    draft = {"name": "Vex", "tagline": "Grumpy mercenary with a soft core", "description": "Tall, scarred. " * 3,
             "personality": "Dry humour.", "scenario": "You hire her in a tavern.", "greeting": "*looks up* What?",
             "tags": ["fantasy", "mercenary"], "extra": "ignored"}
    model, calls = _fake_model({}, draft)
    monkeypatch.setattr(cm, "stream_chat", model)
    app, client, h = admin_client(tmp_path)
    r = client.post("/api/characters/assist", json={"idea": "A grumpy mercenary with a soft core", "language": "de"}, headers=h)
    assert r.status_code == 200
    out = r.json()
    assert out["name"] == "Vex" and out["tags"] == "fantasy, mercenary" and "extra" not in out
    assert set(out) == {"name", "tagline", "description", "personality", "greeting", "scenario", "tags"}
    assert "Write every field in German." in calls[-1]
    assert client.get("/api/characters", headers=h).json() == []  # a draft is not saved

    assert client.post("/api/characters/assist", json={"idea": "ab"}, headers=h).status_code == 422
    # The adults-only check runs on the idea and on the draft.
    assert client.post("/api/characters/assist", json={"idea": "a 14-year-old girl"}, headers=h).status_code == 422
    model2, _ = _fake_model({}, {**draft, "description": "She is 15 years old."})
    monkeypatch.setattr(cm, "stream_chat", model2)
    assert client.post("/api/characters/assist", json={"idea": "a young witch"}, headers=h).status_code == 422


def test_character_assistant_reports_an_unreadable_answer(tmp_path, monkeypatch):
    async def babble(*args, **kwargs):
        yield "Here is a nice character: Vex."
    monkeypatch.setattr(cm, "stream_chat", babble)
    app, client, h = admin_client(tmp_path)
    r = client.post("/api/characters/assist", json={"idea": "A grumpy mercenary"}, headers=h)
    assert r.status_code == 502 and "could not be read" in r.json()["detail"]


def test_relationship_comes_along_in_export_and_import(tmp_path):
    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Mara", greeting="Hello.")
    client.patch(f"/api/chats/{chat['id']}/relation", json={"trust": 70, "affection": 20, "mood": "wary", "note": "Not yet."}, headers=h)
    data = client.get(f"/api/export/chat/{chat['id']}", headers=h).json()
    assert data["chat"]["relation"] == {"enabled": True, "set": True, "trust": 70, "affection": 20, "mood": "wary", "note": "Not yet."}
    data["chat"]["relation"]["trust"] = 500  # out of range is clamped
    r = client.post("/api/export/import", content=json.dumps(data), headers=h)
    assert r.status_code == 201
    chats = client.get("/api/chats", headers=h).json()
    new = [c for c in chats if c["id"] != chat["id"]][0]["relation"]
    assert (new["set"], new["trust"], new["affection"], new["mood"], new["note"], new["new_messages"]) == (True, 100, 20, "wary", "Not yet.", 0)
