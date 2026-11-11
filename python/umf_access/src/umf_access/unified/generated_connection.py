# SPDX-License-Identifier: MIT OR Apache-2.0
"""Typed native cursor scope, canonical field profile and token framing."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import cast

from .session_policy import GeneratedNativeError, SessionIdentity

_PROFILE_ISSUER = object()
_PREPARED_ISSUER = object()

@dataclass(frozen=True, slots=True)
class GeneratedCursorScope:
    """Trusted host-composition pins for one forward connection route."""

    application_id: str
    application_digest: str
    api_digest: str
    host_operation_id: str
    allowed_field_profile_digest: str

    def __post_init__(self) -> None:
        for name in ("application_id", "host_operation_id"):
            value = getattr(self, name)
            if (
                type(value) is not str
                or not value
                or "\x00" in value
                or not 1 <= len(value.encode("utf-8")) <= 256
            ):
                raise ValueError("generated cursor scope identifier is invalid")
        for name in (
            "application_digest",
            "api_digest",
            "allowed_field_profile_digest",
        ):
            if type(getattr(self, name)) is not str or not re.fullmatch(
                r"[0-9a-f]{64}", getattr(self, name)
            ):
                raise ValueError("generated cursor scope digest is invalid")


@dataclass(frozen=True, slots=True)
class GeneratedConnectionRoute:
    """One immutable Host operation to issued Record and Field profile join."""

    module: str
    record: str
    cursor_scope: GeneratedCursorScope
    allowed_field_profile: AllowedConnectionFieldProfile

    def __post_init__(self) -> None:
        if (
            type(self.module) is not str
            or not self.module
            or type(self.record) is not str
            or not self.record
            or type(self.cursor_scope) is not GeneratedCursorScope
            or type(self.allowed_field_profile) is not AllowedConnectionFieldProfile
            or self.cursor_scope.allowed_field_profile_digest
            != self.allowed_field_profile.digest
        ):
            raise ValueError("generated connection route pins differ")


def _freeze_json(value: object) -> object:
    if type(value) is dict:
        if any(type(key) is not str for key in value):
            raise ValueError("allowed connection field profile keys must be strings")
        return MappingProxyType({key: _freeze_json(item) for key, item in value.items()})
    if type(value) is list:
        return tuple(_freeze_json(item) for item in value)
    if type(value) is tuple:
        return tuple(_freeze_json(item) for item in value)
    if value is None or type(value) in (str, bool, int):
        return value
    raise ValueError("allowed connection field profile must be canonical JSON")


def _json_value(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _json_value(item) for key, item in value.items()}
    if type(value) is tuple:
        return [_json_value(item) for item in value]
    return value


def _decode_connection_cursor(secret: bytes, token: str) -> dict[str, object]:
    # Bound framing before base64/JSON allocation. This accommodates the pure
    # 128 KiB Key and 1 MiB call limits plus a compact stable context.
    if type(token) is not str or not token or len(token) > 2_000_000:
        raise ValueError("cursor framing differs")
    try:
        encoded, signature = token.split(".")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", encoded) or not re.fullmatch(
            r"[0-9a-f]{64}", signature
        ):
            raise ValueError("cursor framing differs")
        expected = hmac.new(secret, encoded.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("cursor authentication differs")
        raw = base64.b64decode(
            encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True
        )
        if len(raw) > 1_500_000:
            raise ValueError("cursor payload exceeds its bound")

        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate cursor member")
                result[key] = value
            return result

        parsed = json.loads(
            raw.decode("utf-8", errors="strict"),
            object_pairs_hook=unique,
            parse_constant=lambda _value: (_ for _ in ()).throw(ValueError()),
        )
        if (
            type(parsed) is not dict
            or set(parsed) != {"version", "contextDigest", "after"}
            or parsed.get("version") != "umf.generated-connection-cursor/1"
            or type(parsed.get("contextDigest")) is not str
            or not re.fullmatch(r"[0-9a-f]{64}", parsed["contextDigest"])
            or type(parsed.get("after")) is not str
            or len(parsed["after"].encode("utf-8", errors="strict")) > 131_072
        ):
            raise ValueError("cursor payload differs")
        canonical = json.dumps(
            parsed,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        if canonical != raw:
            raise ValueError("cursor payload is not canonical")
        return parsed
    except (UnicodeError, TypeError, json.JSONDecodeError, RecursionError):
        raise ValueError("cursor payload differs") from None


def _encode_connection_cursor(secret: bytes, context_digest: str, after: str) -> str:
    if type(after) is not str or len(after) > 131_072:
        raise GeneratedNativeError("LIMIT_EXCEEDED")
    if len(after.encode("utf-8", errors="strict")) > 131_072:
        raise GeneratedNativeError("LIMIT_EXCEEDED")
    raw = json.dumps(
        {
            "version": "umf.generated-connection-cursor/1",
            "contextDigest": context_digest,
            "after": after,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    if len(raw) > 1_500_000:
        raise GeneratedNativeError("LIMIT_EXCEEDED")
    encoded = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
    signature = hmac.new(secret, encoded.encode("ascii"), hashlib.sha256).hexdigest()
    token = encoded + "." + signature
    if len(token) > 2_000_000:
        raise GeneratedNativeError("LIMIT_EXCEEDED")
    return token


@dataclass(frozen=True, slots=True, init=False)
class AllowedConnectionFieldProfile:
    """Immutable canonical join of issued Fields and prepared API exposure."""

    body: Mapping[str, object]
    digest: str

    def __init__(self, body, digest, _issuer=None) -> None:
        if _issuer is not _PROFILE_ISSUER:
            raise ValueError("allowed connection field profile must be issued from a body")
        object.__setattr__(self, "body", body)
        object.__setattr__(self, "digest", digest)

    @classmethod
    def from_body(cls, body: Mapping[str, object]) -> AllowedConnectionFieldProfile:
        if type(body) is not dict or set(body) != {
            "version",
            "scalarCodecProfile",
            "fields",
        }:
            raise ValueError("allowed connection field profile shape differs")
        frozen = cast(Mapping[str, object], _freeze_json(body))
        if (
            frozen.get("version") != "umf.allowed-connection-fields/1"
            or type(frozen.get("scalarCodecProfile")) is not str
            or not cast(str, frozen["scalarCodecProfile"])
        ):
            raise ValueError("allowed connection field profile version differs")
        fields = frozen.get("fields")
        if type(fields) is not tuple or not fields:
            raise ValueError("allowed connection field profile is empty")
        ids: list[str] = []
        for item in fields:
            if (
                not isinstance(item, Mapping)
                or set(item) != {"fieldId", "sourceField", "output", "scalar", "nullable"}
                or type(item.get("fieldId")) is not str
                or not cast(str, item.get("fieldId"))
                or not isinstance(item.get("sourceField"), Mapping)
                or not isinstance(item.get("output"), Mapping)
                or type(item.get("scalar")) is not str
                or not cast(str, item.get("scalar"))
                or type(item.get("nullable")) is not bool
            ):
                raise ValueError("allowed connection field descriptor differs")
            source_field = item["sourceField"]
            output = item["output"]
            if (
                set(source_field) != {"module", "element"}
                or any(type(source_field[key]) is not str or not source_field[key] for key in ("module", "element"))
                or set(output) != {"carrier", "name", "nativeType", "nullable", "oid"}
                or type(output.get("carrier")) is not str
                or type(output.get("name")) is not str
                or type(output.get("nullable")) is not bool
                or type(output.get("oid")) is not int
                or not isinstance(output.get("nativeType"), Mapping)
                or type(output["nativeType"].get("kind")) is not str
                or not cast(str, output["nativeType"].get("kind"))
                or item["nullable"] != output["nullable"]
            ):
                raise ValueError("allowed connection field output join differs")
            ids.append(cast(str, item["fieldId"]))
        if ids != sorted(set(ids)):
            raise ValueError("allowed connection field IDs must be unique and sorted")
        raw = json.dumps(
            _json_value(frozen),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        return cls(frozen, hashlib.sha256(raw).hexdigest(), _PROFILE_ISSUER)


@dataclass(frozen=True, slots=True)
class GeneratedForwardConnectionRequest:
    """Immutable UMF route input; it contains no SQL or native authority."""

    operation_id: str
    module: str
    record: str
    fields: tuple[str, ...] | None
    where: object | None
    first: int
    after: str | None = None

    def __post_init__(self) -> None:
        if any(
            type(value) is not str or not value
            for value in (self.operation_id, self.module, self.record)
        ):
            raise ValueError("forward connection request identity differs")
        if self.fields is not None and (
            type(self.fields) is not tuple
            or any(type(value) is not str or not value for value in self.fields)
            or len(set(self.fields)) != len(self.fields)
        ):
            raise ValueError("forward connection request fields differ")
        if type(self.first) is not int or not 0 <= self.first <= 100:
            raise ValueError("forward connection request first differs")
        if self.after is not None and type(self.after) is not str:
            raise ValueError("forward connection request cursor differs")
        if self.where is not None:
            from umf_access_generated_executor import (
                GeneratedReadAnd,
                GeneratedReadAtom,
                GeneratedReadNot,
                GeneratedReadOr,
            )

            allowed = {GeneratedReadAtom, GeneratedReadAnd, GeneratedReadOr, GeneratedReadNot}
            pending = [(self.where, 1)]
            nodes = 0
            while pending:
                term, depth = pending.pop()
                nodes += 1
                if type(term) not in allowed or depth > 8 or nodes > 64:
                    raise ValueError("forward connection filter exceeds its immutable bound")
                if type(term) in {GeneratedReadAnd, GeneratedReadOr}:
                    pending.extend((child, depth + 1) for child in term.args)
                elif type(term) is GeneratedReadNot:
                    pending.append((term.arg, depth + 1))


@dataclass(frozen=True, slots=True, init=False, weakref_slot=True)
class PreparedForwardConnection:
    """Nominal immutable connection work issued by one native binding."""

    _binding: object
    _scope: object
    _identity: SessionIdentity
    _route: GeneratedConnectionRoute
    _cursor_scope: GeneratedCursorScope
    _call: object
    _bound: object
    _context: Mapping[str, object]
    _issuer: object

    def __init__(
        self, *, binding, scope, identity, route, call, bound, context, _issuer=None
    ):
        if _issuer is not _PREPARED_ISSUER:
            raise ValueError("prepared connection must be issued by a native binding")
        object.__setattr__(self, "_binding", binding)
        object.__setattr__(self, "_scope", scope)
        object.__setattr__(self, "_identity", identity)
        object.__setattr__(self, "_route", route)
        object.__setattr__(self, "_cursor_scope", route.cursor_scope)
        object.__setattr__(self, "_call", call)
        object.__setattr__(self, "_bound", bound)
        object.__setattr__(self, "_context", cast(Mapping[str, object], _freeze_json(context)))
        object.__setattr__(self, "_issuer", _issuer)
