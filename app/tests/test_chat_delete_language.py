"""1.8.0: delete a whole chat, and replies in the language set in the account."""

from compain.models import Chat, Message
from compain.routes import chats as cm

from .test_account_chat import _chat, _stream
from .test_api import USER_PW, auth_headers, create_user
from .test_features import admin_client


def _recording_model():
    seen = []

    async def model(base_url, api_key, model, messages, max_tokens):
        seen.append(messages)
        yield "*nods* Fine."
    return model, seen


def test_a_user_deletes_an_own_chat_completely(tmp_path, monkeypatch):
    model, _ = _recording_model()
    monkeypatch.setattr(cm, "stream_chat", model)
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "nora")
    nora = auth_headers(client, "nora", USER_PW)
    _, chat = _chat(client, nora, "Mara", greeting="*Rain.* You are late.")
    cid = chat["id"]
    _stream(client, f"/api/chats/{cid}/messages", nora, {"content": "Sorry."})
    with app.state.session_factory() as db:
        assert db.query(Message).filter(Message.chat_id == cid).count() == 3
    # Nobody else can delete it, not even another user guessing the number.
    assert client.delete(f"/api/chats/{cid}", headers=h).status_code == 404
    assert client.delete(f"/api/chats/{cid}", headers=nora).status_code == 200
    assert client.get(f"/api/chats/{cid}", headers=nora).status_code == 404
    assert client.get("/api/chats", headers=nora).json() == []
    with app.state.session_factory() as db:
        assert db.get(Chat, cid) is None
        assert db.query(Message).filter(Message.chat_id == cid).count() == 0
    # The character stays.
    assert [c["name"] for c in client.get("/api/characters", headers=nora).json()] == ["Mara"]


def test_automatic_reply_language_follows_the_account(tmp_path, monkeypatch):
    model, seen = _recording_model()
    monkeypatch.setattr(cm, "stream_chat", model)
    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Natasha", description="Natasha, 24, Tattoo-Künstlerin.",
                    greeting="*Schaut kurz auf.* Schuhe aus.")
    cid = chat["id"]
    client.put("/api/auth/preferences", json={"uiLanguage": "en", "language": "auto"}, headers=h)

    _stream(client, f"/api/chats/{cid}/messages", h, {"content": "Hallo, wie geht's?", "language": "auto"})
    system, last = seen[-1][0]["content"], seen[-1][-1]["content"]
    assert "write every reply in English only" in system
    assert system.rstrip().endswith("in another language.")  # the language rule comes last
    assert last.endswith("(Reply in English.)") and last.startswith("Hallo")

    # An explicit choice wins over the interface language.
    _stream(client, f"/api/chats/{cid}/messages", h, {"content": "Hi!", "language": "de"})
    assert "in German only" in seen[-1][0]["content"] and seen[-1][-1]["content"].endswith("(Antworte auf Deutsch.)")

    # The reminder is only for the model; the stored message is unchanged.
    texts = [m["content"] for m in client.get(f"/api/chats/{cid}", headers=h).json()["messages"]]
    assert "Hallo, wie geht's?" in texts and not any("Reply in English" in t for t in texts)


def test_accounts_without_a_language_keep_following_the_user(tmp_path, monkeypatch):
    model, seen = _recording_model()
    monkeypatch.setattr(cm, "stream_chat", model)
    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Mara")
    _stream(client, f"/api/chats/{chat['id']}/messages", h, {"content": "Hi", "language": "auto"})
    assert "Reply in the language the user writes in." in seen[-1][0]["content"]
    assert seen[-1][-1]["content"] == "Hi"


def test_window_moves_in_steps_so_the_prompt_cache_holds(tmp_path):
    """The start of the prompt must stay the same for several replies (llama.cpp prompt cache)."""
    from compain.routes.chats import build_context, window_step

    app, client, h = admin_client(tmp_path)
    _, chat = _chat(client, h, "Mara", greeting="*Rain.* You are late.")
    cid = chat["id"]
    limit, step = 20, window_step(20)
    starts = []
    with app.state.session_factory() as db:
        c = db.get(Chat, cid)
        for i in range(60):
            db.add(Message(chat_id=cid, role="user" if i % 2 == 0 else "assistant", content=f"line {i}"))
            db.commit()
            db.refresh(c)
            msgs = build_context(db, c, c.character, limit)
            starts.append((msgs[1]["content"], len(msgs)))
    firsts = [f for f, _ in starts]
    # The first history message changes only every few messages, never with each one.
    changes = sum(1 for a, b in zip(firsts, firsts[1:]) if a != b)
    assert changes <= 60 // step + 1
    # The window never holds more than the limit (plus the opening line) and never shrinks below limit - step.
    for content, n in starts[limit:]:
        assert limit - step <= n - 1 <= limit + 1
