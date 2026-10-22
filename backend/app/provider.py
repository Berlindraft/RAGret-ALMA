"""Small schema-independent provider adapter shared by extraction and answers."""

import json
import os
import hashlib
from datetime import datetime, timezone
import httpx
from fastapi import HTTPException

_status = {}


class ProviderUnavailable(HTTPException):
    """Transport failed; callers may show explicitly labeled stored evidence."""


def _status_key():
    provider = os.getenv("AI_PROVIDER", "deepseek")
    prefix = "DEEPSEEK" if provider == "deepseek" else "ALMA"
    return (
        provider,
        os.getenv(prefix + "_MODEL", ""),
        os.getenv("ALMA_API_URL", ""),
        hashlib.sha256(os.getenv(prefix + "_API_KEY", "").encode()).hexdigest(),
    )


def connection_status():
    return _status.get(
        _status_key(),
        {
            "connection_status": "unknown",
            "connection_message": "Connection has not been checked yet.",
        },
    )


def _mark(status, message):
    _status[_status_key()] = dict(
        connection_status=status,
        connection_message=message,
        connection_checked_at=datetime.now(timezone.utc).isoformat(),
    )


async def check_connection():
    """Check authenticated model access without requesting a generated completion."""
    if os.getenv("AI_PROVIDER", "deepseek") != "deepseek":
        return connection_status()
    key = os.getenv("DEEPSEEK_API_KEY")
    if not key:
        _mark("unavailable", "No DeepSeek key is configured.")
        return connection_status()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=8)) as client:
            response = await client.get(
                "https://api.deepseek.com/models",
                headers={"Authorization": "Bearer " + key},
            )
        if response.status_code == 200:
            available = {m["id"] for m in response.json().get("data", [])}
            if os.getenv("DEEPSEEK_MODEL", "deepseek-flash") in available:
                _mark(
                    "connected",
                    "DeepSeek authenticated successfully; the configured model is available.",
                )
            else:
                _mark(
                    "unavailable",
                    "DeepSeek connected, but the configured model is not available for this key.",
                )
        else:
            _mark(
                "unavailable",
                f"DeepSeek connection check returned HTTP {response.status_code}. Check key access and account status.",
            )
    except httpx.RequestError:
        _mark(
            "unavailable",
            "DeepSeek could not be reached. Check the network connection, then retry.",
        )
    except (ValueError, KeyError, TypeError, AttributeError):
        _mark(
            "unavailable", "DeepSeek returned an unexpected connection-check response."
        )
    return connection_status()


async def structured(system, content, schema, validate=None, max_tokens=6500):
    provider = os.getenv("AI_PROVIDER", "deepseek")
    messages = [
        {
            "role": "system",
            "content": system
            + "\nReturn JSON matching this schema: "
            + json.dumps(schema.model_json_schema()),
        },
        {"role": "user", "content": json.dumps(content, ensure_ascii=False)},
    ]
    key = (
        os.getenv("DEEPSEEK_API_KEY")
        if provider == "deepseek"
        else os.getenv("ALMA_API_KEY")
    )
    if not key:
        raise HTTPException(
            503,
            "No model key configured. Add a backend provider key to extract uploaded records.",
        )
    if provider == "deepseek":
        url = "https://api.deepseek.com/chat/completions"
        header, prefix, path = "Authorization", "Bearer ", "choices.0.message.content"
    else:
        url = os.getenv("ALMA_API_URL")
        if not url or not os.getenv("ALMA_REQUEST_TEMPLATE"):
            raise HTTPException(
                503,
                "Configure the exact ALMA endpoint and request template supplied by the organizers.",
            )
        header, prefix, path = (
            os.getenv("ALMA_AUTH_HEADER", "Authorization"),
            os.getenv("ALMA_AUTH_PREFIX", "Bearer "),
            os.getenv("ALMA_RESPONSE_PATH", ""),
        )

    def payload():
        if provider == "deepseek":
            return dict(
                model=os.getenv("DEEPSEEK_MODEL", "deepseek-flash"),
                messages=messages,
                response_format={"type": "json_object"},
                max_tokens=max_tokens,
                temperature=0.1,
                thinking={"type": "disabled"},
            )
        try:
            template = json.loads(os.environ["ALMA_REQUEST_TEMPLATE"])
        except ValueError:
            raise HTTPException(503, "ALMA_REQUEST_TEMPLATE must be valid JSON.")

        def replace(value):
            if isinstance(value, dict):
                return {k: replace(v) for k, v in value.items()}
            if isinstance(value, list):
                return [replace(v) for v in value]
            return (
                {
                    "$messages": messages,
                    "$model": os.getenv("ALMA_MODEL", ""),
                    "$prompt": messages[0]["content"] + "\n" + messages[-1]["content"],
                }.get(value, value)
                if isinstance(value, str)
                else value
            )

        return replace(template)

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(90, connect=8, write=30, pool=10)
        ) as client:
            for attempt in range(2):
                response = await client.post(
                    url, json=payload(), headers={header: prefix + key}
                )
                response.raise_for_status()
                _mark("connected", "The last provider request connected successfully.")
                value = response.json()
                for part in path.split(".") if path else []:
                    value = value[int(part)] if isinstance(value, list) else value[part]
                try:
                    result = schema.model_validate(
                        json.loads(value) if isinstance(value, str) else value
                    )
                    if validate:
                        validate(result)
                    return result.model_dump()
                except (ValueError, TypeError) as exc:
                    if attempt:
                        raise
                    messages.append(
                        {
                            "role": "user",
                            "content": "Validation failed. Repair the JSON and evidence references. "
                            + str(exc)[:800],
                        }
                    )
    except httpx.HTTPStatusError as exc:
        _mark("unavailable", f"Provider returned HTTP {exc.response.status_code}.")
        raise HTTPException(
            502,
            f"The model provider returned HTTP {exc.response.status_code}. Check provider configuration and credit balance.",
        )
    except httpx.ConnectTimeout:
        message = "The provider connection timed out before a response was received. Check the network route to the configured API."
        _mark("unavailable", message)
        raise ProviderUnavailable(504, message)
    except httpx.TimeoutException:
        message = "The provider response timed out. Saved decision evidence is still available."
        _mark("unavailable", message)
        raise ProviderUnavailable(504, message)
    except httpx.RequestError:
        _mark(
            "unavailable",
            "The model provider could not be reached. Check the network connection to the API.",
        )
        raise ProviderUnavailable(
            502, "The model provider could not be reached. Please try again."
        )
    except (ValueError, KeyError, TypeError, IndexError):
        raise HTTPException(
            502,
            "The model returned invalid structured evidence after one repair attempt. No unvalidated result was stored.",
        )
