#!/usr/bin/env python3
"""Call the sealed campaign runner's installed_cohort_snapshot in-place."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, pathlib, sys

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--runner", required=True, type=pathlib.Path)
    p.add_argument("--output", required=True, type=pathlib.Path)
    p.add_argument("--expected-runner-sha256", required=True)
    args = p.parse_args()
    raw = args.runner.read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.expected_runner_sha256:
        raise RuntimeError("runner bytes differ from source-seal pin")
    sys.path.insert(0, str(args.runner.parent))
    spec = importlib.util.spec_from_file_location("g03_sealed_campaign_runner", args.runner)
    if spec is None or spec.loader is None: raise RuntimeError("cannot load sealed campaign runner")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    snapshot = module.installed_cohort_snapshot()
    canonical = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(canonical) > 8 * 1024 * 1024: raise RuntimeError("installed snapshot exceeds 8 MiB")
    if not isinstance(snapshot, dict) or set(snapshot) != {"packages", "modules", "python", "limits"}:
        raise RuntimeError("sealed snapshot schema differs from reviewed runner")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("xb") as f:
        f.write(canonical + b"\n"); f.flush()
        import os; os.fsync(f.fileno())
    print(json.dumps({"profile":"umf.g03-installed-cohort-snapshot/1",
        "runnerSha256":args.expected_runner_sha256,"snapshotSha256":hashlib.sha256(canonical).hexdigest(),
        "snapshotBytes":len(canonical),"canonical":True,"snapshotPath":str(args.output)},
        sort_keys=True,separators=(",",":")))
    return 0

if __name__ == "__main__": raise SystemExit(main())
