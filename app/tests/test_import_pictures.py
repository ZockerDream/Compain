"""1.7.0: character lists with pictures and public visibility in the JSON import."""

import base64
import json

import httpx

from compain.routes import export as export_mod

from .test_api import USER_PW, auth_headers
from .test_features import admin_client

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def payload(*chars):
    return json.dumps({"format": "compain-characters-v1", "characters": list(chars)})


def test_data_uri_picture_and_visibility(tmp_path):
    app, client, h = admin_client(tmp_path)
    uri = "data:image/png;base64," + base64.b64encode(PNG).decode()
    r = client.post("/api/export/import", content=payload(
        {"name": "Aiko", "tagline": "t", "visibility": "public", "picture": uri},
        {"name": "Ren", "visibility": "private"}), headers=h)
    assert r.status_code == 201, r.text
    assert (r.json()["characters"], r.json()["pictures"], r.json()["picture_errors"]) == (2, 1, [])
    mine = {c["name"]: c for c in client.get("/api/characters", headers=h).json()}
    assert mine["Aiko"]["visibility"] == "public" and mine["Ren"]["visibility"] == "private"
    assert client.get(f"/api/characters/{mine['Aiko']['id']}/picture", headers=h).content == PNG
    # Importing the same file again creates nothing new.
    assert client.post("/api/export/import", content=payload({"name": "Aiko", "picture": uri}), headers=h).json()["characters"] == 0


def test_users_get_review_and_no_web_pictures(tmp_path):
    app, client, h = admin_client(tmp_path)
    client.post("/api/admin/users", json={"username": "nora", "email": "nora@example.org", "password": USER_PW}, headers=h)
    nora = auth_headers(client, "nora", USER_PW)
    r = client.post("/api/export/import", content=payload(
        {"name": "Mio", "visibility": "public", "picture_url": "https://example.org/a.png"}), headers=nora)
    assert r.status_code == 201 and r.json()["pictures"] == 0
    assert "only admins" in r.json()["picture_errors"][0]
    assert client.get("/api/characters", headers=nora).json()[0]["visibility"] == "pending"


def test_web_pictures_are_fetched_and_checked(tmp_path, monkeypatch):
    app, client, h = admin_client(tmp_path)
    monkeypatch.setattr(export_mod, "_public_host", lambda host: host != "intern.local")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/moved.png":
            return httpx.Response(302, headers={"location": "/ok.png"})
        if request.url.path == "/ok.png":
            return httpx.Response(200, content=PNG)
        if request.url.path == "/to-intern.png":
            return httpx.Response(302, headers={"location": "http://intern.local/x.png"})
        return httpx.Response(200, content=b"<html>not a picture</html>")

    real = httpx.AsyncClient
    monkeypatch.setattr(export_mod.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    r = client.post("/api/export/import", content=payload(
        {"name": "A", "picture_url": "https://pics.example/moved.png"},
        {"name": "B", "picture_url": "https://pics.example/page.html"},
        {"name": "C", "picture_url": "http://intern.local/x.png"},
        {"name": "D", "picture_url": "https://pics.example/to-intern.png"},
        {"name": "E", "picture_url": "file:///etc/passwd"}), headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["characters"] == 5 and body["pictures"] == 1
    errors = " ".join(body["picture_errors"])
    assert "B: not a PNG" in errors and "C: address is not public" in errors
    assert "D: address is not public" in errors and "E: not an http(s) address" in errors


def test_private_addresses_are_not_public():
    assert not export_mod._public_host("localhost")
    assert not export_mod._public_host("127.0.0.1")
    assert not export_mod._public_host("10.0.0.5")
    assert not export_mod._public_host("169.254.169.254")
