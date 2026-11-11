# SPDX-License-Identifier: MIT OR Apache-2.0
"""Field codecs and issued columns shared by generated query forms."""
from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from types import MappingProxyType
from typing import Generic, TypeVar, cast

from umf_access.dsl import Column, FieldRef, Node, Ordering, Predicate

from .session_policy import SessionError

R = TypeVar("R")
T = TypeVar("T")


_WRAPPERS = {
    "boolean": "boolean",
    "string": "string",
    "integer": "integerToken",
    "decimal": "decimalToken",
    "float": "floatToken",
    "date": "date",
    "timestamp": "timestamp",
    "uuid": "uuid",
    "bits128": "bits128Hex",
}


_INT_TOKEN = re.compile(r"-?(?:0|[1-9][0-9]*)\Z")


_DECIMAL_TOKEN = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")


_FLOAT_TOKEN = re.compile(
    r"[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?\Z"
)


def _ref_key(field: FieldRef) -> tuple[str, str]:
    """Return the identity of the source Field, not its owning Record."""
    return cast(str, field.field_module), field.field


def _owner_key(field: FieldRef) -> tuple[str, str, str | None]:
    return field.module, field.element, field.alias


def _field_id(field: FieldRef) -> str:
    module, element = _ref_key(field)
    escape = lambda part: part.replace("~", "~0").replace("/", "~1")
    return escape(module) + "/" + escape(element)


def _typed_literal(carrier: str, value: object) -> Mapping[str, object]:
    """Mechanically wrap a concrete Python value; the issued codec decides meaning."""
    wrapper = _WRAPPERS.get(carrier)
    if wrapper is None:
        raise TypeError("this generated carrier has no issued query codec")
    if carrier == "boolean" or carrier == "string":
        scalar = value
    elif carrier == "integer":
        if type(value) is not int:
            raise TypeError("integer query value requires int")
        scalar = str(value)
    elif carrier == "decimal":
        if type(value) is not Decimal or not value.is_finite():
            raise TypeError("decimal query value requires finite Decimal")
        scalar = str(value)
    elif carrier == "float":
        if type(value) is not float or not math.isfinite(value):
            raise TypeError("float query value requires finite float")
        scalar = repr(value)
    else:
        scalar = value
    if carrier == "boolean" and type(scalar) is not bool:
        raise TypeError("boolean query value requires bool")
    if (
        carrier
        in {
            "string",
            "integer",
            "decimal",
            "float",
            "date",
            "timestamp",
            "uuid",
            "bits128",
        }
        and type(scalar) is not str
    ):
        raise TypeError("query value does not match its generated carrier")
    if carrier == "integer" and _INT_TOKEN.fullmatch(cast(str, scalar)) is None:
        raise TypeError("integer query value requires exact integer text")
    if carrier == "decimal":
        try:
            if (
                _DECIMAL_TOKEN.fullmatch(cast(str, scalar)) is None
                or not Decimal(cast(str, scalar)).is_finite()
            ):
                raise TypeError("decimal query value requires a finite exact token")
        except InvalidOperation:
            raise TypeError(
                "decimal query value requires a finite exact token"
            ) from None
    if carrier == "float":
        if _FLOAT_TOKEN.fullmatch(cast(str, scalar)) is None:
            raise TypeError("float query value requires an exact numeric token")
        try:
            if not math.isfinite(float(cast(str, scalar))):
                raise TypeError("float query value must be finite")
        except ValueError:
            raise TypeError(
                "float query value requires an exact numeric token"
            ) from None
    if type(scalar) is str:
        scalar.encode("utf-8", errors="strict")
    return MappingProxyType({wrapper: scalar})


@dataclass(frozen=True, slots=True)
class GeneratedFieldBinding:
    """Exact source Field, output decoder and Rust-issued expression IDs."""

    field: FieldRef
    attribute: str
    carrier: str
    output: Mapping[str, object]
    predicates: Mapping[str, str]
    orders: Mapping[str, str]

    def __post_init__(self) -> None:
        if type(self.field) is not FieldRef:
            raise TypeError("generated field requires an exact UMF FieldRef")
        if type(self.attribute) is not str or not self.attribute:
            raise TypeError("generated field requires its exact row attribute")
        if type(self.carrier) is not str or not self.carrier:
            raise TypeError("generated field requires its issued carrier")
        if not isinstance(self.output, Mapping):
            raise TypeError("generated field output descriptor is required")
        if not isinstance(self.predicates, Mapping) or not isinstance(
            self.orders, Mapping
        ):
            raise TypeError("generated field expression ID maps are required")
        predicate_ids = dict(self.predicates)
        order_ids = dict(self.orders)
        if any(
            type(operator) is not str or type(identity) is not str or not identity
            for operator, identity in predicate_ids.items()
        ) or set(predicate_ids) - {
            "eq",
            "ne",
            "lt",
            "le",
            "gt",
            "ge",
            "is-null",
            "is-not-null",
        }:
            raise TypeError("generated predicate map differs")
        if any(
            type(direction) is not str or type(identity) is not str or not identity
            for direction, identity in order_ids.items()
        ) or set(order_ids) - {"asc", "desc"}:
            raise TypeError("generated order map differs")
        from umf_access_generated_executor import freeze_json

        output = cast(Mapping[str, object], freeze_json(dict(self.output)))
        if output.get("carrier") != self.carrier:
            raise TypeError("generated field output carrier differs")
        object.__setattr__(self, "output", output)
        object.__setattr__(self, "predicates", MappingProxyType(predicate_ids))
        object.__setattr__(self, "orders", MappingProxyType(order_ids))


class GeneratedReadColumn(Column[R, T], Generic[R, T]):
    """Per-client Column facade whose expression values retain issued IDs."""

    __slots__ = ("_binding", "_client_token")
    __hash__ = None

    def __init__(self, binding: GeneratedFieldBinding, *, _client_token: object = None):
        if type(binding) is not GeneratedFieldBinding:
            raise TypeError("generated column requires a verified Field binding")
        object.__setattr__(self, "ref", binding.field)
        object.__setattr__(self, "_binding", binding)
        object.__setattr__(self, "_client_token", _client_token)

    def __bool__(self) -> bool:
        raise TypeError("generated columns have no truth value")

    def _predicate(self, operator: str, value: object = None) -> Predicate[R]:
        identity = self._binding.predicates.get(operator)
        if identity is None:
            raise TypeError("this generated predicate is not issued")
        values = (
            ()
            if operator in {"is-null", "is-not-null"}
            else (_typed_literal(self._binding.carrier, value),)
        )
        if self._client_token is not None:
            return Predicate(Node("generated.read.predicate/2", (
                identity, _owner_key(self.ref), _ref_key(self.ref), values,
                self._client_token,
            )))
        return Predicate(Node("generated.read.predicate/1", (
            identity, _ref_key(self.ref), values,
        )))

    def __eq__(self, other: object) -> Predicate[R]:  # type: ignore[override]
        if other is None:
            raise TypeError("use is_null() for generated nullable comparisons")
        return self._predicate("eq", other)

    def __ne__(self, other: object) -> Predicate[R]:  # type: ignore[override]
        if other is None:
            raise TypeError("use is_not_null() for generated nullable comparisons")
        return self._predicate("ne", other)

    def __lt__(self, other: object) -> Predicate[R]:
        return self._predicate("lt", other)

    def __le__(self, other: object) -> Predicate[R]:
        return self._predicate("le", other)

    def __gt__(self, other: object) -> Predicate[R]:
        return self._predicate("gt", other)

    def __ge__(self, other: object) -> Predicate[R]:
        return self._predicate("ge", other)

    def is_null(self) -> Predicate[R]:
        return self._predicate("is-null")

    def is_not_null(self) -> Predicate[R]:
        return self._predicate("is-not-null")

    def asc(self) -> Ordering[R]:
        return self._ordering("asc")

    def desc(self) -> Ordering[R]:
        return self._ordering("desc")

    def _ordering(self, direction: str) -> Ordering[R]:
        identity = self._binding.orders.get(direction)
        if identity is None:
            raise TypeError("this generated ordering is not issued")
        expression = (
            Node("generated.read.order/2", (
                identity, _owner_key(self.ref), _ref_key(self.ref), self._client_token,
            ))
            if self._client_token is not None
            else Node("generated.read.order/1", (identity, _ref_key(self.ref)))
        )
        return Ordering(expression, direction.upper())


def _decode_literal(value: object, output: Mapping[str, object]) -> object:
    from umf_access_generated_executor import GeneratedExecutionError, decode_result_literal

    try:
        return decode_result_literal(value, output)
    except (GeneratedExecutionError, TypeError, ValueError, OverflowError):
        message = (
            "generated result omitted a required value"
            if value is None and output.get("nullable") is not True
            else "generated result literal is malformed"
        )
        raise SessionError(message) from None
