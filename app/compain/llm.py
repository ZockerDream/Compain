"""Model client. Talks to any OpenAI-compatible chat endpoint, self-hosted or hosted.

If the base URL is "mock", a fixed test reply is streamed instead. Tests and local
runs without a model use this.
"""

import json
from collections.abc import AsyncIterator

import httpx


def build_messages(system_prompt: str, history: list[dict]) -> list[dict]:
    return [{"role": "system", "content": system_prompt}, *history]


async def stream_chat(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
) -> AsyncIterator[str]:
    """Yield text pieces as they arrive from the model."""
    if base_url == "mock":
        for piece in ["*The model answers in a test reply.* ", "Streaming works. ", "Ask again to see it change."]:
            yield piece
        return

    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens, "stream": True}

    # A self-hosted model on a CPU can need minutes before the first word (long story, other requests
    # waiting for the same slot), so the read timeout is generous. Stop still works at any time.
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0].get("delta", {}).get("content")
                except (ValueError, KeyError, IndexError):
                    continue
                if delta:
                    yield delta


def extract_json(text: str) -> dict | None:
    """The first JSON object in a model answer. Models sometimes wrap it in ```json fences or add a sentence."""
    start = text.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        value = json.loads(text[start:i + 1])
                    except ValueError:
                        break
                    return value if isinstance(value, dict) else None
        start = text.find("{", start + 1)
    return None
