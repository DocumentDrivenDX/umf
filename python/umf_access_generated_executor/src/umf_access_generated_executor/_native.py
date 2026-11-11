"""Verified native-table projection values from inventoried build output."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

from umf_access_generated_executor._canonical import (
    ExactJsonNumber,
    canonical_json,
    freeze_json,
    parse_json,
)
from umf_access_generated_executor._errors import GeneratedExecutionError
from umf_access_generated_executor._values import (
    GeneratedFiles,
    GeneratedManifest,
    _hash,
)

_NATIVE_PATH = "native/native-table-source.json"
_ISSUE = object()


def _object(value: object, required: set[str], name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != required:
        raise ValueError(name + " has missing or unknown members")
    return value


def _name(value: object, name: str) -> str:
    if type(value) is not str or not value or "\x00" in value:
        raise ValueError(name + " must be nonempty text")
    value.encode("utf-8", errors="strict")
    return value


def _digest(value: object, name: str) -> str:
    if type(value) is not str:
        raise ValueError(name + " must be SHA-256 hex")
    _hash(value, name)
    return value


def _check_source(
    value: object,
    expected_source_digest: str,
    *,
    expected_version: str = "umf.native-table-source/1",
) -> Mapping[str, object]:
    source_members = {
            "version",
            "bundleDigest",
            "sourceDigest",
            "configurationDigest",
            "configuration",
            "expectedCatalog",
            "operations",
        }
    if expected_version.endswith("/3"):
        source_members.add("relationships")
    source = _object(value, source_members, "native table source")
    if source["version"] != expected_version or expected_version not in {
        "umf.native-table-source/1",
        "umf.native-table-source/2",
        "umf.native-table-source/3",
    }:
        raise ValueError("native table source version is unsupported")
    _digest(source["bundleDigest"], "native bundle digest")
    source_digest = _digest(source["sourceDigest"], "native source digest")
    if source_digest != expected_source_digest:
        raise ValueError("native source digest differs from final source digest")
    configuration_digest = _digest(
        source["configurationDigest"], "native configuration digest"
    )
    configuration = _object(
        source["configuration"],
        {"schema", "module", "ownerRole", "personRole", "batchRole", "groupRoles"},
        "native configuration",
    )
    for field in ("schema", "module", "ownerRole", "personRole", "batchRole"):
        _name(configuration[field], "native configuration " + field)
    groups = configuration["groupRoles"]
    if not isinstance(groups, Mapping):
        raise TypeError("native group roles must be an object")
    for role, group in groups.items():
        _name(role, "native group role key")
        _name(group, "native group role value")
    if (
        hashlib.sha256(canonical_json(configuration)).hexdigest()
        != configuration_digest
    ):
        raise ValueError("native configuration digest mismatch")

    catalog_members = {"tables", "checks"}
    if expected_version.endswith("/3"):
        catalog_members.update({"keys", "foreignKeys"})
    catalog = _object(source["expectedCatalog"], catalog_members, "expected catalog")
    table_keys = (
        {"id", "name"}
        if expected_version.endswith("/1")
        else {"id", "name", "record", "columns"}
    )
    for collection, required in (("tables", table_keys), ("checks", {"id"})):
        rows = catalog[collection]
        if not isinstance(rows, (list, tuple)):
            raise TypeError("native catalog entries must be arrays")
        identities: set[str] = set()
        names: set[str] = set()
        for row in rows:
            item = _object(row, required, "native catalog entry")
            identity = _name(item["id"], "native catalog identity")
            identities.add(identity)
            if "name" in required:
                name = _name(item["name"], "native catalog name")
                names.add(name)
            if "record" in required:
                record = _object(
                    item["record"], {"module", "element"}, "native catalog Record"
                )
                if (
                    _name(record["module"], "native catalog Record module")
                    != configuration["module"]
                ):
                    raise ValueError("native catalog Record module differs")
                _name(record["element"], "native catalog Record element")
                columns = item["columns"]
                if not isinstance(columns, (list, tuple)):
                    raise TypeError("native catalog columns must be an array")
                column_names: set[str] = set()
                field_refs: set[tuple[str, str]] = set()
                for column in columns:
                    descriptor = _object(
                        column, {"name", "field", "nativeType"}, "native catalog column"
                    )
                    column_name = _name(
                        descriptor["name"], "native catalog column name"
                    )
                    field = _object(
                        descriptor["field"],
                        {"module", "element"},
                        "native catalog Field",
                    )
                    field_ref = (
                        _name(field["module"], "native catalog Field module"),
                        _name(field["element"], "native catalog Field element"),
                    )
                    if column_name in column_names or field_ref in field_refs:
                        raise ValueError("native catalog column identity is duplicated")
                    native_type = descriptor["nativeType"]
                    if (
                        not isinstance(native_type, Mapping)
                        or type(native_type.get("kind")) is not str
                    ):
                        raise ValueError("native catalog nativeType is malformed")
                    kind = native_type["kind"]
                    if kind in {"varchar", "char"}:
                        _object(
                            native_type, {"kind", "length"}, "native character type"
                        )
                        if type(native_type["length"]) not in {int, ExactJsonNumber}:
                            raise ValueError(
                                "native character length is not a JSON number"
                            )
                    elif kind == "numeric":
                        _object(
                            native_type,
                            {"kind", "precision", "scale"},
                            "native numeric type",
                        )
                        if type(native_type["precision"]) not in {
                            int,
                            ExactJsonNumber,
                        } or type(native_type["scale"]) not in {int, ExactJsonNumber}:
                            raise ValueError(
                                "native numeric precision/scale is not a JSON number"
                            )
                    elif kind not in {
                        "boolean",
                        "text",
                        "int2",
                        "int4",
                        "int8",
                        "float4",
                        "float8",
                        "date",
                        "timestamp",
                        "timestamptz",
                        "uuid",
                        "bytea",
                    }:
                        raise ValueError("native catalog nativeType is unsupported")
                    else:
                        _object(native_type, {"kind"}, "native scalar type")
                    column_names.add(column_name)
                    field_refs.add(field_ref)
        if len(identities) != len(rows):
            raise ValueError("native catalog identities must be unique")
        if collection == "tables" and len(names) != len(rows):
            raise ValueError("native catalog table names must be unique")

    if expected_version.endswith("/3"):
        _check_native_relationships(source, configuration)

    operations = source["operations"]
    if not isinstance(operations, (list, tuple)):
        raise TypeError("native operations must be an array")
    seen: set[str] = set()
    kinds = {"query", "read", "insert", "insertFrom", "update", "delete", "upsert"}
    for operation in operations:
        item = _object(operation, {"id", "kind"}, "native operation")
        identity = _name(item["id"], "native operation ID")
        if identity in seen:
            raise ValueError("native operation IDs must be unique")
        seen.add(identity)
        if item["kind"] not in kinds:
            raise ValueError("native operation kind is unsupported")
    return source


_RELATIONSHIP_REFUSALS = frozenset({
    "source-cardinality-unsupported",
    "target-cardinality-unsupported",
    "sourceMultiplicity-malformed",
    "targetMultiplicity-malformed",
    "target-not-required-to-one",
    "relationship-not-directed",
    "target-lifecycle-unsupported",
    "association-record-unsupported",
    "unknown-relationship-members",
    "source-record-module-unsupported",
    "target-record-module-unsupported",
    "relationship-foreign-key-link-not-unique",
    "binding-relationship-not-unique",
    "binding-relationship-module-mismatch",
    "source-or-target-table-missing",
    "foreign-key-target-mismatch",
    "original-target-key-missing",
    "foreign-key-pair-shape-unsupported",
    "foreign-key-field-not-bound",
    "verified-native-key-or-foreign-key-missing",
    "verified-native-key-or-foreign-key-mismatch",
    "binding-relationship-does-not-match-native-pairs",
})


def _check_native_relationships(
    source: Mapping[str, object], configuration: Mapping[str, object]
) -> None:
    """Check the closed `/3` projection's relationship, binding and DDL pins."""
    catalog = _object(
        source["expectedCatalog"],
        {"tables", "checks", "keys", "foreignKeys"},
        "native `/3` expected catalog",
    )
    tables = catalog["tables"]
    keys = catalog["keys"]
    foreign_keys = catalog["foreignKeys"]
    relationships = source.get("relationships")
    if not isinstance(tables, (list, tuple)) or not isinstance(keys, (list, tuple)) or not isinstance(foreign_keys, (list, tuple)) or not isinstance(relationships, (list, tuple)):
        raise TypeError("native `/3` relationship inventory is malformed")

    table_by_record: dict[tuple[str, str], Mapping[str, object]] = {}
    table_by_id: dict[str, Mapping[str, object]] = {}
    for value in tables:
        table = _object(value, {"id", "name", "record", "columns"}, "native `/3` table")
        table_id = _name(table["id"], "native `/3` table ID")
        record = _object(table["record"], {"module", "element"}, "native `/3` table Record")
        record_ref = (
            _name(record["module"], "native `/3` Record module"),
            _name(record["element"], "native `/3` Record ID"),
        )
        if record_ref in table_by_record or table_id in table_by_id:
            raise ValueError("native `/3` table Record or ID is duplicated")
        table_by_record[record_ref] = table
        table_by_id[table_id] = table

    key_by_identity: dict[tuple[str, str], Mapping[str, object]] = {}
    for value in keys:
        key = _object(value, {"table", "id", "name", "primary", "columns", "definitionSql"}, "native `/3` Key")
        table_id = _name(key["table"], "native `/3` Key table")
        identity = _name(key["id"], "native `/3` Key ID")
        if table_id not in table_by_id or type(key["primary"]) is not bool or type(key["definitionSql"]) is not str:
            raise ValueError("native `/3` Key facts are malformed")
        _name(key["name"], "native `/3` Key name")
        columns = key["columns"]
        if not isinstance(columns, (list, tuple)) or not columns or any(type(item) is not str or not item for item in columns):
            raise ValueError("native `/3` Key columns are malformed")
        if (table_id, identity) in key_by_identity:
            raise ValueError("native `/3` Key identities are duplicated")
        key_by_identity[(table_id, identity)] = key

    foreign_key_by_identity: dict[tuple[str, str], Mapping[str, object]] = {}
    for value in foreign_keys:
        foreign_key = _object(value, {"table", "id", "name", "targetKey", "definitionSql"}, "native `/3` Foreign Key")
        table_id = _name(foreign_key["table"], "native `/3` Foreign Key table")
        identity = _name(foreign_key["id"], "native `/3` Foreign Key ID")
        if table_id not in table_by_id or type(foreign_key["definitionSql"]) is not str:
            raise ValueError("native `/3` Foreign Key facts are malformed")
        _name(foreign_key["name"], "native `/3` Foreign Key name")
        _name(foreign_key["targetKey"], "native `/3` Foreign Key target Key")
        if (table_id, identity) in foreign_key_by_identity:
            raise ValueError("native `/3` Foreign Key identities are duplicated")
        foreign_key_by_identity[(table_id, identity)] = foreign_key

    module = _name(configuration["module"], "native `/3` module")
    relationship_ids: set[str] = set()
    linked_foreign_keys: set[tuple[str, str]] = set()
    for value in relationships:
        if not isinstance(value, Mapping):
            raise TypeError("native `/3` Relationship entry is malformed")
        declaration = value.get("declaration")
        if not isinstance(declaration, Mapping):
            raise ValueError("native `/3` Relationship declaration is malformed")
        identity = _name(declaration.get("id"), "native `/3` original Relationship ID")
        logical_identity = _object(value.get("logicalIdentity"), {"module", "id"}, "native `/3` Relationship identity")
        if logical_identity != {"module": module, "id": identity} or identity in relationship_ids:
            raise ValueError("native `/3` Relationship identity differs or repeats")
        relationship_ids.add(identity)
        status = value.get("status")
        if status == "refused":
            refused = _object(value, {"declaration", "logicalIdentity", "status", "reasons"}, "refused native Relationship")
            reasons = refused["reasons"]
            if (
                not isinstance(reasons, (list, tuple))
                or not reasons
                or any(type(reason) is not str or reason not in _RELATIONSHIP_REFUSALS for reason in reasons)
                or tuple(reasons) != tuple(sorted(set(reasons)))
            ):
                raise ValueError("refused native Relationship reasons are malformed")
            continue
        if status != "admitted":
            raise ValueError("native `/3` Relationship status is unsupported")
        entry = _object(value, {"declaration", "logicalIdentity", "status", "logical", "binding", "native"}, "admitted native Relationship")
        logical = _object(
            entry["logical"],
            {"module", "id", "source", "target", "sourceMultiplicity", "targetMultiplicity", "targetLifecycle", "directed"},
            "admitted native Relationship logical facts",
        )
        if logical["module"] != module or logical["id"] != identity or declaration.get("directed") is not True or declaration.get("targetLifecycle") != "independent":
            raise ValueError("admitted native Relationship logical pins differ")
        if set(declaration) != {"id", "name", "source", "target", "sourceMultiplicity", "targetMultiplicity", "targetLifecycle", "directed"}:
            raise ValueError("admitted native Relationship has unsupported source members")
        source_refs = declaration.get("source")
        target_refs = declaration.get("target")
        if not isinstance(source_refs, (list, tuple)) or len(source_refs) != 1 or not isinstance(target_refs, (list, tuple)) or len(target_refs) != 1:
            raise ValueError("admitted native Relationship source/target arity differs")
        source_ref = _object(source_refs[0], {"module", "element"}, "native Relationship source Record")
        raw_target = _object(target_refs[0], {"module", "element", "key"}, "native Relationship target Key")
        target_ref = {"module": raw_target["module"], "element": raw_target["element"], "key": raw_target["key"]}
        if (
            logical["source"] != source_ref
            or logical["target"] != target_ref
            or logical["sourceMultiplicity"] != declaration.get("sourceMultiplicity")
            or logical["targetMultiplicity"] != declaration.get("targetMultiplicity")
            or logical["directed"] is not declaration.get("directed")
            or logical["targetLifecycle"] != declaration.get("targetLifecycle")
            or logical["targetMultiplicity"] != {"min": 1, "max": 1}
        ):
            raise ValueError("admitted native Relationship declaration differs from normalized facts")
        source_record = (module, _name(source_ref["element"], "native Relationship source Record"))
        target_record = (module, _name(raw_target["element"], "native Relationship target Record"))
        source_table = table_by_record.get(source_record)
        target_table = table_by_record.get(target_record)
        if source_table is None or target_table is None:
            raise ValueError("admitted native Relationship source/target table is missing")

        binding = _object(entry["binding"], {"sourceRecord", "targetRecord", "toOne", "pairs"}, "admitted native Relationship binding")
        if binding["sourceRecord"] != list(source_record) or binding["targetRecord"] != list(target_record) or binding["toOne"] is not True:
            raise ValueError("admitted native Relationship owner binding differs")
        pairs = binding["pairs"]
        if not isinstance(pairs, (list, tuple)) or not pairs:
            raise ValueError("admitted native Relationship pairs are malformed")
        source_columns = {column["field"]["module"] + "\0" + column["field"]["element"]: column for column in source_table["columns"]}
        target_columns = {column["field"]["module"] + "\0" + column["field"]["element"]: column for column in target_table["columns"]}
        source_column_names: list[str] = []
        target_column_names: list[str] = []
        for pair_value in pairs:
            pair = _object(pair_value, {"sourceField", "targetField", "sourceColumn", "targetColumn"}, "native Relationship pair")
            source_field = _object(pair["sourceField"], {"module", "element"}, "native Relationship source Field")
            target_field = _object(pair["targetField"], {"module", "element"}, "native Relationship target Field")
            source_key = _name(source_field["module"], "native source Field module") + "\0" + _name(source_field["element"], "native source Field ID")
            target_key = _name(target_field["module"], "native target Field module") + "\0" + _name(target_field["element"], "native target Field ID")
            source_column = _object(pair["sourceColumn"], {"tableId", "tableName", "columnName", "field"}, "native source physical column")
            target_column = _object(pair["targetColumn"], {"tableId", "tableName", "columnName", "field"}, "native target physical column")
            if (
                source_column["field"] != source_field
                or target_column["field"] != target_field
                or source_column["tableId"] != source_table["id"]
                or source_column["tableName"] != source_table["name"]
                or target_column["tableId"] != target_table["id"]
                or target_column["tableName"] != target_table["name"]
                or source_key not in source_columns
                or target_key not in target_columns
                or source_columns[source_key]["name"] != source_column["columnName"]
                or target_columns[target_key]["name"] != target_column["columnName"]
            ):
                raise ValueError("native Relationship pair does not match exact table/Field binding")
            source_column_names.append(_name(source_column["columnName"], "native source column name"))
            target_column_names.append(_name(target_column["columnName"], "native target column name"))

        native = _object(entry["native"], {"foreignKey", "targetKey"}, "admitted native Relationship DDL")
        foreign_key = native["foreignKey"]
        target_key = native["targetKey"]
        foreign_key_identity = (source_table["id"], _name(foreign_key.get("id") if isinstance(foreign_key, Mapping) else None, "native Relationship Foreign Key ID"))
        target_key_identity = (target_table["id"], _name(raw_target["key"], "native Relationship target Key ID"))
        if (
            not isinstance(foreign_key, Mapping)
            or not isinstance(target_key, Mapping)
            or foreign_key_by_identity.get(foreign_key_identity) != foreign_key
            or key_by_identity.get(target_key_identity) != target_key
            or foreign_key.get("table") != source_table["id"]
            or target_key.get("table") != target_table["id"]
            or foreign_key.get("targetKey") != target_key.get("name")
            or target_key.get("columns") != target_column_names
            or foreign_key_identity in linked_foreign_keys
        ):
            raise ValueError("native Relationship does not match exact verified Key/Foreign Key catalog")
        linked_foreign_keys.add(foreign_key_identity)


def _check_program_joins(
    native: Mapping[str, object], manifest: GeneratedManifest, files: GeneratedFiles
) -> None:
    manifest_value = manifest.value
    source = cast(Mapping[str, object], manifest_value["source"])
    target = cast(Mapping[str, object], manifest_value["target"])
    module_ids = source["moduleIds"]
    configuration = cast(Mapping[str, object], native["configuration"])
    module = configuration["module"]
    if not isinstance(module_ids, tuple) or module not in module_ids:
        raise ValueError("native module is not selected in the final manifest")
    operations = {
        cast(str, item["id"]): cast(str, item["kind"])
        for item in cast(tuple[Mapping[str, object], ...], native["operations"])
    }
    programs = cast(Mapping[str, object], manifest_value["programs"])
    file_mapping = files.mapping
    for operation_id, descriptor_value in programs.items():
        if operation_id not in operations:
            raise ValueError("generated program is not a declared native operation")
        descriptor = _object(
            descriptor_value, {"kind", "programPath"}, "generated program descriptor"
        )
        if (
            descriptor["kind"] != "query"
            or operations[cast(str, operation_id)] != "query"
        ):
            raise ValueError("program and native operation kinds differ")
        path = _name(descriptor["programPath"], "generated program path")
        from umf_access_generated_executor._values import normalized_path

        normalized_path(path)
        content = file_mapping.get(path)
        if content is None:
            raise ValueError("generated program file is absent from inventory")
        exported = parse_json(content)
        if canonical_json(exported) != content:
            raise ValueError("generated query program is not canonical JSON")
        program = _object(
            exported,
            {
                "version",
                "readiness",
                "programDigest",
                "source",
                "target",
                "parameterOrder",
                "parameters",
                "parameterSources",
                "outputs",
                "obligations",
                "template",
                "program",
            },
            "generated query program",
        )
        if program["version"] != "weft.generated-query-program/1":
            raise ValueError("generated query program version differs")
        if program["readiness"] not in {
            "export-only",
            "weft.fixed-query-executable/1",
        }:
            raise ValueError("generated query program readiness is unsupported")
        _digest(program["programDigest"], "generated query program digest")
        embedded = program["program"]
        if (
            hashlib.sha256(canonical_json(embedded)).hexdigest()
            != program["programDigest"]
        ):
            raise ValueError("embedded query program digest mismatch")
        exported_source = _object(
            program["source"], {"modelSha256", "module", "operation"}, "program source"
        )
        if (
            exported_source["modelSha256"] != source["sha256"]
            or exported_source["module"] != module
            or exported_source["operation"] != operation_id
        ):
            raise ValueError("generated source/module/operation pin mismatch")
        exported_target = _object(
            program["target"], {"id", "modelSha256"}, "program target"
        )
        if (
            exported_target["id"] != target["id"]
            or exported_target["modelSha256"] != source["sha256"]
        ):
            raise ValueError("generated target/source pin mismatch")
        embedded_program = _object(
            embedded,
            {
                "status",
                "version",
                "module",
                "operation",
                "binding",
                "modelSha256",
                "transport",
                "dbapiSql",
                "nativeDescriptionSql",
                "dbapiParameterOrder",
                "parameterSources",
                "outputs",
                "result",
                "obligations",
            },
            "embedded lowered program",
        )
        binding = _object(
            embedded_program["binding"], {"modelSha256"}, "embedded binding"
        )
        if (
            embedded_program["module"] != module
            or embedded_program["operation"] != operation_id
            or embedded_program["modelSha256"] != source["sha256"]
            or binding["modelSha256"] != source["sha256"]
        ):
            raise ValueError("embedded program pins differ")


@dataclass(frozen=True, slots=True, init=False)
class AdmittedNativeTable:
    """Opaque native projection issued only from verified artifact admission."""

    _source: Mapping[str, object]
    _operations: tuple[tuple[str, str], ...]

    def __init__(
        self,
        source: Mapping[str, object],
        operations: tuple[tuple[str, str], ...],
        *,
        _issuer: object,
    ) -> None:
        if _issuer is not _ISSUE:
            raise TypeError(
                "AdmittedNativeTable values are issued by prepare_generated"
            )
        object.__setattr__(
            self, "_source", cast(Mapping[str, object], freeze_json(source))
        )
        object.__setattr__(self, "_operations", tuple(operations))

    @classmethod
    def _from_verified(
        cls, manifest: GeneratedManifest, files: GeneratedFiles
    ) -> AdmittedNativeTable | None:
        content = files.mapping.get(_NATIVE_PATH)
        if content is None:
            return None
        value = parse_json(content)
        if canonical_json(value) != content:
            raise ValueError("native table source is not canonical JSON")
        manifest_source = manifest.value["source"]
        if not isinstance(manifest_source, Mapping):
            raise TypeError("manifest source is malformed")
        algebra = manifest.value.get("algebra")
        expected_version = (
            "umf.native-table-source/3"
            if isinstance(algebra, Mapping)
            and algebra.get("profile") == "weft.generated-read-algebra/8"
            else (
                "umf.native-table-source/2"
                if isinstance(algebra, Mapping) and bool(algebra)
                else "umf.native-table-source/1"
            )
        )
        source = _check_source(
            value,
            _digest(manifest_source.get("sha256"), "source digest"),
            expected_version=expected_version,
        )
        _check_program_joins(source, manifest, files)
        operations_value = source["operations"]
        assert isinstance(operations_value, (list, tuple))
        operations = tuple(
            (item["id"], item["kind"])
            for item in operations_value
            if isinstance(item, Mapping)
        )
        if len(operations) != len(operations_value):
            raise ValueError("native operations are malformed")
        return cls(source, operations, _issuer=_ISSUE)

    @property
    def native_source(self) -> Mapping[str, object]:
        return self._source

    def lifecycle_source_snapshot(self) -> dict[str, object]:
        """Return detached JSON values without rounding opaque exact numbers."""
        def copy(value: object) -> object:
            if isinstance(value, ExactJsonNumber):
                return value
            if isinstance(value, Mapping):
                return {key: copy(item) for key, item in value.items()}
            if isinstance(value, tuple):
                return [copy(item) for item in value]
            return value

        return cast(dict[str, object], copy(self._source))

    @property
    def source_digest(self) -> str:
        return cast(str, self._source["sourceDigest"])

    @property
    def bundle_digest(self) -> str:
        return cast(str, self._source["bundleDigest"])

    @property
    def configuration_digest(self) -> str:
        return cast(str, self._source["configurationDigest"])

    @property
    def operations(self) -> tuple[tuple[str, str], ...]:
        """Immutable ``(operation_id, kind)`` inventory from verified build output."""
        return self._operations


def admitted_native_table(
    manifest: GeneratedManifest, files: GeneratedFiles
) -> AdmittedNativeTable | None:
    """Internal admission hook; caller must already have verified the final artifact."""
    try:
        return AdmittedNativeTable._from_verified(manifest, files)
    except (KeyError, TypeError, ValueError, UnicodeError, RecursionError):
        raise GeneratedExecutionError("ARTIFACT_REFUSED") from None
