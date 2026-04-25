from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .contracts import ModelReply
from .image_utils import image_data_url, image_size

MOONDREAM_POINT_URL = "https://api.moondream.ai/v1/point"


class MoondreamClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = MOONDREAM_POINT_URL,
        timeout_seconds: int = 90,
    ) -> None:
        self.api_key = api_key or os.environ.get("MOONDREAM_API_KEY")
        if not self.api_key:
            raise RuntimeError("MOONDREAM_API_KEY is required")
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds

    def predict_point(
        self,
        model_id: str,
        image_path: Path,
        instruction: str,
        purpose: str,
    ) -> ModelReply:
        width, height = image_size(image_path)
        payload = {
            "image_url": image_data_url(image_path),
            "object": _object_query(instruction),
        }
        raw = self._post(payload)
        raw.setdefault("model", model_id)
        return ModelReply(text=_point_text(raw, width, height), raw=raw)

    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            self.base_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "X-Moondream-Auth": self.api_key,
                "Content-Type": "application/json",
                "User-Agent": "click-eval/0.1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(
                request, timeout=self.timeout_seconds
            ) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Moondream HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Moondream request failed: {exc}") from exc

        return json.loads(body)


def _point_text(raw: dict[str, Any], width: int, height: int) -> str:
    try:
        first_point = raw["points"][0]
        x = float(first_point["x"]) * width
        y = float(first_point["y"]) * height
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise RuntimeError(f"Unexpected Moondream response shape: {raw}") from exc

    return json.dumps(
        {
            "x": x,
            "y": y,
            "reason": "first point returned by Moondream point API",
        }
    )


def _object_query(instruction: str) -> str:
    stripped = instruction.strip().rstrip(".")
    query = re.sub(
        r"^(?:please\s+)?(?:click|tap|press|select|choose|open)\s+(?:on\s+)?",
        "",
        stripped,
        flags=re.IGNORECASE,
    ).strip()
    return query or stripped
