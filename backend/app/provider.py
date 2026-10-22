"""Small schema-independent provider adapter shared by extraction and answers."""

import json
import os
import httpx
from fastapi import HTTPException


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
        async with httpx.AsyncClient(timeout=90) as client:
            for attempt in range(2):
                response = await client.post(
                    url, json=payload(), headers={header: prefix + key}
                )
                response.raise_for_status()
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
        raise HTTPException(
            502,
            f"The model provider returned HTTP {exc.response.status_code}. Check provider configuration and credit balance.",
        )
    except httpx.RequestError:
        raise HTTPException(
            502, "The model provider could not be reached. Please try again."
        )
    except (ValueError, KeyError, TypeError, IndexError):
        raise HTTPException(
            502,
            "The model returned invalid structured evidence after one repair attempt. No unvalidated result was stored.",
        )
