"""Help: support tickets.

Rules:
- Every user can open tickets, sees only their own and can answer, close and reopen them.
- Admins see all tickets, answer them, write internal notes (never shown to the user), change status,
  priority, category and who takes care of it, and can delete tickets.
- Status: open (waits for an admin), in_progress, answered (waits for the user), closed. A user's answer
  reopens an answered or closed ticket; an admin's answer marks it answered.
- Both sides get a live event and an unread marker when the other side writes.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..deps import as_utc, current_user, get_db, require_admin
from ..models import AuditLog, Ticket, TicketMessage, User, utcnow

router = APIRouter(prefix="/api/tickets", tags=["help"])

CATEGORIES = ("question", "bug", "idea", "account", "other")
PRIORITIES = ("low", "normal", "high")
STATUSES = ("open", "in_progress", "answered", "closed")
MAX_OPEN_PER_USER = 10
MAX_TEXT = 5000


class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    category: str = "question"
    content: str = Field(min_length=1, max_length=MAX_TEXT)


class TicketPost(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_TEXT)
    internal: bool = False  # admins only: a note the user never sees
    status: str | None = None  # admins only: set a status with the answer (for example "closed")


class TicketPatch(BaseModel):
    status: str | None = None
    priority: str | None = None
    category: str | None = None
    assigned_to: int | None = None
    unassign: bool = False


def _name(u: User | None) -> str:
    if u is None:
        return "Deleted user"
    return u.display_name or u.username


def _after(t: datetime | None, mark: datetime | None) -> bool:
    return mark is None or (t is not None and as_utc(t) > as_utc(mark))


def _unread(t: Ticket, for_admin: bool) -> bool:
    if for_admin:
        return any(not m.from_admin and _after(m.created_at, t.admin_read_at) for m in t.messages)
    return any(m.from_admin and not m.internal and _after(m.created_at, t.user_read_at) for m in t.messages)


def ticket_out(db: DbSession, t: Ticket, viewer: User, with_messages: bool = False) -> dict:
    admin_view = viewer.role == "admin"
    visible = [m for m in t.messages if admin_view or not m.internal]
    last = visible[-1] if visible else None
    assignee = db.get(User, t.assigned_to) if t.assigned_to else None
    out = {
        "id": t.id,
        "subject": t.subject,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "user_id": t.user_id,
        "user_name": _name(t.user),
        "mine": t.user_id == viewer.id,
        "assigned_to": t.assigned_to,
        "assigned_name": _name(assignee) if assignee else None,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "message_count": len(visible),
        "last_message": last.content[:160] if last else "",
        "last_from_admin": bool(last and last.from_admin),
        # Unread for the person looking: their own tickets count admin answers, admins count user posts.
        "unread": _unread(t, for_admin=admin_view and t.user_id != viewer.id),
    }
    if with_messages:
        authors = {u.id: u for u in db.query(User).filter(User.id.in_({m.author_id for m in visible if m.author_id})).all()}
        out["messages"] = [
            {
                "id": m.id,
                "content": m.content,
                "from_admin": m.from_admin,
                "internal": m.internal,
                "author_name": _name(authors.get(m.author_id)) if m.author_id else "Deleted user",
                "mine": m.author_id == viewer.id,
                "created_at": m.created_at.isoformat(),
            }
            for m in visible
        ]
    return out


def _get(db: DbSession, ticket_id: int, user: User) -> Ticket:
    t = db.get(Ticket, ticket_id)
    # Someone else's ticket looks like a missing one, so ids reveal nothing.
    if t is None or (t.user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Ticket not found")
    return t


async def notify(request: Request, db: DbSession, owner_id: int, ticket_id: int) -> None:
    hub = getattr(request.app.state, "hub", None)
    if hub is None:
        return
    targets = {owner_id} | {u.id for u in db.query(User).filter(User.role == "admin", User.active.is_(True)).all()}
    for uid in targets:
        try:
            await hub.publish(uid, {"type": "tickets", "id": ticket_id})
        except Exception:
            pass


@router.get("")
def list_tickets(
    scope: str = Query("mine", pattern="^(mine|all)$"),
    status: str | None = None,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    q = db.query(Ticket)
    if scope == "all":
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Admins only")
    else:
        q = q.filter(Ticket.user_id == user.id)
    if status:
        if status == "active":
            q = q.filter(Ticket.status != "closed")
        elif status in STATUSES:
            q = q.filter(Ticket.status == status)
    rows = q.order_by(Ticket.updated_at.desc()).limit(500).all()
    return [ticket_out(db, t, user) for t in rows]


@router.get("/summary")
def summary(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Counts for the badge in the navigation."""
    own = db.query(Ticket).filter(Ticket.user_id == user.id).all()
    out = {"unread": sum(1 for t in own if _unread(t, for_admin=False)), "open": sum(1 for t in own if t.status != "closed")}
    if user.role == "admin":
        active = db.query(Ticket).filter(Ticket.status != "closed").all()
        out["admin_waiting"] = sum(1 for t in active if t.status == "open")
        out["admin_unread"] = sum(1 for t in active if t.user_id != user.id and _unread(t, for_admin=True))
    return out


@router.get("/admins")
def admins(_: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    rows = db.query(User).filter(User.role == "admin", User.active.is_(True)).order_by(User.username).all()
    return [{"id": u.id, "name": _name(u)} for u in rows]


@router.post("", status_code=201)
async def create_ticket(body: TicketIn, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown category")
    if not body.subject.strip() or not body.content.strip():
        raise HTTPException(status_code=422, detail="Subject and message are needed")
    open_count = db.query(Ticket).filter(Ticket.user_id == user.id, Ticket.status != "closed").count()
    if open_count >= MAX_OPEN_PER_USER:
        raise HTTPException(status_code=409, detail=f"Limit: {MAX_OPEN_PER_USER} open tickets. Close one first.")
    now = utcnow()
    t = Ticket(user_id=user.id, subject=body.subject.strip(), category=body.category, status="open",
               created_at=now, updated_at=now, user_read_at=now)
    t.messages.append(TicketMessage(author_id=user.id, from_admin=False, content=body.content.strip(), created_at=now))
    db.add(t)
    db.commit()
    db.refresh(t)
    await notify(request, db, t.user_id, t.id)
    return ticket_out(db, t, user, with_messages=True)


@router.get("/{ticket_id}")
def get_ticket(ticket_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    t = _get(db, ticket_id, user)
    now = utcnow()
    if t.user_id == user.id:
        t.user_read_at = now
    if user.role == "admin" and t.user_id != user.id:
        t.admin_read_at = now
    db.commit()
    return ticket_out(db, t, user, with_messages=True)


@router.post("/{ticket_id}/messages", status_code=201)
async def post_message(ticket_id: int, body: TicketPost, request: Request, user: User = Depends(current_user),
                       db: DbSession = Depends(get_db)):
    t = _get(db, ticket_id, user)
    text = body.content.strip()
    if not text:
        raise HTTPException(status_code=422, detail="The message is empty")
    is_admin = user.role == "admin"
    # An admin writing in their own ticket writes as the user who asked.
    as_admin = is_admin and t.user_id != user.id
    if body.internal and not as_admin:
        raise HTTPException(status_code=403, detail="Only admins can write internal notes")
    if body.status is not None and (not as_admin or body.status not in STATUSES):
        raise HTTPException(status_code=422, detail="Status can't be set here")
    now = utcnow()
    t.messages.append(TicketMessage(author_id=user.id, from_admin=as_admin, internal=body.internal, content=text, created_at=now))
    if not body.internal:
        if as_admin:
            t.status = body.status or "answered"
            t.admin_read_at = now
            if t.assigned_to is None:
                t.assigned_to = user.id
        else:
            if t.status in ("answered", "closed"):
                t.status = "open"
            t.user_read_at = now
        t.updated_at = now
    elif body.status:
        t.status = body.status
    if as_admin:
        db.add(AuditLog(user_id=user.id, action="ticket.note" if body.internal else "ticket.answer", detail=f"#{t.id}"))
    db.commit()
    db.refresh(t)
    await notify(request, db, t.user_id, t.id)
    return ticket_out(db, t, user, with_messages=True)


@router.patch("/{ticket_id}")
async def update_ticket(ticket_id: int, body: TicketPatch, request: Request, user: User = Depends(current_user),
                        db: DbSession = Depends(get_db)):
    t = _get(db, ticket_id, user)
    is_admin = user.role == "admin"
    if not is_admin:
        # The owner can only close or reopen.
        if body.priority is not None or body.category is not None or body.assigned_to is not None or body.unassign:
            raise HTTPException(status_code=403, detail="Admins only")
        if body.status not in ("open", "closed"):
            raise HTTPException(status_code=422, detail="You can close or reopen a ticket")
        if body.status == "open" and t.status == "closed":
            if db.query(Ticket).filter(Ticket.user_id == user.id, Ticket.status != "closed").count() >= MAX_OPEN_PER_USER:
                raise HTTPException(status_code=409, detail=f"Limit: {MAX_OPEN_PER_USER} open tickets. Close one first.")
    changes = []
    if body.status is not None:
        if body.status not in STATUSES:
            raise HTTPException(status_code=422, detail="Unknown status")
        if body.status != t.status:
            changes.append(f"status {t.status}->{body.status}")
            t.status = body.status
    if body.priority is not None:
        if body.priority not in PRIORITIES:
            raise HTTPException(status_code=422, detail="Unknown priority")
        t.priority = body.priority
        changes.append(f"priority {body.priority}")
    if body.category is not None:
        if body.category not in CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown category")
        t.category = body.category
        changes.append(f"category {body.category}")
    if body.unassign:
        t.assigned_to = None
        changes.append("unassigned")
    elif body.assigned_to is not None:
        target = db.get(User, body.assigned_to)
        if target is None or target.role != "admin":
            raise HTTPException(status_code=422, detail="Tickets can only be given to admins")
        t.assigned_to = target.id
        changes.append(f"assigned #{target.id}")
    t.updated_at = utcnow()
    if is_admin and changes:
        db.add(AuditLog(user_id=user.id, action="ticket.update", detail=f"#{t.id} " + ", ".join(changes)))
    db.commit()
    db.refresh(t)
    await notify(request, db, t.user_id, t.id)
    return ticket_out(db, t, user, with_messages=True)


@router.delete("/{ticket_id}", status_code=204)
async def delete_ticket(ticket_id: int, request: Request, admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    t = _get(db, ticket_id, admin)
    owner_id = t.user_id
    db.delete(t)
    db.add(AuditLog(user_id=admin.id, action="ticket.delete", detail=f"#{ticket_id}"))
    db.commit()
    await notify(request, db, owner_id, ticket_id)
