"""Run unchanged original native search harness with scoped grant qualification."""

import json
import os
import runpy
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
from pg_search_privilege_campaign import qualify
from umf_access.postgres_search import PostgresSearchTarget

out = Path(os.environ["UMF_PRIVILEGE_WORKFLOW_OUT"])
out.mkdir()
original = PostgresSearchTarget.verify
active = False
done = False


def verify(self):
    global active, done
    result = original(self)
    if not active and not done:
        active = True
        try:
            qualify(
                self,
                out.parent,
                out / "grants",
                {
                    "path": os.environ["UMF_PRIVILEGE_SDK_WHEEL"],
                    "sha256": os.environ["UMF_PRIVILEGE_SDK_SHA256"],
                },
            )
        finally:
            active = False
        done = True
    return result


PostgresSearchTarget.verify = verify
try:
    runpy.run_path(
        str(REPO / "python/umf_access/tests/search_e2e.py"),
        run_name="__main__",
    )
    if not done:
        raise RuntimeError(
            "original workflow never reached genuine target verification"
        )
finally:
    PostgresSearchTarget.verify = original
    (out / "workflow-state.json").write_text(
        json.dumps(
            {
                "grantCampaignCompleted": done,
                "verifyHookRestored": PostgresSearchTarget.verify is original,
                "nativeAuthority": False,
                "inventoryComplete": False,
            },
            indent=2,
        )
        + "\n"
    )
