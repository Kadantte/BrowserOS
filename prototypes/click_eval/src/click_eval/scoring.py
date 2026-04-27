from __future__ import annotations

import math
import statistics
from collections import defaultdict
from typing import Any

from .contracts import Point

THRESHOLDS = (10, 25, 50)


def score_point(
    task_id: str,
    model_name: str,
    gt: Point | None,
    pred: Point | None,
    image_size: tuple[int, int],
    error: str | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "task_id": task_id,
        "model": model_name,
        "gt_x": gt.x if gt is not None else "",
        "gt_y": gt.y if gt is not None else "",
        "pred_x": "",
        "pred_y": "",
        "dx": "",
        "dy": "",
        "l2": "",
        "normalized_l2": "",
        "error": error or "",
    }
    for threshold in THRESHOLDS:
        row[f"within_{threshold}px"] = ""

    if pred is None:
        return row

    row.update({"pred_x": pred.x, "pred_y": pred.y})
    if gt is None:
        return row

    dx = pred.x - gt.x
    dy = pred.y - gt.y
    l2 = math.hypot(dx, dy)
    diagonal = math.hypot(image_size[0], image_size[1])
    normalized = l2 / diagonal if diagonal else 0.0

    row.update(
        {
            "dx": dx,
            "dy": dy,
            "l2": l2,
            "normalized_l2": normalized,
        }
    )
    for threshold in THRESHOLDS:
        row[f"within_{threshold}px"] = l2 <= threshold

    return row


def summarize_scores(score_rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in score_rows:
        grouped[str(row["model"])].append(row)

    summary: dict[str, Any] = {}
    for model_name, rows in grouped.items():
        distances = [float(row["l2"]) for row in rows if row["l2"] != ""]
        durations = [
            float(row["duration_seconds"])
            for row in rows
            if row.get("duration_seconds") not in {"", None}
        ]
        model_summary: dict[str, Any] = {
            "total": len(rows),
            "scored": len(distances),
            "skipped": sum(1 for row in rows if row.get("skipped") is True),
            "errors": sum(
                1
                for row in rows
                if row.get("error") and row.get("skipped") is not True
            ),
            "mean_l2": statistics.fmean(distances) if distances else None,
            "median_l2": statistics.median(distances) if distances else None,
            "mean_duration_seconds": statistics.fmean(durations)
            if durations
            else None,
            "median_duration_seconds": statistics.median(durations)
            if durations
            else None,
        }
        for threshold in THRESHOLDS:
            key = f"within_{threshold}px"
            hits = sum(1 for row in rows if row.get(key) is True)
            model_summary[f"hit_rate_{threshold}px"] = (
                hits / len(distances) if distances else None
            )
        summary[model_name] = model_summary

    return summary
