"""Portable JSON admission matching UMF's interoperable numeric boundary."""

import math

MAX_DEPTH = 128
MAX_VALUES = 100_000
MAX_TEXT_LENGTH = 4_000_000
MAX_SAFE_INTEGER = 2**53 - 1


def copy_json(value):
    active = set()
    count = 0

    def visit(item, depth):
        nonlocal count
        count += 1
        if count > MAX_VALUES or depth > MAX_DEPTH:
            raise ValueError("LIMIT: JSON structural limit exceeded")
        if item is None or type(item) in (str, bool):
            return item
        if type(item) is int:
            if abs(item) > MAX_SAFE_INTEGER:
                raise ValueError("NUMBER: use an exact integerToken carrier")
            return item
        if type(item) is float:
            if (
                not math.isfinite(item)
                or item == 0
                and math.copysign(1, item) < 0
                or item.is_integer()
                and abs(item) > MAX_SAFE_INTEGER
            ):
                raise ValueError("NUMBER: outside the interoperable numeric profile")
            return item
        if type(item) not in (list, dict):
            raise ValueError("NON_JSON: plain JSON values required")
        if id(item) in active:
            raise ValueError("CYCLE: cyclic JSON value")
        active.add(id(item))
        try:
            if type(item) is list:
                return [visit(child, depth + 1) for child in item]
            if any(type(key) is not str for key in item):
                raise ValueError("KEY: JSON object keys must be strings")
            return {key: visit(child, depth + 1) for key, child in item.items()}
        finally:
            active.remove(id(item))

    return visit(value, 0)
