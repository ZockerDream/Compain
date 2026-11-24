"""Tests for the help tickets: ownership, admin answers, internal notes, status flow, unread markers, limits."""

from .test_api import ADMIN_PW, USER_PW, auth_headers, client, create_user  # noqa: F401  (client is a fixture)


def setup(client):
    admin = auth_headers(client, "admin", ADMIN_PW)
    create_user(client, admin, "ann")
    create_user(client, admin, "ben")
    return admin, auth_headers(client, "ann", USER_PW), auth_headers(client, "ben", USER_PW)


def new_ticket(client, h, subject="Reply stops early", content="The reply ends **mid sentence**."):
    r = client.post("/api/tickets", json={"subject": subject, "category": "bug", "content": content}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_user_sees_only_own_tickets_admin_sees_all(client):
    admin, ann, ben = setup(client)
    t = new_ticket(client, ann)
    assert t["status"] == "open" and t["messages"][0]["content"].startswith("The reply")
    assert [x["id"] for x in client.get("/api/tickets", headers=ann).json()] == [t["id"]]
    assert client.get("/api/tickets", headers=ben).json() == []
    assert client.get(f"/api/tickets/{t['id']}", headers=ben).status_code == 404
    assert client.post(f"/api/tickets/{t['id']}/messages", json={"content": "hi"}, headers=ben).status_code == 404
    assert client.get("/api/tickets?scope=all", headers=ben).status_code == 403
    assert [x["id"] for x in client.get("/api/tickets?scope=all", headers=admin).json()] == [t["id"]]


def test_answer_flow_unread_and_internal_notes(client):
    admin, ann, _ = setup(client)
    t = new_ticket(client, ann)
    tid = t["id"]
    s = client.get("/api/tickets/summary", headers=admin).json()
    assert s["admin_waiting"] == 1 and s["admin_unread"] == 1

    # Internal note: the user never sees it, the status stays.
    r = client.post(f"/api/tickets/{tid}/messages", json={"content": "Probably the token cap.", "internal": True}, headers=admin)
    assert r.status_code == 201 and r.json()["status"] == "open"
    assert all(not m["internal"] for m in client.get(f"/api/tickets/{tid}", headers=ann).json()["messages"])
    assert client.post(f"/api/tickets/{tid}/messages", json={"content": "x", "internal": True}, headers=ann).status_code == 403

    # Admin answer: answered, assigned to that admin, unread for the user.
    r = client.post(f"/api/tickets/{tid}/messages", json={"content": "Set the reply length to *Long*."}, headers=admin)
    body = r.json()
    assert body["status"] == "answered" and body["assigned_name"] == "admin"
    assert client.get("/api/tickets/summary", headers=ann).json()["unread"] == 1
    got = client.get(f"/api/tickets/{tid}", headers=ann).json()
    assert [m["from_admin"] for m in got["messages"]] == [False, True]
    assert client.get("/api/tickets/summary", headers=ann).json()["unread"] == 0

    # The user answers: open again. The user closes, then reopens by writing.
    assert client.post(f"/api/tickets/{tid}/messages", json={"content": "Works, thanks"}, headers=ann).json()["status"] == "open"
    assert client.patch(f"/api/tickets/{tid}", json={"status": "closed"}, headers=ann).json()["status"] == "closed"
    assert client.post(f"/api/tickets/{tid}/messages", json={"content": "One more thing"}, headers=ann).json()["status"] == "open"


def test_only_admins_change_priority_assign_and_delete(client):
    admin, ann, _ = setup(client)
    tid = new_ticket(client, ann)["id"]
    assert client.patch(f"/api/tickets/{tid}", json={"priority": "high"}, headers=ann).status_code == 403
    assert client.patch(f"/api/tickets/{tid}", json={"status": "in_progress"}, headers=ann).status_code == 422
    assert client.delete(f"/api/tickets/{tid}", headers=ann).status_code == 403
    admin_id = client.get("/api/tickets/admins", headers=admin).json()[0]["id"]
    r = client.patch(f"/api/tickets/{tid}", json={"priority": "high", "status": "in_progress", "category": "account", "assigned_to": admin_id}, headers=admin)
    assert r.status_code == 200
    b = r.json()
    assert (b["priority"], b["status"], b["category"], b["assigned_to"]) == ("high", "in_progress", "account", admin_id)
    ann_id = client.get("/api/auth/me", headers=ann).json()["id"]
    assert client.patch(f"/api/tickets/{tid}", json={"assigned_to": ann_id}, headers=admin).status_code == 422
    # Answer and close in one step.
    assert client.post(f"/api/tickets/{tid}/messages", json={"content": "Done", "status": "closed"}, headers=admin).json()["status"] == "closed"
    assert client.delete(f"/api/tickets/{tid}", headers=admin).status_code == 204
    assert client.get("/api/tickets", headers=ann).json() == []
    assert any(a["action"] == "ticket.delete" for a in client.get("/api/admin/audit", headers=admin).json())


def test_open_ticket_limit_and_validation(client):
    _, ann, _ = setup(client)
    assert client.post("/api/tickets", json={"subject": "Hi", "category": "bug", "content": "x"}, headers=ann).status_code == 422
    assert client.post("/api/tickets", json={"subject": "Hello", "category": "nope", "content": "x"}, headers=ann).status_code == 422
    ids = [new_ticket(client, ann, subject=f"Question {i}")["id"] for i in range(10)]
    assert client.post("/api/tickets", json={"subject": "Eleven", "category": "bug", "content": "x"}, headers=ann).status_code == 409
    client.patch(f"/api/tickets/{ids[0]}", json={"status": "closed"}, headers=ann)
    new_ticket(client, ann, subject="Now it fits")


def test_deleting_the_account_removes_its_tickets(client):
    admin, ann, _ = setup(client)
    new_ticket(client, ann)
    r = client.post("/api/auth/delete-account", json={"password": USER_PW, "confirm": "ann"}, headers=ann)
    assert r.status_code in (200, 204), r.text
    assert client.get("/api/tickets?scope=all", headers=admin).json() == []
