#!/usr/bin/env python3
"""Rebuild selected-command-only G02 corpus and pin native compiler results."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

if len(sys.argv) != 4:
    raise SystemExit("usage: select_valid_model_corpus.py INPUT.json COMPILER OUTPUT.json")
source_path, compiler, output_path = map(Path, sys.argv[1:])

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

cases = json.loads(source_path.read_text(encoding="utf-8"))
result = []
for case in cases:
    request = json.loads(case["request"])
    binding = request["binding"]
    model = json.loads(binding["modelJson"])
    module = next(m for m in model["modules"] if m["id"] == request["module"])
    command_set = module["extensions"]["umf.tables"]["commands"]
    selected = [c for c in command_set if c["id"] == request["operation"]]
    if len(selected) != 1:
        raise ValueError(f"{case['name']}: selected operation not unique")
    module["extensions"]["umf.tables"]["commands"] = selected
    model_text = compact(model)
    binding["modelJson"] = model_text
    binding["modelSha256"] = hashlib.sha256(model_text.encode("utf-8")).hexdigest()
    request_text = compact(request)
    proc = subprocess.run([str(compiler)], input=request_text, text=True,
                          capture_output=True, check=True, timeout=120)
    expected = json.loads(proc.stdout)
    item = {"name": case["name"], "request": request_text, "expected": expected}
    if case.get("status") != expected["status"]:
        raise AssertionError((case["name"], case.get("status"), expected["status"]))
    result.append(item)
output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n",
                       encoding="utf-8")
print(json.dumps({"cases": len(result), "statuses": {
    status: sum(c["expected"]["status"] == status for c in result)
    for status in sorted({c["expected"]["status"] for c in result})
}}, sort_keys=True))
