from __future__ import annotations

import json
import math
import re
from typing import Any

from .contracts import ParsedPoint, Point


def parse_point_value(value: Any) -> Point | None:
    if isinstance(value, Point):
        return value

    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return _point_from_numbers(value[0], value[1])

    if isinstance(value, dict):
        if "x" in value and "y" in value:
            return _point_from_numbers(value["x"], value["y"])
        for key in ("point", "click_point", "coordinate", "coordinates"):
            if key in value:
                point = parse_point_value(value[key])
                if point is not None:
                    return point

    return None


def parse_point_response(text: str) -> ParsedPoint:
    obj_text = _first_json_object(text)
    if obj_text is None:
        return ParsedPoint(point=None, error="response did not contain a JSON object")

    try:
        obj = json.loads(obj_text)
    except json.JSONDecodeError as exc:
        return ParsedPoint(point=None, error=f"invalid JSON: {exc.msg}")

    point = parse_point_value(obj)
    if point is None:
        return ParsedPoint(point=None, error="JSON did not contain numeric x/y")

    reason = obj.get("reason") if isinstance(obj, dict) else None
    return ParsedPoint(point=point, reason=str(reason) if reason is not None else None)


def _point_from_numbers(x_value: Any, y_value: Any) -> Point | None:
    try:
        x = float(x_value)
        y = float(y_value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(x) or not math.isfinite(y):
        return None

    return Point(x=x, y=y)


def _first_json_object(text: str) -> str | None:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL)
    if fenced:
        return fenced.group(1)

    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    return None
