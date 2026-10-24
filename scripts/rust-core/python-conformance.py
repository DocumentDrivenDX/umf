# SPDX-License-Identifier: MIT OR Apache-2.0
"""Run installed Python-host parity against the frozen 139-case core corpus."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python-conformance.py CURRENT_CONFORMANCE.json")

    import umf
    from umf import Diagnostic, Extension, Registry, read_json_value, schema_validator, validate_document
    from umf._rust import copy_json

    fixture_path = Path(sys.argv[1]).resolve()
    raw = fixture_path.read_bytes()
    corpus = json.loads(raw)
    cases = corpus.get("cases")
    if corpus.get("profile") != "umf.current-conformance/1" or len(cases or []) != 139:
        raise AssertionError("expected the frozen 139-case umf.current-conformance/1 corpus")
    if os.environ.get("UMF_REQUIRE_INSTALLED") == "1":
        source_root = Path.cwd().resolve() / "python" / "src"
        installed = Path(umf.__file__).resolve()
        if installed.is_relative_to(source_root):
            raise AssertionError(f"expected an installed umf-core package, imported {installed}")
        import umf._rust_core as native

        if not native.engine_version().startswith("umf-core-r2"):
            raise AssertionError("installed package is not backed by the R2 Rust extension")

    outcomes = []
    differences = []
    for case in cases:
        registry = Registry()
        spec = case.get("registry")
        if spec is not None:
            def callback(payload, context):
                return [Diagnostic(
                    "BASELINE_CALLBACK",
                    context["path"],
                    f"{context['document']['id']}:{context['scope']}:{payload['kind']}",
                    "warning",
                )]

            registry.register(Extension(
                spec["id"], spec["version"], (spec["scope"],), True, callback
            ))
        actual = validate_document(case["document"], registry)
        result = {
            "valid": actual.valid,
            "complete": actual.complete,
            "diagnostics": [item.__dict__ for item in actual.diagnostics],
        }
        expected = {
            "valid": case["valid"],
            "complete": case["complete"],
            "diagnostics": case["diagnostics"],
        }
        if result != expected:
            differences.append({"id": case["id"], "actual": result, "expected": expected})
        outcomes.append({"id": case["id"], **result})

    if differences:
        report = {
            "status": "fail",
            "cases": len(outcomes),
            "mismatches": len(differences),
            "firstFive": differences[:5],
        }
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
        raise AssertionError(f"Installed Python R2 conformance has {len(differences)} mismatches; first five are in the report above")

    # Public compatibility and callback behavior stay explicit in addition to
    # the 139 vectors, which exercise the generic semantic engine.
    # Preserve the installed predecessor's jsonschema.validator_for profiles,
    # including dialect-specific keywords rather than only accepting the
    # current core's Draft 2020-12 dialect.
    dialect_probes = (
        (
            "Draft 3",
            "http://json-schema.org/draft-03/schema#",
            {"type": "array", "items": [{"type": "string"}], "additionalItems": False},
            ["x", "y"],
            False,
        ),
        (
            "Draft 4",
            "http://json-schema.org/draft-04/schema#",
            {"type": "array", "items": [{"type": "string"}], "additionalItems": False},
            ["x", "y"],
            False,
        ),
        (
            "Draft 6",
            "http://json-schema.org/draft-06/schema#",
            {"contains": {"type": "integer"}},
            ["x"],
            False,
        ),
        (
            "Draft 7",
            "http://json-schema.org/draft-07/schema#",
            {"if": {"type": "string"}, "then": {"minLength": 2}},
            "x",
            False,
        ),
        (
            "Draft 2019-09",
            "https://json-schema.org/draft/2019-09/schema",
            {"contains": {"type": "integer"}, "minContains": 2},
            [1],
            False,
        ),
        (
            "Draft 2020-12",
            "https://json-schema.org/draft/2020-12/schema",
            {"prefixItems": [{"type": "string"}], "items": False},
            ["x", "y"],
            False,
        ),
        (
            "Draft 3 required boolean",
            "http://json-schema.org/draft-03/schema#",
            {"type": "object", "properties": {"x": {"type": "string", "required": True}}},
            {},
            False,
        ),
        (
            "Draft 4 boolean exclusive bound",
            "http://json-schema.org/draft-04/schema#",
            {"type": "number", "minimum": 1, "exclusiveMinimum": True},
            1,
            False,
        ),
        (
            "Draft 2019-09 tuple items",
            "https://json-schema.org/draft/2019-09/schema",
            {"type": "array", "items": [{"type": "string"}], "additionalItems": False},
            ["x", "y"],
            False,
        ),
        (
            "Draft 3 inert later keywords",
            "http://json-schema.org/draft-03/schema#",
            {"type": "array", "prefixItems": [{"type": "string"}], "unevaluatedItems": False},
            ["x", "y"],
            True,
        ),
    )
    for dialect, uri, keywords, instance, expected_valid in dialect_probes:
        validator = schema_validator({"$schema": uri, **keywords})
        if validator.is_valid(instance) is not expected_valid:
            raise AssertionError(f"consumer {dialect} schema_validator dialect/keyword compatibility regressed")
    validator = schema_validator({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "string",
        "x-consumer-note": "inert",
    })
    if not validator.is_valid("value") or validator.is_valid(1):
        raise AssertionError("consumer Draft 7 schema_validator compatibility regressed")
    try:
        schema_validator({"$schema": "urn:unsupported:dialect"})
    except ValueError:
        pass
    else:
        raise AssertionError("unknown consumer schema dialect was accepted")

    copied = copy_json({"left": "a" * 3_000_000, "right": "b" * 3_000_000})
    if len(copied["left"]) + len(copied["right"]) != 6_000_000:
        raise AssertionError("copy_json incorrectly imposed an aggregate 4M text limit")
    valid_document = next(case["document"] for case in cases if case["valid"])
    compact = json.dumps(valid_document, ensure_ascii=False, separators=(",", ":"))
    compact_units = len(compact.encode("utf-16-le", "surrogatepass")) // 2
    source = compact + " " * (4_000_000 - compact_units)
    source_units = len(source.encode("utf-16-le", "surrogatepass")) // 2
    if source_units != 4_000_000 or read_json_value(source) != valid_document:
        raise AssertionError("four-million-unit JSON source did not round-trip")

    def nested(count):
        value = "leaf"
        for _ in range(count):
            value = {"x": value}
        return value

    depth128 = json.loads(json.dumps(valid_document, ensure_ascii=False))
    depth128["modules"][0]["elements"][0]["extensions"]["r2Boundary"] = nested(122)
    validate_document(depth128)
    depth129 = json.loads(json.dumps(valid_document, ensure_ascii=False))
    depth129["modules"][0]["elements"][0]["extensions"]["r2Boundary"] = nested(123)
    try:
        validate_document(depth129)
    except ValueError as error:
        if getattr(error, "code", None) != "LIMIT":
            raise
    else:
        raise AssertionError("depth-129 document was not refused by the Rust limit")

    print(json.dumps({
        "status": "pass",
        "runtime": sys.version.split()[0],
        "package": str(Path(umf.__file__).resolve()),
        "native": getattr(getattr(umf, "_rust_core", None), "engine_version", lambda: None)(),
        "fixture": str(fixture_path),
        "fixtureSha256": hashlib.sha256(raw).hexdigest(),
        "cases": len(outcomes),
        "valid": sum(item["valid"] for item in outcomes),
        "invalid": sum(not item["valid"] for item in outcomes),
        "orderedDiagnostics": True,
        "copiedTextUnits": 6_000_000,
        "sourceTextUnits": source_units,
        "maxDocumentDepth": 128,
        "inventoryExtensionDepth": {"accepted": 122, "refused": 123},
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
