#!/usr/bin/env python3
"""Execute exactly one source-owned G03 scenario in a fresh child process."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID


def load_runner(harness: Path):
    lifecycle = harness / "tests/lifecycle"
    sys.path.insert(0, str(lifecycle))
    path = lifecycle / "g03-defaults-native.py"
    spec = importlib.util.spec_from_file_location("g03_full14_scenario_runner", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load sealed campaign runner")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--harness", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--dsn", required=True)
    parser.add_argument("--campaign-id", required=True)
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--scenario", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--max-report-bytes", type=int, required=True)
    args = parser.parse_args()
    if str(UUID(args.campaign_id)) != args.campaign_id:
        raise RuntimeError("campaign identifier is not a canonical UUID")
    runner = load_runner(args.harness)
    fixture_bytes = args.fixture.read_bytes()
    fixture = json.loads(fixture_bytes)
    expected = {entry["caseId"]: entry["scenarios"] for entry in runner.CAMPAIGN_ROSTER}
    if args.case_id not in expected or args.scenario not in expected[args.case_id]:
        raise RuntimeError("scenario request is outside the exact source-owned campaign roster")
    target_case = runner.run_admission_refusal if args.scenario == "admission-refusal" else runner.run_chain
    if args.scenario == "admission-refusal":
        result = target_case(SimpleNamespace(dsn=args.dsn), fixture, args.campaign_id)
    else:
        result = target_case(SimpleNamespace(dsn=args.dsn, scenario=args.scenario),
                             fixture, args.scenario, args.campaign_id)
    if type(result) is not dict:
        raise RuntimeError("source scenario function returned a non-dictionary")
    envelope = {
        "profile": "umf.g03-full14-scenario-child/1",
        "caseId": args.case_id,
        "scenario": args.scenario,
        "campaignId": args.campaign_id,
        "runnerSha256": hashlib.sha256((args.harness / "tests/lifecycle/g03-defaults-native.py").read_bytes()).hexdigest(),
        "fixtureSha256": hashlib.sha256(fixture_bytes).hexdigest(),
        "rawScenario": result,
    }
    raw = (json.dumps(runner.native_json_value(envelope), sort_keys=True,
                      indent=2, ensure_ascii=False) + "\n").encode()
    if args.max_report_bytes < 1 or args.max_report_bytes > 8 * 1024 * 1024:
        raise RuntimeError("scenario report limit is outside the closed 8 MiB per-file cap")
    if len(raw) > args.max_report_bytes:
        raise RuntimeError("single scenario report exceeds the bounded report size")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open("xb") as stream:
        stream.write(raw)
        stream.flush()
        import os
        os.fsync(stream.fileno())
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"scenario child failed: {type(error).__name__}: {error}", file=sys.stderr)
        raise
