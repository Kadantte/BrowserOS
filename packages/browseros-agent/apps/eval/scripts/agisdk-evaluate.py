#!/usr/bin/env python3
"""
AGI SDK evaluation helper for BrowserOS eval framework.

Reads JSON from stdin with task_id and env_state, runs the agisdk
evaluator, and outputs the result as JSON to stdout.

Input format:
    {"task_id": "dashdish-1", "env_state": {...}, "model_response": ""}

Output format:
    {"reward": 0.0, "pass": false, "message": "...", "per_criterion": [...]}

NOTE: The agisdk API (WebCloneEvaluator, TaskConfig) needs verification
against the actual installed package version. The imports and method
signatures below are based on the documented API and may need adjustment.
"""

import json
import sys


def main():
    data = json.loads(sys.stdin.read())
    task_id = data["task_id"]
    env_state = data["env_state"]
    model_response = data.get("model_response", "")

    try:
        from agisdk.real import TaskConfig, WebCloneEvaluator
    except ImportError:
        # Fall back to alternative import paths
        try:
            from agisdk import TaskConfig, WebCloneEvaluator
        except ImportError:
            print(
                json.dumps(
                    {
                        "reward": 0,
                        "pass": False,
                        "message": "agisdk package not installed",
                        "per_criterion": [],
                    }
                )
            )
            sys.exit(0)

    try:
        config = TaskConfig(task_id, version="v2")
        evaluator = WebCloneEvaluator(config)
        result = evaluator.evaluate(
            env_state=env_state, model_response=model_response
        )

        reward = getattr(result, "reward", 0.0)
        message = getattr(result, "message", "")
        per_criterion = getattr(result, "per_criterion", [])

        # Serialize per_criterion if it contains non-serializable objects
        try:
            serialized_criteria = [
                {
                    "name": getattr(c, "name", str(c)),
                    "passed": getattr(c, "passed", False),
                    "message": getattr(c, "message", ""),
                }
                if not isinstance(c, dict)
                else c
                for c in per_criterion
            ]
        except (TypeError, AttributeError):
            serialized_criteria = []

        print(
            json.dumps(
                {
                    "reward": float(reward),
                    "pass": float(reward) == 1.0,
                    "message": str(message),
                    "per_criterion": serialized_criteria,
                }
            )
        )

    except Exception as e:
        print(
            json.dumps(
                {
                    "reward": 0,
                    "pass": False,
                    "message": f"Evaluation error: {str(e)}",
                    "per_criterion": [],
                }
            )
        )


if __name__ == "__main__":
    main()
