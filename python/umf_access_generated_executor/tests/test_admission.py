from __future__ import annotations

import ast
import hashlib
import operator
import tempfile
import tomllib
import unittest
from collections.abc import Mapping, MutableMapping
from pathlib import Path
from typing import cast

from umf_access_generated_executor import (
    ExecutionScope,
    GeneratedCall,
    GeneratedExecutionError,
    GeneratedFiles,
    GeneratedManifest,
    TargetBinding,
    TrustedArtifactRef,
    prepare_generated,
)
from umf_access_generated_executor._canonical import (
    ExactJsonNumber,
    canonical_json,
    parse_json,
)
from umf_access_generated_executor._manifest import validate_manifest_shape

PURE_RUNTIME_BOUNDARY_OWNERS = {
    "_ordinary_page.py": "GeneratedExecutor.prepare_ordinary_page",
}


def valid_artifact(
    native=True, readiness="export-only", duplicate_dbapi_parameter=False
):
    content = b'{"declaredQuery":"export-only"}'
    file_mapping = {"programs/query.json": content}
    if native:
        parameter_order = (
            ["owner"] if readiness == "weft.fixed-query-executable/1" else []
        )
        parameter_sources = (
            [{"id": "owner", "source": {"kind": "input", "parameter": "owner"}}]
            if parameter_order
            else []
        )
        dbapi_order = parameter_order * (2 if duplicate_dbapi_parameter else 1)
        codec = {
            "profile": "weft.query-codec-instructions/1",
            "steps": [
                {"op": "require-exact-wrapper", "wrapper": "string", "nullable": False},
                {
                    "op": "parse-carrier",
                    "carrier": "string",
                    "profile": "weft.string/1",
                    "scale": None,
                    "precision": None,
                    "maxTokenBytes": None,
                },
                {
                    "op": "check-refinements",
                    "carrier": "string",
                    "length": None,
                    "integerWidth": None,
                    "range": None,
                    "allowedIdentities": None,
                },
                {
                    "op": "normalize-native-query-value",
                    "carrier": "string",
                    "mode": "identity",
                },
            ],
        }
        embedded_program = {
            "status": "compiled",
            "version": "weft.table-operation/0.1",
            "module": "board",
            "operation": "board.tasks",
            "binding": {"modelSha256": "2" * 64},
            "modelSha256": "2" * 64,
            "transport": {"profile": "test"},
            "dbapiSql": "SELECT 1",
            "nativeDescriptionSql": "SELECT 1",
            "dbapiParameterOrder": dbapi_order,
            "parameterSources": parameter_sources,
            "outputs": [
                {
                    "name": "owner",
                    "field": {"module": "board", "element": "owner"},
                    "carrier": "string",
                    "nullable": False,
                }
            ],
            "result": {
                "kind": "many",
                "maxRows": 10,
                "nativeReadGuard": {
                    "profile": "pg18-read-frame/0.1",
                    "maxNativeBytes": 8388608,
                    "sqlstate": "22012",
                    "includesLookahead": True,
                    "partialFrames": False,
                },
            },
            "obligations": {},
        }
        exported = {
            "version": "weft.generated-query-program/1",
            "readiness": readiness,
            "programDigest": hashlib.sha256(
                canonical_json(embedded_program)
            ).hexdigest(),
            "source": {
                "modelSha256": "2" * 64,
                "module": "board",
                "operation": "board.tasks",
            },
            "target": {"id": "postgresql18", "modelSha256": "2" * 64},
            "parameterOrder": parameter_order,
            "parameters": (
                [
                    {
                        "id": "owner",
                        "slot": 1,
                        "field": {"module": "board", "element": "owner"},
                        "declaration": {},
                        "carrier": "string",
                        "nullable": False,
                        "codec": codec,
                    }
                ]
                if parameter_order
                else []
            ),
            "parameterSources": parameter_sources,
            "outputs": embedded_program["outputs"],
            "obligations": {},
            "template": {},
            "program": embedded_program,
        }
        file_mapping["programs/query.json"] = canonical_json(exported)
        configuration = {
            "schema": "board",
            "module": "board",
            "ownerRole": "owner",
            "personRole": "person",
            "batchRole": "batch",
            "groupRoles": {"editor": "board_editor"},
        }
        native_source = {
            "version": "umf.native-table-source/1",
            "bundleDigest": "9" * 64,
            "sourceDigest": "2" * 64,
            "configurationDigest": hashlib.sha256(
                canonical_json(configuration)
            ).hexdigest(),
            "configuration": configuration,
            "expectedCatalog": {
                "tables": [{"id": "tasks", "name": "tasks"}],
                "checks": [{"id": "tasks.owner"}],
            },
            "operations": [{"id": "board.tasks", "kind": "query"}],
        }
        file_mapping["native/native-table-source.json"] = canonical_json(native_source)
    files = GeneratedFiles.from_mapping(file_mapping)
    target = TargetBinding("postgresql18", "pg18/1", "18", "1" * 64)
    value = {
        "version": "weft.generated-execution/1",
        "artifactId": "task-board-1",
        "artifactDigest": "0" * 64,
        "source": {
            "documentId": "task-board",
            "coreVersion": "0.10.0",
            "sha256": "2" * 64,
            "moduleIds": ["board"],
            "bundleInputDigest": "3" * 64,
        },
        "generator": {
            "umfDistribution": "umf-core",
            "umfVersion": "0.10.0",
            "umfSourceDigest": "4" * 64,
            "weftDistribution": "weft-sql",
            "weftVersion": "0.4.54",
            "weftSourceDigest": "5" * 64,
            "abi": "weft.generated-execution/1",
        },
        "executor": {
            "abiMajor": 1,
            "minMinor": 0,
            "maxMinor": 0,
            "packageId": "umf-access-generated-executor",
        },
        "target": {
            "id": target.id,
            "profile": target.profile,
            "version": target.version,
            "bindingDigest": target.binding_digest,
        },
        "algebra": {},
        "programs": {
            "board.tasks": {"kind": "query", "programPath": "programs/query.json"}
        },
        "inventory": dict(files.inventory),
        "provenance": {
            "receiptDigest": "6" * 64,
            "issuer": "build-ci",
            "buildId": "build-7",
        },
    }
    payload = dict(value)
    del payload["artifactDigest"]
    del payload["provenance"]
    payload_digest = hashlib.sha256(canonical_json(payload)).hexdigest()
    final_preimage = dict(value)
    del final_preimage["artifactDigest"]
    value["artifactDigest"] = hashlib.sha256(canonical_json(final_preimage)).hexdigest()
    manifest = GeneratedManifest.from_json(canonical_json(value))
    trusted = TrustedArtifactRef(
        value["artifactId"],
        value["artifactDigest"],
        value["provenance"]["receiptDigest"],
        payload_digest,
        value["source"]["sha256"],
        target.binding_digest,
        files.inventory,
        value["provenance"]["issuer"],
        value["provenance"]["buildId"],
    )
    return manifest, files, trusted, target


class AdmissionTests(unittest.TestCase):
    def test_minor_two_is_a_distinct_exact_read_algebra_profile(self) -> None:
        manifest, _files, _trusted, _target = valid_artifact()
        value = manifest.copied_value()
        value["algebra"] = {
            "profile": "weft.generated-read-algebra/2",
            "algebraPath": "algebra/read.json",
        }
        value["programs"] = {}
        value["executor"] = {
            **value["executor"],
            "minMinor": 2,
            "maxMinor": 2,
        }
        value["inventory"]["algebra/read.json"] = "7" * 64
        self.assertEqual(
            validate_manifest_shape(value)["executor"]["minMinor"], 2
        )

        value["executor"] = {
            **value["executor"],
            "minMinor": 1,
            "maxMinor": 2,
        }
        with self.assertRaises(ValueError):
            validate_manifest_shape(value)

    def test_manifest_parser_rejects_duplicate_noncanonical_and_nonfinite_json(self):
        cases = (
            b'{"a":1,"a":2}',
            b'{ "a":1}',
            b'{"a":NaN}',
            b'{"a":Infinity}',
            b'{"a":"\\ud800"}',
            b"\xef\xbb\xbf{}",
        )
        for source in cases:
            with self.subTest(source=source), self.assertRaises(ValueError):
                GeneratedManifest.from_json(source)

    def test_canonicalization_preserves_exact_fractional_json_tokens(self):
        value = cast(dict[str, object], parse_json('{"n":1.000e+03,"s":"𝄞"}'))
        self.assertEqual(
            canonical_json(value), b'{"n":1.000e+03,"s":"\xf0\x9d\x84\x9e"}'
        )
        self.assertIsInstance(value["n"], ExactJsonNumber)

    def test_valid_external_receipt_target_and_inventory_admit(self):
        manifest, files, trusted, target = valid_artifact()
        executor = prepare_generated(manifest, files, trusted, target)
        self.assertIsNone(executor.read_profile)
        self.assertIs(executor.trusted_artifact, trusted)
        scope = ExecutionScope("app-1", "principal-handle", "req-1", 100.0, "lease-1")
        with self.assertRaises(GeneratedExecutionError) as raised:
            executor.bind(GeneratedCall("board.tasks", {}), scope)
        self.assertEqual(raised.exception.code, "UNSUPPORTED")
        self.assertEqual(str(raised.exception), "UNSUPPORTED")

    def test_tampered_file_or_external_receipt_refuses_before_bind(self):
        manifest, _files, trusted, target = valid_artifact()
        tampered = GeneratedFiles.from_mapping({"programs/query.json": b"changed"})
        for replacement in (
            (tampered, trusted),
            (
                _files,
                TrustedArtifactRef(
                    trusted.artifact_id,
                    trusted.artifact_digest,
                    trusted.receipt_digest,
                    "7" * 64,
                    trusted.source_digest,
                    trusted.target_binding_digest,
                    trusted.inventory,
                    trusted.issuer,
                    trusted.build_id,
                ),
            ),
        ):
            with (
                self.subTest(replacement=replacement[0]),
                self.assertRaises(GeneratedExecutionError) as raised,
            ):
                prepare_generated(manifest, replacement[0], replacement[1], target)
            self.assertEqual(raised.exception.code, "ARTIFACT_REFUSED")

    def test_target_source_and_abi_changes_refuse(self):
        manifest, files, trusted, target = valid_artifact()
        wrong_target = TargetBinding("postgresql17", "pg17/1", "17", "8" * 64)
        with self.assertRaises(GeneratedExecutionError) as raised:
            prepare_generated(manifest, files, trusted, wrong_target)
        self.assertEqual(raised.exception.code, "ARTIFACT_REFUSED")

        value = manifest.copied_value()
        executor_value = dict(cast(Mapping[str, object], value["executor"]))
        executor_value["maxMinor"] = 1
        value["executor"] = executor_value
        forged = GeneratedManifest.from_json(canonical_json(value))
        with self.assertRaises(GeneratedExecutionError):
            prepare_generated(forged, files, trusted, target)

    def test_inventory_paths_reject_traversal_and_non_normalized_forms(self):
        for path in (
            "../escape",
            "/absolute",
            "a//b",
            "a/./b",
            "a/../b",
            "C:/escape",
            "a\\b",
        ):
            with self.subTest(path=path), self.assertRaises(ValueError):
                GeneratedFiles.from_mapping({path: b"x"})

    def test_directory_snapshot_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            (directory / "target").write_bytes(b"x")
            (directory / "link").symlink_to(directory / "target")
            with self.assertRaises(ValueError):
                GeneratedFiles.from_directory(directory)

    def test_nested_manifest_and_call_values_are_immutable_copies(self):
        manifest, _files, _trusted, _target = valid_artifact()
        copied = manifest.value
        with self.assertRaises(TypeError):
            operator.setitem(
                cast(MutableMapping[str, object], copied), "artifactId", "changed"
            )
        nested = cast(Mapping[str, object], copied["programs"])
        with self.assertRaises(TypeError):
            operator.setitem(cast(MutableMapping[str, object], nested), "new", {})
        source = {"parameter": {"string": "initial"}}
        call = GeneratedCall("board.tasks", source)
        source["parameter"]["string"] = "changed"
        parameter = cast(Mapping[str, object], call.inputs["parameter"])
        self.assertEqual(parameter["string"], "initial")
        with self.assertRaises(TypeError):
            operator.setitem(
                cast(MutableMapping[str, object], parameter), "string", "changed-again"
            )

    def test_package_runtime_imports_are_stdlib_and_have_no_dynamic_execution(self):
        package = Path(__file__).parents[1] / "src/umf_access_generated_executor"
        for module_name, owner in PURE_RUNTIME_BOUNDARY_OWNERS.items():
            self.assertTrue((package / module_name).is_file())
            self.assertEqual(owner, "GeneratedExecutor.prepare_ordinary_page")
        forbidden = {"umf", "umf_access", "umf_codegen", "weft", "batten", "psycopg"}
        for source in package.glob("*.py"):
            tree = ast.parse(source.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    roots = {alias.name.split(".", 1)[0] for alias in node.names}
                    self.assertFalse(roots & forbidden, source.name)
                if isinstance(node, ast.ImportFrom):
                    root = (node.module or "").split(".", 1)[0]
                    self.assertNotIn(root, forbidden, source.name)
                if isinstance(node, ast.Call):
                    self.assertFalse(
                        isinstance(node.func, ast.Name)
                        and node.func.id in {"eval", "exec", "__import__"},
                        source.name,
                    )
                    self.assertFalse(
                        isinstance(node.func, ast.Attribute)
                        and node.func.attr == "import_module",
                        source.name,
                    )
        metadata = tomllib.loads(
            (Path(__file__).parents[1] / "pyproject.toml").read_text()
        )
        self.assertEqual(metadata["project"]["dependencies"], [])

    def test_native_table_projection_is_issued_from_verified_inventory_and_immutable(
        self,
    ):
        manifest, files, trusted, target = valid_artifact(native=True)
        executor = prepare_generated(manifest, files, trusted, target)
        projection = executor.native_table
        self.assertEqual(projection.source_digest, "2" * 64)
        self.assertEqual(projection.bundle_digest, "9" * 64)
        manifest_source = cast(Mapping[str, object], manifest.value["source"])
        self.assertNotEqual(
            projection.bundle_digest, manifest_source["bundleInputDigest"]
        )
        self.assertEqual(projection.operations, (("board.tasks", "query"),))
        with self.assertRaises(TypeError):
            cast(MutableMapping[str, object], projection.native_source)[
                "bundleDigest"
            ] = "0" * 64
        configuration = cast(
            MutableMapping[str, object], projection.native_source["configuration"]
        )
        with self.assertRaises(TypeError):
            configuration["schema"] = "changed"
        lifecycle_copy = projection.lifecycle_source_snapshot()
        self.assertEqual(lifecycle_copy["bundleDigest"], projection.bundle_digest)
        lifecycle_copy["bundleDigest"] = "0" * 64
        self.assertEqual(projection.bundle_digest, "9" * 64)

    def test_native_projection_must_be_canonical_and_match_source_digest(self):
        manifest, files, trusted, target = valid_artifact(native=True)
        content = files.mapping["native/native-table-source.json"]
        tampered_files = GeneratedFiles.from_mapping(
            {
                "programs/query.json": files.mapping["programs/query.json"],
                "native/native-table-source.json": content.replace(
                    b'"bundleDigest":', b'"bundleDigest" :'
                ),
            }
        )
        # The manifest and trusted receipt pin canonical bytes, so formatting tampering refuses.
        with self.assertRaises(GeneratedExecutionError) as raised:
            prepare_generated(manifest, tampered_files, trusted, target)
        self.assertEqual(raised.exception.code, "ARTIFACT_REFUSED")

    def test_issued_fixed_query_binds_exact_tagged_string_inputs(self):
        manifest, files, trusted, target = valid_artifact(
            native=True, readiness="weft.fixed-query-executable/1"
        )
        executor = prepare_generated(manifest, files, trusted, target)
        scope = ExecutionScope("app-1", "principal-handle", "req-1", 100.0, "lease-1")
        bound = executor.bind(
            GeneratedCall("board.tasks", {"owner": {"string": "alice"}}), scope
        )
        self.assertEqual(bound.operation_kind, "read")
        self.assertEqual(bound.parameters, ("alice",))
        program = cast(dict[str, object], parse_json(bound.program_json))
        self.assertEqual(program["nativeInputs"], [{"owner": "alice"}])
        with self.assertRaises(GeneratedExecutionError) as raised:
            executor.bind(
                GeneratedCall("board.tasks", {"owner": {"integerToken": "1"}}), scope
            )
        self.assertEqual(raised.exception.code, "INVALID")
        with self.assertRaises(GeneratedExecutionError) as raised:
            executor.bind(
                GeneratedCall("board.tasks", {"owner": {"string": "alice"}}, first=1),
                scope,
            )
        self.assertEqual(raised.exception.code, "UNSUPPORTED")

    def test_fixed_query_preserves_repeated_dbapi_parameter_order(self):
        manifest, files, trusted, target = valid_artifact(
            native=True,
            readiness="weft.fixed-query-executable/1",
            duplicate_dbapi_parameter=True,
        )
        executor = prepare_generated(manifest, files, trusted, target)
        scope = ExecutionScope("app-1", "principal-handle", "req-1", 100.0, "lease-1")
        bound = executor.bind(
            GeneratedCall("board.tasks", {"owner": {"string": "alice"}}), scope
        )
        self.assertEqual(bound.parameters, ("alice", "alice"))

    def test_missing_native_projection_is_fixed_unsupported(self):
        manifest, files, trusted, target = valid_artifact(native=False)
        executor = prepare_generated(manifest, files, trusted, target)
        with self.assertRaises(GeneratedExecutionError) as raised:
            _ = executor.native_table
        self.assertEqual(raised.exception.code, "UNSUPPORTED")

    def test_error_text_is_fixed_and_does_not_include_artifact_data(self):
        error = GeneratedExecutionError("ARTIFACT_REFUSED", "target.bindingDigest")
        self.assertEqual(str(error), "ARTIFACT_REFUSED")
        self.assertNotIn("target.bindingDigest", str(error))


if __name__ == "__main__":
    unittest.main()
