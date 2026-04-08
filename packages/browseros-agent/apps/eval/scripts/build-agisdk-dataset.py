#!/usr/bin/env python3
"""
Build JSONL dataset for AGI SDK / REAL Bench evaluation.

Reads task definitions from the agisdk package, filters to feasible
action-only tasks (excludes llm_boolean evaluators), and outputs JSONL
to stdout in the BrowserOS eval framework format.

Usage:
    python scripts/build-agisdk-dataset.py > data/agisdk-real.jsonl
"""

import json
import sys


def main():
    try:
        from agisdk.real import TASKS
    except ImportError:
        print(
            "Error: agisdk package not installed. Run: pip install agisdk",
            file=sys.stderr,
        )
        sys.exit(1)

    count = 0
    skipped_infeasible = 0
    skipped_llm = 0

    for task_id, task_config in TASKS.items():
        # Skip infeasible tasks
        if not getattr(task_config, "possible", True):
            skipped_infeasible += 1
            continue

        # Skip tasks that use llm_boolean evaluator (non-deterministic)
        eval_type = getattr(task_config, "eval_type", None) or getattr(
            task_config, "evaluator_type", None
        )
        if eval_type == "llm_boolean":
            skipped_llm += 1
            continue

        # Extract task fields
        website = getattr(task_config, "website", "") or ""
        url = getattr(task_config, "url", "") or getattr(task_config, "start_url", "")
        prompt = getattr(task_config, "prompt", "") or getattr(
            task_config, "instruction", ""
        )
        difficulty = getattr(task_config, "difficulty", "unknown")
        similar_to = getattr(task_config, "similar_to", "")
        category = getattr(task_config, "category", "action")

        if not url or not prompt:
            print(
                f"Warning: Skipping {task_id} — missing url or prompt", file=sys.stderr
            )
            continue

        entry = {
            "query_id": f"agisdk-{task_id}",
            "dataset": "agisdk-real",
            "query": prompt,
            "graders": ["agisdk_state_diff"],
            "start_url": url,
            "metadata": {
                "original_task_id": task_id,
                "website": website,
                "category": "agisdk-real",
                "additional": {
                    "agisdk_task_id": task_id,
                    "challenge_type": "action",
                    "difficulty": str(difficulty),
                    "similar_to": str(similar_to),
                    "eval_type": str(eval_type or "script"),
                },
            },
        }

        print(json.dumps(entry))
        count += 1

    print(
        f"Generated {count} tasks (skipped {skipped_infeasible} infeasible, "
        f"{skipped_llm} llm_boolean)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
