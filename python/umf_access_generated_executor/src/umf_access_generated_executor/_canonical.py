"""Closed canonical JSON handling for generated execution manifests."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType

MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_JSON_DEPTH = 128
MAX_JSON_NODES = 250_000


@dataclass(frozen=True, slots=True)
class ExactJsonNumber:
    """A non-integer JSON number retained as its exact source token."""

    token: str


def _scalar_text(value: str) -> None:
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise ValueError("JSON text contains a non-scalar Unicode value")


def _pairs(items: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in items:
        _scalar_text(key)
        if key in result:
            raise ValueError("duplicate JSON object member")
        result[key] = value
    return result


def _constant(_value: str) -> object:
    raise ValueError("non-finite JSON number")


def parse_json(data: str | bytes) -> object:
    return _parse_json(data, MAX_MANIFEST_BYTES, "manifest")


def parse_bounded_program_json(data: bytes, max_bytes: int) -> object:
    """Parse canonical internal program JSON with its own explicit byte ceiling."""
    if type(max_bytes) is not int or max_bytes <= 0:
        raise ValueError("program byte limit must be a positive integer")
    return _parse_json(data, max_bytes, "program")


def parse_bounded_result_json(data: bytes, max_bytes: int) -> object:
    """Parse a bounded result frame with node capacity derived from its bytes."""
    if type(max_bytes) is not int or max_bytes <= 0:
        raise ValueError("result byte limit must be a positive integer")
    return _parse_json(data, max_bytes, "result", max_nodes=max_bytes, max_depth=MAX_JSON_DEPTH)


def _parse_json(
    data: str | bytes,
    max_bytes: int,
    label: str,
    *,
    max_nodes: int = MAX_JSON_NODES,
    max_depth: int = MAX_JSON_DEPTH,
) -> object:
    if isinstance(data, bytes):
        if len(data) > max_bytes:
            raise ValueError(label + " size limit exceeded")
        text = data.decode("utf-8", errors="strict")
    elif type(data) is str:
        if len(data) > max_bytes:
            raise ValueError(label + " size limit exceeded")
        if len(data.encode("utf-8", errors="strict")) > max_bytes:
            raise ValueError(label + " size limit exceeded")
        text = data
    else:
        raise ValueError("manifest must be UTF-8 JSON text")
    if text.startswith("\ufeff"):
        raise ValueError("manifest byte order mark is not allowed")
    try:
        value = json.loads(
            text,
            object_pairs_hook=_pairs,
            parse_float=ExactJsonNumber,
            parse_constant=_constant,
        )
    except RecursionError:
        raise ValueError("manifest structure limit exceeded") from None
    _check_tree(value, max_nodes=max_nodes, max_depth=max_depth)
    return value


def _check_tree(
    root: object,
    *,
    max_nodes: int = MAX_JSON_NODES,
    max_depth: int = MAX_JSON_DEPTH,
) -> None:
    stack: list[tuple[object, int]] = [(root, 0)]
    count = 0
    while stack:
        value, depth = stack.pop()
        count += 1
        if count > max_nodes or depth > max_depth:
            raise ValueError("manifest structure limit exceeded")
        if isinstance(value, str):
            _scalar_text(value)
        elif isinstance(value, Mapping):
            for key, child in value.items():
                if type(key) is not str:
                    raise ValueError("JSON object keys must be strings")
                _scalar_text(key)
                stack.append((child, depth + 1))
        elif isinstance(value, (list, tuple)):
            stack.extend((child, depth + 1) for child in value)
        elif value is None or type(value) in {bool, int, ExactJsonNumber}:
            continue
        else:
            raise ValueError("manifest contains a non-JSON value")


def canonical_json(value: object) -> bytes:
    _check_tree(value)
    return _encode(value).encode("utf-8", errors="strict")


def _encode(value: object) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if type(value) is int:
        return str(value)
    if isinstance(value, ExactJsonNumber):
        return value.token
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, Mapping):
        items = sorted(value.items(), key=lambda item: item[0])
        return (
            "{"
            + ",".join(_encode(key) + ":" + _encode(item) for key, item in items)
            + "}"
        )
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_encode(item) for item in value) + "]"
    raise ValueError("manifest contains a non-JSON value")


def freeze_json(value: object) -> object:
    if isinstance(value, Mapping):
        return MappingProxyType(
            {key: freeze_json(child) for key, child in value.items()}
        )
    if isinstance(value, (list, tuple)):
        return tuple(freeze_json(child) for child in value)
    return value


def thaw_json(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: thaw_json(child) for key, child in value.items()}
    if isinstance(value, (list, tuple)):
        return [thaw_json(child) for child in value]
    return value
