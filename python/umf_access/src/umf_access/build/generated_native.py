# SPDX-License-Identifier: MIT OR Apache-2.0
"""Issue unsigned generated-execution artifacts from verified table builds.

This is build-side glue.  It delegates deployment verification to the original
UMF verifier and accepts Weft-exported programs as opaque canonical bytes; it
does not compile queries or grant trust to an artifact.  A host-supplied
verified receipt is required before a final installable manifest can be made.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from umf_access_generated_executor import TargetBinding

_DIGEST = re.compile(r"[0-9a-f]{64}\Z")
_MANIFEST_VERSION = "weft.generated-execution/1"
_EXPORT_VERSION = "weft.generated-query-program/1"
_NATIVE_VERSION = "umf.native-table-source/2"
_NATIVE_JOIN_VERSION = "umf.native-table-source/3"
_PROGRAM_FIELDS = {
    "status", "version", "module", "operation", "binding", "modelSha256",
    "transport", "dbapiSql", "nativeDescriptionSql", "dbapiParameterOrder",
    "parameterSources", "outputs", "result", "obligations",
}


def _nonempty(value: object, name: str, *, maximum: int | None = None) -> str:
    if type(value) is not str or not value or (maximum is not None and len(value) > maximum):
        raise ValueError(f"{name} must be nonempty text")
    value.encode("utf-8", errors="strict")
    return value


def _digest(value: object, name: str) -> str:
    if type(value) is not str or _DIGEST.fullmatch(value) is None:
        raise ValueError(f"{name} must be lowercase SHA-256 hex")
    return value


def _object(value: object, fields: set[str], name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError(f"{name} has missing or unknown members")
    return value


def _has_members(value: object, fields: set[str], name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or not fields.issubset(value):
        raise ValueError(f"{name} is missing required members")
    return value


@dataclass(frozen=True, slots=True)
class GeneratorBuildFacts:
    umf_distribution: str
    umf_version: str
    umf_source_digest: str
    weft_distribution: str
    weft_version: str
    weft_source_digest: str

    def __post_init__(self) -> None:
        for name in ("umf_distribution", "umf_version", "weft_distribution", "weft_version"):
            _nonempty(getattr(self, name), name)
        for name in ("umf_source_digest", "weft_source_digest"):
            _digest(getattr(self, name), name)


@dataclass(frozen=True, slots=True)
class GeneratedArtifactContext:
    artifact_id: str
    generator: GeneratorBuildFacts
    target: TargetBinding

    def __post_init__(self) -> None:
        _nonempty(self.artifact_id, "artifact ID", maximum=256)
        if not isinstance(self.generator, GeneratorBuildFacts):
            raise TypeError("generator build facts are required")


@dataclass(frozen=True, slots=True)
class UnsignedGeneratedArtifact:
    """Payload and files awaiting an independently verified receipt."""

    payload_json: bytes
    payload_digest: str
    files: tuple[tuple[str, bytes], ...]
    inventory: tuple[tuple[str, str], ...]


@dataclass(frozen=True, slots=True)
class VerifiedBuildReceipt:
    """Receipt facts supplied by the host's external trust verifier."""

    receipt_digest: str
    issuer: str
    build_id: str
    payload_digest: str
    inventory: tuple[tuple[str, str], ...]

    def __post_init__(self) -> None:
        _digest(self.receipt_digest, "receipt digest")
        _nonempty(self.issuer, "receipt issuer")
        _nonempty(self.build_id, "receipt build ID")
        _digest(self.payload_digest, "receipt payload digest")
        if type(self.inventory) is not tuple:
            raise ValueError("receipt inventory must be an ordered tuple")
        for item in self.inventory:
            if type(item) is not tuple or len(item) != 2:
                raise ValueError("receipt inventory entry is malformed")
            _nonempty(item[0], "receipt inventory path")
            _digest(item[1], "receipt inventory hash")
        if self.inventory != tuple(sorted(self.inventory)):
            raise ValueError("receipt inventory must be sorted")


@dataclass(frozen=True, slots=True)
class FinalGeneratedArtifact:
    """Receipt-bound manifest bytes; Rust readiness still controls execution."""

    manifest_json: bytes
    files: tuple[tuple[str, bytes], ...]
    artifact_digest: str


def _executor_primitives():
    # Keep the generated runtime package out of ordinary umf_access imports.
    try:
        from umf_access_generated_executor._canonical import canonical_json, parse_json
        from umf_access_generated_executor._values import normalized_path
    except ImportError as error:
        raise RuntimeError(
            "install umf-access-generated-executor in the build environment"
        ) from error
    return canonical_json, parse_json, normalized_path


def _issue_read_algebra(
    weft_module: object,
    *,
    target_id: str,
    binding: Mapping[str, object],
    module: str,
    source_digest: str,
    binding_digest: str,
    canonical_json: object,
    parse_json: object,
    profile: str = "v4",
    native_source3: Mapping[str, object] | None = None,
) -> tuple[bytes, Mapping[str, object], int]:
    """Require an explicitly selected Rust-issued read profile."""
    encode = cast(Any, canonical_json)
    decode = cast(Any, parse_json)
    issuers = {
        "v4": (4, "prepare_generated_read_algebra_v4_json"),
        "v5": (5, "prepare_generated_read_algebra_v5_json"),
        "v6": (6, "prepare_generated_read_algebra_v6_json"),
        "v7": (7, "prepare_generated_read_algebra_v7_json"),
        "v8": (8, "prepare_generated_read_algebra_v8_json"),
    }
    if profile not in issuers:
        raise ValueError("generated read profile must be explicitly selected from v4, v5, v6, v7, or v8")
    if (profile == "v8") != (native_source3 is not None):
        raise ValueError("generated read v8 requires its exact nativeSource3 projection")
    version, issuer_name = issuers[profile]
    exporter = getattr(weft_module, issuer_name, None)
    if not callable(exporter):
        raise TypeError(f"installed Rust Weft lacks the required generated-read {profile} issuer")
    request = {
        "version": f"weft.generated-read-algebra-request/{version}",
        "target": target_id,
        "binding": binding,
        "module": module,
    }
    if native_source3 is not None:
        request["nativeSource3"] = native_source3
    try:
        text = exporter(encode(request).decode("utf-8", errors="strict"))
    except Exception as error:
        raise ValueError("Rust Weft refused the verified generated-read algebra") from error
    if type(text) is not str:
        raise ValueError("Rust Weft returned a non-text generated-read algebra")
    raw = text.encode("utf-8", errors="strict")
    algebra = decode(raw)
    profile = f"weft.generated-read-algebra/{version}"
    readiness = f"weft.generated-read-executable/{version}"
    if (
        not isinstance(algebra, Mapping)
        or algebra.get("version") != profile
        or algebra.get("readiness") != readiness
        or algebra.get("source") != {"modelSha256": source_digest, "module": module}
        or algebra.get("target") != {
            "id": target_id,
            "modelSha256": source_digest,
            "bindingDigest": binding_digest,
        }
        or encode(algebra) != raw
    ):
        raise ValueError("Rust Weft generated-read algebra does not exactly pin the verified source and target")
    expected_abi = {"major": 1, "minor": version}
    if version >= 5 and algebra.get("executorAbi") != expected_abi:
        raise ValueError("Rust Weft generated-read executor ABI differs from the selected profile")
    if version == 8:
        if set(algebra) != {"version", "readiness", "source", "target", "executorAbi", "roots"}:
            raise ValueError("Rust Weft v8 algebra has missing or unknown members")
        if not isinstance(native_source3, Mapping):
            raise ValueError("Rust Weft v8 algebra lacks the exact nativeSource3 input")
        native_relationships = native_source3.get("relationships")
        if not isinstance(native_relationships, (list, tuple)):
            raise ValueError("nativeSource3 Relationship inventory is malformed")
        expected_ids: set[str] = set()
        rows_by_id: dict[str, Mapping[str, object]] = {}
        for row in native_relationships:
            if not isinstance(row, Mapping):
                raise TypeError("nativeSource3 Relationship row is malformed")
            identity = _object(row.get("logicalIdentity"), {"module", "id"}, "nativeSource3 Relationship identity")
            key = _nonempty(identity["module"], "nativeSource3 Relationship module").replace("~", "~0").replace("/", "~1") + "/" + _nonempty(identity["id"], "nativeSource3 Relationship ID").replace("~", "~0").replace("/", "~1")
            if key in expected_ids:
                raise ValueError("nativeSource3 Relationship identities are duplicated")
            expected_ids.add(key)
            rows_by_id[key] = row
        roots = algebra.get("roots")
        if not isinstance(roots, Mapping) or not roots:
            raise ValueError("Rust Weft v8 read roots are absent")
        for root_id, root in roots.items():
            if type(root_id) is not str or not isinstance(root, Mapping):
                raise ValueError("Rust Weft v8 root inventory is malformed")
            catalog = _object(root.get("requiredInnerJoins"), {"profile", "relationships"}, "Rust Weft required-inner-join catalog")
            relationship_descriptors = catalog["relationships"]
            if catalog["profile"] != "weft.generated-required-inner-join-catalog/1" or not isinstance(relationship_descriptors, Mapping) or set(relationship_descriptors) != expected_ids:
                raise ValueError("Rust Weft v8 per-root Relationship catalog differs from nativeSource3")
            for key, descriptor in relationship_descriptors.items():
                row = rows_by_id[key]
                if isinstance(descriptor, Mapping) and descriptor.get("status") == "unsupported":
                    refused = _object(descriptor, {"status", "reason"}, "Rust Weft unsupported Relationship descriptor")
                    if refused["status"] != "unsupported" or type(refused["reason"]) is not str or not refused["reason"]:
                        raise ValueError("Rust Weft unsupported Relationship descriptor differs")
                    if row.get("status") not in {"admitted", "refused"}:
                        raise ValueError("nativeSource3 Relationship status is unsupported")
                    continue
                if row.get("status") == "refused":
                    raise ValueError("Rust Weft admitted a refused native Relationship")
                elif row.get("status") == "admitted":
                    eligible = _has_members(descriptor, {"profile", "relationship", "binding", "native"}, "Rust Weft eligible Relationship descriptor")
                    if eligible["profile"] != "weft.generated-required-inner-join/1" or eligible["relationship"] != row.get("logical") or eligible["binding"] != row.get("binding") or eligible["native"] != row.get("native"):
                        raise ValueError("Rust Weft eligible Relationship descriptor differs from nativeSource3")
                    source_ref = cast(Mapping[str, object], cast(Mapping[str, object], eligible["relationship"])["source"])
                    if (source_ref.get("module"), source_ref.get("element")) != (root.get("module"), root.get("record")):
                        raise ValueError("Rust Weft admitted Relationship is attached to a different root")
                else:
                    raise ValueError("nativeSource3 Relationship status is unsupported")
    return raw, algebra, version


def _target_facts(target: object) -> dict[str, str]:
    try:
        facts = {
            "id": target.id,
            "profile": target.profile,
            "version": target.version,
            "bindingDigest": target.binding_digest,
        }
    except AttributeError as error:
        raise TypeError("target must be a TargetBinding") from error
    for name in ("id", "profile", "version"):
        _nonempty(facts[name], "target " + name)
    _digest(facts["bindingDigest"], "target binding digest")
    return facts


def _original_source(bundle: Mapping[str, object], parse_json) -> tuple[Mapping[str, object], Mapping[str, object]]:
    source = _object(bundle.get("source"), {"format", "utf8"}, "deployment source")
    if source["format"] != "json":
        raise ValueError("generated table artifact source profile currently requires JSON")
    raw = source["utf8"]
    if type(raw) is not str:
        raise ValueError("deployment source UTF-8 text is missing")
    document = _has_members(parse_json(raw), {"umf", "id", "modules"}, "original UMF document")
    return source, document


def _native_source(
    verified_bundle: Mapping[str, object],
    parse_json,
    canonical_json,
    *,
    relationship_binding: Mapping[str, object] | None = None,
) -> tuple[dict[str, object], str, str, tuple[str, ...], str, tuple[dict[str, str], ...]]:
    source, document = _original_source(verified_bundle, parse_json)
    raw = cast(str, source["utf8"]).encode("utf-8", errors="strict")
    source_digest = _digest(verified_bundle.get("sourceDigest"), "deployment source digest")
    if hashlib.sha256(raw).hexdigest() != source_digest:
        raise ValueError("verified deployment source digest mismatch")
    document_id = _nonempty(document.get("id"), "document ID")
    core_version = _nonempty(document.get("umf"), "core version")
    modules = document.get("modules")
    if not isinstance(modules, (list, tuple)) or not modules:
        raise ValueError("original source module inventory is empty")
    module_ids: list[str] = []
    selected_module: Mapping[str, object] | None = None
    for item in modules:
        module = _has_members(item, {"id", "extensions"}, "source module")
        module_id = _nonempty(module.get("id"), "source module ID")
        if module_id in module_ids:
            raise ValueError("source module IDs are duplicated")
        module_ids.append(module_id)
        if module_id == verified_bundle.get("module"):
            selected_module = module
    if selected_module is None:
        raise ValueError("verified module is absent from original source")

    configuration = _object(
        verified_bundle.get("configuration"),
        {"schema", "module", "ownerRole", "personRole", "batchRole", "groupRoles"},
        "verified deployment configuration",
    )
    payload_digest = hashlib.sha256(canonical_json(verified_bundle)).hexdigest()
    projection: dict[str, object] = {
        "version": _NATIVE_VERSION,
        "bundleDigest": _digest(verified_bundle.get("bundleDigest"), "deployment bundle digest"),
        "sourceDigest": source_digest,
        "configurationDigest": _digest(verified_bundle.get("configurationDigest"), "configuration digest"),
        "configuration": dict(configuration),
    }
    expected = verified_bundle.get("expectedCatalog")
    if not isinstance(expected, Mapping):
        raise TypeError("verified expected catalog is missing")
    tables = expected.get("tables")
    checks = expected.get("checks")
    if not isinstance(tables, (list, tuple)) or not isinstance(checks, (list, tuple)):
        raise TypeError("verified expected catalog inventory is malformed")
    declarations = selected_module["extensions"]["umf.tables"].get("tables")
    if not isinstance(declarations, (list, tuple)) or len(declarations) != len(tables):
        raise ValueError("verified expected catalog table declarations differ from the original module")
    declarations_by_id: dict[str, Mapping[str, object]] = {}
    for declaration in declarations:
        if not isinstance(declaration, Mapping):
            raise TypeError("original native table declaration is malformed")
        identity = _nonempty(declaration.get("id"), "source table ID")
        if identity in declarations_by_id:
            raise ValueError("original native table IDs are duplicated")
        declarations_by_id[identity] = declaration
    projected_tables: list[dict[str, object]] = []
    for expected_table in tables:
        if not isinstance(expected_table, Mapping):
            raise TypeError("verified expected table is malformed")
        identity = _nonempty(expected_table.get("id"), "table ID")
        name = _nonempty(expected_table.get("name"), "table name")
        declaration = declarations_by_id.get(identity)
        if declaration is None or declaration.get("name") != name:
            raise ValueError("verified expected table differs from the original table declaration")
        record = _object(declaration.get("record"), {"module", "element"}, "source table Record")
        if record["module"] != verified_bundle.get("module"):
            raise ValueError("native table Record is outside the verified deployment module")
        columns = declaration.get("columns")
        if not isinstance(columns, (list, tuple)) or not columns:
            raise ValueError("source table column inventory is empty")
        exact_columns: list[dict[str, object]] = []
        column_names: set[str] = set()
        field_refs: set[tuple[str, str]] = set()
        for column in columns:
            if not isinstance(column, Mapping):
                raise TypeError("source native column is malformed")
            column_name = _nonempty(column.get("name"), "source native column name")
            field = _object(column.get("field"), {"module", "element"}, "source native Field")
            field_ref = (_nonempty(field.get("module"), "source Field module"), _nonempty(field.get("element"), "source Field element"))
            if column_name in column_names or field_ref in field_refs:
                raise ValueError("source table column or Field binding is duplicated")
            column_names.add(column_name)
            field_refs.add(field_ref)
            native_type = column.get("nativeType")
            if not isinstance(native_type, Mapping):
                raise TypeError("source native column type is missing")
            exact_columns.append({
                "name": column_name,
                "field": dict(field),
                "nativeType": dict(native_type),
            })
        projected_tables.append({"id": identity, "name": name, "record": dict(record), "columns": exact_columns})
    if len(declarations_by_id) != len(tables):
        raise ValueError("original native table declarations do not exactly cover expected tables")
    projection["expectedCatalog"] = {
        "tables": projected_tables,
        "checks": [
            {"id": _nonempty(check.get("id") if isinstance(check, Mapping) else None, "check ID")}
            for check in checks
        ],
    }
    if relationship_binding is not None:
        keys = expected.get("keys")
        foreign_keys = expected.get("foreignKeys")
        if not isinstance(keys, (list, tuple)) or not isinstance(foreign_keys, (list, tuple)):
            raise TypeError("verified expected catalog Key/Foreign Key inventory is malformed")
        exact_keys: list[dict[str, object]] = []
        for row in keys:
            key = _object(row, {"table", "id", "name", "primary", "columns", "definitionSql"}, "verified native Key")
            if type(key["primary"]) is not bool or not isinstance(key["columns"], (list, tuple)):
                raise TypeError("verified native Key is malformed")
            exact_keys.append(dict(key))
        exact_foreign_keys: list[dict[str, object]] = []
        for row in foreign_keys:
            foreign_key = _object(row, {"table", "id", "name", "targetKey", "definitionSql"}, "verified native Foreign Key")
            exact_foreign_keys.append(dict(foreign_key))
        projected_catalog = cast(dict[str, object], projection["expectedCatalog"])
        projection["version"] = _NATIVE_JOIN_VERSION
        projected_catalog["keys"] = exact_keys
        projected_catalog["foreignKeys"] = exact_foreign_keys
        projection["relationships"] = _project_relationships(
            document,
            selected_module,
            declarations_by_id,
            projected_tables,
            expected,
            exact_keys,
            exact_foreign_keys,
            relationship_binding,
        )
    extensions = selected_module.get("extensions")
    if not isinstance(extensions, Mapping) or not isinstance(extensions.get("umf.tables"), Mapping):
        raise TypeError("selected source module lacks verified table declarations")
    commands = extensions["umf.tables"].get("commands")
    if not isinstance(commands, (list, tuple)):
        raise TypeError("selected source operation inventory is malformed")
    operations: list[dict[str, str]] = []
    operation_ids: set[str] = set()
    for command in commands:
        if not isinstance(command, Mapping):
            raise TypeError("source operation declaration is malformed")
        identity = _nonempty(command.get("id"), "operation ID")
        body = command.get("body")
        kind = _nonempty(body.get("kind") if isinstance(body, Mapping) else None, "operation kind")
        if identity in operation_ids:
            raise ValueError("source operation IDs are duplicated")
        if kind not in {"query", "read", "insert", "insertFrom", "update", "delete", "upsert"}:
            raise ValueError("source operation kind is unsupported by the native projection")
        operation_ids.add(identity)
        operations.append({"id": identity, "kind": kind})
    projection["operations"] = operations
    return projection, document_id, core_version, tuple(module_ids), payload_digest, tuple(operations)


def _project_relationships(
    document: Mapping[str, object],
    selected_module: Mapping[str, object],
    table_declarations: Mapping[str, Mapping[str, object]],
    projected_tables: list[dict[str, object]],
    expected_catalog: Mapping[str, object],
    exact_keys: list[dict[str, object]],
    exact_foreign_keys: list[dict[str, object]],
    binding: Mapping[str, object],
) -> list[dict[str, object]]:
    """Project the complete source Relationship inventory without inventing pairs."""
    raw_relationships = selected_module.get("relationships")
    if raw_relationships is None:
        raw_relationships = document.get("relationships", ())
    if not isinstance(raw_relationships, (list, tuple)):
        raise TypeError("original Relationship inventory is malformed")
    module_id = _nonempty(selected_module.get("id"), "Relationship module")

    table_by_record: dict[tuple[str, str], tuple[Mapping[str, object], Mapping[str, object]]] = {}
    table_by_id: dict[str, Mapping[str, object]] = {}
    projected_by_id: dict[str, dict[str, object]] = {}
    for declaration in table_declarations.values():
        record = _object(declaration.get("record"), {"module", "element"}, "source table Record")
        record_ref = (_nonempty(record["module"], "table Record module"), _nonempty(record["element"], "table Record element"))
        table_id = _nonempty(declaration.get("id"), "source table ID")
        if record_ref in table_by_record or table_id in table_by_id:
            raise ValueError("native table Record or ID is ambiguous")
        table_by_record[record_ref] = (declaration, record)
        table_by_id[table_id] = declaration
    for item in projected_tables:
        projected_by_id[cast(str, item["id"])] = item

    binding_relationships = binding.get("relationships")
    if not isinstance(binding_relationships, (list, tuple)):
        raise TypeError("exact Weft binding Relationship inventory is malformed")
    binding_by_id: dict[str, list[Mapping[str, object]]] = {}
    for item in binding_relationships:
        if not isinstance(item, Mapping):
            raise TypeError("Weft binding Relationship is malformed")
        identity = _nonempty(item.get("id"), "binding Relationship ID")
        binding_by_id.setdefault(identity, []).append(item)

    source_elements: dict[tuple[str, str], Mapping[str, object]] = {}
    source_modules = document.get("modules")
    if not isinstance(source_modules, (list, tuple)):
        raise TypeError("original source module inventory is malformed")
    for source_module in source_modules:
        if not isinstance(source_module, Mapping):
            raise TypeError("original source module is malformed")
        source_module_id = _nonempty(source_module.get("id"), "source module ID")
        elements = source_module.get("elements")
        if not isinstance(elements, (list, tuple)):
            raise TypeError("original source elements are malformed")
        for element in elements:
            if not isinstance(element, Mapping):
                raise TypeError("original source element is malformed")
            element_id = _nonempty(element.get("id"), "source element ID")
            source_elements[(source_module_id, element_id)] = element

    key_rows = {(row["table"], row["id"]): row for row in exact_keys}
    foreign_key_rows = {(row["table"], row["id"]): row for row in exact_foreign_keys}
    projected: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for raw in raw_relationships:
        if not isinstance(raw, Mapping):
            raise TypeError("original Relationship declaration is malformed")
        declaration = dict(raw)
        identity = _nonempty(raw.get("id"), "original Relationship ID")
        if identity in seen_ids:
            raise ValueError("original Relationship IDs are duplicated")
        seen_ids.add(identity)
        logical_identity = {"module": module_id, "id": identity}
        reasons: list[str] = []

        source_rows = raw.get("source")
        target_rows = raw.get("target")
        if not isinstance(source_rows, (list, tuple)) or len(source_rows) != 1:
            reasons.append("source-cardinality-unsupported")
        if not isinstance(target_rows, (list, tuple)) or len(target_rows) != 1:
            reasons.append("target-cardinality-unsupported")
        source_ref: Mapping[str, object] | None = None
        target_ref: Mapping[str, object] | None = None
        target_key_id: str | None = None
        if not reasons:
            source_ref = _object(source_rows[0], {"module", "element"}, "Relationship source Record")
            target_ref = _object(target_rows[0], {"module", "element", "key"}, "Relationship target Key ref")
            target_key_id = _nonempty(target_ref.get("key"), "Relationship target Key")
        multiplicities = {
            name: raw.get(name)
            for name in ("sourceMultiplicity", "targetMultiplicity")
        }
        for name, value in multiplicities.items():
            if not isinstance(value, Mapping) or set(value) != {"min", "max"}:
                reasons.append(name + "-malformed")
        if isinstance(multiplicities["targetMultiplicity"], Mapping):
            target_multiplicity = cast(Mapping[str, object], multiplicities["targetMultiplicity"])
            if target_multiplicity.get("min") != 1 or target_multiplicity.get("max") != 1:
                reasons.append("target-not-required-to-one")
        if raw.get("directed") is not True:
            reasons.append("relationship-not-directed")
        if raw.get("targetLifecycle") != "independent":
            reasons.append("target-lifecycle-unsupported")
        if "associationRecord" in raw:
            reasons.append("association-record-unsupported")
        if set(raw) != {
            "id", "name", "source", "target", "sourceMultiplicity",
            "targetMultiplicity", "targetLifecycle", "directed",
        }:
            reasons.append("unknown-relationship-members")
        if source_ref is not None and source_ref.get("module") != module_id:
            reasons.append("source-record-module-unsupported")
        if target_ref is not None and target_ref.get("module") != module_id:
            reasons.append("target-record-module-unsupported")

        linked_fks: list[tuple[Mapping[str, object], Mapping[str, object]]] = []
        for table in table_declarations.values():
            foreign_keys = table.get("foreignKeys", ())
            if not isinstance(foreign_keys, (list, tuple)):
                raise TypeError("source native Foreign Key inventory is malformed")
            for foreign_key in foreign_keys:
                if not isinstance(foreign_key, Mapping):
                    raise TypeError("source native Foreign Key declaration is malformed")
                link = foreign_key.get("relationship")
                if isinstance(link, Mapping) and link.get("module") == module_id and link.get("id") == identity:
                    linked_fks.append((table, foreign_key))
        if len(linked_fks) != 1:
            reasons.append("relationship-foreign-key-link-not-unique")

        binding_rows = binding_by_id.get(identity, [])
        if len(binding_rows) != 1:
            reasons.append("binding-relationship-not-unique")
        elif binding_rows[0].get("module", module_id) != module_id:
            reasons.append("binding-relationship-module-mismatch")

        if reasons or source_ref is None or target_ref is None or target_key_id is None:
            projected.append({
                "declaration": declaration,
                "logicalIdentity": logical_identity,
                "status": "refused",
                "reasons": sorted(set(reasons)) or ["relationship-not-eligible"],
            })
            continue

        source_record = (cast(str, source_ref["module"]), cast(str, source_ref["element"]))
        target_record = (cast(str, target_ref["module"]), cast(str, target_ref["element"]))
        source_entry = table_by_record.get(source_record)
        target_entry = table_by_record.get(target_record)
        if source_entry is None or target_entry is None:
            reasons.append("source-or-target-table-missing")
        if reasons:
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": sorted(set(reasons))})
            continue

        source_table, _ = source_entry
        target_table, _ = target_entry
        source_table_id = _nonempty(source_table.get("id"), "source table ID")
        target_table_id = _nonempty(target_table.get("id"), "target table ID")
        foreign_table, source_fk = linked_fks[0]
        source_fk_id = _nonempty(source_fk.get("id"), "source Foreign Key ID")
        original_target = _object(source_fk.get("target"), {"record", "key"}, "source Foreign Key target")
        original_target_record = _object(original_target["record"], {"module", "element"}, "source Foreign Key target Record")
        if (
            foreign_table.get("id") != source_table_id
            or dict(original_target_record) != {"module": target_record[0], "element": target_record[1]}
            or original_target.get("key") != target_key_id
        ):
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": ["foreign-key-target-mismatch"]})
            continue
        target_record_element = next(
            (item for item in cast(list[object], document.get("modules", [])) if isinstance(item, Mapping) and item.get("id") == target_record[0]),
            None,
        )
        target_elements = target_record_element.get("elements") if isinstance(target_record_element, Mapping) else None
        target_record_model = next((item for item in target_elements if isinstance(item, Mapping) and item.get("id") == target_record[1]), None) if isinstance(target_elements, (list, tuple)) else None
        record_keys = target_record_model.get("keys") if isinstance(target_record_model, Mapping) else None
        original_key = next((item for item in record_keys if isinstance(item, Mapping) and item.get("id") == target_key_id), None) if isinstance(record_keys, (list, tuple)) else None
        if not isinstance(original_key, Mapping):
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": ["original-target-key-missing"]})
            continue
        source_fields = source_fk.get("fields")
        target_fields = original_key.get("fields")
        if not isinstance(source_fields, (list, tuple)) or not isinstance(target_fields, (list, tuple)) or not source_fields or len(source_fields) != len(target_fields):
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": ["foreign-key-pair-shape-unsupported"]})
            continue
        source_columns = {(_nonempty(c["field"].get("module"), "source column module"), _nonempty(c["field"].get("element"), "source column Field")): c for c in source_entry[0].get("columns", []) if isinstance(c, Mapping) and isinstance(c.get("field"), Mapping)}
        target_columns = {(_nonempty(c["field"].get("module"), "target column module"), _nonempty(c["field"].get("element"), "target column Field")): c for c in target_entry[0].get("columns", []) if isinstance(c, Mapping) and isinstance(c.get("field"), Mapping)}
        pairs: list[dict[str, object]] = []
        for source_field_value, target_field_value in zip(source_fields, target_fields, strict=True):
            source_field = _object(source_field_value, {"module", "element"}, "Foreign Key source Field")
            target_field = _object(target_field_value, {"module", "element"}, "target Key Field")
            source_field_ref = (_nonempty(source_field["module"], "source Field module"), _nonempty(source_field["element"], "source Field"))
            target_field_ref = (_nonempty(target_field["module"], "target Field module"), _nonempty(target_field["element"], "target Field"))
            source_column = source_columns.get(source_field_ref)
            target_column = target_columns.get(target_field_ref)
            if source_column is None or target_column is None:
                reasons.append("foreign-key-field-not-bound")
                break
            pairs.append({
                "sourceField": dict(source_field),
                "targetField": dict(target_field),
                "sourceColumn": {"tableId": source_table_id, "tableName": source_entry[0]["name"], "columnName": source_column["name"], "field": dict(source_field)},
                "targetColumn": {"tableId": target_table_id, "tableName": target_entry[0]["name"], "columnName": target_column["name"], "field": dict(target_field)},
            })
        if reasons:
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": sorted(set(reasons))})
            continue

        catalog_foreign_key = foreign_key_rows.get((source_table_id, source_fk_id))
        catalog_target_key = key_rows.get((target_table_id, target_key_id))
        if catalog_foreign_key is None or catalog_target_key is None:
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": ["verified-native-key-or-foreign-key-missing"]})
            continue
        if (
            catalog_foreign_key["name"] != source_fk.get("name")
            or catalog_foreign_key["targetKey"] != catalog_target_key["name"]
            or list(catalog_target_key["columns"])
            != [pair["targetColumn"]["columnName"] for pair in pairs]
        ):
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": ["verified-native-key-or-foreign-key-mismatch"]})
            continue

        bound = binding_rows[0]
        expected_source = [source_record[0], source_record[1]]
        expected_target = [target_record[0], target_record[1]]
        def binding_field_name(field: Mapping[str, object]) -> str:
            ref = (_nonempty(field["module"], "binding Field module"), _nonempty(field["element"], "binding Field ID"))
            element = source_elements.get(ref)
            if element is None:
                raise ValueError("binding Relationship Field is absent from original source")
            return _nonempty(element.get("name", ref[1]), "binding logical Field name")

        expected_pairs = [[binding_field_name(cast(Mapping[str, object], pair["sourceField"])), binding_field_name(cast(Mapping[str, object], pair["targetField"]))] for pair in pairs]
        if (
            bound.get("source") != expected_source
            or bound.get("target") != expected_target
            or bound.get("pairs") != expected_pairs
            or bound.get("toOne") is not True
        ):
            projected.append({"declaration": declaration, "logicalIdentity": logical_identity, "status": "refused", "reasons": ["binding-relationship-does-not-match-native-pairs"]})
            continue

        logical = {
            "module": module_id,
            "id": identity,
            "source": {"module": source_record[0], "element": source_record[1]},
            "target": {"module": target_record[0], "element": target_record[1], "key": target_key_id},
            "sourceMultiplicity": dict(cast(Mapping[str, object], multiplicities["sourceMultiplicity"])),
            "targetMultiplicity": dict(cast(Mapping[str, object], multiplicities["targetMultiplicity"])),
            "targetLifecycle": raw.get("targetLifecycle"),
            "directed": raw["directed"],
        }
        projected.append({
            "declaration": declaration,
            "logicalIdentity": logical_identity,
            "status": "admitted",
            "logical": logical,
            "binding": {
                "sourceRecord": expected_source,
                "targetRecord": expected_target,
                "toOne": True,
                "pairs": pairs,
            },
            "native": {"foreignKey": dict(catalog_foreign_key), "targetKey": dict(catalog_target_key)},
        })
    return projected


def _check_export(raw: bytes, operation_id: str, module: str, source_digest: str, target_id: str, parse_json, canonical_json) -> bytes:
    if type(raw) is not bytes:
        raise ValueError("Weft generated query exports must be exact bytes")
    exported = parse_json(raw)
    if not isinstance(exported, Mapping) or canonical_json(exported) != raw:
        raise ValueError("Weft generated query export must be canonical JSON")
    required = {
        "version", "readiness", "programDigest", "source", "target", "parameterOrder",
        "parameters", "parameterSources", "outputs", "obligations", "template", "program",
    }
    _object(exported, required, "Weft generated query export")
    if exported["version"] != _EXPORT_VERSION or exported["readiness"] not in {
        "export-only",
        "weft.fixed-query-executable/1",
    }:
        raise ValueError("Weft export readiness profile is unsupported")
    source = _object(exported["source"], {"modelSha256", "module", "operation"}, "query export source")
    target = _object(exported["target"], {"id", "modelSha256"}, "query export target")
    if source != {"modelSha256": source_digest, "module": module, "operation": operation_id}:
        raise ValueError("Weft query export source/module/operation pins differ")
    if target != {"id": target_id, "modelSha256": source_digest}:
        raise ValueError("Weft query export target/source pins differ")
    output_elements: set[str] = set()
    for output in exported["outputs"]:
        field = output.get("field") if isinstance(output, Mapping) else None
        if not isinstance(field, Mapping):
            continue
        module_id = field.get("module")
        element_id = field.get("element")
        if type(module_id) is not str or type(element_id) is not str:
            continue
        if element_id in output_elements:
            raise ValueError(
                "fixed query outputs with duplicate Field element IDs are not representable in result frames"
            )
        output_elements.add(element_id)
    program = _object(exported["program"], _PROGRAM_FIELDS, "sealed Weft program")
    digest = _digest(exported["programDigest"], "Weft program digest")
    if hashlib.sha256(canonical_json(program)).hexdigest() != digest:
        raise ValueError("Weft program digest mismatch")
    binding = _object(program["binding"], {"modelSha256"}, "Weft program binding")
    if (
        program["version"] != "weft.table-operation/0.1"
        or program["module"] != module
        or program["operation"] != operation_id
        or program["modelSha256"] != source_digest
        or binding["modelSha256"] != source_digest
    ):
        raise ValueError("sealed Weft program pins differ")
    return raw


def prepare_generated_table_build(
    bundle: Mapping[str, object],
    weft_binding: Mapping[str, object],
    context: GeneratedArtifactContext,
    *,
    profile: str = "v4",
) -> UnsignedGeneratedArtifact:
    """Create Rust-issued algebra and, when declared, fixed-query files.

    The installed PyO3 module is the only Weft issuer; no caller-supplied export
    bytes or module object can assert or alter Rust readiness. Ordinary Record
    models may have an empty fixed-query operation set.
    """
    canonical_json, parse_json, normalized_path = _executor_primitives()
    if not isinstance(bundle, Mapping):
        raise TypeError("deployment bundle must be an object")
    try:
        from umf_codegen import verify_table_deployment
    except ImportError as error:
        raise RuntimeError("umf_codegen is required only in the build environment") from error
    original_bundle = parse_json(canonical_json(bundle))
    if not isinstance(original_bundle, Mapping):
        raise TypeError("deployment bundle must be a JSON object")
    verified = verify_table_deployment(dict(original_bundle))
    if canonical_json(verified) != canonical_json(bundle):
        raise ValueError("deployment verifier returned a different bundle")
    if not isinstance(weft_binding, Mapping):
        raise TypeError("exact Weft table binding is required")
    binding = parse_json(canonical_json(weft_binding))
    if not isinstance(binding, Mapping):
        raise TypeError("Weft binding must be a JSON object")
    projection, document_id, core_version, module_ids, bundle_input_digest, operations = _native_source(
        cast(Mapping[str, object], verified),
        parse_json,
        canonical_json,
        relationship_binding=(binding if profile == "v8" else None),
    )
    target = _target_facts(context.target)
    module = cast(str, cast(Mapping[str, object], projection["configuration"])["module"])
    operation_kinds = {item["id"]: item["kind"] for item in operations}
    query_operation_ids = [identity for identity, kind in operation_kinds.items() if kind == "query"]
    source_info = cast(Mapping[str, object], verified["source"])
    source_text = source_info["utf8"]
    configuration = cast(Mapping[str, object], verified["configuration"])
    expected_lifecycle = {
        "version": "umf.table-lifecycle/0.1",
        "module": module,
        "configurationDigest": projection["configurationDigest"],
        "deploymentDigest": projection["bundleDigest"],
    }
    if (
        binding.get("modelJson") != source_text
        or binding.get("modelSha256") != projection["sourceDigest"]
        or binding.get("schema") != configuration["schema"]
        or binding.get("nativeLifecycle") != expected_lifecycle
    ):
        raise ValueError("Weft binding does not exactly pin the verified deployment source")
    if hashlib.sha256(canonical_json(binding)).hexdigest() != target["bindingDigest"]:
        raise ValueError("target binding digest differs from the exact Weft binding")
    try:
        import weft as weft_module
    except ImportError as error:
        raise RuntimeError("Weft's PyO3 exporter is required only in the build environment") from error
    if getattr(weft_module, "__version__", None) != context.generator.weft_version:
        raise ValueError("installed Rust Weft version differs from the trusted build facts")
    prepared_module = None
    if query_operation_ids:
        request = {
            "version": "weft.table-operation-module/0.1",
            "target": target["id"],
            "module": module,
            "binding": binding,
        }
        try:
            prepared_module = weft_module.prepare_table_operation_module_json(
                canonical_json(request).decode("utf-8", errors="strict")
            )
        except Exception as error:
            raise ValueError("Rust Weft refused the verified table source/binding") from error
    files: dict[str, bytes] = {
        "native/native-table-source.json": canonical_json(projection)
    }
    algebra_bytes, algebra, algebra_version = _issue_read_algebra(
        weft_module,
        target_id=cast(str, target["id"]),
        binding=cast(Mapping[str, object], binding),
        module=module,
        source_digest=cast(str, projection["sourceDigest"]),
        binding_digest=cast(str, target["bindingDigest"]),
        canonical_json=canonical_json,
        parse_json=parse_json,
        profile=profile,
        native_source3=(cast(Mapping[str, object], projection) if profile == "v8" else None),
    )
    if algebra_version != {"v4": 4, "v5": 5, "v6": 6, "v7": 7, "v8": 8}.get(profile):
        raise ValueError(f"generated build requires the Rust read algebra {profile} profile")
    files["algebra/read.json"] = algebra_bytes
    descriptors: dict[str, dict[str, str]] = {}
    for operation_id in query_operation_ids:
        if prepared_module is None:
            raise ValueError("Rust Weft table operation module is absent for declared queries")
        try:
            prepared_query = prepared_module.prepare_query(operation_id)
            exported_text = prepared_query.export_generated_program_json()
        except Exception as error:
            raise ValueError("Rust Weft refused the declared query export") from error
        if type(exported_text) is not str:
            raise ValueError("Rust Weft returned a non-text generated query export")
        raw = exported_text.encode("utf-8", errors="strict")
        content = _check_export(raw, operation_id, module, projection["sourceDigest"], target["id"], parse_json, canonical_json)
        path = "programs/" + hashlib.sha256(operation_id.encode("utf-8", errors="strict")).hexdigest() + ".json"
        normalized_path(path)
        files[path] = content
        descriptors[operation_id] = {"kind": "query", "programPath": path}
    ordered_files = tuple(sorted(files.items()))
    inventory = tuple((path, hashlib.sha256(content).hexdigest()) for path, content in ordered_files)
    payload: dict[str, object] = {
        "version": _MANIFEST_VERSION,
        "artifactId": _nonempty(context.artifact_id, "artifact ID", maximum=256),
        "source": {
            "documentId": document_id,
            "coreVersion": core_version,
            "sha256": projection["sourceDigest"],
            "moduleIds": list(module_ids),
            "bundleInputDigest": bundle_input_digest,
        },
        "generator": {
            "umfDistribution": context.generator.umf_distribution,
            "umfVersion": context.generator.umf_version,
            "umfSourceDigest": context.generator.umf_source_digest,
            "weftDistribution": context.generator.weft_distribution,
            "weftVersion": context.generator.weft_version,
            "weftSourceDigest": context.generator.weft_source_digest,
            "abi": _MANIFEST_VERSION,
        },
        "executor": {"abiMajor": 1, "minMinor": algebra_version, "maxMinor": algebra_version, "packageId": "umf-access-generated-executor"},
        "target": target,
        "algebra": {"profile": algebra["version"], "algebraPath": "algebra/read.json"},
        "programs": descriptors,
        "inventory": dict(inventory),
    }
    payload_json = canonical_json(payload)
    return UnsignedGeneratedArtifact(
        payload_json,
        hashlib.sha256(payload_json).hexdigest(),
        ordered_files,
        inventory,
    )


def finalize_generated_table_build(
    unsigned: UnsignedGeneratedArtifact,
    verified_receipt: VerifiedBuildReceipt,
) -> FinalGeneratedArtifact:
    """Finalize only when an external receipt exactly pins payload and files."""
    canonical_json, parse_json, _normalized_path = _executor_primitives()
    if not isinstance(unsigned, UnsignedGeneratedArtifact) or not isinstance(verified_receipt, VerifiedBuildReceipt):
        raise TypeError("unsigned artifact and externally verified receipt are required")
    if verified_receipt.payload_digest != unsigned.payload_digest or verified_receipt.inventory != unsigned.inventory:
        raise ValueError("external build receipt does not pin this generated payload and inventory")
    payload = parse_json(unsigned.payload_json)
    if not isinstance(payload, Mapping) or canonical_json(payload) != unsigned.payload_json:
        raise ValueError("unsigned generated payload is not canonical JSON")
    if hashlib.sha256(unsigned.payload_json).hexdigest() != unsigned.payload_digest:
        raise ValueError("unsigned generated payload digest mismatch")
    actual_inventory = tuple(
        (path, hashlib.sha256(content).hexdigest()) for path, content in unsigned.files
    )
    if actual_inventory != unsigned.inventory:
        raise ValueError("unsigned generated file inventory mismatch")
    payload_inventory = payload.get("inventory")
    if not isinstance(payload_inventory, Mapping) or dict(payload_inventory) != dict(actual_inventory):
        raise ValueError("unsigned payload does not describe its generated file inventory")
    manifest = dict(payload)
    manifest["provenance"] = {
        "receiptDigest": verified_receipt.receipt_digest,
        "issuer": verified_receipt.issuer,
        "buildId": verified_receipt.build_id,
    }
    manifest["artifactDigest"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    manifest_json = canonical_json(manifest)
    return FinalGeneratedArtifact(manifest_json, unsigned.files, manifest["artifactDigest"])
