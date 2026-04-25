from __future__ import annotations

import csv
import concurrent.futures
import json
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from tqdm import tqdm

from .contracts import ModelReply, ModelSkipped, ModelSpec, Point
from .image_utils import image_size
from .io import load_model_config, load_tasks, write_jsonl
from .parsing import parse_point_response
from .scoring import score_point, summarize_scores
from .viz import annotate_image

PredictPoint = Callable[[ModelSpec, Path, str, str], ModelReply]
OPENROUTER_CANDIDATE_CONCURRENCY = 4


@dataclass(frozen=True)
class RunOptions:
    tasks_path: Path
    models_path: Path
    out_dir: Path
    annotate: bool = True
    fail_fast: bool = False
    limit: int | None = None
    progress: bool = True


def run_eval(options: RunOptions, predict_point: PredictPoint) -> dict[str, object]:
    judge, candidates, config = load_model_config(options.models_path)
    tasks = load_tasks(options.tasks_path)
    if options.limit is not None:
        tasks = tasks[: options.limit]

    options.out_dir.mkdir(parents=True, exist_ok=True)
    _log(
        options,
        f"Loaded {len(tasks)} task(s), {len(candidates)} candidate model(s). "
        f"Output: {options.out_dir}",
    )
    resolved_rows: list[dict[str, object]] = []
    prediction_rows: list[dict[str, object]] = []
    score_rows: list[dict[str, object]] = []
    annotations: dict[str, list[dict[str, object]]] = {}

    task_iter = _progress(options, tasks, desc="Tasks", unit="task")
    for task in task_iter:
        if task.gt_point is not None:
            _log(options, f"[{task.task_id}] Using provided GT")
        elif judge is not None:
            _log(
                options,
                f"[{task.task_id}] Resolving GT with {judge.name} "
                f"({judge.provider}/{judge.model_id})",
            )
        else:
            _log(options, f"[{task.task_id}] Resolving GT")
        try:
            gt_point, resolved = _resolve_ground_truth(task, judge, predict_point)
        except Exception as exc:
            _log(options, f"[{task.task_id}] GT failed: {exc}")
            if options.fail_fast:
                raise
            resolved = dict(task.raw)
            resolved["ground_truth_error"] = str(exc)
            resolved_rows.append(resolved)
            continue

        _log(options, f"[{task.task_id}] GT: ({gt_point.x:.1f}, {gt_point.y:.1f})")
        resolved_rows.append(resolved)
        task_image_size = image_size(task.image_path)

        for model, prediction in _predict_candidates_for_task(
            options, task, candidates, predict_point
        ):
            prediction_rows.append(prediction)
            parsed_point = prediction.get("_point")
            point = parsed_point if isinstance(parsed_point, Point) else None
            score = score_point(
                task.task_id,
                model.name,
                gt_point,
                point,
                task_image_size,
                error=str(prediction.get("error") or ""),
            )
            score["duration_seconds"] = prediction.get("duration_seconds", "")
            score["skipped"] = bool(prediction.get("skipped"))
            score_rows.append(score)
            if point is not None:
                annotations.setdefault(task.task_id, []).append(
                    {
                        "model": model.name,
                        "point": point,
                        "l2": score["l2"] if score["l2"] != "" else None,
                    }
                )

        if options.annotate:
            annotate_image(
                task.image_path,
                options.out_dir / "annotated" / f"{task.task_id}.png",
                gt_point,
                annotations.get(task.task_id, []),
            )

    for row in prediction_rows:
        row.pop("_point", None)

    summary = {
        "tasks": len(tasks),
        "models": [model.name for model in candidates],
        "judge_model": judge.model_id if judge else None,
        "config": {
            key: value
            for key, value in config.items()
            if key not in {"candidate_models", "judge_model"}
        },
        "summary": summarize_scores(score_rows),
        "result_rows": _build_result_rows(score_rows),
    }

    write_jsonl(options.out_dir / "resolved_tasks.jsonl", resolved_rows)
    write_jsonl(options.out_dir / "predictions.jsonl", prediction_rows)
    _write_scores_csv(options.out_dir / "scores.csv", score_rows)
    (options.out_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    _log(options, f"Wrote results to {options.out_dir}")
    return summary


def _predict_candidates_for_task(
    options: RunOptions,
    task,
    candidates: list[ModelSpec],
    predict_point: PredictPoint,
) -> list[tuple[ModelSpec, dict[str, object]]]:
    predictions: list[dict[str, object] | None] = [None] * len(candidates)
    progress_bar = _candidate_progress(options, len(candidates), task.task_id)
    try:
        start = 0
        while start < len(candidates):
            model = candidates[start]
            if model.provider.lower() == "openrouter":
                end = start + 1
                while (
                    end < len(candidates)
                    and candidates[end].provider.lower() == "openrouter"
                ):
                    end += 1
                group_predictions = _predict_openrouter_candidates(
                    options, task, candidates[start:end], predict_point
                )
                for offset, prediction in enumerate(group_predictions):
                    index = start + offset
                    predictions[index] = prediction
                    _log_prediction_status(
                        options, task.task_id, candidates[index], prediction
                    )
                    _update_progress(progress_bar)
                start = end
                continue

            _log_running(options, task.task_id, model)
            prediction = _predict_candidate(task, model, predict_point)
            predictions[start] = prediction
            _log_prediction_status(options, task.task_id, model, prediction)
            _update_progress(progress_bar)
            start += 1
    finally:
        if progress_bar is not None:
            progress_bar.close()

    return [
        (model, prediction)
        for model, prediction in zip(candidates, predictions, strict=True)
        if prediction is not None
    ]


def _predict_openrouter_candidates(
    options: RunOptions,
    task,
    models: list[ModelSpec],
    predict_point: PredictPoint,
) -> list[dict[str, object]]:
    for model in models:
        _log_running(options, task.task_id, model)

    max_workers = min(OPENROUTER_CANDIDATE_CONCURRENCY, len(models))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(_predict_candidate, task, model, predict_point)
            for model in models
        ]
        return [future.result() for future in futures]


def _resolve_ground_truth(task, judge: ModelSpec | None, predict_point: PredictPoint):
    resolved = dict(task.raw)
    if task.gt_point is not None:
        resolved["gt_point"] = task.gt_point.as_list()
        return task.gt_point, resolved

    if judge is None:
        raise RuntimeError(
            f"{task.task_id}: missing gt_point and no judge_model configured"
        )

    reply = predict_point(judge, task.image_path, task.instruction, "ground_truth")
    parsed = parse_point_response(reply.text)
    if parsed.point is None:
        raise RuntimeError(f"{task.task_id}: judge failed: {parsed.error}")

    resolved["gt_point"] = parsed.point.as_list()
    resolved["gt_model"] = judge.model_id
    resolved["gt_reason"] = parsed.reason
    resolved["gt_raw_text"] = reply.text
    return parsed.point, resolved


def _predict_candidate(
    task, model: ModelSpec, predict_point: PredictPoint
) -> dict[str, object]:
    base: dict[str, object] = {
        "task_id": task.task_id,
        "image_path": task.image_path_text,
        "instruction": task.instruction,
        "model": model.name,
        "model_id": model.model_id,
        "point": None,
        "reason": None,
        "raw_text": None,
        "error": None,
        "skipped": False,
        "duration_seconds": None,
    }
    started = time.perf_counter()
    try:
        reply = predict_point(model, task.image_path, task.instruction, "candidate")
    except ModelSkipped as exc:
        base["duration_seconds"] = time.perf_counter() - started
        base["skipped"] = True
        base["error"] = str(exc)
        return base
    except Exception as exc:
        base["duration_seconds"] = time.perf_counter() - started
        base["error"] = str(exc)
        return base

    base["duration_seconds"] = time.perf_counter() - started
    parsed = parse_point_response(reply.text)
    base["raw_text"] = reply.text
    base["reason"] = parsed.reason
    if parsed.point is None:
        base["error"] = parsed.error
        return base

    base["point"] = parsed.point.as_list()
    base["_point"] = parsed.point
    return base


def _log_running(options: RunOptions, task_id: str, model: ModelSpec) -> None:
    _log(
        options,
        f"[{task_id}] Running {model.name} ({model.provider}/{model.model_id})",
    )


def _log_prediction_status(
    options: RunOptions,
    task_id: str,
    model: ModelSpec,
    prediction: dict[str, object],
) -> None:
    duration = prediction.get("duration_seconds")
    duration_text = f" in {float(duration):.2f}s" if isinstance(duration, float) else ""
    if prediction.get("skipped"):
        _log(
            options,
            f"[{task_id}] {model.name} skipped{duration_text}: {prediction['error']}",
        )
    elif prediction.get("error"):
        _log(
            options,
            f"[{task_id}] {model.name} failed{duration_text}: {prediction['error']}",
        )
    else:
        _log(options, f"[{task_id}] {model.name} finished{duration_text}")


def _write_scores_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "task_id",
        "model",
        "gt_x",
        "gt_y",
        "pred_x",
        "pred_y",
        "dx",
        "dy",
        "l2",
        "normalized_l2",
        "within_10px",
        "within_25px",
        "within_50px",
        "duration_seconds",
        "skipped",
        "error",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _build_result_rows(score_rows: list[dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for row in score_rows:
        grouped.setdefault(str(row["model"]), []).append(row)

    result_rows: list[dict[str, object]] = []
    for model_name, rows in grouped.items():
        distances = [float(row["l2"]) for row in rows if row.get("l2") != ""]
        durations = [
            float(row["duration_seconds"])
            for row in rows
            if row.get("duration_seconds") not in {"", None}
        ]
        skipped = sum(1 for row in rows if row.get("skipped") is True)
        errors = sum(
            1 for row in rows if row.get("error") and row.get("skipped") is not True
        )
        status = _result_status(len(rows), len(distances), errors, skipped)
        result_rows.append(
            {
                "model": model_name,
                "status": status,
                "l2": statistics.fmean(distances) if distances else None,
                "duration_seconds": statistics.fmean(durations) if durations else None,
                "reason": _result_reason(rows, status),
            }
        )

    return sorted(result_rows, key=_result_sort_key)


def _result_status(total: int, scored: int, errors: int, skipped: int) -> str:
    if scored == total and errors == 0 and skipped == 0:
        return "ok"
    if errors:
        return "error"
    if skipped:
        return "skipped"
    return "error"


def _result_reason(rows: list[dict[str, object]], status: str) -> str:
    if status == "ok":
        return ""
    for row in rows:
        if status == "skipped" and row.get("skipped") is not True:
            continue
        reason = row.get("error")
        if reason:
            return str(reason)
    return "no score"


def _result_sort_key(row: dict[str, object]) -> tuple[int, float, str]:
    l2 = row.get("l2")
    is_ranked = l2 is not None
    return (
        0 if is_ranked else 1,
        float(l2) if l2 is not None else float("inf"),
        str(row["model"]),
    )


def _progress(options: RunOptions, items, **kwargs):
    if not _show_progress(options):
        return items
    return tqdm(items, dynamic_ncols=True, **kwargs)


def _candidate_progress(options: RunOptions, total: int, task_id: str):
    if not _show_progress(options):
        return None
    return tqdm(
        total=total,
        desc=f"{task_id} candidates",
        unit="call",
        leave=False,
        dynamic_ncols=True,
    )


def _update_progress(progress_bar) -> None:
    if progress_bar is not None:
        progress_bar.update(1)


def _log(options: RunOptions, message: str) -> None:
    if not options.progress:
        return
    if _show_progress(options):
        tqdm.write(message, file=sys.stderr)
        return
    print(message, file=sys.stderr)


def _show_progress(options: RunOptions) -> bool:
    return options.progress and sys.stderr.isatty()
