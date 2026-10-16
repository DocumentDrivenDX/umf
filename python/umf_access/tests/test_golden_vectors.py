"""Runtime helper oracle agreement, separate from pending generated-model replay."""
import json
import unittest
from decimal import Decimal
from pathlib import Path

from umf_access.values import (
    validate_allowed,
    validate_binary,
    validate_boolean,
    validate_decimal,
    validate_integer,
    validate_length,
    validate_range,
    validate_string,
)

ROOT = Path(__file__).resolve().parents[3]
CORPUS = ROOT / "fixtures/access/golden-vectors/core-carriers.json"


def primitive(literal):
    if literal is None:
        return None
    kind, value = next(iter(literal.items()))
    return {"boolean": lambda: value, "integerToken": lambda: int(value),
            "decimalToken": lambda: Decimal(value), "string": lambda: value,
            "binaryHex": lambda: bytes.fromhex(value)}[kind]()


def check(vector, field, literal):
    """Fixture adapter supplies explicit resolved constraints to public helpers.

    This is test scaffolding, not runtime schema interpretation or generation.
    """
    if literal is None:
        if field["nullability"] != "absent-allowed":
            raise ValueError("null not admitted")
        return None
    facets = field.get("facets", {})
    cardinality = field["cardinality"]
    if cardinality in ("array", "map"):
        if set(literal) != {cardinality}:
            raise ValueError("container kind mismatch")
        values = literal[cardinality]
        if cardinality == "array" and type(values) is not list or cardinality == "map" and type(values) is not dict:
            raise ValueError("container carrier mismatch")
        bounds = facets.get("collectionSize", {})
        validate_length(values, minimum=bounds.get("min"), maximum=bounds.get("max"))
        item = next(f for f in vector["extraFields"] if f["id"] == field["itemType"]["element"])
        for value in values if cardinality == "array" else values.values():
            check(vector, item, value)
        return values
    family = field["scalarType"]
    wrapper = {"boolean":"boolean", "integer":"integerToken", "decimal":"decimalToken",
               "string":"string", "binary":"binaryHex"}[family]
    if set(literal) != {wrapper}:
        raise ValueError("literal kind mismatch")
    value = primitive(literal)
    if family == "boolean":
        validate_boolean(value)
    elif family == "integer":
        width = facets.get("integerWidth", {})
        validate_integer(value, bits=width.get("bits"), signed=width.get("signed", True))
    elif family == "decimal":
        validate_decimal(value, precision=facets.get("precision"), scale=facets.get("scale"))
    elif family == "string":
        validate_string(value)
    elif family == "binary":
        validate_binary(value)
    if "length" in facets:
        bounds = facets["length"]
        validate_length(value, minimum=bounds.get("min"), maximum=bounds.get("max"))
    if "range" in facets:
        bounds = facets["range"]
        validate_range(value, minimum=primitive(bounds.get("min")), maximum=primitive(bounds.get("max")),
                       min_inclusive=bounds.get("minInclusive", True), max_inclusive=bounds.get("maxInclusive", True))
    if "allowedValues" in field:
        validate_allowed(value, tuple(primitive(v) for v in field["allowedValues"]))
    return value


class GoldenVectors(unittest.TestCase):
    # @covers US-081-AC2 -- helper agreement only; generated models pending.
    def test_non_temporal_core_oracle(self):
        corpus = json.loads(CORPUS.read_text())
        self.assertEqual(corpus["coreVersion"], "0.8.0")
        checked = 0
        for vector in corpus["vectors"]:
            if vector["field"].get("scalarType") in ("date", "timestamp"):
                continue  # CONTRACT-075, not the generic core oracle.
            with self.subTest(vector=vector["id"]):
                if vector["expected"]:
                    check(vector, vector["field"], vector["literal"])
                else:
                    with self.assertRaises(ValueError):
                        check(vector, vector["field"], vector["literal"])
            checked += 1
        self.assertEqual(checked, 69)


if __name__ == "__main__":
    unittest.main()
