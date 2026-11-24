"""1.3.0: chat export as Markdown and import, card V3 and card export, search over all chats,
bookmarks, and the waiting line of the self-hosted model."""

import asyncio
import base64
import json

from compain.cards import _png_text_chunks, parse_card
from compain.modelqueue import ModelQueue
from compain.models import Chat
from compain.routes.chats import build_context

from .test_account_chat import _chat, _stream
from .test_api import USER_PW, auth_headers, create_user
from .test_features import admin_client, png_with_card


def _talk(client, h, chat_id, text):
    return _stream(client, f"/api/chats/{chat_id}/messages", h, {"content": text})


# ---------- export and import ----------

def test_chat_exports_as_markdown_and_imports_back(tmp_path):
    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Mara", greeting="*Rain.* You are late.", description="A sea captain")
    _talk(client, h, chat["id"], "The **key** is under the boat.")
    full = client.get(f"/api/chats/{chat['id']}", headers=h).json()
    client.patch(f"/api/chats/{chat['id']}/messages/{full['messages'][1]['id']}", json={"important": True, "bookmarked": True}, headers=h)

    md = client.get(f"/api/export/chat/{chat['id']}?format=md", headers=h)
    assert md.status_code == 200 and md.headers["content-type"].startswith("text/markdown")
    assert "attachment" in md.headers["content-disposition"] and ".md" in md.headers["content-disposition"]
    assert "**Mara:**" in md.text and "*Rain.* You are late." in md.text
    assert "The **key** is under the boat." in md.text and "⭐ 🔖" in md.text
    assert client.get(f"/api/export/chat/{chat['id']}?format=pdf", headers=h).status_code == 422

    data = client.get(f"/api/export/chat/{chat['id']}", headers=h).json()
    assert data["chat"]["character_card"]["description"] == "A sea captain"

    # Another user imports the file: the character is created from the copy in the file.
    create_user(client, h, "nora")
    nora = auth_headers(client, "nora", USER_PW)
    r = client.post("/api/export/import", content=json.dumps(data), headers=nora)
    assert r.status_code == 201, r.text
    assert r.json()["chats"] == 1 and r.json()["characters"] == 1
    mine = client.get(f"/api/chats/{r.json()['first_chat_id']}", headers=nora).json()
    assert mine["character_name"] == "Mara" and [m["content"] for m in mine["messages"]] == [m["content"] for m in full["messages"]]
    assert mine["messages"][1]["important"] and mine["messages"][1]["bookmarked"]
    assert mine["unread"] == 0

    # Importing again uses the existing character instead of creating a second one.
    r = client.post("/api/export/import", content=json.dumps(data), headers=nora)
    assert r.json()["characters"] == 0
    assert len([c for c in client.get("/api/characters", headers=nora).json() if c["name"] == "Mara"]) == 1

    # Everything at once, and files that are not exports.
    everything = client.get("/api/export/all", headers=h).json()
    assert client.post("/api/export/import", content=json.dumps(everything), headers=nora).json()["chats"] == 1
    assert client.post("/api/export/import", content=b"not json", headers=nora).status_code == 422
    assert client.post("/api/export/import", content=json.dumps({"format": "other"}), headers=nora).status_code == 422
    client.__exit__(None, None, None)


def test_import_keeps_at_most_ten_important_messages(tmp_path):
    app, client, h = admin_client(tmp_path)
    payload = {"format": "compain-chat-v1", "chat": {"title": "Long", "character": "Iris", "messages": [
        {"role": "user" if i % 2 else "assistant", "content": f"line {i}", "important": True} for i in range(14)
    ] + [{"role": "system", "content": "ignored"}, {"role": "user", "content": "   "}]}}
    r = client.post("/api/export/import", content=json.dumps(payload), headers=h)
    chat = client.get(f"/api/chats/{r.json()['first_chat_id']}", headers=h).json()
    assert len(chat["messages"]) == 14 and chat["important_count"] == 10
    client.__exit__(None, None, None)


# ---------- character cards ----------

def test_v3_card_and_example_dialogue(tmp_path):
    card = {"spec": "chara_card_v3", "spec_version": "3.0", "data": {
        "name": "Vex", "description": "A thief", "personality": "Sly", "first_mes": "*grins*",
        "mes_example": "<START>\n{{user}}: Hi\n{{char}}: *bows*", "tags": ["fantasy"]}}
    fields, _ = parse_card("vex.json", json.dumps(card).encode())
    assert fields["name"] == "Vex" and fields["tags"] == "fantasy"
    assert fields["personality"].startswith("Sly") and "Example dialogue:" in fields["personality"] and "*bows*" in fields["personality"]

    app, client, h = admin_client(tmp_path)
    # A JSON array brings several cards at once.
    many = [{"name": "One"}, {"spec": "chara_card_v2", "data": {"name": "Two"}}]
    r = client.post("/api/characters/import", content=json.dumps(many), headers={**h, "X-Filename": "pack.json"})
    assert r.status_code == 201 and r.json()["count"] == 2
    client.__exit__(None, None, None)


def test_card_export_as_png_and_json_round_trip(tmp_path):
    app, client, h = admin_client(tmp_path)
    png = png_with_card({"spec": "chara_card_v2", "data": {"name": "Mira", "description": "Painter", "first_mes": "Hello.", "tags": ["art"]}})
    cid = client.post("/api/characters/import", content=png, headers={**h, "X-Filename": "mira.png"}).json()["id"]

    r = client.get(f"/api/characters/{cid}/card", headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    chunks = _png_text_chunks(r.content)
    assert list(chunks).count("chara") == 1
    card = json.loads(base64.b64decode(chunks["chara"]))
    assert card["spec"] == "chara_card_v2" and card["data"]["name"] == "Mira" and card["data"]["first_mes"] == "Hello."
    # The exported PNG imports again.
    again = client.post("/api/characters/import", content=r.content, headers={**h, "X-Filename": "Mira.png"})
    assert again.status_code == 201 and again.json()["name"] == "Mira"

    plain = client.post("/api/characters", json={"name": "Nopic"}, headers=h).json()["id"]
    j = client.get(f"/api/characters/{plain}/card", headers=h)
    assert j.headers["content-type"].startswith("application/json") and j.json()["data"]["name"] == "Nopic"
    assert client.get(f"/api/characters/{plain}/card?format=png", headers=h).status_code == 409

    create_user(client, h, "otto")
    otto = auth_headers(client, "otto", USER_PW)
    assert client.get(f"/api/characters/{cid}/card", headers=otto).status_code == 404
    client.__exit__(None, None, None)


# ---------- search over all chats ----------

def test_search_finds_messages_in_all_own_chats_only(tmp_path):
    app, client, h = admin_client(tmp_path)
    _, a = _chat(client, h, "Mara")
    _, b = _chat(client, h, "Iris")
    _talk(client, h, a["id"], "Where is the silver key?")
    _talk(client, h, b["id"], "The SILVER moon rises. 100% sure_thing")

    hits = client.get("/api/chats/search?q=silver", headers=h).json()
    assert {x["chat_id"] for x in hits} == {a["id"], b["id"]}
    assert hits[0]["chat_id"] == b["id"]  # newest first
    assert "SILVER" in hits[0]["snippet"] and hits[0]["character_name"] == "Iris"
    assert client.get("/api/chats/search?q=x", headers=h).json() == []  # too short
    # % and _ are searched as text, not as wildcards.
    assert len(client.get("/api/chats/search?q=0%25 s", headers=h).json()) == 1
    assert client.get("/api/chats/search?q=e_k", headers=h).json() == []

    create_user(client, h, "pia")
    pia = auth_headers(client, "pia", USER_PW)
    assert client.get("/api/chats/search?q=silver", headers=pia).json() == []
    client.__exit__(None, None, None)


# ---------- bookmarks ----------

def test_bookmarks_are_listed_and_never_reach_the_model(tmp_path):
    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Mara")
    _talk(client, h, chat["id"], "Secret bookmark line")
    msgs = client.get(f"/api/chats/{chat['id']}", headers=h).json()["messages"]
    r = client.patch(f"/api/chats/{chat['id']}/messages/{msgs[0]['id']}", json={"bookmarked": True}, headers=h)
    assert r.status_code == 200 and r.json()["bookmarked"] and not r.json()["important"]
    assert client.get("/api/chats", headers=h).json()[0]["bookmark_count"] == 1
    marks = client.get("/api/chats/bookmarks", headers=h).json()
    assert [m["message_id"] for m in marks] == [msgs[0]["id"]] and marks[0]["snippet"] == "Secret bookmark line"
    with app.state.session_factory() as db:
        c = db.get(Chat, chat["id"])
        system = build_context(db, c, c.character, 60)[0]["content"]
    assert "Secret bookmark line" not in system  # only important lines go into the system prompt
    client.patch(f"/api/chats/{chat['id']}/messages/{msgs[0]['id']}", json={"bookmarked": False}, headers=h)
    assert client.get("/api/chats/bookmarks", headers=h).json() == []
    client.__exit__(None, None, None)


# ---------- waiting line ----------

def test_queue_gives_places_in_order_and_frees_slots():
    q = ModelQueue()

    async def run():
        a, b, c = q.join("self"), q.join("self"), q.join("self")
        assert await q.wait_turn(a, 1, 0.1)
        assert not await q.wait_turn(b, 1, 0.3)  # the only slot is taken
        assert q.position(b) == 1 and q.position(c) == 2 and q.position(a) == 0
        assert q.snapshot("self") == {"running": 1, "waiting": 2}
        q.leave(c)  # Stop while waiting
        assert q.snapshot("self")["waiting"] == 1
        q.leave(a)
        q.leave(a)  # twice is harmless
        assert await q.wait_turn(b, 1, 0.5)
        q.leave(b)
        assert q.snapshot("self") == {"running": 0, "waiting": 0}

    asyncio.run(run())


def test_reply_reports_its_status_and_admin_sees_the_queue(tmp_path):
    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Mara")
    events = _talk(client, h, chat["id"], "Hello")
    statuses = [e["status"] for e in events if "status" in e]
    assert statuses == ["thinking"]
    assert events.index({"status": "thinking"}) < next(i for i, e in enumerate(events) if "delta" in e)
    st = client.get("/api/chats/model-status", headers=h).json()
    assert st["state"] == "ok" and st["slots"] == 2 and st["running"] == 0 and st["waiting"] == 0
    overview = client.get("/api/admin/overview", headers=h).json()
    assert overview["model_queue"] == {"running": 0, "waiting": 0, "slots": 2}
    assert client.put("/api/admin/settings", json={"model_slots": 0}, headers=h).status_code == 422
    assert client.put("/api/admin/settings", json={"model_slots": 3}, headers=h).json()["model_slots"] == 3
    client.__exit__(None, None, None)
