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
import re
import sys
from datetime import date

# evals-omnizon.vercel.app was DMCA-takedown'd by Vercel (HTTP 451). Every task
# on that site fails grading with "Failed to fetch /finish endpoint".
EXCLUDED_WEBSITES = {"omnizon"}

# Tasks where the eval site itself is broken or otherwise unsolvable for reasons
# unrelated to model capability. See plans/audits/ for evidence.
EXCLUDED_TASKS = {
    # evals-topwork.vercel.app throws Minified React error #185
    # ("Maximum update depth exceeded") on every form submit; the page renders
    # "Application error: a client-side exception has occurred" instead of saving
    # the job post.
    "topwork-1",
    # fly-unified-2 hardcodes `Exp: 12/25` in both the goal text and a jmespath
    # grader criterion (`paymentInfo.expDate`). Freshening the goal alone leaves
    # the grader expecting the original (now-expired) value; freshening both
    # would require monkey-patching agisdk's TaskConfig at runtime, which is too
    # fragile. fly-unified-4 and fly-unified-5 don't have card-exp grader
    # criteria and freshen cleanly.
    "fly-unified-2",
}

# Far-future replacement used by `freshen_goal_dates` when a task's hardcoded
# credit-card expiration is in the past (or expires within the next 6 months).
_FRESH_EXP = "Exp: 12/30"
_EXP_PATTERN = re.compile(r"Exp:\s*(\d{2})/(\d{2})\b")


def freshen_goal_dates(goal: str) -> str:
    """Roll any `Exp: MM/YY` date forward when it's within 6 months of today.

    Several AGISDK tasks (e.g., fly-unified-{2,5,12}) hardcode credit-card
    expirations like `Exp: 12/25`. The eval-site checkout forms reject expired
    cards; once the wall clock passes the hardcoded date, those tasks become
    unsolvable. Two-digit years are interpreted as 20YY.
    """
    today_yyyymm = date.today().year * 12 + date.today().month

    def replace(match: re.Match[str]) -> str:
        mo, yr = int(match.group(1)), int(match.group(2))
        exp_yyyymm = (2000 + yr) * 12 + mo
        if exp_yyyymm <= today_yyyymm + 6:
            return _FRESH_EXP
        return match.group(0)

    return _EXP_PATTERN.sub(replace, goal)


def has_llm_eval(task: dict) -> bool:
    return any(e.get("type") == "llm_boolean" for e in task.get("evals", []))


def main():
    try:
        from agisdk.REAL.tasks import all_tasks
    except ImportError:
        print(
            "Error: agisdk package not installed. Run: pip install agisdk",
            file=sys.stderr,
        )
        sys.exit(1)

    count = 0
    skipped_infeasible = 0
    skipped_llm = 0
    skipped_excluded = 0
    skipped_tasks = 0
    freshened = 0

    for task in all_tasks:
        if not task.get("possible", True):
            skipped_infeasible += 1
            continue

        if has_llm_eval(task):
            skipped_llm += 1
            continue

        task_id = task["id"]
        if task_id in EXCLUDED_TASKS:
            skipped_tasks += 1
            continue

        website = task.get("website", {})
        if website.get("id") in EXCLUDED_WEBSITES:
            skipped_excluded += 1
            continue

        original_goal = task.get("goal", "")
        goal = freshen_goal_dates(original_goal)
        if goal != original_goal:
            freshened += 1
        start_url = website.get("url", "")

        if not start_url or not goal:
            print(f"Warning: Skipping {task_id} — missing url or goal", file=sys.stderr)
            continue

        entry = {
            "query_id": f"agisdk-{task_id}",
            "dataset": "agisdk-real",
            "query": goal,
            "graders": ["agisdk_state_diff"],
            "start_url": start_url,
            "metadata": {
                "original_task_id": task_id,
                "website": website.get("name", ""),
                "category": "agisdk-real",
                "additional": {
                    "agisdk_task_id": task_id,
                    "challenge_type": task.get("challengeType", "action"),
                    "difficulty": task.get("difficulty", "unknown"),
                    "similar_to": website.get("similarTo", ""),
                },
            },
        }

        print(json.dumps(entry))
        count += 1

    print(
        f"Generated {count} tasks (skipped {skipped_infeasible} infeasible, "
        f"{skipped_llm} llm_boolean, {skipped_excluded} excluded sites, "
        f"{skipped_tasks} excluded tasks; freshened {freshened} expired card dates)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
