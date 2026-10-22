"""Load real generated full-shape models and exercise installed SDK codecs.

Run after the public schema generator, with its output directory as argument.
This is schema/instance/codec evidence, not managed cloud acceptance.
"""
from __future__ import annotations

import hashlib
import importlib.abc
import json
import sys
from decimal import Decimal
from pathlib import Path


class NoCompiler(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        if fullname == "weft" or fullname.startswith("weft."):
            raise AssertionError("generated models must not load a compiler")


def main():
    root = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(root))
    sys.meta_path.insert(0, NoCompiler())

    def snapshot():
        return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in sorted((root / "search_docs").rglob("*"))
                if path.is_file() and "__pycache__" not in path.parts}

    before = snapshot()
    from search_docs.codecs import decode_Doc, encode_Doc_create
    from search_docs.models import Doc, DocCreate

    checks = ["actual-generated-package-load-without-compiler"]
    values = {"id": "original", "body": "e\u0301 and \u00e9", "embedding": (1.0, 0.0, -0.0),
              "count": 2**63 - 1, "amount": Decimal("1234567890123456789012345678.1234567890"),
              "payload": b"\x00\xff"}
    created = DocCreate(**values)
    encoded = encode_Doc_create(created)
    assert encoded == values and type(encoded["amount"]) is Decimal
    assert encoded["amount"].as_tuple() == values["amount"].as_tuple()
    checks.append("actual-create-instance-and-exact-codec-values")
    decoded = decode_Doc(list(values), list(values.values()))
    assert decoded == Doc(**values)
    checks.append("actual-row-decode-and-instance-validation")
    for field, invalid in (("count", 2**63), ("count", True),
                           ("amount", Decimal("1.00000000001")),
                           ("embedding", (0.1, 0.0, 0.0)), ("embedding", (1.0,)),
                           ("payload", "AA=="), ("body", None)):
        try:
            DocCreate(**{**values, field: invalid})
        except ValueError:
            checks.append("refuse-invalid-" + field)
        else:
            raise AssertionError("invalid native value admitted: " + field)
    forged = DocCreate.model_construct(**{**values, "count": 2**63})
    try:
        encode_Doc_create(forged)
    except ValueError:
        checks.append("constructed-instance-cannot-bypass-codec-validation")
    else:
        raise AssertionError("constructed instance bypassed codec boundary")
    assert "weft" not in sys.modules and before == snapshot()
    checks.append("unchanged-generated-package-and-no-compiler-import")
    receipt = {"status": "PASS", "checks": checks, "scope": "generated schema/load/instance/codec only",
               "temporal": "HELD", "generatedFiles": before,
               "harnessSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (root / "schema-instance-result.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"status": "PASS", "checks": len(checks), "temporal": "HELD"}))


if __name__ == "__main__":
    main()
