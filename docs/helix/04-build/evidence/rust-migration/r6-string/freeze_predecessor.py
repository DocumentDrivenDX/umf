#!/usr/bin/env python3
"""Reproduce the R6 string predecessor trace from its retained Git blob."""

from __future__ import annotations

import json
import subprocess
import sys
import types
from pathlib import Path

PREDECESSOR_BLOB = "f7db2b84826820880a1a7c47ee8fb8da4e069a1b"
PREDECESSOR_SHA256 = "02dd96fc2d8de2d6c5ce5bb250a64131a81acb8174231e16ec117f9680d2342d"
SOURCE_PATH = "python/umf_access/src/umf_access/values.py"


def repository_root() -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return Path(result.stdout.strip())


def main() -> None:
    import hashlib

    root = repository_root()
    source = subprocess.run(
        ["git", "cat-file", "blob", PREDECESSOR_BLOB],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
    ).stdout
    digest = hashlib.sha256(source).hexdigest()
    if digest != PREDECESSOR_SHA256:
        raise SystemExit(f"predecessor source hash differs: {digest}")

    package = types.ModuleType("umf_access")
    package.__path__ = [str(root / "python/umf_access/src/umf_access")]
    sys.modules["umf_access"] = package

    shared_types = types.ModuleType("umf_access.types")

    class ValueRuleError(ValueError):
        pass

    shared_types.ValueRuleError = ValueRuleError
    shared_types.Vector = tuple
    sys.modules["umf_access.types"] = shared_types

    pydantic = types.ModuleType("pydantic")

    class TypeAdapter:
        @classmethod
        def __class_getitem__(cls, item):
            return cls

    pydantic.TypeAdapter = TypeAdapter
    sys.modules["pydantic"] = pydantic

    module = types.ModuleType("umf_access.values")
    module.__package__ = "umf_access"
    module.__file__ = str(root / SOURCE_PATH)
    sys.modules[module.__name__] = module
    exec(compile(source, module.__file__, "exec"), module.__dict__)

    class IterBoom(Exception):
        pass

    boom = IterBoom("iter boom")

    class CustomIter(str):
        def __iter__(self):
            return iter(["x", "\ud800"])

    class CustomIterValid(str):
        def __iter__(self):
            return iter(["x", "y"])

    class CustomIterRaises(str):
        def __iter__(self):
            raise boom

    class CustomIterBadItem(str):
        def __iter__(self):
            return iter([object()])

    cases = [
        ("nonstring_none", None),
        ("nonstring_bytes", b"x"),
        ("nonstring_int", 1),
        ("empty", ""),
        ("ascii", "abc"),
        ("bmp", "é"),
        ("supplementary", "😀"),
        ("combining", "e\u0301"),
        ("lone_high_at_0", "\ud800"),
        ("lone_low_at_1", "x\udfff"),
        ("lone_middle", "a\ud800b"),
        ("explicit_high_low_pair", "\ud83d\ude00"),
        ("explicit_low_high_pair", "\ude00\ud83d"),
        ("mixed_valid_then_surrogate", "a😀\ud800z"),
        ("subclass_custom_valid_iteration", CustomIterValid("stored")),
        ("subclass_custom_surrogate_iteration", CustomIter("stored")),
        ("subclass_custom_iterator_raises", CustomIterRaises("stored")),
        ("subclass_custom_iterator_nonchar", CustomIterBadItem("stored")),
    ]

    def call(validator, value):
        try:
            result = validator(value)
            return {
                "outcome": "accept",
                "returned_same_object": result is value,
                "returned_type": type(result).__name__,
            }
        except BaseException as error:
            return {
                "outcome": "raise",
                "exception_type": type(error).__name__,
                "message": str(error),
                "is_original_exception": error is boom,
            }

    observations = []
    for name, value in cases:
        observations.append(
            {
                "case": name,
                "input_type": type(value).__name__,
                "direct": call(module.validate_string, value),
                "field_validator": call(module.FieldValidator(kind="string"), value),
            }
        )
    print(
        json.dumps(
            {
                "scope": "source-tree predecessor; exact helper and FieldValidator(kind=string)",
                "source": SOURCE_PATH,
                "observations": observations,
            },
            ensure_ascii=True,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
