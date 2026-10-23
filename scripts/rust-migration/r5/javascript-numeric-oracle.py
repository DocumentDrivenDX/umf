#!/usr/bin/env python3
"""Independent Decimal/Fraction/IEEE-754 oracle for CONTRACT-049 R5 vectors."""
from __future__ import annotations

import json
import math
import struct
import sys
from decimal import Decimal, InvalidOperation
from fractions import Fraction


def bits_to_float(bits: str) -> float:
    return struct.unpack(">d", bytes.fromhex(bits))[0]


def exact_decimal(token: str) -> bool:
    # Decimal's ambient exponent range is intentionally narrower than the
    # adapter's textual exponent bound, so grammar admission is independent.
    import re
    return re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", token) is not None


def decimal_fraction(token: str) -> Fraction:
    return Fraction(Decimal(token))


def expected(row: dict) -> dict:
    op = row["op"]
    if op == "exactDecimal":
        token = row["token"]
        okay = exact_decimal(token) and len(token.encode("utf-16-le")) // 2 <= 4_000_000
        exponent = token.partition("e")[2] if "e" in token else token.partition("E")[2]
        if len(exponent) > 32:
            okay = False
        return {"ok": okay, "value": {"decimalToken": token} if okay else None}
    if op == "integerFromBigInt":
        token = row["token"]
        okay = token == (str(int(token)) if token.lstrip("-").isdigit() else None)
        return {"ok": okay, "value": {"integerToken": token} if okay else None}
    if op == "integerToBigInt":
        token = row["token"]
        if not exact_decimal(token):
            return {"ok": False, "value": None}
        value = decimal_fraction(token)
        okay = value.denominator == 1 and token != "-0" and token != "-0.0"
        return {"ok": okay, "value": str(value.numerator) if okay else None}
    if op == "admitJavascriptNumber":
        value = bits_to_float(row["bits"])
        kind = row["scalarType"]
        # `shortest` is frozen from ECMAScript Number#toString vectors; Python
        # never formats the binary64 to decide parity.
        token = row["shortest"]
        if not math.isfinite(value) or (value == 0.0 and math.copysign(1.0, value) < 0):
            okay = False
        elif kind == "integer":
            okay = value.is_integer() and abs(value) <= 9_007_199_254_740_991
        else:
            okay = exact_decimal(token) and decimal_fraction(token) == Fraction.from_float(value)
        carrier = "integerToken" if kind == "integer" else "decimalToken"
        return {"ok": okay, "value": {carrier: token} if okay else None}
    if op == "numericToNumberLossless":
        token = row["token"]
        okay = exact_decimal(token)
        try:
            value = float(Decimal(token))
        except (InvalidOperation, OverflowError):
            return {"ok": False, "value": None}
        if not math.isfinite(value) or (value == 0.0 and math.copysign(1.0, value) < 0):
            okay = False
        if okay:
            okay = decimal_fraction(token) == Fraction.from_float(value)
        if okay and row.get("integer"):
            okay = value.is_integer() and abs(value) <= 9_007_199_254_740_991
        return {"ok": okay, "value": value if okay else None}
    raise ValueError(f"Unknown operation {op}")


def main() -> None:
    rows = json.load(sys.stdin)
    output = [{**row, "oracle": expected(row)} for row in rows]
    json.dump(output, sys.stdout, ensure_ascii=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
