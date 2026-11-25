"""1.6.0: email address on accounts, login with username or email, and roles in Server Management."""

from .test_api import ADMIN_PW, USER_PW, auth_headers, create_user, login
from .test_features import admin_client


def test_login_with_username_or_email(tmp_path):
    app, client, h = admin_client(tmp_path)
    r = client.post("/api/admin/users", json={"username": "Nora", "email": " Nora@Example.ORG ", "password": USER_PW}, headers=h)
    assert r.status_code == 201 and r.json()["email"] == "nora@example.org"
    assert login(client, "Nora", USER_PW).status_code == 200
    assert login(client, "nora", USER_PW).status_code == 200  # other case
    assert login(client, "NORA@example.org", USER_PW).status_code == 200
    bad = login(client, "nora@example.org", "wrong-password-123")
    assert bad.status_code == 401 and "email" in bad.json()["detail"]
    assert login(client, "nobody@example.org", USER_PW).status_code == 401
    nora = auth_headers(client, "nora@example.org", USER_PW)
    me = client.get("/api/auth/me", headers=nora).json()
    assert (me["username"], me["email"], me["role"]) == ("Nora", "nora@example.org", "user")


def test_failed_logins_lock_the_account_whichever_name_is_used(tmp_path):
    app, client, h = admin_client(tmp_path)
    client.post("/api/admin/users", json={"username": "nora", "email": "nora@example.org", "password": USER_PW}, headers=h)
    limit = client.get("/api/admin/settings", headers=h).json()["failed_login_limit"]
    for i in range(limit):
        login(client, "nora" if i % 2 else "nora@example.org", "wrong-password-123")
    assert login(client, "nora", USER_PW).status_code == 423
    assert login(client, "nora@example.org", USER_PW).status_code == 423


def test_usernames_and_emails_are_unique_and_checked(tmp_path):
    app, client, h = admin_client(tmp_path)
    client.post("/api/admin/users", json={"username": "nora", "email": "nora@example.org", "password": USER_PW}, headers=h)
    post = lambda **b: client.post("/api/admin/users", json={"password": USER_PW, **b}, headers=h)
    assert post(username="NORA").status_code == 409  # case does not make it new
    assert post(username="other", email="NORA@example.org").status_code == 409
    assert post(username="a@b").status_code == 422  # would look like an email
    assert post(username="x").status_code == 422
    assert post(username="other", email="not-an-address").status_code == 422
    assert post(username="noemail").status_code == 201  # admins may leave the address empty
    assert post(username="noemail2").status_code == 201  # several accounts without an address


def test_own_account_changes_need_the_password(tmp_path):
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "nora")
    create_user(client, h, "bob")
    client.patch("/api/admin/users/3", json={"email": "bob@example.org"}, headers=h)
    nora = auth_headers(client, "nora", USER_PW)
    assert client.patch("/api/auth/account", json={"email": "n@example.org", "current": "wrong"}, headers=nora).status_code == 401
    assert client.patch("/api/auth/account", json={"email": "bob@example.org", "current": USER_PW}, headers=nora).status_code == 409
    assert client.patch("/api/auth/account", json={"username": "Bob", "current": USER_PW}, headers=nora).status_code == 409
    r = client.patch("/api/auth/account", json={"username": "Nora Night", "email": "N@Example.org", "current": USER_PW}, headers=nora)
    assert r.status_code == 200 and r.json() == {"username": "Nora Night", "email": "n@example.org"}
    assert login(client, "Nora Night", USER_PW).status_code == 200
    assert login(client, "n@example.org", USER_PW).status_code == 200
    assert login(client, "nora", USER_PW).status_code == 401
    r = client.patch("/api/auth/account", json={"email": "", "current": USER_PW}, headers=nora)
    assert r.json()["email"] == ""
    assert login(client, "n@example.org", USER_PW).status_code == 401


def test_admin_sets_roles_and_account_details(tmp_path):
    app, client, h = admin_client(tmp_path)
    create_user(client, h, "nora")
    users = {u["username"]: u for u in client.get("/api/admin/users", headers=h).json()}
    nid, aid = users["nora"]["id"], users["admin"]["id"]
    assert users["nora"]["role"] == "user" and users["nora"]["email"] == ""
    nora = auth_headers(client, "nora", USER_PW)
    assert client.get("/api/admin/users", headers=nora).status_code == 403

    r = client.patch(f"/api/admin/users/{nid}", json={"role": "admin", "email": "nora@example.org", "username": "nora2"}, headers=h)
    assert r.status_code == 200 and (r.json()["role"], r.json()["email"], r.json()["username"]) == ("admin", "nora@example.org", "nora2")
    assert client.get("/api/admin/users", headers=nora).status_code == 200  # the same session is admin now
    assert client.patch(f"/api/admin/users/{nid}", json={"role": "boss"}, headers=h).status_code == 422
    assert client.patch(f"/api/admin/users/{aid}", json={"role": "user"}, headers=h).status_code == 409  # not yourself
    assert client.patch(f"/api/admin/users/{nid}", json={"username": "admin"}, headers=h).status_code == 409
    # The new admin may take the role away from the old one.
    assert client.patch(f"/api/admin/users/{aid}", json={"role": "user"}, headers=nora).status_code == 200
    assert client.get("/api/admin/users", headers=h).status_code == 403
    roles = [e["detail"] for e in client.get("/api/admin/audit", headers=nora).json() if e["action"] == "user.role"]
    assert roles == ["admin: admin -> user", "nora: user -> admin"]
