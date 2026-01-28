# /// script
# dependencies = ["fastapi", "uvicorn"]
# ///

"""
Webhook trigger for ADW (AI Developer Workflow).

Receives GitHub webhook events and spawns adwPlanBuild.tsx
for new issues. Start with: uv run adws/trigger_webhook.py
"""

import os
import subprocess
import sys
from datetime import datetime, timezone

from fastapi import FastAPI, Header, Request

app = FastAPI()


def log(message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    print(f"[{timestamp}] {message}", flush=True)


@app.post("/webhook")
async def webhook(request: Request, x_github_event: str = Header(default="")):
    body = await request.json()

    # Handle PR review comment events
    if x_github_event in ("pull_request_review_comment", "pull_request_review"):
        pr_number = body.get("pull_request", {}).get("number")
        if pr_number is None:
            log("No PR number found in payload")
            return {"status": "ignored"}

        action = body.get("action", "")
        if action not in ("created", "submitted"):
            log(f"Ignored PR review action: {action}")
            return {"status": "ignored"}

        log(f"PR review comment on PR #{pr_number}, triggering ADW PR Review")

        subprocess.Popen(
            ["npx", "tsx", "adws/adwPrReview.tsx", str(pr_number)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        return {"status": "triggered", "pr": pr_number}

    if x_github_event != "issues":
        log(f"Ignored event: {x_github_event}")
        return {"status": "ignored"}

    action = body.get("action", "")
    if action != "opened":
        log(f"Ignored issues action: {action}")
        return {"status": "ignored"}

    issue_number = body.get("issue", {}).get("number")
    if issue_number is None:
        log("No issue number found in payload")
        return {"status": "ignored"}

    log(f"New issue #{issue_number} detected, triggering ADW workflow")

    subprocess.Popen(
        ["npx", "tsx", "adws/adwPlanBuild.tsx", str(issue_number)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

    return {"status": "triggered", "issue": issue_number}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    log(f"Starting webhook trigger on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
