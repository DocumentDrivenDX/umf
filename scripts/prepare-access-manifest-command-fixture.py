# SPDX-License-Identifier: MIT OR Apache-2.0
"""Prepare explicit source-pinned catalog inputs after the public Bun generator.

No database, native provider, credential, native database registration or execution is used.
The public generator uses the original in-memory preparation registry.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib
import importlib.metadata
import json
import sys
from pathlib import Path

from umf_access.capture import capture
from umf_access.dsl import render_logical


def prepare(root: Path) -> Path:
    sys.path.insert(0, str(root))
    source = json.loads((root / "fixture-input.json").read_text())
    mixed = source["mixed"]
    original = source["original"]
    package = "mixed_sales" if mixed else "manifest_sales"
    declarations = importlib.import_module("manifest_declarations")
    names = ("set_selected", "set_optional") if mixed else ("deactivate", "deactivate_optional")
    binding = original["binding"] if mixed else {
        "version": "umf.raw-read-binding/0.1", "modelJson": source["model"]["utf8"],
        "modelSha256": source["model"]["sha256"],
        "tables": [{"logical": ["sales", "Customer"], "native": "customers", "key": ["id"],
                    "columns": {"id": "id", "active": "active", "last_seen": "last_seen"}}],
    }
    commands = {}
    for name in names:
        declaration = capture(getattr(declarations, name))
        for index, variant in enumerate(declaration.variants):
            parameters = {}
            for parameter in declaration.parameters:
                if parameter.optional and parameter.name not in variant.presence:
                    continue
                parameters[parameter.name] = (
                    {"string": "done" if parameter.name == "after" else "chosen"} if mixed
                    else {"boolean": False} if parameter.name == "active" else {"integerToken": "100"}
                )
            request = {
                "interfaceVersion": "weft-mutation-compile/0.1.0", "dialect": "weft-mutation/0.1.0",
                "sql": render_logical(variant, binding=binding, owner_bound=True), "parameters": parameters,
                "model": source["model"], "modelPin": source["modelPin"], "action": source["action"],
                "target": {"module": "sales", "element": "order" if mixed else "customer", "key": "pk"},
                "selectionProfile": {"id": "weft.update-selection", "version": "1"},
                "batchSize": 2, "limits": {"maxItems": 3, "maxManifestBytes": 16777216},
            }
            commands[f"{name}:{index}"] = {"configuration": (root / "registry.json").read_text(), "request": request}
    targets = []
    if mixed:
        raw = copy.deepcopy(original)
        reference = importlib.import_module(package + ".actions").SetStatus
        raw["source"].update(action=reference.action, actionPointer=reference.source.action_pointer)
        targets.append({
            "id": "pg-original", "kind": "postgresql", "backendId": "weft-postgresql",
            "backendVersion": "raw-read/0.1", "targetProfile": "weft.raw-read/0.1",
            "platform": [{"name": "postgresql", "versions": ["180006"]}],
            "binding": binding, "nativeActions": [raw], "maxItems": 3,
        })
    targets.append({
        "id": "truss-manifest-original", "kind": "truss", "backendId": "truss.postgresql.runtime",
        "backendVersion": "0.4.41", "targetProfile": "truss-runtime-pg18.6/0.5", "platform": [],
        "binding": binding, "manifestCommands": commands,
    })
    documents = [binding["modelJson"]]
    documents += [item["binding"]["documentJson"] for item in binding.get("nativeColumns", {}).get("sets", [])]
    descriptors = []
    for index, text in enumerate(dict.fromkeys(documents)):
        path = root / "sources" / f"original-{index}.json"
        path.parent.mkdir(exist_ok=True)
        path.write_text(text)
        descriptors.append({"path": str(path.relative_to(root)), "sha256": hashlib.sha256(text.encode()).hexdigest()})
    config = {
        "package": package, "modules": ["manifest_declarations"], "targets": targets,
        "weft": {"distribution": "umf-weft", "version": importlib.metadata.version("umf-weft")}, "umf": {"documents": descriptors},
    }
    path = root / "catalog-config.json"
    path.write_text(json.dumps(config, indent=2) + "\n")
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    print(prepare(parser.parse_args().root.resolve()))
