# SPDX-License-Identifier: MIT OR Apache-2.0
"""Typed per-client facade for the issued one-edge required join slice."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from types import MappingProxyType
from typing import TYPE_CHECKING, Any, Generic, TypeVar, cast, overload

from umf_access.dsl import Node, Ordering, Predicate, RequiredJoin, Terminal

from umf_access_generated_executor import (
    GeneratedJoinedAnd,
    GeneratedJoinedAtom,
    GeneratedJoinedField,
    GeneratedJoinedNot,
    GeneratedJoinedOr,
    GeneratedJoinedOrder,
    GeneratedJoinedReadCall,
)

if TYPE_CHECKING:
    from ._generated_columns import GeneratedReadColumn

R = TypeVar("R")
J = TypeVar("J")
T1 = TypeVar("T1")
T2 = TypeVar("T2")
T3 = TypeVar("T3")
T4 = TypeVar("T4")
T5 = TypeVar("T5")
T6 = TypeVar("T6")
T7 = TypeVar("T7")
T8 = TypeVar("T8")
ResultT = TypeVar("ResultT", covariant=True)


def _escaped(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _field_id(field: object) -> str:
    return _escaped(cast(str, getattr(field, "field_module"))) + "/" + _escaped(
        cast(str, getattr(field, "field"))
    )


def _unescape_component(value: str) -> str:
    output: list[str] = []
    index = 0
    while index < len(value):
        if value[index] != "~":
            output.append(value[index])
            index += 1
        elif value.startswith("~0", index):
            output.append("~")
            index += 2
        elif value.startswith("~1", index):
            output.append("/")
            index += 2
        else:
            raise TypeError("generated Relationship ID is not canonical")
    return "".join(output)


@dataclass(frozen=True, slots=True)
class RequiredJoinBinding:
    """One concrete client-owned RequiredJoin and its issued disposition."""

    relationship: RequiredJoin[Any, Any, Any]
    relationship_module: str
    relationship_id: str
    target_module: str
    target_record: str
    status: str
    reason: str | None
    descriptor: Mapping[str, object]
    client_token: object

    def __post_init__(self) -> None:
        if type(self.relationship) is not RequiredJoin:
            raise TypeError("generated join requires a concrete RequiredJoin")
        if self.status not in {"eligible", "unsupported"}:
            raise TypeError("generated join disposition is malformed")
        from umf_access_generated_executor import freeze_json

        object.__setattr__(self, "descriptor", freeze_json(dict(self.descriptor)))


def build_required_join_bindings(
    row_type: type[Any],
    *,
    module: str,
    record: str,
    root: Mapping[str, object],
    client_token: object,
) -> tuple[Mapping[str, object], Mapping[str, RequiredJoinBinding]]:
    """Rebind original generated relationships to this facade's client token."""
    joins = root.get("requiredInnerJoins")
    if not isinstance(joins, Mapping) or joins.get("profile") != "weft.generated-required-inner-join-catalog/1":
        raise TypeError("generated required Relationship catalog is absent")
    catalog = joins.get("relationships")
    if not isinstance(catalog, Mapping):
        raise TypeError("generated required Relationship inventory is malformed")
    stage_columns = getattr(row_type, "c", None)
    if stage_columns is None:
        raise TypeError("stage-one generated Record has no Column namespace")
    authored: dict[str, tuple[str, RequiredJoin[Any, Any, Any]]] = {}
    for attribute in dir(stage_columns):
        if attribute.startswith("_"):
            continue
        member = getattr(stage_columns, attribute)
        ref = getattr(member, "ref", None)
        if ref is None or getattr(ref, "module", None) != module or getattr(ref, "element", None) != record:
            continue
        if not isinstance(member, RequiredJoin):
            continue
        identity = _field_id(ref)
        if identity in authored:
            raise TypeError("generated Relationship identity is ambiguous")
        authored[identity] = (attribute, member)
    values: dict[str, object] = {}
    bindings: dict[str, RequiredJoinBinding] = {}
    for identity, (attribute, original) in authored.items():
        disposition = catalog.get(identity)
        if not isinstance(disposition, Mapping):
            raise TypeError("stage-one required Relationship is absent from the issued catalog")
        ref = original.ref
        target = original.target
        if (
            original.direction != "forward"
            or target.alias is not None
            or target.key_id is None
            or target.source != ref.source
            or original.ref.alias is not None
        ):
            # Preserve this source member as an unsupported client-owned join
            # token; Query.join will return a fixed unsupported error.
            status, reason = "unsupported", "relationship-outside-required-inner-join-profile"
        elif disposition.get("status") == "unsupported":
            status, reason = "unsupported", cast(str, disposition.get("reason", "unsupported"))
        else:
            status, reason = "eligible", None
            logical = disposition.get("relationship")
            native_binding = disposition.get("binding")
            if not isinstance(logical, Mapping):
                raise TypeError("admitted Relationship cut is malformed")
            source_ref = logical.get("source")
            target_ref = logical.get("target")
            target_multiplicity = logical.get("targetMultiplicity")
            raw_pairs = native_binding.get("pairs") if isinstance(native_binding, Mapping) else None
            target_query = getattr(original, "target_query", None)
            target_key = getattr(target_query, "key", None)
            expected_target_pairs = tuple((field.field_module, field.field) for field in target_key) if isinstance(target_key, tuple) else None
            source_field_inventory = {
                (field.get("sourceField", {}).get("module"), field.get("sourceField", {}).get("element"))
                for field in cast(Mapping[str, object], root.get("fields", {})).values()
                if isinstance(field, Mapping) and isinstance(field.get("sourceField"), Mapping)
            }
            observed_pairs = tuple(
                (
                    (pair.get("sourceField", {}).get("module"), pair.get("sourceField", {}).get("element")),
                    (pair.get("targetField", {}).get("module"), pair.get("targetField", {}).get("element")),
                    pair.get("sourceColumn", {}).get("field") == pair.get("sourceField"),
                    pair.get("targetColumn", {}).get("field") == pair.get("targetField"),
                )
                for pair in raw_pairs
                if isinstance(pair, Mapping)
                and isinstance(pair.get("sourceField"), Mapping)
                and isinstance(pair.get("targetField"), Mapping)
                and isinstance(pair.get("sourceColumn"), Mapping)
                and isinstance(pair.get("targetColumn"), Mapping)
            ) if isinstance(raw_pairs, (list, tuple)) else ()
            raw_pair_count = len(raw_pairs) if isinstance(raw_pairs, (list, tuple)) else -1
            if (
                not isinstance(source_ref, Mapping)
                or (source_ref.get("module"), source_ref.get("element")) != (module, record)
                or not isinstance(target_ref, Mapping)
                or (target_ref.get("module"), target_ref.get("element"), target_ref.get("key"))
                != (target.module, target.element, target.key_id)
                or logical.get("module") != ref.field_module
                or logical.get("id") != ref.field
                or logical.get("directed") is not True
                or target_multiplicity != {"min": 1, "max": 1}
                or not isinstance(native_binding, Mapping)
                or native_binding.get("toOne") is not True
                or native_binding.get("sourceRecord") != [module, record]
                or native_binding.get("targetRecord") != [target.module, target.element]
                or expected_target_pairs is None
                or tuple(pair[1] for pair in observed_pairs) != expected_target_pairs
                or any(pair[0] not in source_field_inventory or pair[2] is not True or pair[3] is not True for pair in observed_pairs)
                or len(observed_pairs) != raw_pair_count
            ):
                raise TypeError("admitted Relationship differs from its original declaration, target Key order or owner-scoped binding pairs")
        concrete = RequiredJoin(
            ref,
            target,
            key_target=original.key_target,
            direction=original.direction,
            optional=False,
        )
        relationship_module, relationship_id = (
            _unescape_component(part) for part in identity.split("/", 1)
        )
        target_module = target.module
        target_record = target.element
        relationship_data = disposition if status == "eligible" else {"status": "unsupported", "reason": reason or "unsupported"}
        binding = RequiredJoinBinding(
            concrete,
            relationship_module,
            relationship_id,
            target_module,
            target_record,
            status,
            reason,
            relationship_data,
            client_token,
        )
        values[attribute] = concrete
        bindings[identity] = binding
    return MappingProxyType(values), MappingProxyType(bindings)


@dataclass(frozen=True, slots=True)
class GeneratedJoinedReadQuery(Generic[R, J, ResultT]):
    _client: Any
    _root_record: Any
    _target_record: Any
    _relationship: RequiredJoinBinding
    _selection: tuple[Any, ...] | None
    _where: object | None
    _orders: tuple[GeneratedJoinedOrder, ...]
    _limit: int | None

    def __bool__(self) -> bool:
        raise TypeError("generated queries have no truth value")

    def _owner(self, column: object) -> tuple[str, str, str]:
        from ._generated_columns import GeneratedReadColumn

        if type(column) is not GeneratedReadColumn or column._client_token is not self._client._token:
            raise TypeError("joined query accepts Columns from this client only")
        for record in (self._root_record, self._target_record):
            if record.columns.get((column.ref.field_module, column.ref.field)) is column:
                return record.module, record.record, _field_id(column.ref)
        raise TypeError("joined query Column belongs to another Record or alias")

    def _selection_slots(self) -> tuple[GeneratedJoinedField, ...] | None:
        if self._selection is None:
            return None
        slots = []
        for column in self._selection:
            module, record, field = self._owner(column)
            slots.append(GeneratedJoinedField(module, record, field))
        return tuple(slots)

    def _call(self) -> GeneratedJoinedReadCall:
        return GeneratedJoinedReadCall(
            self._root_record.module,
            self._root_record.record,
            self._relationship.relationship_module,
            self._relationship.relationship_id,
            self._selection_slots(),
            cast(Any, self._where),
            self._orders,
            self._limit,
        )

    def filter(self, *predicates: Predicate[R | J]) -> GeneratedJoinedReadQuery[R, J, ResultT]:
        additions = tuple(
            _joined_where_from_predicate(predicate, self)
            for predicate in predicates
        )
        if not additions:
            return self
        terms = (() if self._where is None else (self._where,)) + additions
        where = terms[0] if len(terms) == 1 else GeneratedJoinedAnd(cast(Any, terms))
        return replace(self, _where=where)

    where = filter

    @overload
    def select(self) -> GeneratedJoinedReadQuery[R, J, tuple[()]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], c2: GeneratedReadColumn[R, T2] | GeneratedReadColumn[J, T2], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1, T2]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], c2: GeneratedReadColumn[R, T2] | GeneratedReadColumn[J, T2], c3: GeneratedReadColumn[R, T3] | GeneratedReadColumn[J, T3], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1, T2, T3]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], c2: GeneratedReadColumn[R, T2] | GeneratedReadColumn[J, T2], c3: GeneratedReadColumn[R, T3] | GeneratedReadColumn[J, T3], c4: GeneratedReadColumn[R, T4] | GeneratedReadColumn[J, T4], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1, T2, T3, T4]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], c2: GeneratedReadColumn[R, T2] | GeneratedReadColumn[J, T2], c3: GeneratedReadColumn[R, T3] | GeneratedReadColumn[J, T3], c4: GeneratedReadColumn[R, T4] | GeneratedReadColumn[J, T4], c5: GeneratedReadColumn[R, T5] | GeneratedReadColumn[J, T5], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1, T2, T3, T4, T5]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], c2: GeneratedReadColumn[R, T2] | GeneratedReadColumn[J, T2], c3: GeneratedReadColumn[R, T3] | GeneratedReadColumn[J, T3], c4: GeneratedReadColumn[R, T4] | GeneratedReadColumn[J, T4], c5: GeneratedReadColumn[R, T5] | GeneratedReadColumn[J, T5], c6: GeneratedReadColumn[R, T6] | GeneratedReadColumn[J, T6], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1, T2, T3, T4, T5, T6]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], c2: GeneratedReadColumn[R, T2] | GeneratedReadColumn[J, T2], c3: GeneratedReadColumn[R, T3] | GeneratedReadColumn[J, T3], c4: GeneratedReadColumn[R, T4] | GeneratedReadColumn[J, T4], c5: GeneratedReadColumn[R, T5] | GeneratedReadColumn[J, T5], c6: GeneratedReadColumn[R, T6] | GeneratedReadColumn[J, T6], c7: GeneratedReadColumn[R, T7] | GeneratedReadColumn[J, T7], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1, T2, T3, T4, T5, T6, T7]]: ...
    @overload
    def select(self, c1: GeneratedReadColumn[R, T1] | GeneratedReadColumn[J, T1], c2: GeneratedReadColumn[R, T2] | GeneratedReadColumn[J, T2], c3: GeneratedReadColumn[R, T3] | GeneratedReadColumn[J, T3], c4: GeneratedReadColumn[R, T4] | GeneratedReadColumn[J, T4], c5: GeneratedReadColumn[R, T5] | GeneratedReadColumn[J, T5], c6: GeneratedReadColumn[R, T6] | GeneratedReadColumn[J, T6], c7: GeneratedReadColumn[R, T7] | GeneratedReadColumn[J, T7], c8: GeneratedReadColumn[R, T8] | GeneratedReadColumn[J, T8], /) -> GeneratedJoinedReadQuery[R, J, tuple[T1, T2, T3, T4, T5, T6, T7, T8]]: ...
    def select(self, *columns: object) -> GeneratedJoinedReadQuery[R, J, Any]:
        if len(columns) > 8:
            raise TypeError("generated joined select accepts zero to eight Fields")
        for column in columns:
            self._owner(column)
        typed_columns = tuple(cast(Any, column) for column in columns)
        if len({(column.ref.module, column.ref.element, column.ref.field_module, column.ref.field) for column in typed_columns}) != len(typed_columns):
            raise TypeError("generated joined select repeats an owner Field")
        return replace(self, _selection=typed_columns)

    def order_by(self, *items: Ordering[R] | Ordering[J]) -> GeneratedJoinedReadQuery[R, J, ResultT]:
        additions: list[GeneratedJoinedOrder] = []
        for item in items:
            if type(item) is not Ordering or not isinstance(item.field, Node) or item.field.op != "generated.read.order/2":
                raise TypeError("joined order accepts owner-qualified issued orderings only")
            args = item.field.args
            if len(args) != 4 or args[-1] is not self._client._token:
                raise TypeError("joined ordering belongs to another client")
            owner_ref = args[1]
            field_ref = args[2]
            identity = args[0]
            if type(owner_ref) is not tuple or len(owner_ref) != 3 or owner_ref[2] is not None:
                raise TypeError("joined ordering aliases are unsupported")
            record = next((candidate for candidate in (self._root_record, self._target_record) if owner_ref == (candidate.module, candidate.record, None)), None)
            if record is None or type(field_ref) is not tuple or record.columns.get(field_ref) is None:
                raise TypeError("joined ordering belongs to another Record")
            owner = "root" if record is self._root_record else "target"
            entry = cast(Mapping[str, object], self._relationship.descriptor["orders"])[owner]
            issued = entry.get(identity) if isinstance(entry, Mapping) else None
            if not isinstance(issued, Mapping) or issued.get("fieldId") != _field_id(record.columns[field_ref].ref) or issued.get("direction") != item.direction.lower() or issued.get("nulls") != item.nulls.lower():
                raise TypeError("joined order differs from its issued owner entry")
            additions.append(GeneratedJoinedOrder(record.module, record.record, cast(str, identity)))
        return replace(self, _orders=self._orders + tuple(additions))

    def limit(self, rows: int) -> GeneratedJoinedReadQuery[R, J, ResultT]:
        if type(rows) is not int or not 1 <= rows <= min(1000, self._root_record.max_rows):
            raise ValueError("generated joined limit exceeds the admitted root")
        return replace(self, _limit=rows)

    def join(self, *_args: object, **_kwargs: object) -> Any:
        from .session_policy import SessionError

        raise SessionError("UNSUPPORTED")

    def all(self) -> Terminal[list[ResultT]]:
        call = self._call()
        return Terminal(Node("generated.read.joined/3", (self._client._token, call, self)))


def make_joined_query(root_query: Any, binding: RequiredJoinBinding, row_facade_type: type) -> GeneratedJoinedReadQuery[Any, Any, Any]:
    from .session_policy import SessionError

    if binding.status != "eligible":
        raise SessionError("UNSUPPORTED")
    if binding.client_token is not root_query._client._token:
        raise TypeError("generated RequiredJoin belongs to another client")
    target = root_query._client._record_facades.get((binding.target_module, binding.target_record))
    if type(target) is not row_facade_type:
        raise SessionError("UNSUPPORTED")
    descriptor = binding.descriptor
    logical = cast(Mapping[str, object], descriptor["relationship"])
    target_ref = cast(Mapping[str, object], logical["target"])
    source_ref = cast(Mapping[str, object], logical["source"])
    if (source_ref.get("module"), source_ref.get("element")) != (root_query._record.module, root_query._record.record) or (target_ref.get("module"), target_ref.get("element")) != (target.module, target.record):
        raise SessionError("SCHEMA_MISMATCH")
    where = _root_where_to_joined(root_query._where, root_query._record)
    selection = None if root_query._selection is None else tuple(root_query._record.columns[(field.field_module, field.field)] for field in root_query._selection)
    orders = tuple(GeneratedJoinedOrder(root_query._record.module, root_query._record.record, identity) for identity in root_query._orders)
    return GeneratedJoinedReadQuery(root_query._client, root_query._record, target, binding, selection, where, orders, root_query._limit)


def _root_where_to_joined(where: object | None, record: Any) -> object | None:
    if where is None:
        return None
    from umf_access_generated_executor import GeneratedReadAnd as ReadAnd, GeneratedReadAtom as ReadAtom, GeneratedReadNot as ReadNot, GeneratedReadOr as ReadOr

    if type(where) is ReadAtom:
        return GeneratedJoinedAtom(record.module, record.record, where.predicate_id, where.values)
    if type(where) is ReadAnd:
        return GeneratedJoinedAnd(tuple(cast(Any, _root_where_to_joined(child, record)) for child in where.args))
    if type(where) is ReadOr:
        return GeneratedJoinedOr(tuple(cast(Any, _root_where_to_joined(child, record)) for child in where.args))
    if type(where) is ReadNot:
        return GeneratedJoinedNot(cast(Any, _root_where_to_joined(where.arg, record)))
    raise TypeError("pre-join filter is not an issued root expression")


def _joined_where_from_predicate(predicate: Predicate[Any], query: GeneratedJoinedReadQuery[Any, Any, Any]) -> object:
    if type(predicate) is not Predicate:
        raise TypeError("joined filter accepts issued predicates only")
    node = predicate.node
    if node.op == "generated.read.predicate/2":
        if len(node.args) != 5:
            raise TypeError("joined predicate metadata differs")
        identity, owner_ref, field_ref, values, token = node.args
        if token is not query._client._token or type(owner_ref) is not tuple or len(owner_ref) != 3 or owner_ref[2] is not None or type(field_ref) is not tuple or len(field_ref) != 2 or type(identity) is not str or type(values) is not tuple:
            raise TypeError("joined predicate belongs to another client or owner")
        owner_record = next((record for record in (query._root_record, query._target_record) if owner_ref == (record.module, record.record, None)), None)
        if owner_record is None:
            raise TypeError("joined predicate owner differs")
        field_column = owner_record.columns.get(field_ref)
        if field_column is None or field_column._binding.predicates.get(_operator_for_id(field_column, identity)) != identity:
            raise TypeError("joined predicate ID is not issued for its Field")
        owner = "root" if owner_record is query._root_record else "target"
        predicate_catalog = cast(Mapping[str, object], query._relationship.descriptor["predicates"])
        owner_catalog = predicate_catalog.get(owner)
        issued = owner_catalog.get(identity) if isinstance(owner_catalog, Mapping) else None
        if not isinstance(issued, Mapping) or issued.get("fieldId") != _field_id(field_column.ref):
            raise TypeError("joined predicate differs from its issued owner entry")
        return GeneratedJoinedAtom(owner_record.module, owner_record.record, identity, values)
    if node.op in {"generated.read.and/1", "generated.read.or/1"}:
        if len(node.args) != 2:
            raise TypeError("joined Boolean expression arity differs")
        terms = tuple(_joined_where_from_predicate(Predicate(cast(Node, child)), query) for child in node.args)
        return GeneratedJoinedAnd(cast(Any, terms)) if node.op.endswith("and/1") else GeneratedJoinedOr(cast(Any, terms))
    if node.op == "generated.read.not/1" and len(node.args) == 1:
        return GeneratedJoinedNot(cast(Any, _joined_where_from_predicate(Predicate(cast(Node, node.args[0])), query)))
    raise TypeError("joined filter accepts generated owner-qualified predicates only")


def _operator_for_id(column: Any, identity: str) -> str:
    return next((operator for operator, candidate in column._binding.predicates.items() if candidate == identity), "")
