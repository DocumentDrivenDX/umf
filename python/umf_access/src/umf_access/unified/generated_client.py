# SPDX-License-Identifier: MIT OR Apache-2.0
"""Per-client typed facade for Rust-issued single-root read algebra."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, replace
from types import MappingProxyType, SimpleNamespace
from typing import Any, Generic, Literal, NoReturn, TYPE_CHECKING, TypeVar, cast, overload

from umf_access.dsl import Continuation, FieldRef, Node, Ordering, Page, Predicate, RequiredJoin, Terminal

from .session_policy import GeneratedNativeError, SessionError
from ._generated_columns import (
    GeneratedFieldBinding,
    GeneratedReadColumn,
    _INT_TOKEN,
    _decode_literal,
    _field_id,
    _owner_key,
    _ref_key,
    _typed_literal,
)

if TYPE_CHECKING:
    from .generated_join_query import GeneratedJoinedReadQuery

R = TypeVar("R")
T = TypeVar("T")
T1 = TypeVar("T1")
T2 = TypeVar("T2")
T3 = TypeVar("T3")
T4 = TypeVar("T4")
T5 = TypeVar("T5")
T6 = TypeVar("T6")
T7 = TypeVar("T7")
T8 = TypeVar("T8")
JoinTarget = TypeVar("JoinTarget")
ResultT_co = TypeVar("ResultT_co", covariant=True)

def _canonical_bytes(value: object) -> bytes:
    from umf_access_generated_executor import canonical_json

    return canonical_json(value)






class _FrozenNamespace:
    """Attribute namespace whose names and values cannot be replaced."""

    __slots__ = ("_values",)

    def __init__(self, values: Mapping[str, object]):
        object.__setattr__(self, "_values", MappingProxyType(dict(values)))

    def __getattr__(self, name: str) -> object:
        try:
            return self._values[name]
        except KeyError:
            raise AttributeError(name) from None

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError("generated facade namespaces are immutable")




def _decode_field_key(value: str) -> dict[str, str]:
    parts = value.split("/")
    if len(parts) != 2:
        raise SessionError("generated Field ID is malformed")

    def unescape(part: str) -> str:
        result = part.replace("~1", "/").replace("~0", "~")
        if result.replace("~", "") != part.replace("~1", "").replace("~0", ""):
            raise SessionError("generated Field ID escape is malformed")
        return result

    module, element = (unescape(part) for part in parts)
    if _field_key(module, element) != value:
        raise SessionError("generated Field ID is not canonical")
    return {"module": module, "element": element}


def _field_key(module: str, element: str) -> str:
    escape = lambda part: part.replace("~", "~0").replace("/", "~1")
    return escape(module) + "/" + escape(element)


def _expression_parts(node: Node, record: Any, kind: str) -> tuple[object, ...]:
    """Check successor expression provenance before dropping owner-only metadata."""
    legacy_count = 3 if kind == "predicate" else 2
    if node.op == f"generated.read.{kind}/1":
        if record.client.read_profile == "weft.generated-read-algebra/8":
            raise TypeError("generated expression lacks its client and Record owner")
        if len(node.args) != legacy_count:
            raise TypeError("generated expression metadata differs")
        return node.args
    if node.op != f"generated.read.{kind}/2" or len(node.args) != legacy_count + 2:
        raise TypeError("generated expression metadata differs")
    if (
        record.client.read_profile != "weft.generated-read-algebra/8"
        or node.args[1] != (record.module, record.record, None)
        or node.args[-1] is not record.client._token
    ):
        raise TypeError("generated expression belongs to another client or Record")
    return (node.args[0], *node.args[2:-1])


def _where_from_predicate(predicate: Predicate[Any], record: Any) -> object:
    from umf_access_generated_executor import (
        GeneratedReadAnd,
        GeneratedReadAtom,
        GeneratedReadNot,
        GeneratedReadOr,
    )

    node = predicate.node
    if node.op in {"generated.read.predicate/1", "generated.read.predicate/2"}:
        args = _expression_parts(node, record, "predicate")
        if len(args) != 3 or type(args[0]) is not str:
            raise TypeError("generated predicate metadata differs")
        field_ref = cast(tuple[str, str], args[1])
        binding = record.columns.get(field_ref)
        if binding is None or args[0] not in binding._binding.predicates.values():
            raise TypeError("generated predicate is not issued for its Field")
        return GeneratedReadAtom(cast(str, args[0]), cast(tuple[object, ...], args[2]))
    if node.op in {"generated.read.and/1", "generated.read.or/1"}:
        if len(node.args) != 2:
            raise TypeError("generated Boolean expression arity differs")
        children = tuple(
            _where_from_predicate(Predicate(cast(Node, child)), record)
            for child in node.args
        )
        terms = cast(Any, children)
        return GeneratedReadAnd(terms) if node.op.endswith("and/1") else GeneratedReadOr(terms)
    if node.op == "generated.read.not/1" and len(node.args) == 1:
        child = _where_from_predicate(Predicate(cast(Node, node.args[0])), record)
        return GeneratedReadNot(cast(Any, child))
    raise TypeError("generated filter accepts issued Boolean expressions only")






@dataclass(frozen=True, slots=True)
class _GeneratedRowFacade(Generic[R]):
    client: GeneratedClient
    module: str
    record: str
    row_type: type[R]
    fields: tuple[GeneratedFieldBinding, ...]
    default_selection: tuple[FieldRef, ...]
    max_rows: int
    columns: Mapping[tuple[str, str], GeneratedReadColumn[R, object]]
    c: object
    objects: GeneratedReadQuery[R, R] | None
    key_type: type[Any] | None
    key_id: str | None
    relationships: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class GeneratedReadQuery(Generic[R, ResultT_co]):
    """Immutable fluent query; terminals contain data but acquire no native lease."""

    _client: GeneratedClient
    _record: _GeneratedRowFacade[R]
    _selection: tuple[FieldRef, ...] | None = None
    _filters: tuple[Any, ...] = ()
    _where: object | None = None
    _orders: tuple[str, ...] = ()
    _limit: int | None = None

    def __bool__(self) -> bool:
        raise TypeError("generated queries have no truth value")

    def filter(self, *predicates: Predicate[R]) -> GeneratedReadQuery[R, ResultT_co]:
        additions: list[GeneratedReadFilter] = []
        where_additions: list[object] = []
        allowed = {
            identity
            for field in self._record.fields
            for identity in field.predicates.values()
        }
        for predicate in predicates:
            if type(predicate) is not Predicate:
                raise TypeError("generated filter accepts issued predicates only")
            where_additions.append(_where_from_predicate(predicate, self._record))
            if predicate.node.op in {"generated.read.predicate/1", "generated.read.predicate/2"}:
                args = _expression_parts(predicate.node, self._record, "predicate")
                if len(args) != 3 or args[0] not in allowed:
                    raise TypeError("generated predicate belongs to another Record")
                field_ref = cast(tuple[str, str], args[1])
                if field_ref not in self._record.columns:
                    raise TypeError("generated predicate Field differs")
                binding = self._record.columns[field_ref]._binding
                if cast(str, args[0]) not in binding.predicates.values():
                    raise TypeError("generated predicate ID is not issued for its Field")
                values = cast(tuple[Mapping[str, object], ...], args[2])
                from umf_access_generated_executor import GeneratedReadFilter

                additions.append(GeneratedReadFilter(cast(str, args[0]), values))
            elif not self._client._uses_v2(self._record.module, self._record.record):
                raise SessionError("UNSUPPORTED")
        new_where = self._where
        if where_additions:
            from umf_access_generated_executor import GeneratedReadAnd

            all_terms = cast(
                Any, (() if new_where is None else (new_where,)) + tuple(where_additions)
            )
            new_where = all_terms[0] if len(all_terms) == 1 else GeneratedReadAnd(all_terms)
        return replace(
            self,
            _filters=self._filters + tuple(additions),
            _where=new_where,
        )

    where = filter

    def first(self) -> Terminal[ResultT_co | None]:
        return self._v2_terminal("first")

    def one(self) -> Terminal[ResultT_co]:
        return self._v2_terminal("one")

    def count(self) -> Terminal[int]:
        return self._v2_terminal("count")

    def exists(self) -> Terminal[bool]:
        return self._v2_terminal("exists")

    def get(self, key: object) -> Terminal[R]:
        return self._v2_terminal("get", key=key)

    def _v2_terminal(self, terminal: str, *, key: object = None) -> Terminal[Any]:
        if not self._client._uses_v2(self._record.module, self._record.record):
            raise SessionError("UNSUPPORTED")
        from umf_access_generated_executor import GeneratedReadCallV2

        selection_ids = (
            None
            if self._selection is None
            else tuple(_field_id(field) for field in self._selection)
        )
        where = self._where
        key_values: tuple[object, ...] | None = None
        if terminal == "get":
            if self._selection is not None or self._where is not None or self._orders or self._limit is not None:
                raise SessionError("UNSUPPORTED")
            root = self._client._issued_root(self._record.module, self._record.record)
            primary_key = cast(tuple[Mapping[str, object], ...], root["primaryKey"])
            if (
                self._record.key_type is None
                or type(key) is not self._record.key_type
                or type(self._record.key_id) is not str
            ):
                raise SessionError("generated Key type is not pinned")
            key_identity = getattr(type(key), "KEY_IDENTITY", None)
            if (
                not isinstance(key_identity, Mapping)
                or key_identity.get("module") != self._record.module
                or key_identity.get("element") != self._record.record
                or key_identity.get("key") != self._record.key_id
                or getattr(type(key), "UMF_KEY", False) is not True
            ):
                raise SessionError("generated Key source identity differs")
            key_bindings: list[GeneratedFieldBinding] = []
            expected_key_fields: list[tuple[str, str, str]] = []
            for component in primary_key:
                field_id = cast(str, component["fieldId"])
                source_field = _decode_field_key(field_id)
                binding = next(
                    (
                        item
                        for item in self._record.fields
                        if _field_id(item.field) == field_id
                    ),
                    None,
                )
                if binding is None:
                    raise SessionError("generated Key Field is not exposed")
                key_bindings.append(binding)
                expected_key_fields.append(
                    (
                        source_field["module"],
                        source_field["element"],
                        binding.attribute,
                    )
                )
            raw_values = tuple(getattr(key, binding.attribute) for binding in key_bindings)
            if getattr(type(key), "UMF_FIELDS", None) != tuple(expected_key_fields):
                raise SessionError("generated Key fields differ from the issued Key")
            wrapped: list[object] = []
            for field_binding, value in zip(key_bindings, raw_values, strict=True):
                wrapped.append(_typed_literal(field_binding.carrier, value))
            key_values = tuple(wrapped)
            where = None
        elif key is not None:
            raise TypeError("only get accepts a Key")
        elif terminal != "all" and self._limit is not None:
            raise SessionError("UNSUPPORTED")
        if terminal in {"count", "exists"} and (
            self._selection is not None or self._orders or self._limit is not None
        ):
            raise SessionError("UNSUPPORTED")
        call = GeneratedReadCallV2(
            self._record.module,
            self._record.record,
            selection_ids,
            cast(Any, where),
            self._orders,
            self._limit,
            terminal,  # type: ignore[arg-type]
            key_values,
        )
        return Terminal(
            Node(
                "generated.read.terminal/2",
                (self._client._token, call, self._selection, self._record),
            )
        )

    def page(
        self, *, size: int, after: Continuation[Any] | None = None, snapshot: bool = False
    ) -> Terminal[Page[ResultT_co, Any]]:
        """Create an inert Page/6 terminal; no native lease is opened here."""
        from umf_access_generated_executor import GeneratedOrdinaryPageCall, GeneratedOrdinaryPagePosition

        if type(size) is not int or not 1 <= size <= 1000:
            raise ValueError("generated page size must be between 1 and 1000")
        if self._client.read_profile not in {"weft.generated-read-algebra/6", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}:
            raise SessionError("UNSUPPORTED")
        root = self._client._issued_root(self._record.module, self._record.record)
        support = root.get("ordinaryPage")
        primary_key = root.get("primaryKey")
        if (
            not isinstance(support, Mapping)
            or support.get("status") != "eligible"
            or self._record.key_type is None
            or root.get("primaryKeyId") != self._record.key_id
            or not isinstance(primary_key, (tuple, list))
            or len(primary_key) != 1
        ):
            raise SessionError("UNSUPPORTED")
        key_component = cast(Mapping[str, object], primary_key[0])
        key_field_id = cast(str, key_component.get("fieldId"))
        key_identity = getattr(self._record.key_type, "KEY_IDENTITY", None)
        key_fields = getattr(self._record.key_type, "UMF_FIELDS", None)
        if (
            not isinstance(key_identity, Mapping)
            or key_identity.get("module") != self._record.module
            or key_identity.get("element") != self._record.record
            or key_identity.get("key") != self._record.key_id
            or type(key_fields) is not tuple
            or len(key_fields) != 1
            or _field_key(cast(str, key_fields[0][0]), cast(str, key_fields[0][1])) != key_field_id
        ):
            raise SessionError("generated Page Key metadata differs")
        if snapshot is not False or self._orders or self._limit is not None:
            raise SessionError("UNSUPPORTED")
        esc = lambda part: part.replace("~", "~0").replace("/", "~1")
        root_id = esc(self._record.module) + "/" + esc(self._record.record)
        selection_ids = (
            tuple(_field_id(field) for field in self._selection)
            if self._selection is not None
            else tuple(_field_id(field) for field in self._record.default_selection)
        )
        position = None
        if after is not None:
            if (
                type(after) is not Continuation
                or after.owner_cursor is not None
                or after.snapshot_versions
                or type(after.identity_digest) is not str
                or re.fullmatch(r"[0-9a-f]{64}", after.identity_digest) is None
            ):
                raise SessionError("INVALID_CURSOR")
            if len(after.sort_values) != 1 or type(after.sort_values[0]) is not str:
                raise SessionError("INVALID_CURSOR")
            key_type = self._record.key_type
            if key_type is None or type(after.key) is not key_type:
                raise SessionError("INVALID_CURSOR")
            key_value = getattr(after.key, key_fields[0][2], None)
            sort_value = after.sort_values[0]
            if type(key_value) is not str or key_value != sort_value:
                raise SessionError("INVALID_CURSOR")
            identity = bytes.fromhex(after.identity_digest)
            key_literal = _typed_literal("string", key_value)
            sort_literal = _typed_literal("string", sort_value)
            position = GeneratedOrdinaryPagePosition(identity, key_literal, sort_literal)
        call = GeneratedOrdinaryPageCall(root_id, selection_ids, cast(Any, self._where), size, position, False)
        return Terminal(Node("generated.read.page/6", (self._client._token, call, self._selection, self._record)))

    def join(
        self,
        relationship: RequiredJoin[R, JoinTarget, Any],
        *,
        how: Literal["inner"] | None = None,
    ) -> GeneratedJoinedReadQuery[R, JoinTarget, ResultT_co]:
        if self._client.read_profile != "weft.generated-read-algebra/8":
            raise SessionError("UNSUPPORTED")
        from umf_access.dsl import RequiredJoin
        from .generated_join_query import RequiredJoinBinding, make_joined_query

        if type(relationship) is not RequiredJoin:
            raise TypeError("generated join accepts a client-owned RequiredJoin only")
        binding = next(
            (value for value in self._record.relationships.values()
             if type(value) is RequiredJoinBinding and value.relationship is relationship),
            None,
        )
        if binding is None:
            raise TypeError("generated RequiredJoin belongs to another Record or client")
        if how not in (None, "inner"):
            raise SessionError("UNSUPPORTED")
        if binding.status != "eligible":
            raise SessionError("UNSUPPORTED")
        return make_joined_query(self, binding, _GeneratedRowFacade)

    def group_by(self, *_args: object, **_kwargs: object) -> NoReturn:
        raise SessionError("UNSUPPORTED")

    def having(self, *_args: object, **_kwargs: object) -> NoReturn:
        raise SessionError("UNSUPPORTED")

    def related(self, *_args: object, **_kwargs: object) -> NoReturn:
        raise SessionError("UNSUPPORTED")

    def include_keys(self, *_args: object, **_kwargs: object) -> NoReturn:
        raise SessionError("UNSUPPORTED")

    def search(self, *_args: object, **_kwargs: object) -> NoReturn:
        raise SessionError("UNSUPPORTED")

    def into(self, *_args: object, **_kwargs: object) -> NoReturn:
        raise SessionError("UNSUPPORTED")

    @overload
    def select(
        self, c1: GeneratedReadColumn[R, T1], /
    ) -> GeneratedReadQuery[R, tuple[T1]]: ...
    @overload
    def select(
        self, c1: GeneratedReadColumn[R, T1], c2: GeneratedReadColumn[R, T2], /
    ) -> GeneratedReadQuery[R, tuple[T1, T2]]: ...
    @overload
    def select(
        self,
        c1: GeneratedReadColumn[R, T1],
        c2: GeneratedReadColumn[R, T2],
        c3: GeneratedReadColumn[R, T3],
        /,
    ) -> GeneratedReadQuery[R, tuple[T1, T2, T3]]: ...
    @overload
    def select(
        self,
        c1: GeneratedReadColumn[R, T1],
        c2: GeneratedReadColumn[R, T2],
        c3: GeneratedReadColumn[R, T3],
        c4: GeneratedReadColumn[R, T4],
        /,
    ) -> GeneratedReadQuery[R, tuple[T1, T2, T3, T4]]: ...
    @overload
    def select(
        self,
        c1: GeneratedReadColumn[R, T1],
        c2: GeneratedReadColumn[R, T2],
        c3: GeneratedReadColumn[R, T3],
        c4: GeneratedReadColumn[R, T4],
        c5: GeneratedReadColumn[R, T5],
        /,
    ) -> GeneratedReadQuery[R, tuple[T1, T2, T3, T4, T5]]: ...
    @overload
    def select(
        self,
        c1: GeneratedReadColumn[R, T1],
        c2: GeneratedReadColumn[R, T2],
        c3: GeneratedReadColumn[R, T3],
        c4: GeneratedReadColumn[R, T4],
        c5: GeneratedReadColumn[R, T5],
        c6: GeneratedReadColumn[R, T6],
        /,
    ) -> GeneratedReadQuery[R, tuple[T1, T2, T3, T4, T5, T6]]: ...
    @overload
    def select(
        self,
        c1: GeneratedReadColumn[R, T1],
        c2: GeneratedReadColumn[R, T2],
        c3: GeneratedReadColumn[R, T3],
        c4: GeneratedReadColumn[R, T4],
        c5: GeneratedReadColumn[R, T5],
        c6: GeneratedReadColumn[R, T6],
        c7: GeneratedReadColumn[R, T7],
        /,
    ) -> GeneratedReadQuery[R, tuple[T1, T2, T3, T4, T5, T6, T7]]: ...
    @overload
    def select(
        self,
        c1: GeneratedReadColumn[R, T1],
        c2: GeneratedReadColumn[R, T2],
        c3: GeneratedReadColumn[R, T3],
        c4: GeneratedReadColumn[R, T4],
        c5: GeneratedReadColumn[R, T5],
        c6: GeneratedReadColumn[R, T6],
        c7: GeneratedReadColumn[R, T7],
        c8: GeneratedReadColumn[R, T8],
        /,
    ) -> GeneratedReadQuery[R, tuple[T1, T2, T3, T4, T5, T6, T7, T8]]: ...
    def select(self, *columns: Any) -> GeneratedReadQuery[R, Any]:
        if not 0 <= len(columns) <= 8:
            raise TypeError("generated select accepts zero to eight Fields")
        selection: list[FieldRef] = []
        for column in columns:
            if (
                type(column) is not GeneratedReadColumn
                or self._record.columns.get(_ref_key(column.ref)) is not column
            ):
                raise TypeError("generated select accepts Fields from this Record only")
            selection.append(column.ref)
        if len({_ref_key(field) for field in selection}) != len(selection):
            raise TypeError("generated select repeats a Field")
        return replace(self, _selection=tuple(selection))

    def order_by(self, *items: Ordering[R]) -> GeneratedReadQuery[R, ResultT_co]:
        additions: list[str] = []
        for item in items:
            if (
                type(item) is not Ordering
                or not isinstance(item.field, Node)
                or item.field.op not in {"generated.read.order/1", "generated.read.order/2"}
            ):
                raise TypeError("generated order accepts issued orderings only")
            args = _expression_parts(item.field, self._record, "order")
            if len(args) != 2 or args[1] not in self._record.columns:
                raise TypeError("generated ordering belongs to another Record")
            field_ref = cast(tuple[str, str], args[1])
            binding = self._record.columns[field_ref]._binding
            if binding.orders.get(item.direction.lower()) != args[0]:
                raise TypeError("generated ordering ID/direction differs")
            root = self._client._issued_root(self._record.module, self._record.record)
            issued_orders = cast(Mapping[str, object], root["orders"])
            issued_order = issued_orders.get(cast(str, args[0]))
            if (
                not isinstance(issued_order, Mapping)
                or issued_order.get("fieldId") != _field_id(binding.field)
                or issued_order.get("direction") != item.direction.lower()
                or issued_order.get("nulls") != item.nulls.lower()
            ):
                raise TypeError("generated ordering null placement differs")
            additions.append(cast(str, args[0]))
        if len(set(self._orders + tuple(additions))) != len(
            self._orders + tuple(additions)
        ):
            raise TypeError("generated ordering repeats an order")
        return replace(self, _orders=self._orders + tuple(additions))

    def limit(self, rows: int) -> GeneratedReadQuery[R, ResultT_co]:
        if type(rows) is not int or not 1 <= rows <= min(1000, self._record.max_rows):
            raise ValueError("generated read limit exceeds the admitted root")
        return replace(self, _limit=rows)

    def all(self) -> Terminal[list[ResultT_co]]:
        if self._client._uses_v2(self._record.module, self._record.record):
            return cast(Terminal[list[ResultT_co]], self._v2_terminal("all"))
        from umf_access_generated_executor import GeneratedReadCall

        selection = self._selection
        selection_ids = (
            None
            if selection is None
            else tuple(_field_id(field) for field in selection)
        )
        call = GeneratedReadCall(
            self._record.module,
            self._record.record,
            selection_ids,
            self._filters,
            self._orders,
            self._limit or self._record.max_rows,
        )
        return Terminal(
            Node(
                "generated.read.terminal/1",
                (self._client._token, call, selection, self._record),
            )
        )


ReadInvoker = Callable[[object], Awaitable[Mapping[str, object]]]


class GeneratedClient:
    """Per-artifact client; the host supplies the only execution callback."""

    __slots__ = ("_invoke", "_models", "_models_frozen", "_native", "_token", "_record_facades")

    def __init__(
        self,
        native_binding: object,
        invoke: ReadInvoker,
        model_factory: Callable[[GeneratedClient], object] | None = None,
    ):
        from .generated_binding import GeneratedNativeTableBinding

        if type(native_binding) is not GeneratedNativeTableBinding or not callable(
            invoke
        ):
            raise TypeError("generated client requires the host-owned native binding")
        self._native = native_binding
        self._invoke = invoke
        self._token = object()
        self._record_facades: dict[tuple[str, str], _GeneratedRowFacade[Any]] = {}
        self._models = SimpleNamespace()
        self._models_frozen = False
        if model_factory is not None:
            models = model_factory(self)
            if isinstance(models, _FrozenNamespace):
                self._models = models
            elif isinstance(models, Mapping):
                if any(type(name) is not str for name in models):
                    raise TypeError("generated model factory returned invalid names")
                self._models = _FrozenNamespace(models)
            elif hasattr(models, "__dict__"):
                self._models = _FrozenNamespace(vars(models))
            else:
                raise TypeError("generated model factory must return a model namespace")
            self._models_frozen = True

    @classmethod
    def from_host(
        cls,
        native_binding: object,
        invoke: ReadInvoker,
        *,
        model_factory: Callable[[GeneratedClient], object] | None = None,
    ) -> GeneratedClient:
        """Construct a per-artifact facade with the host's request-bound invoker."""
        return cls(native_binding, invoke, model_factory)

    @property
    def target(self) -> Any:
        return self._native.target

    @property
    def target_binding_digest(self) -> str:
        return self._native.target_binding_digest

    @property
    def read_profile(self) -> str | None:
        return cast(Any, self._native).read_profile

    @property
    def artifact_digest(self) -> str:
        return cast(Any, self._native).artifact_digest

    @property
    def receipt_digest(self) -> str:
        return cast(Any, self._native).receipt_digest

    @property
    def source_digest(self) -> str:
        return self._native.source_digest

    @property
    def algebra_digest(self) -> str:
        return self._native.algebra_digest

    @property
    def models(self) -> object:
        if not self._models_frozen:
            if not hasattr(self._models, "__dict__"):
                raise TypeError("generated model namespace is not exposable")
            self._models = _FrozenNamespace(vars(self._models))
            self._models_frozen = True
        return self._models

    def model(
        self,
        module: str,
        record: str,
        row_type: type[R],
        fields: tuple[GeneratedFieldBinding, ...],
        default_selection: tuple[FieldRef, ...],
        max_rows: int,
        source_digest: str,
        target_binding_digest: str,
        algebra_digest: str,
        *,
        key_type: type[Any] | None = None,
        key_id: str | None = None,
    ) -> _GeneratedRowFacade[R]:
        if self._models_frozen:
            raise SessionError("generated model registrations are sealed")
        expected = {
            "source": self.source_digest,
            "target": self.target_binding_digest,
            "algebra": self.algebra_digest,
        }
        actual = {
            "source": source_digest,
            "target": target_binding_digest,
            "algebra": algebra_digest,
        }
        if actual != expected:
            raise SessionError("generated client source/target/algebra pins differ")
        if (
            type(module) is not str
            or module != self._native.module
            or type(record) is not str
            or not record
        ):
            raise TypeError("generated Record identity differs")
        if not isinstance(row_type, type) or type(fields) is not tuple or not fields:
            raise TypeError("generated Record facade metadata is incomplete")
        if type(default_selection) is not tuple or type(max_rows) is not int:
            raise TypeError("generated Record selection metadata differs")
        root = self._issued_root(module, record)
        root_fields = cast(Mapping[str, object], root["fields"])
        if type(root["predicates"]) is not dict or type(root["orders"]) is not dict:
            raise SessionError("generated read expression inventory differs")
        expected_predicates: dict[str, dict[str, str]] = {
            identity: {} for identity in root_fields
        }
        for identity, value in root["predicates"].items():
            if not isinstance(value, Mapping):
                raise SessionError("generated predicate inventory is malformed")
            field_id = cast(str, value.get("fieldId"))
            operator = cast(str, value.get("operator"))
            if (
                field_id not in expected_predicates
                or operator in expected_predicates[field_id]
            ):
                raise SessionError("generated predicate identity is ambiguous")
            expected_predicates[field_id][operator] = identity
        expected_orders: dict[str, dict[str, str]] = {
            identity: {} for identity in root_fields
        }
        for identity, value in root["orders"].items():
            if not isinstance(value, Mapping):
                raise SessionError("generated order inventory is malformed")
            field_id = cast(str, value.get("fieldId"))
            direction = cast(str, value.get("direction"))
            if (
                field_id not in expected_orders
                or direction in expected_orders[field_id]
            ):
                raise SessionError("generated order identity is ambiguous")
            expected_orders[field_id][direction] = identity
        field_by_id: dict[str, GeneratedFieldBinding] = {}
        attributes: set[str] = set()
        columns: dict[tuple[str, str], GeneratedReadColumn[R, object]] = {}
        for binding in fields:
            if type(binding) is not GeneratedFieldBinding:
                raise TypeError("generated Field mapping must be immutable")
            identity = _field_id(binding.field)
            if _owner_key(binding.field) != (module, record, None):
                raise SessionError("generated Field owner differs from its Record")
            if identity in field_by_id or binding.attribute in attributes:
                raise TypeError("generated Field or row attribute is ambiguous")
            issued = root_fields.get(identity)
            if not isinstance(issued, Mapping):
                raise SessionError("generated Field is absent from the admitted algebra")
            source_field = issued.get("sourceField")
            if (
                not isinstance(source_field, Mapping)
                or source_field
                != {
                    "module": binding.field.field_module,
                    "element": binding.field.field,
                }
            ):
                raise SessionError("generated Field source identity differs")
            if _canonical_bytes(issued["output"]) != _canonical_bytes(binding.output):
                raise SessionError(
                    "generated Field output differs from the admitted algebra"
                )
            if binding.carrier != issued["output"]["carrier"]:
                raise SessionError(
                    "generated Field carrier differs from the admitted algebra"
                )
            if (
                dict(binding.predicates) != expected_predicates[identity]
                or dict(binding.orders) != expected_orders[identity]
            ):
                raise SessionError(
                    "generated Field expression IDs differ from the admitted algebra"
                )
            field_by_id[identity] = binding
            attributes.add(binding.attribute)
            columns[_ref_key(binding.field)] = GeneratedReadColumn(
                binding,
                _client_token=(
                    self._token if self.read_profile == "weft.generated-read-algebra/8" else None
                ),
            )
        if set(field_by_id) != set(root_fields):
            raise SessionError(
                "generated Record Fields differ from the admitted algebra"
            )
        raw_defaults = root["defaultSelection"]
        if not isinstance(raw_defaults, (list, tuple)):
            raise SessionError("generated Record default selection is malformed")
        expected_defaults = tuple(cast(str, identity) for identity in raw_defaults)
        default_ids = tuple(_field_id(field) for field in default_selection)
        field_order = tuple(_field_id(binding.field) for binding in fields)
        if (
            default_ids != expected_defaults
            or field_order != expected_defaults
            or max_rows != root["maxRows"]
        ):
            raise SessionError("generated Record default selection differs")
        if any(
            type(field) is not FieldRef
            or _owner_key(field) != (module, record, None)
            or _ref_key(field) not in columns
            for field in default_selection
        ):
            raise TypeError("generated default selection references an unknown Field")
        row_model_fields = getattr(row_type, "model_fields", None)
        raw_umf_fields = getattr(row_type, "UMF_FIELDS", None)
        expected_umf_fields = tuple(
            (
                cast(str, binding.field.field_module),
                binding.field.field,
                binding.attribute,
            )
            for binding in fields
        )
        if type(raw_umf_fields) is not tuple or raw_umf_fields != expected_umf_fields:
            raise SessionError("generated row UMF_FIELDS differ from issued Fields")
        if isinstance(row_model_fields, Mapping) and any(
            attribute not in row_model_fields for attribute in attributes
        ):
            raise TypeError("generated row attribute is absent from the row model")
        if not hasattr(row_type, "model_fields") and any(
            not hasattr(row_type, attribute) for attribute in attributes
        ):
            raise TypeError("generated row attribute is absent from the row type")
        by_attribute = {
            binding.attribute: columns[_ref_key(binding.field)] for binding in fields
        }
        relationships: Mapping[str, object] = MappingProxyType({})
        if self.read_profile == "weft.generated-read-algebra/8":
            from .generated_join_query import build_required_join_bindings

            relation_columns, relationships = build_required_join_bindings(
                row_type,
                module=module,
                record=record,
                root=root,
                client_token=self._token,
            )
            esc = lambda part: part.replace("~", "~0").replace("/", "~1")
            root_id = esc(module) + "/" + esc(record)
            public_roots = cast(Any, self._native).joined_read_roots
            if type(public_roots) is not tuple:
                raise SessionError("generated joined root inventory is malformed")
            authorized = {
                (item.relationship_module, item.relationship_id)
                for item in public_roots
                if getattr(item, "root_id", None) == root_id
            }
            eligible = {
                (binding.relationship_module, binding.relationship_id)
                for binding in relationships.values()
                if getattr(binding, "status", None) == "eligible"
            }
            if eligible != authorized:
                raise SessionError("generated RequiredJoin facade differs from the verified executor inventory")
            if set(by_attribute) & set(relation_columns):
                raise SessionError("generated Field and Relationship attributes collide")
            by_attribute.update(relation_columns)
        c_namespace = _FrozenNamespace(by_attribute)
        if key_type is not None:
            primary_key = root.get("primaryKey")
            if (
                not isinstance(key_type, type)
                or not isinstance(primary_key, (list, tuple))
                or type(key_id) is not str
                or not key_id
                or root.get("primaryKeyId") != key_id
                or getattr(key_type, "UMF_KEY", False) is not True
            ):
                raise SessionError("generated Key metadata differs")
        facade = _GeneratedRowFacade(
            self,
            module,
            record,
            row_type,
            fields,
            default_selection,
            max_rows,
            MappingProxyType(columns),
            c_namespace,
            None,
            key_type,
            key_id,
            relationships,
        )
        if (module, record) in self._record_facades:
            raise SessionError("generated Record is registered more than once")
        self._record_facades[(module, record)] = facade
        query = GeneratedReadQuery(self, facade)
        object.__setattr__(facade, "objects", query)
        model_name = row_type.__name__
        if hasattr(self._models, model_name):
            raise TypeError("generated client model name is ambiguous")
        setattr(self._models, model_name, facade)
        return facade

    async def run(
        self,
        terminal: Terminal[Any],
    ) -> object:
        from umf_access_generated_executor import GeneratedReadCall, GeneratedReadCallV2, GeneratedOrdinaryPageCall

        if not self._models_frozen and hasattr(self._models, "__dict__"):
            self._models = _FrozenNamespace(vars(self._models))
            self._models_frozen = True

        if type(terminal) is Terminal and terminal.node.op == "generated.read.joined/3":
            from umf_access_generated_executor import GeneratedJoinedReadCall
            from .generated_join_query import GeneratedJoinedReadQuery

            node = terminal.node
            if len(node.args) != 3:
                raise TypeError("generated joined terminal identity differs")
            token, call, query = node.args
            if (
                token is not self._token
                or type(call) is not GeneratedJoinedReadCall
                or type(query) is not GeneratedJoinedReadQuery
                or query._client is not self
                or query._relationship.client_token is not self._token
                or query._call() != call
            ):
                raise TypeError("generated joined terminal belongs to another client or query")
            try:
                identity = cast(Any, self._native).joined_read_identity(call)
            except GeneratedNativeError:
                raise
            if type(identity) is not str or not identity:
                raise SessionError("generated joined call identity is malformed")
            response = await self._invoke(call.to_mapping())
            if not cast(Any, self._native).validate_joined_read_result(response, call):
                raise SessionError("generated joined host result failed issuer validation")
            if isinstance(response, Mapping) and set(response) == {"schema", "error"}:
                error = response.get("error")
                code = error.get("code") if isinstance(error, Mapping) else None
                if type(code) is not str:
                    raise SessionError("generated joined error frame is malformed")
                if code in {"DENIED", "INVALID", "INVALID_CURSOR", "UNSUPPORTED", "LIMIT_EXCEEDED", "SCHEMA_MISMATCH", "PRECONDITION_FAILED", "BUSY"}:
                    raise GeneratedNativeError(cast(Any, code))
                raise SessionError(code)
            return _decode_joined_read_result(response, query)

        if type(terminal) is not Terminal or terminal.node.op not in {
            "generated.read.terminal/1",
            "generated.read.terminal/2",
            "generated.read.page/6",
        } or len(terminal.node.args) != 4:
            raise TypeError("generated client accepts its own read terminals only")
        token, call, selection, record = terminal.node.args
        page = terminal.node.op == "generated.read.page/6"
        v2 = terminal.node.op == "generated.read.terminal/2"
        if (
            token is not self._token
            or type(call) is not (GeneratedOrdinaryPageCall if page else (GeneratedReadCallV2 if v2 else GeneratedReadCall))
            or type(record) is not _GeneratedRowFacade
            or record.client is not self
        ):
            raise TypeError("generated terminal belongs to another client")
        if selection is not None and (
            type(selection) is not tuple
            or any(type(field) is not FieldRef for field in selection)
        ):
            raise TypeError("generated terminal selection differs")
        if page:
            escaped = lambda value: value.replace("~", "~0").replace("/", "~1")
            expected_root = escaped(record.module) + "/" + escaped(record.record)
            expected_ids = (
                tuple(_field_id(field) for field in selection)
                if selection is not None
                else tuple(_field_id(field) for field in record.default_selection)
            )
            if (
                call.root_id != expected_root
                or call.selected_field_ids != expected_ids
                or type(call.size) is not int
                or not 1 <= call.size <= 1000
                or call.snapshot is not False
            ):
                raise SessionError("generated Page terminal identity differs")
            try:
                expected_identity = cast(Any, self._native).ordinary_page_identity(call)
            except GeneratedNativeError as error:
                if call.after is not None and error.code in {"INVALID", "INVALID_CURSOR"}:
                    from umf_access.pages import StaleContinuation
                    raise StaleContinuation("stale or incompatible generated Page continuation") from None
                raise
            if self.read_profile in {"weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}:
                response = await self._invoke(call.to_mapping())
                is_fixed_error = (
                    isinstance(response, Mapping)
                    and set(response) == {"schema", "error"}
                    and response.get("schema") == self.source_digest
                )
                if not is_fixed_error and not cast(Any, self._native).validate_ordinary_page_result(response, call):
                    raise SessionError("generated Page host result failed issuer validation")
            else:
                response = await self._invoke(call)
            from .generated_page import decode_page_result
            return decode_page_result(response, record, selection, call, expected_identity)
        if call.module != record.module or call.record != record.record:
            raise SessionError("generated terminal Record or limit differs")
        if not v2 and cast(GeneratedReadCall, call).limit > record.max_rows:
            raise SessionError("generated terminal Record or limit differs")
        expected_selection = (
            None
            if selection is None
            else tuple(
                _field_id(field)
                for field in cast(tuple[FieldRef, ...], selection)
            )
        )
        if call.selection != expected_selection:
            raise SessionError("generated terminal selection differs from its call")
        if v2:
            response = await self._invoke(cast(GeneratedReadCallV2, call).to_mapping())
            return _decode_v2_frame(response, record, selection, call)
        response = await self._invoke(call)
        return _decode_frame(
            response,
            record,
            cast(tuple[FieldRef, ...] | None, selection),
            call,
        )

    def _issued_root(self, module: str, record: str) -> Mapping[str, object]:
        from umf_access_generated_executor import canonical_json, parse_json

        content = self._native.algebra_json
        if (
            type(content) is not bytes
            or hashlib.sha256(content).hexdigest() != self.algebra_digest
        ):
            raise SessionError("generated algebra file digest differs")
        algebra = parse_json(content)
        if type(algebra) is not dict or canonical_json(algebra) != content:
            raise SessionError("generated algebra is not canonical")
        escape = lambda part: part.replace("~", "~0").replace("/", "~1")
        key = escape(module) + "/" + escape(record)
        roots = algebra.get("roots")
        root = roots.get(key) if isinstance(roots, Mapping) else None
        if (
            not isinstance(root, Mapping)
            or root.get("module") != module
            or root.get("record") != record
        ):
            raise SessionError("generated Record is absent from the admitted algebra")
        return root

    def _uses_v2(self, module: str, record: str) -> bool:
        return "terminals" in self._issued_root(module, record)




def _decode_joined_read_result(response: Mapping[str, object], query: object) -> list[object]:
    """Materialize a pure validated joined frame through issued Field codecs."""
    from .generated_join_query import GeneratedJoinedReadQuery

    if type(query) is not GeneratedJoinedReadQuery:
        raise TypeError("generated joined result query differs")
    table = response.get("table")
    if not isinstance(table, Mapping) or not isinstance(table.get("rows"), (list, tuple)):
        raise SessionError("generated joined result frame differs")
    descriptor = query._relationship.descriptor
    field_descriptors = descriptor.get("fields")
    if not isinstance(field_descriptors, (list, tuple)):
        raise SessionError("generated joined Field inventory differs")
    if query._selection is None:
        selected_columns = tuple(
            query._root_record.columns[(field.field_module, field.field)]
            for field in query._root_record.default_selection
        )
    else:
        selected_columns = query._selection
    outputs: list[Mapping[str, object]] = []
    for column in selected_columns:
        owner = (
            "root"
            if any(value is column for value in query._root_record.columns.values())
            else "target"
        )
        field_id = _field_id(column.ref)
        matches = [
            item for item in field_descriptors
            if isinstance(item, Mapping)
            and item.get("owner") == owner
            and item.get("fieldId") == field_id
        ]
        if len(matches) != 1 or not isinstance(matches[0].get("output"), Mapping):
            raise SessionError("generated joined selected Field is not issued")
        outputs.append(cast(Mapping[str, object], matches[0]["output"]))
    result: list[object] = []
    for row in cast(list[object], table["rows"]):
        if not isinstance(row, (list, tuple)) or len(row) != len(outputs) + 1:
            raise SessionError("generated joined row shape differs")
        values = tuple(
            _decode_literal(value, output)
            for value, output in zip(row[1:], outputs, strict=True)
        )
        if query._selection is None:
            result.append(query._root_record.row_type(**{
                column._binding.attribute: value
                for column, value in zip(selected_columns, values, strict=True)
            }))
        else:
            result.append(values)
    return result


def _decode_frame(
    response: Mapping[str, object],
    record: _GeneratedRowFacade[Any],
    selection: tuple[FieldRef, ...] | None,
    call: Any,
) -> object:
    if (
        not isinstance(response, Mapping)
        or set(response) != {"schema", "table"}
        or response.get("schema") != record.client.source_digest
    ):
        raise SessionError("generated host result envelope differs")
    frame = response.get("table")
    if not isinstance(frame, Mapping) or set(frame) != {
        "version",
        "kind",
        "sourceDigest",
        "module",
        "record",
        "columns",
        "rows",
        "cursor",
    }:
        raise SessionError("generated read result frame differs")
    if (
        frame.get("version") != "umf.generated-read-result/1"
        or frame.get("kind") != "many"
        or frame.get("sourceDigest") != record.client.source_digest
        or frame.get("module") != record.module
        or frame.get("record") != record.record
        or frame.get("cursor") is not None
    ):
        raise SessionError("generated read result pins differ")
    expected_fields = record.default_selection if selection is None else selection
    columns = frame["columns"]
    rows = frame["rows"]
    if (
        not isinstance(columns, (list, tuple))
        or not isinstance(rows, (list, tuple))
        or len(columns) != len(expected_fields)
        or len(rows) > call.limit
    ):
        raise SessionError("generated read result bounds differ")
    outputs: list[Mapping[str, object]] = []
    bindings: list[GeneratedFieldBinding] = []
    for descriptor, field in zip(columns, expected_fields, strict=True):
        if not isinstance(descriptor, Mapping) or set(descriptor) != {
            "field",
            "output",
        }:
            raise SessionError("generated result column descriptor differs")
        source_field = descriptor["field"]
        if (
            not isinstance(source_field, Mapping)
            or set(source_field) != {"module", "element"}
            or source_field
            != {"module": field.field_module, "element": field.field}
        ):
            raise SessionError("generated result qualified Field differs")
        binding = (
            record.columns.get(_ref_key(field))._binding
            if _ref_key(field) in record.columns
            else None
        )
        if binding is None or _canonical_bytes(
            descriptor["output"]
        ) != _canonical_bytes(binding.output):
            raise SessionError("generated result output descriptor differs")
        outputs.append(cast(Mapping[str, object], descriptor["output"]))
        bindings.append(binding)
    result: list[object] = []
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) != len(expected_fields):
            raise SessionError("generated result row arity differs")
        values = [
            _decode_literal(value, output)
            for value, output in zip(row, outputs, strict=True)
        ]
        if selection is None:
            kwargs = {
                binding.attribute: value
                for binding, value in zip(bindings, values, strict=True)
            }
            result.append(record.row_type(**kwargs))
        else:
            result.append(tuple(values))
    return result


def _decode_v2_frame(
    response: Mapping[str, object],
    record: _GeneratedRowFacade[Any],
    selection: tuple[FieldRef, ...] | None,
    call: Any,
) -> object:
    if (
        not isinstance(response, Mapping)
        or set(response) != {"schema", "table"}
        or response.get("schema") != record.client.source_digest
    ):
        raise SessionError("generated host result envelope differs")
    frame = response.get("table")
    if not isinstance(frame, Mapping):
        raise SessionError("generated v2 result frame differs")
    common = {
        "version": "umf.generated-read-result/2",
        "sourceDigest": record.client.source_digest,
        "module": record.module,
        "record": record.record,
    }
    terminal = call.terminal
    if terminal in {"count", "exists"}:
        if set(frame) != set(common) | {"kind", "terminal", "value"} or any(
            frame.get(key) != value for key, value in common.items()
        ) or frame.get("kind") != "scalar" or frame.get("terminal") != terminal:
            raise SessionError("generated scalar result pins differ")
        value = frame.get("value")
        if terminal == "count":
            if (
                type(value) is not dict
                or set(value) != {"integerToken"}
                or type(value["integerToken"]) is not str
                or _INT_TOKEN.fullmatch(value["integerToken"]) is None
                or value["integerToken"].startswith("-")
            ):
                raise SessionError("generated count result is malformed")
            return int(value["integerToken"])
        if (
            type(value) is not dict
            or set(value) != {"boolean"}
            or type(value["boolean"]) is not bool
        ):
            raise SessionError("generated exists result is malformed")
        return value["boolean"]

    expected = set(common) | {"kind", "terminal", "columns", "rows", "cursor"}
    if set(frame) != expected or any(
        frame.get(key) != value for key, value in common.items()
    ) or frame.get("kind") != "rows" or frame.get("terminal") != terminal or frame.get("cursor") is not None:
        raise SessionError("generated row result pins differ")
    rows = frame.get("rows")
    if not isinstance(rows, (list, tuple)):
        raise SessionError("generated row result shape differs")
    if terminal == "first" and len(rows) > 1:
        raise SessionError("generated first result exceeds its bound")
    if terminal in {"one", "get"} and len(rows) != 1:
        raise SessionError("generated one result cardinality differs")
    root = record.client._issued_root(record.module, record.record)
    limit = call.limit or cast(int, root["maxRows"])
    if terminal == "all" and len(rows) > limit:
        raise SessionError("generated all result exceeds its bound")
    row_frame = {
        "version": "umf.generated-read-result/1",
        "kind": "many",
        "sourceDigest": frame["sourceDigest"],
        "module": frame["module"],
        "record": frame["record"],
        "columns": frame["columns"],
        "rows": rows,
        "cursor": None,
    }
    decoded = _decode_frame(
        {"schema": response["schema"], "table": row_frame},
        record,
        selection,
        SimpleNamespace(limit=limit),
    )
    decoded_rows = cast(list[object], decoded)
    if terminal == "first":
        return decoded_rows[0] if decoded_rows else None
    if terminal in {"one", "get"}:
        return decoded_rows[0]
    return decoded


__all__ = [
    "GeneratedClient",
    "GeneratedFieldBinding",
    "GeneratedReadColumn",
    "GeneratedReadQuery",
]
