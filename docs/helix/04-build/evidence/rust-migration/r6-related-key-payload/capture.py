#!/usr/bin/env python3
"""Freeze and replay the source-bound R6 related-Key JSON predecessor."""
from __future__ import annotations

import argparse
import decimal
import hashlib
import importlib.util
import json
import sys
import types
from dataclasses import dataclass
from pathlib import Path
from typing import Generic, TypeVar

ROOT = Path(__file__).resolve().parents[6]
EVIDENCE = Path(__file__).resolve().parent
FROZEN = EVIDENCE / "frozen"
SOURCE_PATH = ROOT / "python/umf_access/src/umf_access/related_keys.py"
FROZEN_SOURCE = FROZEN / "related_keys.py"
SOURCE_SHA = "dff3862ac453c553288123436d16e71799b6f43669ee8879f6865b4178bc6324"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def codepoints(value: str) -> list[int]:
    return [ord(character) for character in value]


def install_stubs() -> tuple[type, type]:
    """Supply inert test doubles for downstream package dependencies only."""
    package = types.ModuleType("umf_access")
    package.__path__ = [str(ROOT / "python/umf_access/src/umf_access")]
    sys.modules["umf_access"] = package

    class CodecError(ValueError):
        pass

    class StrictModel:
        pass

    key_module = types.ModuleType("umf_access.types")
    key_module.CodecError = CodecError
    key_module.StrictModel = StrictModel
    sys.modules[key_module.__name__] = key_module

    type_var = TypeVar("K")

    @dataclass(frozen=True)
    class RelatedKeys(Generic[type_var]):
        items: tuple[object, ...]
        truncated: bool

    dsl_module = types.ModuleType("umf_access.dsl")
    dsl_module.RelatedKeys = RelatedKeys
    sys.modules[dsl_module.__name__] = dsl_module

    codec_module = types.ModuleType("umf_access.codec_support")

    def validate_graph(model: type, values: dict[str, object]) -> object:
        for name, field in model.model_fields.items():
            expected = field.annotation
            value = values[name]
            if type(value) is not expected:
                raise CodecError("synthetic key carrier mismatch")
        return model(**values)

    codec_module.validate_graph = validate_graph
    sys.modules[codec_module.__name__] = codec_module

    pydantic_module = types.ModuleType("pydantic")
    pydantic_module.BaseModel = type("BaseModel", (), {})
    sys.modules["pydantic"] = pydantic_module
    return CodecError, StrictModel


CodecError, StrictModel = install_stubs()
spec = importlib.util.spec_from_file_location(
    "umf_access.related_keys_frozen", FROZEN_SOURCE
)
if spec is None or spec.loader is None:
    raise SystemExit("cannot load frozen predecessor source")
related_keys = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = related_keys
spec.loader.exec_module(related_keys)


@dataclass
class Field:
    annotation: type


def key_model(carrier: type, name: str) -> type:
    field_name = "value"
    source = types.SimpleNamespace(
        document_id="related-key-freeze",
        core_version="0.10.0",
        document_sha256="0" * 64,
    )
    identity = {
        "documentId": source.document_id,
        "coreVersion": source.core_version,
        "module": "capture",
        "element": name,
        "key": f"{name}_key",
    }

    def init(self: object, **values: object) -> None:
        self.__dict__.update(values)

    return type(
        name,
        (StrictModel,),
        {
            "__init__": init,
            "KEY_IDENTITY": identity,
            "UMF_SOURCE": source,
            "UMF_KEY": True,
            "UMF_FIELDS": (("capture", name, field_name),),
            "model_fields": {field_name: Field(carrier)},
        },
    )


STRING_KEY = key_model(str, "StringKey")
DECIMAL_KEY = key_model(decimal.Decimal, "DecimalKey")
BOOLEAN_KEY = key_model(bool, "BooleanKey")
INTEGER_KEY = key_model(int, "IntegerKey")


def metadata(model: type, bound: int = 2) -> dict[str, object]:
    return {
        "profile": "pg-related-keys-json/0.1",
        "bound": bound,
        "relationship": {"module": "capture", "id": "parent", "direction": "forward"},
        "key": related_keys.key_descriptor(model),
    }


def ashlar_metadata(model: type, bound: int = 2) -> dict[str, object]:
    descriptor = related_keys.key_descriptor(model)
    source = model.UMF_SOURCE
    identity = {"documentId": source.document_id, "revision": "captured-revision"}
    relation = {"module": "capture", "id": "parent", "direction": "forward"}
    return {
        "profile": "ashlar-related-keys-string/0.1",
        "bound": bound,
        "relationship": relation,
        "key": descriptor,
        "target": {**identity, "module": descriptor["module"], "element": descriptor["record"]},
        "modelPins": [{
            "documentId": source.document_id,
            "revision": identity["revision"],
            "sha256": source.document_sha256,
            "umfVersion": source.core_version,
        }],
        "representation": {
            "kind": "relatedKeys",
            "bound": bound,
            "relationship": {**identity, "module": relation["module"], "relationship": relation["id"]},
            "key": {
                "id": descriptor["key"],
                "fields": [
                    {**identity, **component["field"]}
                    for component in descriptor["components"]
                ],
                "types": [
                    {"family": "string", "facets": {}, "nullable": False}
                    for _ in descriptor["components"]
                ],
            },
        },
    }


def payload(items: str, truncated: str = "false") -> str:
    return '{"items":' + items + ',"truncated":' + truncated + "}"


def corpus() -> list[dict[str, object]]:
    astral = chr(0x1F600)
    high = chr(0xD800)
    low = chr(0xDC00)
    cases: list[dict[str, object]] = []

    def add(name: str, value: object, *, model: type = STRING_KEY,
            decoder: dict[str, object] | None = None,
            initial_decimal_flags: tuple[str, ...] = ()) -> None:
        cases.append({
            "name": name,
            "value": value,
            "model": model,
            "decoder": metadata(model) if decoder is None else decoder,
            "initialDecimalFlags": initial_decimal_flags,
        })

    add("valid-empty", payload("[]"))
    add("valid-ordered", payload('[["a"],["b"]]', "true"))
    add("valid-raw-astral-scalar", payload('[[' + json.dumps(astral, ensure_ascii=False) + "]]"))
    add("valid-escaped-surrogate-pair", payload('[["\\ud83d\\ude00"]]'))
    add("valid-escaped-unpaired-high", payload('[["\\ud800"]]'))
    add("valid-escaped-unpaired-low", payload('[["\\udc00"]]'))
    add("valid-raw-unpaired-high-codepoint", payload('[[' + json.dumps(high, ensure_ascii=False) + "]]"))
    add("valid-raw-surrogate-pair-codepoints", payload('[[' + json.dumps(high + low, ensure_ascii=False) + "]]"))
    add("valid-decimal-trailing-zeros", payload('[["1.2300"]]'), model=DECIMAL_KEY)
    add("valid-decimal-negative-zero", payload('[["-0.00"]]'), model=DECIMAL_KEY)
    add("decimal-huge-positive-exponent", payload('[["1e999999999999999999999999999999999999999999999999"]]'), model=DECIMAL_KEY)
    add("decimal-huge-negative-exponent", payload('[["1e-999999999999999999999999999999999999999999999999"]]'), model=DECIMAL_KEY)
    add("decimal-preexisting-flags-preserved", payload('[["1.20"]]'), model=DECIMAL_KEY, initial_decimal_flags=("Inexact", "Rounded"))
    add("decimal-malformed-lexical", payload('[["1e+"]]'), model=DECIMAL_KEY)
    add("decimal-nonfinite-string", payload('[["NaN"]]'), model=DECIMAL_KEY)
    add("integer-canonical", payload('[["-12"]]'), model=INTEGER_KEY)
    add("boolean-exact", payload("[[true]]"), model=BOOLEAN_KEY)

    add("parser-depth-800", "[" * 800 + "null" + "]" * 800)
    add("parser-depth-1200", "[" * 1200 + "null" + "]" * 1200)

    add("duplicate-root-name", '{"items":[],"\\u0069tems":[],"truncated":false}')
    add("duplicate-nested-decoded-name", payload('[[{"a":1,"\\u0061":2}]]'))
    add("numeric-in-item-integer", payload("[[1]]"))
    add("numeric-in-unused-root-member", '{"items":[],"truncated":false,"x":1}')
    add("numeric-in-nested-object", payload('[[{"unused":1}]]'))
    add("numeric-float", payload("[[1.25]]"))
    add("numeric-exponent", payload("[[1e2]]"))
    add("numeric-nan", payload("[[NaN]]"))
    add("numeric-nan-in-unused-member", '{"items":[],"truncated":false,"unused":NaN}')
    add("numeric-positive-infinity", payload("[[Infinity]]"))
    add("numeric-negative-infinity", payload("[[-Infinity]]"))

    for name, text in (
        ("malformed-empty", ""),
        ("malformed-incomplete-object", '{"items":'),
        ("malformed-trailing-comma", '{"items":[],"truncated":false,}'),
        ("malformed-bad-escape", payload('[["\\u12xz"]]')),
        ("malformed-trailing-text", payload("[]") + " x"),
        ("malformed-comment", "// no JSON"),
    ):
        add(name, text)

    for name, text in (
        ("root-array", "[]"),
        ("root-null", "null"),
        ("root-string", '"x"'),
        ("root-missing-truncated", '{"items":[]}'),
        ("root-extra-member", '{"items":[],"truncated":false,"x":null}'),
        ("items-not-list", '{"items":{},"truncated":false}'),
        ("truncated-not-bool", '{"items":[],"truncated":"false"}'),
        ("bound-exceeded", payload('[["a"],["b"],["c"]]')),
        ("truncated-short", payload('[["a"]]', "true")),
        ("item-not-list", payload('["a"]')),
        ("item-width-mismatch", payload("[[]]")),
        ("duplicate-items-order", payload('[["a"],["a"]]')),
        ("descending-items-order", payload('[["b"],["a"]]')),
    ):
        add(name, text)

    invalid_decoder = metadata(STRING_KEY)
    invalid_decoder["bound"] = True
    add("precedence-metadata-before-parse", "{", decoder=invalid_decoder)
    add("precedence-owner-profile-before-value-type", 1, decoder=ashlar_metadata(STRING_KEY))
    add("precedence-value-type-before-parse", 1)
    add("precedence-parse-before-root-shape", '{"items":[],"items":[],"truncated":false}')
    add("precedence-root-shape-before-bound", "[]")
    add("precedence-bound-before-item-validation", payload('[[true],["b"],["c"]]'))
    add("precedence-component-before-next-item-order", payload('[[true],["a"]]'))
    return cases


def result_value(value: object) -> object:
    if isinstance(value, related_keys.RelatedKeys):
        return {
            "items": [
                {name: result_value(item) for name, item in key.__dict__.items()}
                for key in value.items
            ],
            "truncated": value.truncated,
        }
    if type(value) is str:
        return {"type": "str", "codepoints": codepoints(value)}
    if type(value) is decimal.Decimal:
        item = value.as_tuple()
        return {"type": "Decimal", "sign": item.sign, "digits": list(item.digits), "exponent": item.exponent}
    return value


def flags() -> list[str]:
    return sorted(signal.__name__ for signal, active in decimal.getcontext().flags.items() if active)


def capture() -> dict[str, object]:
    if sha256(FROZEN_SOURCE) != SOURCE_SHA:
        raise SystemExit("frozen related_keys.py SHA-256 differs from the source freeze")
    observations = []
    for case in corpus():
        value = case["value"]
        decimal.getcontext().clear_flags()
        for signal_name in case["initialDecimalFlags"]:
            signal = next(signal for signal in decimal.getcontext().flags if signal.__name__ == signal_name)
            decimal.getcontext().flags[signal] = True
        before = flags()
        try:
            result = related_keys.decode_related_keys(value, case["decoder"], case["model"])
        except BaseException as exc:
            observed: dict[str, object] = {
                "exception": type(exc).__name__,
                "message": str(exc),
                "cause": None if exc.__cause__ is None else {
                    "class": type(exc.__cause__).__name__,
                    "message": str(exc.__cause__),
                },
                "context": None if exc.__context__ is None else {
                    "class": type(exc.__context__).__name__,
                    "message": str(exc.__context__),
                },
                "suppressContext": exc.__suppress_context__,
            }
        else:
            observed = {"result": result_value(result)}
        observed["decimalFlagsBefore"] = before
        observed["decimalFlagsAfter"] = flags()
        observations.append({
            "name": case["name"],
            "inputType": type(value).__name__,
            "inputCodepoints": codepoints(value) if type(value) is str else None,
            "outcome": observed,
        })
    return {
        "profile": "umf-r6-related-key-json-predecessor/1",
        "runtime": {
            "implementation": sys.implementation.name,
            "version": list(sys.version_info[:3]),
        },
        "source": {
            "path": "python/umf_access/src/umf_access/related_keys.py",
            "sha256": SOURCE_SHA,
            "frozenCopy": "frozen/related_keys.py",
        },
        "harness": {
            "dependencies": "stdlib-only stubs for Pydantic, generated Key model, and validate_graph",
            "executedCode": "frozen related_keys.py, including _object, _number, json.loads, and decode_related_keys",
            "scope": "Parser, stage ordering, wrapper error and Decimal-context observations; no Pydantic or native consumer qualification.",
        },
        "cases": observations,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write this interpreter's frozen capture")
    parser.add_argument("--check", action="store_true", help="compare against this interpreter's frozen capture")
    parser.add_argument("--source-check", action="store_true", help="require live Python source to match the frozen SHA")
    args = parser.parse_args()
    if args.source_check and sha256(SOURCE_PATH) != SOURCE_SHA:
        raise SystemExit("live related_keys.py differs from the frozen predecessor source")
    version = f"{sys.version_info.major}.{sys.version_info.minor}"
    target = FROZEN / f"cpython-{version}.json"
    text = json.dumps(capture(), ensure_ascii=True, indent=2, sort_keys=True) + "\n"
    if args.write:
        target.write_text(text, encoding="utf-8")
    elif args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != text:
            raise SystemExit(f"capture differs from {target.name}; frozen files are immutable")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
