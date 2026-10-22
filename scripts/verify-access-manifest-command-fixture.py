# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exercise real generated commands with recording protocol targets only.

This does not qualify a Truss native provider, registry, attempt or execution.
"""
from __future__ import annotations

import argparse
import asyncio
import copy
import importlib
import json
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

import weft
from pydantic import MISSING
from umf_access.adoption import TargetIdentity
from umf_access.build.catalog import CatalogBuildError, compile_catalog
from umf_access.manifest_commands import ManifestProgram
from umf_access.native_program import NativeProgram


def verify(root: Path) -> dict[str, Any]:
    sys.path.insert(0, str(root))
    source = json.loads((root / "fixture-input.json").read_text())
    mixed = source["mixed"]
    package = "mixed_sales" if mixed else "manifest_sales"
    query = importlib.import_module(package + ".queries")
    required_name, optional_name = ("set_selected", "set_optional") if mixed else ("deactivate", "deactivate_optional")
    required, optional = getattr(query, required_name), getattr(query, optional_name)
    plan = query._C0
    pins = {variant.pin.kind: variant.pin for variant in plan.variants}
    checks = []

    class Recording:
        def __init__(self, kind: str):
            pin = pins[kind]
            self.current = TargetIdentity(pin.kind, pin.backend_id, pin.backend_version,
                                          pin.target_profile, pin.binding_sha256,
                                          tuple((name, versions[0]) for name, versions in pin.platform))
            self.calls: list[Any] = []
            self.result = object()

        def identity(self) -> TargetIdentity:
            return self.current

        def plan(self, entry: Any, params: Any, *, timeout: Any = None) -> object:
            self.calls.append((entry, params, timeout))
            return self.result

    class AsyncRecording:
        def __init__(self, kind: str):
            self.inner = Recording(kind)
            self.calls = self.inner.calls
            self.result = self.inner.result

        def identity(self) -> TargetIdentity:
            return self.inner.identity()

        async def plan(self, entry: Any, params: Any, *, timeout: Any = None) -> object:
            return self.inner.plan(entry, params, timeout=timeout)

    def refuse(function: Any, target: Recording) -> None:
        try:
            function()
        except (ValueError, TypeError):
            pass
        else:
            raise AssertionError("expected closed refusal")
        assert not target.calls

    values = {"wanted": "actual-id", "after": "actual-value"} if mixed else {"cutoff": 200, "active": True}
    absent = {"after": "actual-value"} if mixed else {"active": True}
    families = ("postgresql", "truss") if mixed else ("truss",)
    for kind in families:
        target = Recording(kind)
        assert required(target, **values) is target.result
        entry, actual, _ = target.calls[0]
        assert actual == values
        assert type(entry.program) is (NativeProgram if kind == "postgresql" else ManifestProgram)
        if kind == "truss":
            assert not hasattr(entry.program, "execute")
            entry.program.verify_original(weft)
            assert json.loads(entry.program.request_json)["parameters"] != actual
        checks.append(kind + ":sync-actual-values")
        for parameters in (absent, values):
            target = Recording(kind)
            assert optional(target, **parameters) is target.result
            assert target.calls[0][1] == parameters
        checks.append(kind + ":optional-presence")
        invalid = dict(values)
        invalid["wanted" if mixed else "cutoff"] = None
        target = Recording(kind)
        refuse(lambda target=target, invalid=invalid: required(target, **invalid), target)
        checks.append(kind + ":invalid-zero-dispatch")
        target = Recording(kind)
        target.current = replace(target.current, binding_sha256="f" * 64)
        refuse(lambda target=target: required(target, **values), target)
        checks.append(kind + ":wrong-target-zero-dispatch")
        target = Recording(kind)
        ambiguous = replace(plan, variants=plan.variants + plan.variants)
        refuse(lambda ambiguous=ambiguous, target=target: ambiguous.run(target, values), target)
        checks.append(kind + ":ambiguous-zero-dispatch")
        for parameters in ({}, {**values, "extra": True}):
            target = Recording(kind)
            refuse(lambda target=target, parameters=parameters: plan.run(target, parameters), target)
        checks.append(kind + ":inventory-zero-dispatch")

    async def asynchronous() -> None:
        for kind in families:
            target = AsyncRecording(kind)
            assert await required(target, **values) is target.result
            assert target.calls[0][1] == values
            checks.append(kind + ":async-actual-values")
    asyncio.run(asynchronous())
    if not mixed:
        for invalid in ({"cutoff": "200", "active": True}, {"cutoff": MISSING, "active": True}, {"cutoff": 200, "active": "yes"}):
            target = Recording("truss")
            refuse(lambda target=target, invalid=invalid: required(target, **invalid), target)
        checks.append("strict-scalars-zero-dispatch")
        entry = plan.variants[0]
        changed = replace(entry.program, bundle_input_digest="f" * 64)
        target = Recording("truss")
        refuse(lambda: replace(plan, variants=(replace(entry, program=changed),)).run(target, values), target)
        checks.append("generated-bundle-zero-dispatch")

    config = json.loads((root / "catalog-config.json").read_text())
    class NoCompiler:
        def __init__(self) -> None:
            self.calls: list[str] = []
        def __getattr__(self, name: str) -> Any:
            self.calls.append(name)
            raise AssertionError("unexpected original compiler call " + name)
    for location in ("request", "registry"):
        bad = copy.deepcopy(config)
        command = next(iter(bad["targets"][-1]["manifestCommands"].values()))
        if location == "request":
            command["request"]["model"]["utf8"] += " "
        else:
            registry = json.loads(command["configuration"])
            registry["actions"][0]["snapshot"]["utf8"] += " "
            command["configuration"] = json.dumps(registry)
        compiler = NoCompiler()
        try:
            compile_catalog(bad, root, compiler)
        except CatalogBuildError as error:
            assert "original pinned documents" in str(error)
        else:
            raise AssertionError("mismatched original accepted")
        assert not compiler.calls
        checks.append(location + ":source-pin-zero-compile")
    model = "Order" if mixed else "Customer"
    (root / "manifest_missing_read.py").write_text(
        f"from umf_access import query\nfrom {package}.models import {model}\n"
        f"@query\ndef needs_original_read():\n    return {model}.objects.limit(2).all()\n"
    )
    missing = copy.deepcopy(config)
    missing["modules"] = ["manifest_missing_read"]
    missing["targets"] = [missing["targets"][-1]]
    missing["targets"][0]["engineCompiler"] = "truss-runtime"
    compiler = NoCompiler()
    try:
        compile_catalog(missing, root, compiler)
    except CatalogBuildError as error:
        assert "original admitted engine SQL" in str(error)
    else:
        raise AssertionError("read declaration accepted without its original request")
    assert not compiler.calls
    checks.append("missing-read-request-zero-compile")
    return {"scope": "source/installed generated protocol controls only; NO native authority or execution qualification",
            "mixed": mixed, "checks": checks}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    print(json.dumps(verify(parser.parse_args().root.resolve()), sort_keys=True))
