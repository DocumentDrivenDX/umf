"""Immutable values exchanged by generated-artifact admission and binding."""

from __future__ import annotations

import hashlib
import math
import os
import stat
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import TYPE_CHECKING, Literal, Protocol, cast, runtime_checkable

from umf_access_generated_executor._canonical import (
    canonical_json,
    freeze_json,
    parse_bounded_program_json,
    parse_bounded_result_json,
    parse_json,
    thaw_json,
)

if TYPE_CHECKING:
    from umf_access_generated_executor._native import AdmittedNativeTable
    from umf_access_generated_executor._ordinary_page import (
        GeneratedOrdinaryPageCall,
        GeneratedOrdinaryPageRoot,
        PreparedOrdinaryPage,
    )

MAX_FILE_COUNT = 4096
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_ARTIFACT_BYTES = 512 * 1024 * 1024
MAX_GENERATED_READ_CALL_BYTES = 4 * 1024 * 1024
MAX_GENERATED_JOINED_RESULT_BYTES = 8 * 1024 * 1024
MAX_FORWARD_CONNECTION_AFTER_BYTES = 128 * 1024
MAX_FORWARD_CONNECTION_CALL_BYTES = 1024 * 1024
MAX_FORWARD_CONNECTION_PROGRAM_BYTES = 8 * 1024 * 1024


def _hash(value: str, name: str) -> None:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(name + " must be lowercase SHA-256 hex")


def normalized_path(value: str) -> str:
    if type(value) is not str or not value or "\x00" in value or "\\" in value:
        raise ValueError("artifact path is not normalized POSIX text")
    if value.startswith("/") or value.endswith("/") or ":" in value.split("/", 1)[0]:
        raise ValueError("artifact path must be relative")
    if unicodedata.normalize("NFC", value) != value:
        raise ValueError("artifact path is not Unicode-normalized")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError("artifact path contains an invalid segment")
    return value


@dataclass(frozen=True, slots=True)
class GeneratedManifest:
    """A canonical UTF-8 manifest, parsed with duplicate-member rejection."""

    _canonical_bytes: bytes

    def __post_init__(self) -> None:
        if type(self._canonical_bytes) is not bytes:
            raise ValueError("manifest must be exact UTF-8 bytes")
        value = parse_json(self._canonical_bytes)
        if type(value) is not dict or canonical_json(value) != self._canonical_bytes:
            raise ValueError("manifest is not canonical JSON")

    @classmethod
    def from_json(cls, source: str | bytes) -> GeneratedManifest:
        value = parse_json(source)
        canonical = canonical_json(value)
        if isinstance(source, str):
            raw = source.encode("utf-8", errors="strict")
        else:
            raw = source
        if raw != canonical:
            raise ValueError("manifest is not canonical JSON")
        return cls(canonical)

    @property
    def canonical_bytes(self) -> bytes:
        return self._canonical_bytes

    @property
    def value(self) -> Mapping[str, object]:
        parsed = parse_json(self._canonical_bytes)
        return cast(Mapping[str, object], freeze_json(parsed))

    def copied_value(self) -> dict[str, object]:
        return cast(dict[str, object], thaw_json(self.value))


@dataclass(frozen=True, slots=True)
class GeneratedFiles:
    """Byte snapshots for every non-manifest file in an artifact."""

    entries: tuple[tuple[str, bytes], ...]

    def __post_init__(self) -> None:
        if type(self.entries) is not tuple or len(self.entries) > MAX_FILE_COUNT:
            raise ValueError("artifact file entries must be a bounded tuple")
        paths: list[str] = []
        total = 0
        for entry in self.entries:
            if type(entry) is not tuple or len(entry) != 2:
                raise ValueError("artifact file entry must be a path and bytes pair")
            path, content = entry
            paths.append(normalized_path(path))
            if type(content) is not bytes or len(content) > MAX_FILE_BYTES:
                raise ValueError("artifact file content is invalid or too large")
            total += len(content)
        if paths != sorted(paths) or len(set(paths)) != len(paths):
            raise ValueError("artifact file entries must be sorted and unique")
        if total > MAX_ARTIFACT_BYTES:
            raise ValueError("artifact size limit exceeded")

    @classmethod
    def from_mapping(cls, files: Mapping[str, bytes]) -> GeneratedFiles:
        if not isinstance(files, Mapping):
            raise TypeError("generated files must be a path-to-bytes mapping")
        if len(files) > MAX_FILE_COUNT:
            raise ValueError("artifact file-count limit exceeded")
        entries: list[tuple[str, bytes]] = []
        total = 0
        for path, content in files.items():
            normalized_path(path)
            if type(content) is not bytes:
                raise ValueError("artifact files must be exact bytes")
            if len(content) > MAX_FILE_BYTES:
                raise ValueError("artifact file-size limit exceeded")
            total += len(content)
            if total > MAX_ARTIFACT_BYTES:
                raise ValueError("artifact size limit exceeded")
            entries.append((path, content))
        return cls(tuple(sorted(entries)))

    @classmethod
    def from_directory(cls, root: str | os.PathLike[str]) -> GeneratedFiles:
        directory = Path(root)
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError("artifact root must be a real directory")
        entries: list[tuple[str, bytes]] = []
        total = 0
        for current, directories, filenames in os.walk(directory, followlinks=False):
            base = Path(current)
            for name in tuple(directories):
                item = base / name
                if item.is_symlink():
                    raise ValueError("artifact contains a symlink")
            for name in filenames:
                item = base / name
                if item.is_symlink() or not stat.S_ISREG(item.lstat().st_mode):
                    raise ValueError("artifact contains a non-regular file")
                path = item.relative_to(directory).as_posix()
                normalized_path(path)
                if len(entries) >= MAX_FILE_COUNT:
                    raise ValueError("artifact file-count limit exceeded")
                size = item.lstat().st_size
                if size > MAX_FILE_BYTES:
                    raise ValueError("artifact file-size limit exceeded")
                total += size
                if total > MAX_ARTIFACT_BYTES:
                    raise ValueError("artifact size limit exceeded")
                entries.append((path, item.read_bytes()))
        return cls(tuple(sorted(entries)))

    @property
    def inventory(self) -> tuple[tuple[str, str], ...]:
        return tuple(
            (path, hashlib.sha256(content).hexdigest())
            for path, content in self.entries
        )

    @property
    def mapping(self) -> Mapping[str, bytes]:
        return MappingProxyType(dict(self.entries))


@dataclass(frozen=True, slots=True)
class TargetBinding:
    id: str
    profile: str
    version: str
    binding_digest: str

    def __post_init__(self) -> None:
        if any(
            type(value) is not str or not value
            for value in (self.id, self.profile, self.version)
        ):
            raise ValueError("target identity fields must be nonempty strings")
        _hash(self.binding_digest, "target binding digest")


@dataclass(frozen=True, slots=True)
class TrustedArtifactRef:
    """Host-pinned facts from an independently verified receipt registry."""

    artifact_id: str
    artifact_digest: str
    receipt_digest: str
    payload_digest: str
    source_digest: str
    target_binding_digest: str
    inventory: tuple[tuple[str, str], ...]
    issuer: str
    build_id: str

    def __post_init__(self) -> None:
        if any(
            type(value) is not str or not value
            for value in (self.artifact_id, self.issuer, self.build_id)
        ):
            raise ValueError("trusted artifact identity fields must be nonempty")
        for value, name in (
            (self.artifact_digest, "artifact digest"),
            (self.receipt_digest, "receipt digest"),
            (self.payload_digest, "payload digest"),
            (self.source_digest, "source digest"),
            (self.target_binding_digest, "target binding digest"),
        ):
            _hash(value, name)
        if type(self.inventory) is not tuple:
            raise ValueError("trusted inventory must be an immutable tuple")
        if any(type(entry) is not tuple or len(entry) != 2 for entry in self.inventory):
            raise ValueError("trusted inventory entries must be pairs")
        paths = [normalized_path(path) for path, _digest in self.inventory]
        if paths != sorted(paths) or len(set(paths)) != len(paths):
            raise ValueError("trusted inventory must be sorted and unique")
        for _path, digest in self.inventory:
            _hash(digest, "inventory digest")


@dataclass(frozen=True, slots=True)
class ExecutionScope:
    """Host-issued request context; the executor does not authenticate it."""

    application: object
    principal: object
    request_id: str
    deadline_monotonic: float
    lease_id: str
    api_digest: str | None = None
    consistency: str | None = None

    def __post_init__(self) -> None:
        if self.application is None or self.principal is None:
            raise ValueError("host scope requires application and principal")
        if type(self.request_id) is not str or not self.request_id:
            raise ValueError("host scope requires a request ID")
        if type(self.lease_id) is not str or not self.lease_id:
            raise ValueError("host scope requires a lease ID")
        if type(self.deadline_monotonic) not in {int, float} or not math.isfinite(
            self.deadline_monotonic
        ):
            raise ValueError("host scope deadline must be finite")


@dataclass(frozen=True, slots=True)
class GeneratedCall:
    """A declared operation plus exact tagged parameter values."""

    operation_id: str
    inputs: Mapping[str, object]
    invocation_key: str | None = None
    fields: tuple[tuple[str, str], ...] = ()
    first: int | None = None
    after: str | None = None

    def __post_init__(self) -> None:
        if type(self.operation_id) is not str or not self.operation_id:
            raise ValueError("generated call requires an operation ID")
        if not isinstance(self.inputs, Mapping):
            raise TypeError("generated call inputs must be a mapping")
        frozen = freeze_json(dict(self.inputs))
        object.__setattr__(self, "inputs", cast(Mapping[str, object], frozen))
        if type(self.fields) is not tuple or any(
            type(field) is not tuple
            or len(field) != 2
            or any(type(identity) is not str or not identity for identity in field)
            for field in self.fields
        ):
            raise ValueError("generated call fields must be qualified identity pairs")
        if self.first is not None and (type(self.first) is not int or self.first < 0):
            raise ValueError("generated call first must be nonnegative")
        if self.after is not None and type(self.after) is not str:
            raise ValueError("generated call cursor must be text")


@dataclass(frozen=True, slots=True)
class GeneratedReadFilter:
    """One issued predicate with its exact immutable ordered argument values."""

    predicate_id: str
    values: tuple[object, ...]

    def __post_init__(self) -> None:
        if type(self.predicate_id) is not str or not self.predicate_id:
            raise ValueError("generated predicate ID must be nonempty text")
        if type(self.values) is not tuple:
            raise ValueError("generated predicate values must be an immutable tuple")
        object.__setattr__(
            self, "values", tuple(freeze_json(value) for value in self.values)
        )


@dataclass(frozen=True, slots=True)
class GeneratedForwardConnectionCall:
    """Pure v5 bind request; ``after`` is a decoded position after UMF preflight."""

    module: str
    record: str
    fields: tuple[str, ...] | None
    where: GeneratedReadWhere | None
    first: int
    after: str | None

    def __post_init__(self) -> None:
        if any(
            type(value) is not str or not value for value in (self.module, self.record)
        ):
            raise ValueError("forward connection root identity is malformed")
        if self.fields is not None and (
            type(self.fields) is not tuple
            or not 1 <= len(self.fields) <= 8
            or any(type(value) is not str or not value for value in self.fields)
            or len(set(self.fields)) != len(self.fields)
        ):
            raise ValueError("forward connection fields are malformed")
        if self.where is not None and not isinstance(
            self.where,
            (GeneratedReadAtom, GeneratedReadAnd, GeneratedReadOr, GeneratedReadNot),
        ):
            raise ValueError("forward connection filter tree is malformed")
        if type(self.first) is not int or not 0 <= self.first <= 100:
            raise ValueError("forward connection first is outside 0..100")
        if self.after is not None and type(self.after) is not str:
            raise ValueError("forward connection after position must be decoded text")
        if self.after is not None:
            if len(self.after) > MAX_FORWARD_CONNECTION_AFTER_BYTES:
                raise ValueError("forward connection after position exceeds its byte bound")
            if any(0xD800 <= ord(char) <= 0xDFFF for char in self.after):
                raise ValueError("forward connection after position is not Unicode scalar text")
            if len(self.after.encode("utf-8", errors="strict")) > MAX_FORWARD_CONNECTION_AFTER_BYTES:
                raise ValueError("forward connection after position exceeds its byte bound")

    def estimated_wire_bytes(self, limit: int = MAX_FORWARD_CONNECTION_CALL_BYTES) -> int:
        """Return a conservative escaped JSON size, stopping at the call budget."""
        total = 64

        def add_text(value: str) -> None:
            nonlocal total
            # Six escaped ASCII characters per code point is a conservative
            # pre-allocation bound; UTF-8 encoding can expand by at most 4x.
            if len(value) > limit // 6:
                raise OverflowError("forward connection call exceeds its byte budget")
            # JSON escaping can expand each UTF-8 byte to six ASCII bytes.
            total += 6 * len(value.encode("utf-8", errors="strict")) + 8
            if total > limit:
                raise OverflowError("forward connection call exceeds its byte budget")

        add_text(self.module)
        add_text(self.record)
        for field in self.fields or ():
            add_text(field)

        if self.where is not None:
            stack: list[tuple[object, int]] = [(self.where, 1)]
            nodes = 0
            while stack:
                term, depth = stack.pop()
                nodes += 1
                if depth > 8 or nodes > 64:
                    raise OverflowError("forward connection filter exceeds its structural limit")
                if type(term) is GeneratedReadAtom:
                    add_text(term.predicate_id)
                    for value in term.values:
                        if isinstance(value, Mapping):
                            for key, scalar in value.items():
                                add_text(key)
                                if type(scalar) is str:
                                    add_text(scalar)
                                else:
                                    total += 16
                        elif type(value) is str:
                            add_text(value)
                        else:
                            total += 16
                elif type(term) in {GeneratedReadAnd, GeneratedReadOr}:
                    total += 32
                    stack.extend((child, depth + 1) for child in term.args)
                elif type(term) is GeneratedReadNot:
                    total += 16
                    stack.append((term.arg, depth + 1))
                else:
                    raise ValueError("forward connection filter tree is malformed")
                if total > limit:
                    raise OverflowError("forward connection call exceeds its byte budget")
        if self.after is not None:
            add_text(self.after)
        return total


@dataclass(frozen=True, slots=True)
class BoundForwardConnectionProgram:
    """Mechanical SQL binding over one admitted Rust-issued v5 connection."""

    sql: str
    parameters: tuple[object, ...]
    previous_sql: str
    previous_parameters: tuple[object, ...]
    root: Mapping[str, str]
    fields: tuple[Mapping[str, str], ...]
    outputs: tuple[Mapping[str, object], ...]
    key_output: Mapping[str, object]
    previous_output: Mapping[str, object]
    first: int
    fetch_limit: int
    source_digest: str
    target_digest: str
    native_read_guard: Mapping[str, object]
    obligations: Mapping[str, object]
    program_json: bytes

    def __post_init__(self) -> None:
        if (
            type(self.sql) is not str
            or not self.sql
            or type(self.previous_sql) is not str
            or not self.previous_sql
        ):
            raise ValueError("bound forward connection SQL is malformed")
        if (
            type(self.parameters) is not tuple
            or type(self.previous_parameters) is not tuple
        ):
            raise ValueError("bound forward connection parameters must be tuples")
        if type(self.first) is not int or not 0 <= self.first <= 100:
            raise ValueError("bound forward connection first is malformed")
        expected_fetch = 1 if self.first == 0 else self.first + 1
        if type(self.fetch_limit) is not int or self.fetch_limit != expected_fetch:
            raise ValueError("bound forward connection fetch limit differs")
        object.__setattr__(self, "root", freeze_json(self.root))
        object.__setattr__(
            self, "fields", tuple(freeze_json(value) for value in self.fields)
        )
        object.__setattr__(
            self, "outputs", tuple(freeze_json(value) for value in self.outputs)
        )
        object.__setattr__(self, "key_output", freeze_json(self.key_output))
        object.__setattr__(self, "previous_output", freeze_json(self.previous_output))
        object.__setattr__(
            self, "native_read_guard", freeze_json(self.native_read_guard)
        )
        object.__setattr__(self, "obligations", freeze_json(self.obligations))
        _hash(self.source_digest, "bound connection source digest")
        _hash(self.target_digest, "bound connection target digest")
        if type(self.program_json) is not bytes:
            raise ValueError("bound forward connection program must be bytes")
        parsed = parse_bounded_program_json(
            self.program_json, MAX_FORWARD_CONNECTION_PROGRAM_BYTES
        )
        if type(parsed) is not dict or canonical_json(parsed) != self.program_json:
            raise ValueError("bound forward connection program must be canonical JSON")


@dataclass(frozen=True, slots=True)
class GeneratedReadCall:
    """Closed first-profile read call; IDs select only admitted Rust fragments."""

    module: str
    record: str
    selection: tuple[str, ...] | None
    filters: tuple[GeneratedReadFilter, ...]
    orders: tuple[str, ...]
    limit: int
    terminal: Literal["all"] = "all"

    def __post_init__(self) -> None:
        if any(
            type(value) is not str or not value for value in (self.module, self.record)
        ):
            raise ValueError("generated root identity must be nonempty text")
        if self.selection is not None and (
            type(self.selection) is not tuple
            or any(type(value) is not str or not value for value in self.selection)
        ):
            raise ValueError("generated selection must be an immutable field tuple")
        if type(self.filters) is not tuple or any(
            type(value) is not GeneratedReadFilter for value in self.filters
        ):
            raise ValueError("generated filters must be immutable filter values")
        if type(self.orders) is not tuple or any(
            type(value) is not str or not value for value in self.orders
        ):
            raise ValueError("generated orders must be immutable IDs")
        if type(self.limit) is not int or self.limit < 1:
            raise ValueError("generated read limit must be positive")
        if self.terminal != "all":
            raise ValueError("generated read terminal is unsupported")


def _freeze_core_literal(value: object) -> object:
    if value is None:
        return None
    if not isinstance(value, Mapping) or len(value) != 1:
        raise ValueError("generated read literal must be null or a tagged scalar")
    scalar = next(iter(value.values()))
    if type(scalar) not in {str, bool}:
        raise ValueError("generated read literal scalar is unsupported")
    return freeze_json(value)


@dataclass(frozen=True, slots=True)
class GeneratedReadAtom:
    predicate_id: str
    values: tuple[object, ...]

    def __post_init__(self) -> None:
        if type(self.predicate_id) is not str or not self.predicate_id:
            raise ValueError("generated read atom requires an issued predicate ID")
        if type(self.values) is not tuple or len(self.values) > 1:
            raise ValueError("generated read atom values must be a bounded tuple")
        object.__setattr__(
            self, "values", tuple(_freeze_core_literal(value) for value in self.values)
        )


@dataclass(frozen=True, slots=True)
class GeneratedReadAnd:
    args: tuple[GeneratedReadWhere, ...]

    def __post_init__(self) -> None:
        if (
            type(self.args) is not tuple
            or not 2 <= len(self.args) <= 16
            or any(
                type(value)
                not in {
                    GeneratedReadAtom,
                    GeneratedReadAnd,
                    GeneratedReadOr,
                    GeneratedReadNot,
                }
                for value in self.args
            )
        ):
            raise ValueError("generated AND requires two to sixteen immutable terms")


@dataclass(frozen=True, slots=True)
class GeneratedReadOr:
    args: tuple[GeneratedReadWhere, ...]

    def __post_init__(self) -> None:
        if (
            type(self.args) is not tuple
            or not 2 <= len(self.args) <= 16
            or any(
                type(value)
                not in {
                    GeneratedReadAtom,
                    GeneratedReadAnd,
                    GeneratedReadOr,
                    GeneratedReadNot,
                }
                for value in self.args
            )
        ):
            raise ValueError("generated OR requires two to sixteen immutable terms")


@dataclass(frozen=True, slots=True)
class GeneratedReadNot:
    arg: GeneratedReadWhere

    def __post_init__(self) -> None:
        if type(self.arg) not in {
            GeneratedReadAtom,
            GeneratedReadAnd,
            GeneratedReadOr,
            GeneratedReadNot,
        }:
            raise ValueError("generated NOT requires one immutable term")


GeneratedReadWhere = (
    GeneratedReadAtom | GeneratedReadAnd | GeneratedReadOr | GeneratedReadNot
)


def _read_wire_where(
    value: object, depth: int, budget: list[int]
) -> GeneratedReadWhere:
    if depth > 8:
        raise ValueError("generated read wire Boolean depth exceeds its bound")
    budget[0] += 1
    if budget[0] > 64 or not isinstance(value, Mapping):
        raise ValueError("generated read wire Boolean tree exceeds its bound")
    op = value.get("op")
    if op == "atom":
        if set(value) != {"op", "predicateId", "values"}:
            raise ValueError("generated read wire atom differs")
        predicate_id = value["predicateId"]
        values = value["values"]
        if (
            type(predicate_id) is not str
            or not predicate_id
            or not isinstance(values, (list, tuple))
            or len(values) > 1
        ):
            raise ValueError("generated read wire atom differs")
        return GeneratedReadAtom(predicate_id, tuple(values))
    if op in {"and", "or"}:
        if set(value) != {"op", "args"}:
            raise ValueError("generated read wire Boolean operator differs")
        args = value["args"]
        if not isinstance(args, (list, tuple)) or not 2 <= len(args) <= 16:
            raise ValueError("generated read wire Boolean operands differ")
        parsed = tuple(_read_wire_where(item, depth + 1, budget) for item in args)
        return GeneratedReadAnd(parsed) if op == "and" else GeneratedReadOr(parsed)
    if op == "not":
        if set(value) != {"op", "arg"}:
            raise ValueError("generated read wire NOT differs")
        return GeneratedReadNot(_read_wire_where(value["arg"], depth + 1, budget))
    raise ValueError("generated read wire operator is unsupported")


def _write_wire_where(value: GeneratedReadWhere | None) -> object:
    if value is None:
        return None
    if type(value) is GeneratedReadAtom:
        return {
            "op": "atom",
            "predicateId": value.predicate_id,
            "values": [
                dict(item) if isinstance(item, Mapping) else None
                for item in value.values
            ],
        }
    if type(value) in {GeneratedReadAnd, GeneratedReadOr}:
        group = cast(GeneratedReadAnd | GeneratedReadOr, value)
        return {
            "op": "and" if type(value) is GeneratedReadAnd else "or",
            "args": [_write_wire_where(item) for item in group.args],
        }
    if type(value) is GeneratedReadNot:
        return {"op": "not", "arg": _write_wire_where(value.arg)}
    raise ValueError("generated read Boolean node type is unsupported")


@dataclass(frozen=True, slots=True)
class GeneratedReadCallV2:
    module: str
    record: str
    selection: tuple[str, ...] | None
    where: GeneratedReadWhere | None
    orders: tuple[str, ...]
    limit: int | None
    terminal: Literal["all", "first", "one", "count", "exists", "get"]
    key: tuple[object, ...] | None

    @property
    def version(self) -> str:
        return "umf.generated-read-call/2"

    @classmethod
    def from_mapping(cls, value: object) -> GeneratedReadCallV2:
        """Parse the closed v2 wire shape without resolving IDs or source meaning."""
        if not isinstance(value, Mapping):
            raise TypeError("generated read wire call must be an object")
        if len(canonical_json(value)) > MAX_GENERATED_READ_CALL_BYTES:
            raise ValueError("generated read wire call exceeds its byte bound")
        if (
            set(value)
            != {
                "version",
                "root",
                "selection",
                "where",
                "orders",
                "limit",
                "terminal",
                "key",
            }
            or value.get("version") != "umf.generated-read-call/2"
        ):
            raise ValueError("generated read wire envelope differs")
        root = value["root"]
        if not isinstance(root, Mapping) or set(root) != {"module", "record"}:
            raise ValueError("generated read wire root differs")
        module = root["module"]
        record = root["record"]
        if (
            type(module) is not str
            or not module
            or type(record) is not str
            or not record
        ):
            raise ValueError("generated read wire root IDs differ")
        selection_value = value["selection"]
        selection: tuple[str, ...] | None
        if selection_value is None:
            selection = None
        elif isinstance(selection_value, (list, tuple)):
            if (
                not 1 <= len(selection_value) <= 8
                or any(type(item) is not str or not item for item in selection_value)
                or len(set(selection_value)) != len(selection_value)
            ):
                raise ValueError("generated read wire selection differs")
            selection = tuple(selection_value)
        else:
            raise ValueError("generated read wire selection differs")
        budget = [0]
        where_value = value["where"]
        where = (
            None if where_value is None else _read_wire_where(where_value, 1, budget)
        )
        orders_value = value["orders"]
        if not isinstance(orders_value, (list, tuple)) or len(orders_value) > 16:
            raise ValueError("generated read wire ordering differs")
        if any(type(item) is not str or not item for item in orders_value) or len(
            set(orders_value)
        ) != len(orders_value):
            raise ValueError("generated read wire ordering differs")
        limit = value["limit"]
        if limit is not None and (type(limit) is not int or not 1 <= limit <= 1000):
            raise ValueError("generated read wire limit differs")
        terminal = value["terminal"]
        if type(terminal) is not str:
            raise ValueError("generated read wire terminal differs")
        key_value = value["key"]
        key: tuple[object, ...] | None
        if key_value is None:
            key = None
        elif isinstance(key_value, (list, tuple)) and 1 <= len(key_value) <= 16:
            key = tuple(_freeze_core_literal(item) for item in key_value)
        else:
            raise ValueError("generated read wire Key differs")
        return cls(
            module,
            record,
            selection,
            where,
            tuple(orders_value),
            limit,
            cast(Literal["all", "first", "one", "count", "exists", "get"], terminal),
            key,
        )

    def to_mapping(self) -> dict[str, object]:
        """Return a detached, mutable wire mapping for a host transport."""
        value = {
            "version": self.version,
            "root": {"module": self.module, "record": self.record},
            "selection": list(self.selection) if self.selection is not None else None,
            "where": _write_wire_where(self.where),
            "orders": list(self.orders),
            "limit": self.limit,
            "terminal": self.terminal,
            "key": [
                dict(value) if isinstance(value, Mapping) else None
                for value in self.key
            ]
            if self.key is not None
            else None,
        }
        if len(canonical_json(value)) > MAX_GENERATED_READ_CALL_BYTES:
            raise ValueError("generated read wire call exceeds its byte bound")
        return value

    def __post_init__(self) -> None:
        if any(
            type(value) is not str or not value for value in (self.module, self.record)
        ):
            raise ValueError("generated v2 root identity must be nonempty text")
        if self.selection is not None and (
            type(self.selection) is not tuple
            or not 1 <= len(self.selection) <= 8
            or any(type(value) is not str or not value for value in self.selection)
            or len(set(self.selection)) != len(self.selection)
        ):
            raise ValueError("generated v2 selection is invalid")
        if self.where is not None and type(self.where) not in {
            GeneratedReadAtom,
            GeneratedReadAnd,
            GeneratedReadOr,
            GeneratedReadNot,
        }:
            raise ValueError("generated v2 Boolean tree is invalid")
        if (
            type(self.orders) is not tuple
            or len(self.orders) > 16
            or any(type(value) is not str or not value for value in self.orders)
            or len(set(self.orders)) != len(self.orders)
        ):
            raise ValueError("generated v2 ordering is invalid")
        if self.limit is not None and (
            type(self.limit) is not int or not 1 <= self.limit <= 1000
        ):
            raise ValueError("generated v2 limit is invalid")
        if type(self.terminal) is not str or self.terminal not in {
            "all",
            "first",
            "one",
            "count",
            "exists",
            "get",
        }:
            raise ValueError("generated v2 terminal is unsupported")
        if self.terminal != "all" and self.limit is not None:
            raise ValueError("generated v2 terminal does not accept a caller limit")
        if self.terminal == "get":
            if (
                self.key is None
                or type(self.key) is not tuple
                or not self.key
                or len(self.key) > 16
            ):
                raise ValueError("generated get requires an immutable Key tuple")
            object.__setattr__(
                self, "key", tuple(_freeze_core_literal(value) for value in self.key)
            )
            if (
                self.where is not None
                or self.orders
                or self.selection is not None
                or self.limit is not None
            ):
                raise ValueError("generated get does not accept other read modifiers")
        elif self.key is not None:
            raise ValueError("generated Key values are only valid for get")
        if self.terminal in {"count", "exists"} and (
            self.selection is not None or self.orders
        ):
            raise ValueError(
                "generated scalar terminal does not accept row selection or ordering"
            )


@dataclass(frozen=True, slots=True)
class BoundProgram:
    """Parameterized issued program and native execution obligations."""

    sql: str
    parameters: tuple[object, ...]
    decoder: str
    operation_kind: Literal["read", "write"]
    obligations: tuple[str, ...]
    source_digest: str
    target_digest: str
    program_json: bytes
    invocation_key: str | None = None

    def __post_init__(self) -> None:
        if type(self.sql) is not str or not self.sql:
            raise ValueError("bound SQL must be nonempty text")
        if type(self.parameters) is not tuple:
            raise ValueError("bound parameters must be an immutable tuple")
        if any(
            type(value) not in {bool, str, int, float} and value is not None
            for value in self.parameters
        ):
            raise ValueError("bound parameter value is unsupported")
        if self.decoder != "umf.table-read-result/0.1":
            raise ValueError("bound result decoder is unsupported")
        if self.operation_kind not in {"read", "write"}:
            raise ValueError("bound operation kind is unsupported")
        if type(self.obligations) is not tuple or any(
            type(value) is not str or not value for value in self.obligations
        ):
            raise ValueError("bound obligations must be immutable identifiers")
        _hash(self.source_digest, "bound source digest")
        _hash(self.target_digest, "bound target digest")
        if self.invocation_key is not None and type(self.invocation_key) is not str:
            raise ValueError("bound invocation key must be text")
        if type(self.program_json) is not bytes:
            raise ValueError("bound program must be immutable canonical JSON bytes")
        parsed = parse_json(self.program_json)
        if type(parsed) is not dict or canonical_json(parsed) != self.program_json:
            raise ValueError("bound program JSON must be canonical")


@dataclass(frozen=True, slots=True)
class BoundReadProgram:
    """Issued composed-read SQL, binds, and native result guards."""

    sql: str
    parameters: tuple[object, ...]
    description_sql: str
    description_parameters: tuple[object, ...]
    fields: tuple[Mapping[str, str], ...]
    outputs: tuple[Mapping[str, object], ...]
    native_read_guard: Mapping[str, object]
    obligations: Mapping[str, object]
    source_digest: str
    target_digest: str
    program_json: bytes

    def __post_init__(self) -> None:
        if type(self.sql) is not str or not self.sql:
            raise ValueError("bound read SQL must be nonempty text")
        if type(self.description_sql) is not str or not self.description_sql:
            raise ValueError("bound read description SQL must be nonempty text")
        if (
            type(self.parameters) is not tuple
            or type(self.description_parameters) is not tuple
        ):
            raise ValueError("bound read parameters must be immutable tuples")
        if self.description_parameters:
            raise ValueError("first-profile description parameters must be empty")
        for parameter in self.parameters:
            if type(parameter) not in {bool, str, int, float} and parameter is not None:
                raise ValueError("bound read parameter value is unsupported")
        if type(self.fields) is not tuple or any(
            type(value) is not dict or set(value) != {"module", "element"}
            for value in self.fields
        ):
            raise ValueError("bound read fields must be ordered qualified references")
        object.__setattr__(
            self, "fields", tuple(freeze_json(value) for value in self.fields)
        )
        if type(self.outputs) is not tuple or any(
            not isinstance(value, Mapping) for value in self.outputs
        ):
            raise ValueError("bound read outputs must be immutable descriptors")
        object.__setattr__(
            self, "outputs", tuple(freeze_json(value) for value in self.outputs)
        )
        for name in ("native_read_guard", "obligations"):
            value = getattr(self, name)
            if not isinstance(value, Mapping):
                raise TypeError("bound read " + name + " must be an object")
            object.__setattr__(
                self, name, cast(Mapping[str, object], freeze_json(value))
            )
        _hash(self.source_digest, "bound read source digest")
        _hash(self.target_digest, "bound read target digest")
        if type(self.program_json) is not bytes:
            raise ValueError("bound read program must be immutable JSON bytes")
        parsed = parse_json(self.program_json)
        if type(parsed) is not dict or canonical_json(parsed) != self.program_json:
            raise ValueError("bound read program JSON must be canonical")


@dataclass(frozen=True, slots=True)
class BoundReadProgramV2:
    sql: str
    parameters: tuple[object, ...]
    description_sql: str
    description_parameters: tuple[object, ...]
    fields: tuple[Mapping[str, str], ...]
    outputs: tuple[Mapping[str, object], ...]
    native_read_guard: Mapping[str, object]
    obligations: Mapping[str, object]
    source_digest: str
    target_digest: str
    terminal: str
    result_kind: Literal["rows", "scalar"]
    cardinality: str
    row_limit: int | None
    scalar_output: Mapping[str, object] | None
    program_json: bytes

    def __post_init__(self) -> None:
        if (
            type(self.sql) is not str
            or not self.sql
            or type(self.description_sql) is not str
            or not self.description_sql
        ):
            raise ValueError("bound v2 SQL fragments must be nonempty text")
        if (
            type(self.parameters) is not tuple
            or type(self.description_parameters) is not tuple
        ):
            raise ValueError("bound v2 parameters must be tuples")
        if self.description_parameters:
            raise ValueError("bound v2 description parameters must be empty")
        if any(
            type(value) not in {bool, str, int, float} and value is not None
            for value in self.parameters
        ):
            raise ValueError("bound v2 parameter type is unsupported")
        if self.terminal not in {"all", "first", "one", "count", "exists", "get"}:
            raise ValueError("bound v2 terminal differs")
        if self.result_kind not in {"rows", "scalar"}:
            raise ValueError("bound v2 result kind differs")
        if self.terminal == "all":
            if (self.result_kind, self.cardinality) != ("rows", "bounded-many"):
                raise ValueError("bound v2 all terminal metadata differs")
        else:
            expected = {
                "first": ("rows", "zero-or-one"),
                "one": ("rows", "exactly-one"),
                "get": ("rows", "exactly-one"),
                "count": ("scalar", "one-integer"),
                "exists": ("scalar", "row-presence"),
            }[self.terminal]
            if (self.result_kind, self.cardinality) != expected:
                raise ValueError("bound v2 terminal cardinality differs")
        if (self.result_kind == "scalar") != (self.scalar_output is not None):
            raise ValueError("bound v2 scalar output profile differs")
        if type(self.fields) is not tuple or any(
            not isinstance(value, Mapping) for value in self.fields
        ):
            raise ValueError("bound v2 fields must be immutable references")
        if any(
            set(value) != {"module", "element"}
            or any(
                type(value[key]) is not str or not value[key]
                for key in ("module", "element")
            )
            for value in self.fields
        ):
            raise ValueError("bound v2 field reference is malformed")
        object.__setattr__(
            self, "fields", tuple(freeze_json(value) for value in self.fields)
        )
        if type(self.outputs) is not tuple or any(
            not isinstance(value, Mapping) for value in self.outputs
        ):
            raise ValueError("bound v2 outputs must be immutable descriptors")
        if self.result_kind == "rows" and len(self.fields) != len(self.outputs):
            raise ValueError("bound v2 row fields and outputs differ")
        if self.result_kind == "scalar" and (self.fields or self.outputs):
            raise ValueError("bound v2 scalar cannot carry row outputs")
        if self.terminal == "all":
            if type(self.row_limit) is not int or not 1 <= self.row_limit <= 1000:
                raise ValueError("bound v2 all row limit differs")
        else:
            expected_row_limit = {
                "first": 1,
                "one": 2,
                "get": 2,
                "count": None,
                "exists": 1,
            }[self.terminal]
            if expected_row_limit is None:
                valid_row_limit = self.row_limit is None
            else:
                valid_row_limit = (
                    type(self.row_limit) is int and self.row_limit == expected_row_limit
                )
            if not valid_row_limit:
                raise ValueError("bound v2 terminal row limit differs")
        object.__setattr__(
            self, "outputs", tuple(freeze_json(value) for value in self.outputs)
        )
        for name in ("native_read_guard", "obligations"):
            value = getattr(self, name)
            if not isinstance(value, Mapping):
                raise TypeError("bound v2 " + name + " must be an object")
            object.__setattr__(self, name, freeze_json(value))
        if self.scalar_output is not None:
            if not isinstance(self.scalar_output, Mapping):
                raise ValueError("bound v2 scalar output descriptor is malformed")
            object.__setattr__(self, "scalar_output", freeze_json(self.scalar_output))
        _hash(self.source_digest, "bound v2 source digest")
        _hash(self.target_digest, "bound v2 target digest")
        if type(self.program_json) is not bytes:
            raise ValueError("bound v2 program must be canonical JSON bytes")
        parsed = parse_json(self.program_json)
        if type(parsed) is not dict or canonical_json(parsed) != self.program_json:
            raise ValueError("bound v2 program JSON must be canonical")


@dataclass(frozen=True, slots=True)
class BoundReadProgramV3(BoundReadProgramV2):
    """Server-guarded composed read with separate fetch and return bounds."""

    fetch_limit: int
    overflow_check: bool

    def __post_init__(self) -> None:
        super(BoundReadProgramV3, self).__post_init__()
        if type(self.fetch_limit) is not int or type(self.overflow_check) is not bool:
            raise ValueError("bound v3 fetch metadata is malformed")
        expected = {
            "all": (None, None),
            "first": (1, 1),
            "one": (2, 2),
            "get": (2, 2),
            "exists": (1, 1),
            "count": (None, 1),
        }[self.terminal]
        if self.terminal == "all" and self.overflow_check:
            if (
                type(self.row_limit) is not int
                or self.fetch_limit != self.row_limit + 1
            ):
                raise ValueError("bound implicit-all overflow metadata differs")
        elif self.terminal == "all":
            if (
                self.overflow_check
                or type(self.row_limit) is not int
                or self.fetch_limit != self.row_limit
            ):
                raise ValueError("bound explicit-all fetch metadata differs")
        elif (
            self.overflow_check
            or self.row_limit != expected[0]
            or self.fetch_limit != expected[1]
        ):
            raise ValueError("bound v3 terminal fetch metadata differs")


def _canonical_joined_field_id(value: str) -> bool:
    parts = value.split("/", 1)
    if len(parts) != 2 or any(not part for part in parts):
        return False
    decoded: list[str] = []
    for part in parts:
        index = 0
        output = ""
        while index < len(part):
            if part[index] == "~":
                if index + 1 >= len(part) or part[index + 1] not in "01":
                    return False
                output += "/" if part[index + 1] == "1" else "~"
                index += 2
            else:
                output += part[index]
                index += 1
        decoded.append(output)
    return all(decoded) and decoded[0].replace("~", "~0").replace("/", "~1") + "/" + decoded[1].replace("~", "~0").replace("/", "~1") == value


@dataclass(frozen=True, slots=True)
class GeneratedJoinedField:
    owner_module: str
    owner_record: str
    field_id: str

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (self.owner_module, self.owner_record, self.field_id)):
            raise ValueError("joined selected Field identity is malformed")
        if not _canonical_joined_field_id(self.field_id):
            raise ValueError("joined selected Field ID must be canonical owner-qualified identity")

    def to_mapping(self) -> dict[str, object]:
        return {"owner": {"module": self.owner_module, "record": self.owner_record}, "fieldId": self.field_id}


@dataclass(frozen=True, slots=True)
class GeneratedJoinedOrder:
    owner_module: str
    owner_record: str
    order_id: str

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (self.owner_module, self.owner_record, self.order_id)):
            raise ValueError("joined order identity is malformed")

    def to_mapping(self) -> dict[str, object]:
        return {"owner": {"module": self.owner_module, "record": self.owner_record}, "orderId": self.order_id}


@dataclass(frozen=True, slots=True)
class GeneratedJoinedAtom:
    owner_module: str
    owner_record: str
    predicate_id: str
    values: tuple[object, ...]

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (self.owner_module, self.owner_record, self.predicate_id)):
            raise ValueError("joined Boolean atom identity is malformed")
        if type(self.values) is not tuple or len(self.values) > 1:
            raise ValueError("joined Boolean atom values are malformed")
        object.__setattr__(self, "values", tuple(_freeze_core_literal(item) for item in self.values))


@dataclass(frozen=True, slots=True)
class GeneratedJoinedAnd:
    args: tuple[GeneratedJoinedWhere, ...]

    def __post_init__(self) -> None:
        if type(self.args) is not tuple or not 2 <= len(self.args) <= 16 or any(type(item) not in _JOINED_WHERE_TYPES for item in self.args):
            raise ValueError("joined AND terms are malformed")


@dataclass(frozen=True, slots=True)
class GeneratedJoinedOr:
    args: tuple[GeneratedJoinedWhere, ...]

    def __post_init__(self) -> None:
        if type(self.args) is not tuple or not 2 <= len(self.args) <= 16 or any(type(item) not in _JOINED_WHERE_TYPES for item in self.args):
            raise ValueError("joined OR terms are malformed")


@dataclass(frozen=True, slots=True)
class GeneratedJoinedNot:
    arg: GeneratedJoinedWhere

    def __post_init__(self) -> None:
        if type(self.arg) not in _JOINED_WHERE_TYPES:
            raise ValueError("joined NOT term is malformed")


GeneratedJoinedWhere = GeneratedJoinedAtom | GeneratedJoinedAnd | GeneratedJoinedOr | GeneratedJoinedNot
_JOINED_WHERE_TYPES = frozenset({GeneratedJoinedAtom, GeneratedJoinedAnd, GeneratedJoinedOr, GeneratedJoinedNot})


def _joined_owner(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != {"module", "record"} or any(type(value[key]) is not str or not value[key] for key in ("module", "record")):
        raise ValueError("joined owner identity is malformed")
    return value


def _read_joined_where(value: object, depth: int, budget: list[int]) -> GeneratedJoinedWhere:
    if depth > 8:
        raise ValueError("joined Boolean depth exceeds its bound")
    budget[0] += 1
    if budget[0] > 64 or not isinstance(value, Mapping):
        raise ValueError("joined Boolean tree exceeds its bound")
    op = value.get("op")
    if op == "atom":
        if set(value) != {"op", "owner", "predicateId", "values"}:
            raise ValueError("joined Boolean atom differs")
        owner = _joined_owner(value["owner"])
        values = value["values"]
        if type(value["predicateId"]) is not str or not value["predicateId"] or not isinstance(values, (list, tuple)) or len(values) > 1:
            raise ValueError("joined Boolean atom differs")
        return GeneratedJoinedAtom(owner["module"], owner["record"], value["predicateId"], tuple(values))
    if op in {"and", "or"}:
        if set(value) != {"op", "args"} or not isinstance(value["args"], (list, tuple)) or not 2 <= len(value["args"]) <= 16:
            raise ValueError("joined Boolean group differs")
        args = tuple(_read_joined_where(item, depth + 1, budget) for item in value["args"])
        return GeneratedJoinedAnd(args) if op == "and" else GeneratedJoinedOr(args)
    if op == "not":
        if set(value) != {"op", "arg"}:
            raise ValueError("joined Boolean NOT differs")
        return GeneratedJoinedNot(_read_joined_where(value["arg"], depth + 1, budget))
    raise ValueError("joined Boolean operator is unsupported")


def _write_joined_where(value: GeneratedJoinedWhere | None) -> object:
    if value is None:
        return None
    if type(value) is GeneratedJoinedAtom:
        return {"op": "atom", "owner": {"module": value.owner_module, "record": value.owner_record}, "predicateId": value.predicate_id, "values": [thaw_json(item) for item in value.values]}
    if type(value) in {GeneratedJoinedAnd, GeneratedJoinedOr}:
        return {"op": "and" if type(value) is GeneratedJoinedAnd else "or", "args": [_write_joined_where(item) for item in value.args]}
    if type(value) is GeneratedJoinedNot:
        return {"op": "not", "arg": _write_joined_where(value.arg)}
    raise ValueError("joined Boolean node type is unsupported")


@dataclass(frozen=True, slots=True)
class GeneratedJoinedReadCall:
    root_module: str
    root_record: str
    relationship_module: str
    relationship_id: str
    selection: tuple[GeneratedJoinedField, ...] | None
    where: GeneratedJoinedWhere | None
    orders: tuple[GeneratedJoinedOrder, ...]
    limit: int | None
    terminal: Literal["all"] = "all"

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (self.root_module, self.root_record, self.relationship_module, self.relationship_id)):
            raise ValueError("joined root or Relationship identity is malformed")
        if self.selection is not None and (type(self.selection) is not tuple or len(self.selection) > 8 or any(type(item) is not GeneratedJoinedField for item in self.selection) or len({(item.owner_module, item.owner_record, item.field_id) for item in self.selection}) != len(self.selection)):
            raise ValueError("joined selection is malformed")
        if self.where is not None and type(self.where) not in _JOINED_WHERE_TYPES:
            raise ValueError("joined where expression is malformed")
        if type(self.orders) is not tuple or len(self.orders) > 8 or any(type(item) is not GeneratedJoinedOrder for item in self.orders) or len({(item.owner_module, item.owner_record, item.order_id) for item in self.orders}) != len(self.orders):
            raise ValueError("joined order list is malformed")
        if self.limit is not None and (type(self.limit) is not int or not 1 <= self.limit <= 1000):
            raise ValueError("joined explicit limit is malformed")
        if self.terminal != "all":
            raise ValueError("joined terminal is unsupported")

    @property
    def version(self) -> str:
        return "umf.generated-read-call/3"

    def to_mapping(self) -> dict[str, object]:
        return {"version": self.version, "root": {"module": self.root_module, "record": self.root_record}, "join": {"module": self.relationship_module, "relationship": self.relationship_id}, "selection": None if self.selection is None else [item.to_mapping() for item in self.selection], "where": _write_joined_where(self.where), "orders": [item.to_mapping() for item in self.orders], "limit": self.limit, "terminal": self.terminal}

    @classmethod
    def from_mapping(cls, value: object) -> GeneratedJoinedReadCall:
        if not isinstance(value, Mapping):
            raise ValueError("joined read wire call must be bounded JSON object")
        # Mapping inputs may be caller-controlled and potentially very large or
        # deeply nested. Bound their shape and exact canonical size before the
        # serializer allocates a copy of the complete wire representation.
        from umf_access_generated_executor._ordinary_page import _bounded_canonical_json_size
        from umf_access_generated_executor._errors import GeneratedExecutionError

        try:
            _bounded_canonical_json_size(value, MAX_GENERATED_READ_CALL_BYTES)
        except GeneratedExecutionError as error:
            raise ValueError("joined read wire call must be bounded JSON") from error
        if len(canonical_json(value)) > MAX_GENERATED_READ_CALL_BYTES:
            raise ValueError("joined read wire call must be bounded JSON")
        if set(value) != {"version", "root", "join", "selection", "where", "orders", "limit", "terminal"} or value.get("version") != "umf.generated-read-call/3":
            raise ValueError("joined read wire envelope differs")
        root, join = value["root"], value["join"]
        if not isinstance(root, Mapping) or set(root) != {"module", "record"} or not isinstance(join, Mapping) or set(join) != {"module", "relationship"}:
            raise ValueError("joined read root or Relationship differs")
        for container, keys in ((root, ("module", "record")), (join, ("module", "relationship"))):
            if any(type(container[key]) is not str or not container[key] for key in keys):
                raise ValueError("joined read root or Relationship identity differs")
        selection_value = value["selection"]
        selection: tuple[GeneratedJoinedField, ...] | None
        if selection_value is None:
            selection = None
        elif isinstance(selection_value, (list, tuple)) and len(selection_value) <= 8:
            members: list[GeneratedJoinedField] = []
            for item in selection_value:
                if not isinstance(item, Mapping) or set(item) != {"owner", "fieldId"}:
                    raise ValueError("joined selected Field differs")
                owner = _joined_owner(item["owner"])
                if type(item["fieldId"]) is not str or not item["fieldId"]:
                    raise ValueError("joined selected Field ID differs")
                members.append(GeneratedJoinedField(owner["module"], owner["record"], item["fieldId"]))
            selection = tuple(members)
        else:
            raise ValueError("joined selection differs")
        where_value = value["where"]
        where = None if where_value is None else _read_joined_where(where_value, 0, [0])
        raw_orders = value["orders"]
        if not isinstance(raw_orders, (list, tuple)) or len(raw_orders) > 8:
            raise ValueError("joined order list differs")
        orders: list[GeneratedJoinedOrder] = []
        for item in raw_orders:
            if not isinstance(item, Mapping) or set(item) != {"owner", "orderId"}:
                raise ValueError("joined order differs")
            owner = _joined_owner(item["owner"])
            if type(item["orderId"]) is not str or not item["orderId"]:
                raise ValueError("joined order ID differs")
            orders.append(GeneratedJoinedOrder(owner["module"], owner["record"], item["orderId"]))
        limit = value["limit"]
        if limit is not None and (type(limit) is not int or not 1 <= limit <= 1000):
            raise ValueError("joined limit differs")
        if value["terminal"] != "all":
            raise ValueError("joined terminal is unsupported")
        return cls(root["module"], root["record"], join["module"], join["relationship"], selection, where, tuple(orders), limit, "all")

    @classmethod
    def from_json(cls, value: str | bytes) -> GeneratedJoinedReadCall:
        raw = value.encode("utf-8", errors="strict") if type(value) is str else value
        return cls.from_mapping(parse_bounded_program_json(raw, MAX_GENERATED_READ_CALL_BYTES))


@dataclass(frozen=True, slots=True)
class GeneratedJoinedReadRoot:
    root_id: str
    module: str
    record: str
    relationship_module: str
    relationship_id: str

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (self.root_id, self.module, self.record, self.relationship_module, self.relationship_id)):
            raise ValueError("joined read root inventory identity is malformed")


@dataclass(frozen=True, slots=True)
class BoundJoinedReadProgram(BoundReadProgramV3):
    call_digest: str
    relationship: Mapping[str, object]
    selection: tuple[GeneratedJoinedField, ...]
    ordinal_output: Mapping[str, object]

    def __post_init__(self) -> None:
        super(BoundJoinedReadProgram, self).__post_init__()
        _hash(self.call_digest, "joined read call digest")
        if not isinstance(self.relationship, Mapping):
            raise TypeError("joined read Relationship identity must be an object")
        object.__setattr__(self, "relationship", freeze_json(self.relationship))
        if type(self.selection) is not tuple or any(type(item) is not GeneratedJoinedField for item in self.selection):
            raise ValueError("joined bound selection is malformed")
        if len(self.selection) != len(self.outputs):
            raise ValueError("joined bound selection and output count differ")
        if not isinstance(self.ordinal_output, Mapping) or dict(self.ordinal_output) != {
            "name": "__weft_ordinal",
            "carrier": "integer",
            "nullable": False,
            "nativeType": {"kind": "int8"},
            "oid": 20,
        }:
            raise ValueError("joined native ordinal descriptor differs")
        object.__setattr__(self, "ordinal_output", freeze_json(self.ordinal_output))
        for ordinal, (selected, output) in enumerate(zip(self.selection, self.outputs, strict=True)):
            if "/" in selected.field_id:
                parts = selected.field_id.split("/", 1)
                source_field = {"module": parts[0].replace("~1", "/").replace("~0", "~"), "element": parts[1].replace("~1", "/").replace("~0", "~")}
            else:
                source_field = {"module": selected.owner_module, "element": selected.field_id}
            if output.get("ordinal") != ordinal or output.get("owner") != {"module": selected.owner_module, "record": selected.owner_record} or output.get("sourceField") != source_field:
                raise ValueError("joined output owner, ordinal or Field differs")


@dataclass(frozen=True, slots=True)
class GeneratedJoinedReadResult:
    """Closed positional result frame for a `/3` joined read call."""

    value: Mapping[str, object]

    def __post_init__(self) -> None:
        if not isinstance(self.value, Mapping):
            raise TypeError("joined result frame must be an object")
        _preflight_joined_result(self.value)
        object.__setattr__(self, "value", freeze_json(self.value))

    @classmethod
    def from_mapping(cls, value: object) -> GeneratedJoinedReadResult:
        if not isinstance(value, Mapping):
            raise ValueError("joined result frame must be bounded JSON")
        return cls(value)

    @classmethod
    def from_json(cls, value: str | bytes) -> GeneratedJoinedReadResult:
        raw = value.encode("utf-8", errors="strict") if type(value) is str else value
        return cls.from_mapping(parse_bounded_result_json(raw, MAX_GENERATED_JOINED_RESULT_BYTES))

    def to_mapping(self) -> Mapping[str, object]:
        return self.value


def _preflight_joined_result(value: Mapping[str, object]) -> None:
    stack: list[tuple[object, int]] = [(value, 0)]
    size = 0
    nodes = 0

    def string_size(text: str) -> int:
        result = 2
        for character in text:
            codepoint = ord(character)
            if 0xD800 <= codepoint <= 0xDFFF:
                raise ValueError("joined result contains an invalid Unicode scalar")
            if character in {'"', "\\", "\b", "\t", "\n", "\f", "\r"}:
                result += 2
            elif codepoint < 0x20:
                result += 6
            elif codepoint < 0x80:
                result += 1
            elif codepoint < 0x800:
                result += 2
            elif codepoint < 0x10000:
                result += 3
            else:
                result += 4
        return result

    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > MAX_GENERATED_JOINED_RESULT_BYTES or depth > 128:
            raise ValueError("joined result frame exceeds structural bounds")
        if type(item) is str:
            if len(item) > MAX_GENERATED_JOINED_RESULT_BYTES:
                raise ValueError("joined result frame exceeds byte bounds")
            size += string_size(item)
        elif isinstance(item, Mapping):
            if len(item) * 2 > MAX_GENERATED_JOINED_RESULT_BYTES - nodes - len(stack):
                raise ValueError("joined result frame exceeds node bounds")
            keys = list(item)
            if any(type(key) is not str for key in keys):
                raise ValueError("joined result frame has a non-text key")
            keys.sort()
            size += 2 + max(0, len(keys) - 1)
            for key in reversed(keys):
                size += string_size(key) + 1
                stack.append((item[key], depth + 1))
        elif isinstance(item, (list, tuple)):
            if len(item) > MAX_GENERATED_JOINED_RESULT_BYTES - nodes - len(stack):
                raise ValueError("joined result frame exceeds node bounds")
            size += 2 + max(0, len(item) - 1)
            stack.extend((child, depth + 1) for child in reversed(item))
        elif item is None or type(item) in {bool, int}:
            if type(item) is int:
                if item.bit_length() > MAX_GENERATED_JOINED_RESULT_BYTES * 4:
                    raise ValueError("joined result integer exceeds byte bounds")
                size += len(str(item))
            else:
                size += 4 if item is None or item is True else 5
        else:
            raise ValueError("joined result frame contains a non-JSON value")
        if size > MAX_GENERATED_JOINED_RESULT_BYTES:
            raise ValueError("joined result frame exceeds byte bounds")


@dataclass(frozen=True, slots=True)
class GeneratedGetManyCall:
    """Immutable request for an issued primary-Key batch read."""

    module: str
    record: str
    key_id: str
    keys: tuple[tuple[object, ...], ...]
    fields: tuple[str, ...]

    def __post_init__(self) -> None:
        for name in ("module", "record", "key_id"):
            value = getattr(self, name)
            if type(value) is not str or not value:
                raise ValueError(
                    "generated Key batch " + name + " must be nonempty text"
                )
            value.encode("utf-8", errors="strict")
        if type(self.keys) is not tuple or not 1 <= len(self.keys) <= 100:
            raise ValueError("generated Key batch must contain 1..100 Keys")
        copied: list[tuple[object, ...]] = []
        for key in self.keys:
            if type(key) is not tuple or not 1 <= len(key) <= 16:
                raise ValueError("generated Key tuple must contain 1..16 values")
            frozen = tuple(freeze_json(value) for value in key)
            if any(
                not isinstance(value, Mapping) or len(value) != 1 for value in frozen
            ):
                raise ValueError(
                    "generated Key values must be exact tagged UMF literals"
                )
            copied.append(frozen)
        object.__setattr__(self, "keys", tuple(copied))
        if (
            type(self.fields) is not tuple
            or len(self.fields) > 8
            or any(type(field) is not str or not field for field in self.fields)
            or len(set(self.fields)) != len(self.fields)
        ):
            raise ValueError("generated Key batch fields must be unique issued IDs")
        for field in self.fields:
            field.encode("utf-8", errors="strict")


@dataclass(frozen=True, slots=True)
class BoundKeyBatchProgram:
    """Verifier-issued batch SQL and immutable native result pins."""

    sql: str
    parameters: tuple[object, ...]
    description_sql: str
    description_parameters: tuple[object, ...]
    keys: tuple[tuple[Mapping[str, object], ...], ...]
    fields: tuple[Mapping[str, object], ...]
    outputs: tuple[Mapping[str, object], ...]
    key_outputs: tuple[Mapping[str, object], ...]
    ordinal_output: Mapping[str, object]
    present_output: Mapping[str, object]
    native_read_guard: Mapping[str, object]
    obligations: Mapping[str, object]
    source_digest: str
    target_digest: str
    root: Mapping[str, str]
    key_id: str
    input_count: int
    program_json: bytes

    def __post_init__(self) -> None:
        if type(self.sql) is not str or not self.sql:
            raise ValueError("bound Key batch SQL must be nonempty text")
        if type(self.description_sql) is not str or not self.description_sql:
            raise ValueError("bound Key batch description SQL must be nonempty text")
        if (
            type(self.description_parameters) is not tuple
            or self.description_parameters
        ):
            raise ValueError("bound Key batch description parameters must be empty")
        if type(self.parameters) is not tuple:
            raise ValueError("bound Key batch parameters must be a tuple")
        if any(
            type(value) not in {bool, str, int, float} and value is not None
            for value in self.parameters
        ):
            raise ValueError("bound Key batch parameter type is unsupported")
        if type(self.keys) is not tuple or not 1 <= len(self.keys) <= 100:
            raise ValueError("bound Key batch size differs")
        copied_keys = tuple(
            tuple(freeze_json(value) for value in key) for key in self.keys
        )
        if any(
            not isinstance(value, Mapping) or len(value) != 1
            for key in copied_keys
            for value in key
        ):
            raise ValueError("bound Key batch values are malformed")
        object.__setattr__(self, "keys", copied_keys)
        for name in ("fields", "outputs", "key_outputs"):
            items = getattr(self, name)
            if type(items) is not tuple or any(
                not isinstance(item, Mapping) for item in items
            ):
                raise ValueError(
                    "bound Key batch " + name + " must be immutable descriptors"
                )
            object.__setattr__(self, name, tuple(freeze_json(item) for item in items))
        if any(
            set(field) != {"module", "element"}
            or any(
                type(field[key]) is not str or not field[key]
                for key in ("module", "element")
            )
            for field in self.fields
        ):
            raise ValueError("bound Key batch field references are malformed")
        if len(self.fields) != len(self.outputs) or len(self.keys[0]) != len(
            self.key_outputs
        ):
            raise ValueError("bound Key batch columns differ")
        if (
            len(self.fields) > 8
            or not 1 <= len(self.key_outputs) <= 16
            or any(len(key) != len(self.key_outputs) for key in self.keys)
        ):
            raise ValueError("bound Key batch field or Key arity differs")
        for name in ("ordinal_output", "present_output", "root"):
            value = getattr(self, name)
            if not isinstance(value, Mapping):
                raise TypeError("bound Key batch " + name + " is malformed")
            object.__setattr__(self, name, freeze_json(value))
        if not isinstance(self.native_read_guard, Mapping) or not isinstance(
            self.obligations, Mapping
        ):
            raise TypeError("bound Key batch guard or obligations are malformed")
        object.__setattr__(
            self, "native_read_guard", freeze_json(self.native_read_guard)
        )
        object.__setattr__(self, "obligations", freeze_json(self.obligations))
        _hash(self.source_digest, "bound Key batch source digest")
        _hash(self.target_digest, "bound Key batch target digest")
        if type(self.key_id) is not str or not self.key_id:
            raise ValueError("bound Key batch Key identity is malformed")
        if set(self.root) != {"module", "record"} or any(
            type(self.root[key]) is not str or not self.root[key]
            for key in ("module", "record")
        ):
            raise ValueError("bound Key batch root identity is malformed")
        if type(self.input_count) is not int or self.input_count != len(self.keys):
            raise ValueError("bound Key batch input count differs")
        if type(self.program_json) is not bytes:
            raise ValueError("bound Key batch program must be canonical JSON bytes")
        parsed = parse_json(self.program_json)
        if type(parsed) is not dict or canonical_json(parsed) != self.program_json:
            raise ValueError("bound Key batch program JSON must be canonical")


@runtime_checkable
class GeneratedExecutor(Protocol):
    @property
    def ordinary_page_roots(self) -> tuple[GeneratedOrdinaryPageRoot, ...]: ...

    @property
    def joined_read_roots(self) -> tuple[GeneratedJoinedReadRoot, ...]: ...

    @property
    def native_table(self) -> AdmittedNativeTable: ...

    @property
    def target(self) -> TargetBinding: ...

    @property
    def trusted_artifact(self) -> TrustedArtifactRef: ...

    @property
    def read_profile(self) -> str | None: ...

    @property
    def read_algebra_json(self) -> bytes: ...

    def bind(self, call: GeneratedCall, scope: ExecutionScope) -> BoundProgram: ...

    def bind_read(
        self, call: GeneratedReadCall, scope: ExecutionScope
    ) -> BoundReadProgram: ...

    def bind_read_v2(
        self, call: GeneratedReadCallV2, scope: ExecutionScope
    ) -> BoundReadProgramV2: ...

    def bind_read_v3(
        self, call: GeneratedReadCallV2, scope: ExecutionScope
    ) -> BoundReadProgramV3: ...

    def prepare_joined_read(self, call: GeneratedJoinedReadCall) -> BoundJoinedReadProgram: ...

    def bind_joined_read(
        self, call: GeneratedJoinedReadCall, scope: ExecutionScope
    ) -> BoundJoinedReadProgram: ...

    def validate_joined_result(
        self, call: GeneratedJoinedReadCall, result: Mapping[str, object]
    ) -> bool: ...

    def bind_get_many(
        self, call: GeneratedGetManyCall, scope: ExecutionScope
    ) -> BoundKeyBatchProgram: ...

    def bind_forward_connection(
        self, call: GeneratedForwardConnectionCall
    ) -> BoundForwardConnectionProgram: ...

    def prepare_ordinary_page(
        self, call: GeneratedOrdinaryPageCall
    ) -> PreparedOrdinaryPage: ...

    def validate_get_many_key(
        self,
        module: str,
        record: str,
        key_id: str,
        components: tuple[object, ...],
    ) -> tuple[object, ...]: ...
