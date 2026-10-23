# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed embedded change-discovery parity and source-forgery refusals."""
from __future__ import annotations

import argparse
import copy
import importlib.resources
import json
import os
import shutil
import socket
import subprocess
from pathlib import Path
from unittest.mock import patch

from umf_codegen import GenerationError, discover_table_migration_changes

parser = argparse.ArgumentParser()
parser.add_argument("--corpus", required=True, type=Path)
args = parser.parse_args()
corpus = json.loads(args.corpus.read_text())
checked = 0
refused = 0
native_cli = str(importlib.resources.files('umf').joinpath('_bin', 'umf'))
real_popen = subprocess.Popen
native_launches = []
def only_native_cli(command, *args, **kwargs):
    assert command[0] == native_cli and command[1] == 'codegen', command
    assert kwargs.get('cwd') == str(Path(native_cli).parent), kwargs
    assert command[2:] == ['--capabilities'] or command[2:] == [
        'discover-changes', '--request', '-', '--input-format', 'json', '--output-format', 'wire'
    ], command
    native_launches.append(command)
    return real_popen(command, *args, **kwargs)

with patch.object(subprocess, "Popen", side_effect=only_native_cli), \
     patch.object(shutil, "which", side_effect=AssertionError("executable lookup forbidden")), \
     patch.object(socket, "create_connection", side_effect=AssertionError("external network forbidden")), \
     patch.dict(os.environ, {"PATH": ""}):
    for case in corpus:
        actual = discover_table_migration_changes(case["previous"], case["next"])
        assert actual == case["expected"], case["name"]
        checked += len(actual)
        for which in ("previous", "next"):
            forged = copy.deepcopy(case[which])
            forged["source"]["utf8"] += " "
            try:
                discover_table_migration_changes(
                    forged if which == "previous" else case["previous"],
                    forged if which == "next" else case["next"],
                )
            except GenerationError as error:
                assert error.code == "TABLE_DEPLOYMENT_UNSUPPORTED", error.code
            else:
                raise AssertionError("forged source bundle admitted: " + which)
            refused += 1

    for malformed in ({}, {"bundleDigest": "0" * 64, "source": {"utf8": "{}"}}):
        try:
            discover_table_migration_changes(malformed, corpus[0]["next"])
        except GenerationError:
            pass
        else:
            raise AssertionError("malformed deployment bundle admitted")
        refused += 1

assert native_launches
print(json.dumps({"cases": len(corpus), "candidateParity": checked,
                  "forgedOrMalformedRefusals": refused,
                  "externalJavascriptProcesses": "forbidden", "nativeCliLaunches": len(native_launches)}))
