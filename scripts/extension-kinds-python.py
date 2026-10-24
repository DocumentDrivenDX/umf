#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Python entrypoint for the shared generic kind corpus."""
import json
import sys
from umf import Registry, inspect_extension_kinds

results = []
for case in json.load(open(sys.argv[1], encoding="utf-8")):
    registry = Registry()
    for item in case["registrations"]:
        registry.register_package(item["manifest"], kinds=item["kinds"])
    results.append({"name": case["name"], "listing": registry.list_kinds(),
                    "inspection": inspect_extension_kinds(case["document"], registry)})
print(json.dumps(results, ensure_ascii=True))
