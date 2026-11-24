"""Public pages: Impressum (legal notice), Datenschutzerklärung (privacy policy) and the changelog.

The Impressum text comes from the file .impressum in the project folder (not in git, it holds
real names and addresses). .impressum-example is the template. Lines starting with "# " become
headings; everything else is shown as written. No HTML is allowed in the file.
"""

import html
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, PlainTextResponse

from ..config import Settings
from ..deps import get_settings

router = APIRouter(tags=["legal"])


def _read(path: str) -> str | None:
    p = Path(path)
    if not p.is_file():
        return None
    text = p.read_text(encoding="utf-8").strip()
    return text or None


def _to_html(text: str) -> str:
    """Very small Markdown: '# ' and '## ' headings, '- ' list items, blank lines between blocks."""
    out: list[str] = []
    in_list = False
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{html.escape(line[2:])}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        if line.startswith("## "):
            out.append(f"<h2>{html.escape(line[3:])}</h2>")
        elif line.startswith("# "):
            out.append(f"<h1>{html.escape(line[2:])}</h1>")
        elif line == "":
            out.append("")
        else:
            out.append(f"<p>{html.escape(line)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


PAGE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Compain</title>
<link rel="stylesheet" href="/static/style.css">
<style>
  .legal {{ max-width: 760px; margin: 40px auto; padding: 32px; }}
  .legal h1 {{ font-size: 30px; margin-bottom: 18px; }}
  .legal h2 {{ font-size: 19px; margin: 22px 0 8px; }}
  .legal p {{ margin: 4px 0; line-height: 1.6; }}
  .legal ul {{ margin: 6px 0 6px 20px; padding: 0; }}
  .legal .back {{ display: inline-block; margin-top: 26px; }}
</style></head>
<body><main class="card legal">{body}<a class="btn back" href="/">← Compain</a></main>
<script>try{{var p=JSON.parse(localStorage.getItem("compain-prefs")||"{{}}");if(p.palette)document.documentElement.setAttribute("data-palette",p.palette);if(p.mode&&p.mode!=="system")document.documentElement.setAttribute("data-mode",p.mode);}}catch(e){{}}</script>
</body></html>"""


@router.get("/impressum", response_class=HTMLResponse)
def impressum_page(settings: Settings = Depends(get_settings)):
    text = _read(settings.impressum_file)
    if text is None:
        body = ("<h1>Impressum</h1><p>Das Impressum ist noch nicht eingerichtet. "
                "Der Betreiber muss die Datei <code>.impressum</code> anlegen (Vorlage: <code>.impressum-example</code>).</p>")
        return HTMLResponse(PAGE.format(title="Impressum", body=body), status_code=503)
    return HTMLResponse(PAGE.format(title="Impressum", body=_to_html(text)))


@router.get("/api/legal/impressum", response_class=PlainTextResponse)
def impressum_text(settings: Settings = Depends(get_settings)):
    text = _read(settings.impressum_file)
    return PlainTextResponse(text or "", status_code=200 if text else 404)


@router.get("/datenschutz", response_class=HTMLResponse)
def privacy_page(settings: Settings = Depends(get_settings)):
    text = _read(settings.datenschutz_file)
    if text is None:
        body = ("<h1>Datenschutzerklärung</h1><p>Die Datenschutzerklärung ist noch nicht eingerichtet. "
                "Der Betreiber muss die Datei <code>.datenschutz</code> anlegen (Vorlage: <code>.datenschutz-example</code>).</p>")
        return HTMLResponse(PAGE.format(title="Datenschutz", body=body), status_code=503)
    return HTMLResponse(PAGE.format(title="Datenschutz", body=_to_html(text)))


@router.get("/api/legal/datenschutz", response_class=PlainTextResponse)
def privacy_text(settings: Settings = Depends(get_settings)):
    text = _read(settings.datenschutz_file)
    return PlainTextResponse(text or "", status_code=200 if text else 404)


@router.get("/changelog", response_class=HTMLResponse)
def changelog_page(settings: Settings = Depends(get_settings)):
    text = _read(settings.changelog_file) or "# Changelog\n\nNo changelog found."
    return HTMLResponse(PAGE.format(title="Changelog", body=_to_html(text)))


@router.get("/api/changelog", response_class=PlainTextResponse)
def changelog_text(settings: Settings = Depends(get_settings)):
    return PlainTextResponse(_read(settings.changelog_file) or "")
