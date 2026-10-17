"""Immutable source-frozen native programs; no execution or compiler discovery."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from .protocols import ActionRefused
from .reviewed import ReadBuildError, _require_source_exact, parameter_style
from .types import RUNTIME_IDENTITY, ActionRef


class ProgramBuildError(ValueError):
    def __init__(self, original_json: str):
        self.original_json = original_json
        super().__init__("WEFT_BLOCKED: " + original_json)


def program_json(text: str) -> Any:
    def members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate owner program member")
            result[key] = value
        return result

    def constant(value: str) -> Any:
        raise ValueError("nonfinite owner JSON")

    return json.loads(text, object_pairs_hook=members, parse_constant=constant)


def canonical_json(value: Any) -> str:
    # The Weft owner uses UTF-16 ordering, including non-BMP identifiers.
    def ordered(item: Any) -> Any:
        if isinstance(item, dict):
            return {
                key: ordered(item[key])
                for key in sorted(item, key=lambda key: key.encode("utf-16-be"))
            }
        if isinstance(item, list):
            return [ordered(v) for v in item]
        return item

    return json.dumps(
        ordered(value), ensure_ascii=False, separators=(",", ":"), allow_nan=False
    )


def _bulk_list_custody(
    program: Mapping[str, Any], request: Mapping[str, Any] | None = None
) -> None:
    """Require original list facets on every bound original bulk-input slot."""
    if program.get("version") != "weft.native-bulk/0.1":
        return
    parameters = program.get("parameters", [])
    candidates = [parameter for parameter in parameters if type(parameter) is dict and parameter.get("container") == "list"]
    requested = request.get("parameters", []) if request is not None else parameters
    selection = request.get("selection", {}).get("parameters", []) if request is not None else []
    if not candidates and not any(
        type(parameter) is dict and parameter.get("container") == "list"
        for parameter in [*requested, *selection]
    ):
        return  # Preserve the established scalar program path byte-for-byte.

    def refuse() -> None:
        raise ActionRefused("NATIVE_BULK_LIST_SLOT_METADATA_REQUIRED")

    if request is not None and canonical_json(parameters) != canonical_json(requested):
        refuse()
    declared = {}
    expected = {}
    for parameter in candidates:
        name = parameter.get("name")
        if (
            set(parameter) != {"name", "carrier", "nullable", "container", "elementNullable", "maxItems"}
            or type(name) is not str or not name or name in declared
            or parameter["carrier"] not in ("string", "integer", "decimal", "boolean")
            or parameter["nullable"] is not False
            or type(parameter["elementNullable"]) is not bool
            or type(parameter["maxItems"]) is not int
            or not 1 <= parameter["maxItems"] <= 1000
        ):
            refuse()
        declared[name] = parameter
        expected[name] = {"source": {"bulkInput": name}, **{key: value for key, value in parameter.items() if key != "name"}}
    for parameter in selection:
        if type(parameter) is dict:
            name = parameter.get("name")
            if (parameter.get("container") == "list" or type(name) is str and name in declared) and (type(name) is not str or canonical_json(parameter) != canonical_json(declared.get(name))):
                refuse()

    def visit(value: Any) -> None:
        if type(value) is dict:
            if set(value) == {"sql", "parameters"}:
                if type(value["parameters"]) is not list:
                    refuse()
                for slot in value["parameters"]:
                    source = slot.get("source") if type(slot) is dict else None
                    name = source.get("bulkInput") if type(source) is dict else None
                    if type(name) is str and name in declared and canonical_json(slot) != canonical_json(expected[name]):
                        refuse()
            else:
                for child in value.values():
                    visit(child)
        elif type(value) is list:
            for child in value:
                visit(child)

    # A declared parameter may be unused or folded away by its original owner.
    # Validate actual slots only; do not derive parameter use from native SQL.
    visit(program)


def _search_parameter_custody(
    program: Mapping[str, Any], request: Mapping[str, Any] | None = None
) -> None:
    """Preserve original selection facets on executed native input slots."""
    if program.get("version") != "weft.search/0.1":
        return
    def refuse() -> None:
        raise ActionRefused("NATIVE_SEARCH_PARAMETER_FACETS_REQUIRED")
    def declarations(original: Any) -> list[Any]:
        if not isinstance(original, dict) or not isinstance(original.get("selection"), dict):
            refuse()
        parameters = original["selection"].get("parameters", [])
        if not isinstance(parameters, list):
            refuse()
        names = set()
        for parameter in parameters:
            if not isinstance(parameter, dict):
                refuse()
            name = parameter.get("name")
            is_list = parameter.get("container") == "list"
            fields = {"name", "carrier", "nullable"} | ({"container", "elementNullable", "maxItems"} if is_list else set())
            if (set(parameter) != fields or type(name) is not str or not name or name in names
                or parameter.get("carrier") not in ("string", "integer", "decimal", "boolean")
                or type(parameter.get("nullable")) is not bool
                or is_list and (parameter["nullable"] is not False or type(parameter["elementNullable"]) is not bool or type(parameter["maxItems"]) is not int or not 1 <= parameter["maxItems"] <= 1000)):
                refuse()
            names.add(name)
        return parameters
    declared = declarations(program.get("request"))
    requested = declarations(request) if request is not None else declared
    nondefault = {p["name"] for p in [*declared, *requested] if p.get("container") == "list" or p["nullable"] is True}
    if not nondefault:
        return  # Valid established non-null scalar packets retain identical bytes.
    if canonical_json(declared) != canonical_json(requested):
        refuse()
    expected = {}
    for parameter in declared:
        slot = {"source": {"input": parameter["name"]}, **{key:value for key,value in parameter.items() if key != "name"}}
        if parameter.get("container") != "list" and parameter["nullable"] is False:
            slot.pop("nullable")  # Original scalar slot ABI omits the default false.
        expected[parameter["name"]] = slot
    preflights = program.get("preflights", [])
    if not isinstance(preflights, list):
        refuse()
    seen = set()
    # These are the original statements actually executed by the search port;
    # selectionTemplate inventories alone do not establish an executable slot.
    for statement in [program.get("statement"), *preflights]:
        if not isinstance(statement, dict) or not isinstance(statement.get("parameters"), list):
            refuse()
        for slot in statement["parameters"]:
            source = slot.get("source") if isinstance(slot, dict) else None
            name = source.get("input") if isinstance(source, dict) else None
            if isinstance(name, str) and name in expected:
                if canonical_json(slot) != canonical_json(expected[name]):
                    refuse()
                seen.add(name)
    if not nondefault <= seen:
        refuse()


def _literal_admission_sources(descriptors: list[Any], code: str) -> None:
    for descriptor in descriptors:
        admission = descriptor.get("nativeAdmission") if isinstance(descriptor, dict) else None
        if not isinstance(admission, dict) or not isinstance(admission.get("parameters"), list):
            raise ActionRefused(code)
        for parameter in admission["parameters"]:
            source = parameter.get("source") if isinstance(parameter, dict) else None
            if not isinstance(source, dict) or set(source) != {"literal"}:
                raise ActionRefused(code)


def _configuration_custody(program: Mapping[str, Any]) -> None:
    if program.get("target") not in ("postgresql18", "lakebase18"):
        return
    version = program.get("version")
    if version not in ("weft.native-bulk/0.1", "weft.search/0.1"):
        return
    obligations = program.get("obligations", {})
    template = program.get("readTemplate" if version == "weft.native-bulk/0.1" else "selectionTemplate", {})
    original_obligations = template.get("obligations", {}) if isinstance(template, dict) else {}
    if not isinstance(obligations, dict) or not isinstance(original_obligations, dict):
        raise ActionRefused("NATIVE_TERM_FILTER_CUSTODY_REQUIRED")
    expected = original_obligations.get("termFilter")
    actual = obligations.get("termFilter")
    if expected is not None or actual is not None:
        if not isinstance(expected, dict) or not isinstance(actual, dict):
            raise ActionRefused("NATIVE_TERM_FILTER_CUSTODY_REQUIRED")
        for packet in (expected, actual):
            if (
                not isinstance(packet, dict)
                or packet.get("version") != "umf.raw-term-filter/0.1"
                or packet.get("nativeCatalogBeforeAfter") is not True
                or not isinstance(packet.get("indexes"), list)
                or not 1 <= len(packet["indexes"]) <= 2000
            ):
                raise ActionRefused("NATIVE_TERM_FILTER_CUSTODY_REQUIRED")
        if version == "weft.search/0.1":
            same = canonical_json(actual) == canonical_json(expected)
        else:
            def semantics(packet: Any) -> Any:
                if any(not isinstance(entry, dict) for entry in packet["indexes"]):
                    raise ActionRefused("NATIVE_TERM_FILTER_CUSTODY_REQUIRED")
                return {**packet, "indexes": [{key: value for key, value in entry.items() if key != "nativeAdmission"} for entry in packet["indexes"]]}
            same = canonical_json(semantics(actual)) == canonical_json(semantics(expected))
            _literal_admission_sources(actual["indexes"], "NATIVE_TERM_FILTER_CUSTODY_REQUIRED")
        if not same:
            raise ActionRefused("NATIVE_TERM_FILTER_CUSTODY_REQUIRED")
    index = program.get("index")
    if version != "weft.search/0.1" or not isinstance(index, dict) or index.get("kind") != "keyword":
        return
    keyword_packet = obligations.get("keywordConfiguration")
    if (
        not isinstance(keyword_packet, dict)
        or keyword_packet.get("version") != "umf.keyword-configuration/0.1"
        or keyword_packet.get("nativeCatalogBeforeAfter") is not True
        or not isinstance(keyword_packet.get("configurations"), list)
        or len(keyword_packet["configurations"]) != 1
    ):
        raise ActionRefused("NATIVE_KEYWORD_CONFIGURATION_REQUIRED")
    entry = keyword_packet["configurations"][0]
    keyword = index.get("keyword", {})
    analyzer = keyword.get("analyzer", {}) if isinstance(keyword, dict) else {}
    language = analyzer.get("language") if isinstance(analyzer, dict) else None
    if (
        language not in ("english", "simple")
        or not isinstance(entry, dict)
        or canonical_json(entry.get("source")) != canonical_json(program.get("source"))
        or canonical_json(entry.get("index")) != canonical_json(index)
        or entry.get("configuration") != "pg_catalog." + language
    ):
        raise ActionRefused("NATIVE_KEYWORD_CONFIGURATION_REQUIRED")
    _literal_admission_sources(keyword_packet["configurations"], "NATIVE_KEYWORD_CONFIGURATION_REQUIRED")


@dataclass(frozen=True)
class NativeProgram:
    original_json: str
    statements_json: str
    bundle_input_digest: str
    runtime_abi: tuple[str, str, str] = RUNTIME_IDENTITY

    @classmethod
    def build(
        cls, compiler: Any, request: Mapping[str, Any], *, bundle_input_digest: str
    ) -> NativeProgram:
        """Explicit build-time compiler call; runtime never loads a compiler."""
        request = dict(program_json(canonical_json(dict(request))))
        version = request.get("version")
        if version == "weft.native-action/0.1" and request.get("target") in ("postgresql18", "lakebase18"):
            request["verificationProfile"] = "source-exact/0.1"
        elif (
            version == "weft.native-bulk/0.1"
            and isinstance(request.get("action"), dict)
            and isinstance(request.get("selection"), dict)
            and request["action"].get("target") in ("postgresql18", "lakebase18")
        ):
            request["action"]["verificationProfile"] = "source-exact/0.1"
            request["selection"]["verificationProfile"] = "source-exact/0.1"
        elif (
            version == "weft.search/0.1"
            and isinstance(request.get("selection"), dict)
            and request["selection"].get("target") in ("postgresql18", "lakebase18")
        ):
            request["selection"]["verificationProfile"] = "source-exact/0.1"
        if version == "weft.managed-action/0.1":
            method = getattr(compiler, "compile_managed_action_json", None)
        elif version == "weft.managed-bulk/0.1":
            method = getattr(compiler, "compile_managed_bulk_json", None)
        elif version == "weft.native-action/0.1":
            method = compiler.compile_native_action_json
        elif version == "weft.native-bulk/0.1":
            method = compiler.compile_native_bulk_json
        elif version == "weft.search/0.1":
            method = compiler.compile_search_json
        elif version == "weft.unity-search/0.1":
            method = compiler.compile_unity_search_json
        else:
            method = None
        if method is None:
            raise ActionRefused("WEFT_PROGRAM_INTERFACE")
        original = method(canonical_json(dict(request)))
        program = program_json(original)
        if program.get("status") != "compiled":
            raise ProgramBuildError(original)
        try:
            _bulk_list_custody(program, request)
            _search_parameter_custody(program, request)
        except ActionRefused as error:
            raise ValueError("WEFT_BLOCKED: " + error.code) from error
        statements: dict[str, Any] = {}

        def visit(value: Any, path: str) -> None:
            if isinstance(value, dict):
                if set(value) == {"sql", "parameters"}:
                    sql, order = (
                        (value["sql"], tuple(range(len(value["parameters"]))))
                        if program.get("profile")
                        in (
                            "umf.actions.native-delta/0.1",
                            "umf.actions.managed-delta/0.1",
                            "umf.actions.managed-delta-bulk/0.1",
                            "umf.actions.native-delta-bulk/0.1",
                            "unity-catalog-current/0.1",
                        )
                        else parameter_style(value["sql"], len(value["parameters"]))
                    )
                    statements[path] = {"sql": sql, "order": order}
                else:
                    for key, child in value.items():
                        visit(child, path + "/" + key)
            elif isinstance(value, list):
                for index, child in enumerate(value):
                    visit(child, path + "/" + str(index))

        visit(program, "")
        result = cls(original, canonical_json(statements), bundle_input_digest)
        result.checked()
        return result

    def bind(self, action: ActionRef[Any, Any]) -> None:
        program = self.checked()
        if (
            action.source is None
            or getattr(action.input_type, "UMF_BUNDLE_INPUT_DIGEST", None)
            != self.bundle_input_digest
        ):
            raise ActionRefused("CATALOG_STALE")
        source = program["source"]
        for name, attribute in [
            ("documentId", "document_id"),
            ("coreVersion", "core_version"),
            ("module", "module"),
            ("action", "action"),
            ("documentSha256", "document_sha256"),
            ("actionPointer", "action_pointer"),
        ]:
            if source[name] != getattr(action.source, attribute):
                raise ActionRefused("NATIVE_ACTION_SOURCE_MISMATCH")
        if source["invocation"] != {
            "id": action.source.invocation_id,
            "version": action.source.invocation_version,
        }:
            raise ActionRefused("NATIVE_INVOCATION_PROFILE")

    def checked(self) -> dict[str, Any]:
        if (
            len(self.original_json.encode()) > 4_194_304
            or len(self.statements_json.encode()) > 8_388_608
        ):
            raise ActionRefused("NATIVE_PROGRAM_BUDGET")
        if (
            self.runtime_abi != RUNTIME_IDENTITY
            or len(self.bundle_input_digest) != 64
            or any(c not in "0123456789abcdef" for c in self.bundle_input_digest)
        ):
            raise ActionRefused("NATIVE_PROGRAM_ABI")
        program = program_json(self.original_json)
        if program.get("version") == "weft.unity-search/0.1" and (
            program.get("profile") != "unity-catalog-current/0.1"
            or program.get("request", {}).get("managed", {}).get("indexType") != "DIRECT_ACCESS"
        ):
            raise ActionRefused("NATIVE_PROGRAM_PROFILE")
        if program.get("version") == "weft.native-action/0.1":
            if program.get("profile") == "umf.actions.managed-delta/0.1":
                if program.get("target") != "databricks-managed-delta" or not isinstance(program.get("catalog"),str) or not program["catalog"]:
                    raise ActionRefused("NATIVE_PROGRAM_PROFILE")
            elif program.get("profile") == "umf.actions.native-delta/0.1":
                if program.get("target") != "spark-delta4":
                    raise ActionRefused("NATIVE_PROGRAM_PROFILE")
            elif program.get("profile") != "umf.actions.native-sql/0.1" or program.get(
                "target"
            ) not in ("postgresql18", "lakebase18"):
                raise ActionRefused("NATIVE_PROGRAM_PROFILE")
        if program.get("profile") == "umf.actions.native-delta-bulk/0.1" and (
            program.get("version") != "weft.native-bulk/0.1"
            or program.get("target") != "spark-delta4"
        ):
            raise ActionRefused("NATIVE_PROGRAM_PROFILE")
        if program.get("profile") == "umf.actions.managed-delta-bulk/0.1" and (
            program.get("version") != "weft.native-bulk/0.1"
            or program.get("target") != "databricks-managed-delta"
            or not isinstance(program.get("catalog"), str)
            or not program["catalog"]
        ):
            raise ActionRefused("NATIVE_PROGRAM_PROFILE")
        pin = program.pop("structuralDigest", {})
        if (
            pin.get("owner")
            != {
                "weft.native-action/0.1": (
                    "weft-databricks-native-action"
                    if (program.get("profile"),program.get("target")) in (("umf.actions.native-delta/0.1","spark-delta4"),("umf.actions.managed-delta/0.1","databricks-managed-delta"))
                    else "weft-postgresql-native-action"
                ),
                "weft.native-bulk/0.1": (
                    "weft-databricks-native-bulk"
                    if (program.get("profile"), program.get("target")) in (
                        ("umf.actions.native-delta-bulk/0.1", "spark-delta4"),
                        ("umf.actions.managed-delta-bulk/0.1", "databricks-managed-delta"),
                    )
                    else "weft-postgresql-native-bulk"
                ),
                "weft.search/0.1": "weft-postgresql-search",
                "weft.unity-search/0.1": "weft-databricks-search",
            }.get(program.get("version"))
            or pin.get("version") != "0.1"
            or hashlib.sha256(canonical_json(program).encode()).hexdigest()
            != pin.get("sha256")
        ):
            raise ActionRefused("NATIVE_PROGRAM_INTEGRITY")
        program["structuralDigest"] = pin
        if program.get("status") != "compiled" or program.get("version") not in (
            "weft.native-action/0.1",
            "weft.native-bulk/0.1",
            "weft.search/0.1",
            "weft.unity-search/0.1",
        ):
            raise ActionRefused("NATIVE_PROGRAM_PROFILE")
        _bulk_list_custody(program)
        _search_parameter_custody(program)
        if program.get("version") in ("weft.native-action/0.1", "weft.native-bulk/0.1", "weft.search/0.1"):
            try:
                _require_source_exact(program)
            except ReadBuildError as error:
                raise ActionRefused("NATIVE_SCHEMA_SOURCE_EXACT_REQUIRED") from error
        _configuration_custody(program)
        # Re-derive only parameter style, never SQL structure or semantics.
        expected: dict[str, Any] = {}

        def visit(value: Any, path: str) -> None:
            if isinstance(value, dict):
                if set(value) == {"sql", "parameters"}:
                    sql, order = (
                        (value["sql"], tuple(range(len(value["parameters"]))))
                        if program.get("profile")
                        in (
                            "umf.actions.native-delta/0.1",
                            "umf.actions.managed-delta/0.1",
                            "umf.actions.managed-delta-bulk/0.1",
                            "umf.actions.native-delta-bulk/0.1",
                            "unity-catalog-current/0.1",
                        )
                        else parameter_style(value["sql"], len(value["parameters"]))
                    )
                    expected[path] = {"sql": sql, "order": list(order)}
                else:
                    for key, child in value.items():
                        visit(child, path + "/" + key)
            elif isinstance(value, list):
                for index, child in enumerate(value):
                    visit(child, path + "/" + str(index))

        visit(program, "")
        if program_json(self.statements_json) != expected:
            raise ActionRefused("NATIVE_PARAMETER_STYLE_INTEGRITY")
        return program
