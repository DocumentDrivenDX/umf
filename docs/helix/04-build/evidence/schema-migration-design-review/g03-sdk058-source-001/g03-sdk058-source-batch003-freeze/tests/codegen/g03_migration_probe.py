# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed embedded G03 discovery/plan parity; no native lifecycle effects."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import socket
import subprocess
from pathlib import Path
from unittest.mock import patch

from umf_codegen import GenerationError, compile_table_migration, discover_table_migration_changes, verify_table_migration
from umf_codegen._embedded import execute

parser = argparse.ArgumentParser()
parser.add_argument("--corpus", required=True, type=Path)
parser.add_argument("--report", required=True, type=Path)
args = parser.parse_args()
corpus_bytes = args.corpus.read_bytes()
corpus = json.loads(corpus_bytes)
discovery_checked = 0
refused = 0
discovery_refused = 0
raw_wire_null_refused = 0
plan_tamper_refused = 0
compilation_parity = 0
verification_parity = 0
accepted_plan_count = 0
blocked_plan_count = 0
python_none_omission_count = 0

with patch.object(subprocess, "Popen", side_effect=AssertionError("external process forbidden")), \
     patch.object(shutil, "which", side_effect=AssertionError("executable lookup forbidden")), \
     patch.object(socket, "create_connection", side_effect=AssertionError("external network forbidden")), \
     patch.dict(os.environ, {"PATH": ""}):
    for case in corpus["discovery"]:
        if "rawWireRequest" in case:
            try:
                execute(case["rawWireRequest"], 30, operation="discover_changes")
            except GenerationError as error:
                expected = case["expectedError"]
                assert error.code == expected["code"], (case["name"], error.code)
                assert str(error) == expected["message"], (case["name"], str(error))
                if "path" in expected:
                    assert error.path == expected["path"], (case["name"], error.path)
                refused += 1
                raw_wire_null_refused += 1
            else:
                raise AssertionError(case["name"] + ": raw-wire null selector accepted")
            continue
        kwargs = {}
        if "options" in case:
            kwargs["options"] = case["options"]
        try:
            actual = discover_table_migration_changes(case["previous"], case["next"], **kwargs)
        except GenerationError as error:
            expected = case.get("expectedError")
            assert expected is not None, case["name"] + ": unexpected refusal " + error.code
            assert error.code == expected["code"], (case["name"], error.code)
            if "message" in expected:
                assert str(error) == expected["message"], (case["name"], str(error))
            if "path" in expected:
                assert error.path == expected["path"], (case["name"], error.path)
            refused += 1
            discovery_refused += 1
        else:
            assert "expectedError" not in case, case["name"] + ": expected refusal"
            assert actual == case["expected"], case["name"]
            discovery_checked += 1
            if case.get("name") == "null-options-omission":
                assert kwargs.get("options") is None
                python_none_omission_count += 1
    for case in corpus["plans"]:
        request = case["request"]
        actual = compile_table_migration(
            migration_id=request["id"], predecessor=request["predecessor"],
            previous_bundle=request["previous"], next_bundle=request["next"],
            options=request["options"],
        )
        assert actual == case["expected"], case["name"]
        compilation_parity += 1
        if actual.get("status") == "compiled":
            accepted_plan_count += 1
            verified = verify_table_migration(actual["plan"])
            assert verified == actual["plan"], case["name"] + ": verified plan differed"
            verification_parity += 1
            for tamper in case.get("tamper", []):
                try:
                    verify_table_migration(tamper["plan"])
                except GenerationError as error:
                    expected = tamper["expectedError"]
                    assert error.code == expected["code"], (case["name"], tamper["mutation"], error.code)
                    assert str(error) == expected["message"], (case["name"], tamper["mutation"], str(error))
                    if "path" in expected:
                        assert error.path == expected["path"], (case["name"], tamper["mutation"], error.path)
                    refused += 1
                    plan_tamper_refused += 1
                else:
                    raise AssertionError(case["name"] + ": rehashed tamper admitted: " + tamper["mutation"])
        else:
            blocked_plan_count += 1

report = {
    "profile": corpus["profile"],
    "corpusSha256": hashlib.sha256(corpus_bytes).hexdigest(),
    "discoveryParityCases": discovery_checked,
    "compilationParityCases": compilation_parity,
    "verificationParityCases": verification_parity,
    "acceptedPlans": accepted_plan_count,
    "blockedPlans": blocked_plan_count,
    "pythonExplicitNoneOmissionCases": python_none_omission_count,
    "rawWireNullRefusalCases": raw_wire_null_refused,
    "discoveryRefusalCases": discovery_refused,
    "rehashedTamperRefusalCases": plan_tamper_refused,
    "externalJavascriptProcesses": "forbidden",
    "nativeLifecycleReleaseQualified": False,
}
args.report.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report))
