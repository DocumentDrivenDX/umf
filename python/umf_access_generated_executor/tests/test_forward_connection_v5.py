"""Pure binding for Rust-issued bounded forward connections."""

from __future__ import annotations

import copy
import hashlib
import json
import time
import unittest
from pathlib import Path
from typing import cast

from umf_access_generated_executor import (
    ExecutionScope,
    GeneratedExecutionError,
    GeneratedFiles,
    GeneratedForwardConnectionCall,
    GeneratedGetManyCall,
    GeneratedManifest,
    GeneratedReadAnd,
    GeneratedReadAtom,
    GeneratedReadCallV2,
    GeneratedReadNot,
    GeneratedReadOr,
    TargetBinding,
    TrustedArtifactRef,
    canonical_json,
    prepare_generated,
)

FIXTURE = Path(__file__).parent / "fixtures" / "read_algebra_v5_rust"
BASE = Path(__file__).parent / "fixtures" / "generated_read_algebra_v4_runtime"


def _v5_artifact(algebra_name: str = "issued-v5.json", algebra_override=None):
    algebra = (
        json.loads((FIXTURE / algebra_name).read_bytes())
        if algebra_override is None
        else copy.deepcopy(algebra_override)
    )
    manifest_value = json.loads((BASE / "manifest.json").read_bytes())
    source_digest = algebra["source"]["modelSha256"]
    target_digest = algebra["target"]["bindingDigest"]
    # This synthetic native projection closes the final Rust artifact against the
    # same two text columns while using consistent lifecycle pins for admission.
    native = json.loads((BASE / "files/native/native-table-source.json").read_bytes())
    root = algebra["roots"]["demo/Note"]
    obligations = root["obligations"]
    lifecycle = obligations["tableLifecycle"]
    configuration = native["configuration"]
    configuration["schema"] = obligations["schema"]
    native["configurationDigest"] = hashlib.sha256(
        canonical_json(configuration)
    ).hexdigest()
    native["bundleDigest"] = lifecycle["deploymentDigest"]
    native["sourceDigest"] = source_digest
    lifecycle["configurationDigest"] = native["configurationDigest"]
    native_tables = []
    known_types = {
        item["fieldId"]: item["output"]["nativeType"]
        for item in root["forwardConnection"]["fieldOutputs"]
    }
    for root_id, item in algebra["roots"].items():
        module, record = root_id.split("/", 1)
        lifecycle_item = item["obligations"]["tableLifecycle"]
        lifecycle_item["configurationDigest"] = native["configurationDigest"]
        lifecycle_table = lifecycle_item["tables"][0]
        if lifecycle_table["record"] != {"module": module, "element": record}:
            physical = record.lower() + "s"
            lifecycle_table["id"] = physical
            lifecycle_table["native"] = physical
            lifecycle_table["record"] = {"module": module, "element": record}
        lifecycle_item["tables"] = [lifecycle_table]
        columns = []
        for field_id, field in item["fields"].items():
            columns.append(
                {
                    "field": field["sourceField"],
                    "name": field["sourceField"]["element"],
                    "nativeType": known_types[field_id],
                }
            )
        native_tables.append(
            {
                "id": lifecycle_table["id"],
                "name": lifecycle_table["native"],
                "record": {"module": module, "element": record},
                "columns": columns,
            }
        )
    native["expectedCatalog"]["tables"] = native_tables
    native_bytes = canonical_json(native)
    algebra_bytes = canonical_json(algebra)
    files = GeneratedFiles.from_mapping(
        {
            "algebra/read.json": algebra_bytes,
            "native/native-table-source.json": native_bytes,
        }
    )
    manifest_value["source"]["sha256"] = source_digest
    manifest_value["target"]["bindingDigest"] = target_digest
    manifest_value["algebra"] = {
        "profile": "weft.generated-read-algebra/5",
        "algebraPath": "algebra/read.json",
    }
    manifest_value["executor"]["minMinor"] = 5
    manifest_value["executor"]["maxMinor"] = 5
    manifest_value["inventory"] = dict(files.inventory)
    manifest_value["programs"] = {}
    manifest_value["artifactDigest"] = "0" * 64
    preimage = dict(manifest_value)
    del preimage["artifactDigest"]
    manifest_value["artifactDigest"] = hashlib.sha256(
        canonical_json(preimage)
    ).hexdigest()
    payload = dict(manifest_value)
    del payload["artifactDigest"]
    del payload["provenance"]
    payload_digest = hashlib.sha256(canonical_json(payload)).hexdigest()
    manifest = GeneratedManifest.from_json(canonical_json(manifest_value))
    provenance = cast(dict[str, object], manifest_value["provenance"])
    target_value = cast(dict[str, object], manifest_value["target"])
    trusted = TrustedArtifactRef(
        cast(str, manifest_value["artifactId"]),
        cast(str, manifest_value["artifactDigest"]),
        cast(str, provenance["receiptDigest"]),
        payload_digest,
        source_digest,
        target_digest,
        files.inventory,
        cast(str, provenance["issuer"]),
        cast(str, provenance["buildId"]),
    )
    target = TargetBinding(
        cast(str, target_value["id"]),
        cast(str, target_value["profile"]),
        cast(str, target_value["version"]),
        target_digest,
    )
    return manifest, files, trusted, target


class ForwardConnectionV5Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        manifest, files, trusted, target = _v5_artifact()
        cls.executor = prepare_generated(manifest, files, trusted, target)
        cls.algebra = json.loads(files.mapping["algebra/read.json"])
        cls.root = cls.algebra["roots"]["demo/Note"]
        cls.owner_eq = next(
            identity
            for identity, predicate in cls.root["predicates"].items()
            if predicate["fieldId"] == "demo/owner" and predicate["operator"] == "eq"
        )
        cls.scope = ExecutionScope(
            "app", "principal", "pure-connection-test", time.monotonic() + 30, "lease"
        )

    def test_first_zero_filter_tree_and_parameter_order(self):
        where = GeneratedReadAnd(
            (
                GeneratedReadAtom(self.owner_eq, ({"string": "alice"},)),
                GeneratedReadNot(
                    GeneratedReadOr(
                        (
                            GeneratedReadAtom(
                                next(
                                    pid
                                    for pid, p in self.root["predicates"].items()
                                    if p["fieldId"] == "demo/id"
                                    and p["operator"] == "is-null"
                                ),
                                (),
                            ),
                            GeneratedReadAtom(self.owner_eq, ({"string": "bob"},)),
                        )
                    )
                ),
            )
        )
        bound = self.executor.bind_forward_connection(
            GeneratedForwardConnectionCall(
                "demo", "Note", ("demo/id", "demo/owner"), where, 0, None
            )
        )
        self.assertEqual(bound.fetch_limit, 1)
        self.assertEqual(bound.parameters, ("alice", "bob", None, None, 1))
        self.assertEqual(bound.previous_parameters, ("alice", "bob", None, None))
        self.assertIn("LIMIT %s::pg_catalog.int8", bound.sql)
        self.assertIn("<= %s::pg_catalog.text", bound.previous_sql)
        self.assertNotIn("{{", bound.sql + bound.previous_sql)

    def test_continuation_key_codec_and_first_plus_lookahead(self):
        bound = self.executor.bind_forward_connection(
            GeneratedForwardConnectionCall(
                "demo",
                "Note",
                ("demo/id",),
                GeneratedReadAtom(self.owner_eq, ({"string": "alice"},)),
                2,
                "a",
            )
        )
        self.assertEqual(bound.fetch_limit, 3)
        self.assertEqual(bound.parameters, ("alice", "a", "a", 3))
        self.assertEqual(bound.previous_parameters, ("alice", "a", "a"))
        self.assertEqual(bound.fields, ({"module": "demo", "element": "id"},))

    def test_percent_identifier_slot_binding_preserves_dbapi_escaping(self):
        manifest, files, trusted, target = _v5_artifact("issued-v5-percent-table.json")
        executor = prepare_generated(manifest, files, trusted, target)
        bound = executor.bind_forward_connection(
            GeneratedForwardConnectionCall("demo", "Note", None, None, 0, None)
        )
        self.assertIn('FROM "plugin_demo"."n%%s"', bound.sql)
        self.assertIn('FROM "plugin_demo"."n%%s"', bound.previous_sql)
        self.assertEqual(bound.parameters, (None, None, 1))

    def test_dollar_placeholder_like_native_name_is_not_rewritten(self):
        manifest, files, trusted, target = _v5_artifact(
            "issued-v5-dollar-identifier.json"
        )
        executor = prepare_generated(manifest, files, trusted, target)
        bound = executor.bind_forward_connection(
            GeneratedForwardConnectionCall("demo", "Note", None, None, 0, None)
        )
        self.assertIn('FROM "plugin_demo"."n$1"', bound.sql)
        self.assertIn('FROM "plugin_demo"."n$1"', bound.previous_sql)
        self.assertIn("%s::pg_catalog.text IS NULL", bound.sql)
        self.assertIn("%s::pg_catalog.text IS NOT NULL", bound.previous_sql)

    def test_first_bounds_and_exact_integer_refuse_booleans(self):
        for first in (-1, 101, True, 1.0):
            with self.subTest(first=first), self.assertRaises(ValueError):
                GeneratedForwardConnectionCall("demo", "Note", None, None, first, None)
        for first in (0, 100):
            self.assertEqual(
                GeneratedForwardConnectionCall(
                    "demo", "Note", None, None, first, None
                ).first,
                first,
            )
        maximum = self.executor.bind_forward_connection(
            GeneratedForwardConnectionCall("demo", "Note", None, None, 100, None)
        )
        self.assertEqual(maximum.fetch_limit, 101)

    def test_decoded_after_byte_boundary_and_escaped_unicode_program_budget(self):
        after = "\u0001" * (128 * 1024)
        call = GeneratedForwardConnectionCall(
            "demo", "Note", None, None, 1, after
        )
        bound = self.executor.bind_forward_connection(call)
        self.assertEqual(bound.parameters, (after, after, 2))
        self.assertEqual(bound.previous_parameters, (after, after))
        self.assertLessEqual(len(bound.program_json), 8 * 1024 * 1024)
        with self.assertRaisesRegex(ValueError, "byte bound"):
            GeneratedForwardConnectionCall(
                "demo", "Note", None, None, 1, after + "x"
            )

    def test_whole_call_budget_refuses_before_building_program(self):
        large_filter = GeneratedReadAtom(self.owner_eq, ({"string": "x" * 200_000},))
        call = GeneratedForwardConnectionCall(
            "demo", "Note", None, large_filter, 1, None
        )
        with self.assertRaises(GeneratedExecutionError) as raised:
            self.executor.bind_forward_connection(call)
        self.assertEqual(raised.exception.code, "LIMIT_EXCEEDED")

    def test_filter_preflight_has_fixed_depth_and_node_limits(self):
        deep = GeneratedReadAtom(self.owner_eq, ({"string": "alice"},))
        for _ in range(1_100):
            deep = GeneratedReadNot(deep)
        deep_call = GeneratedForwardConnectionCall(
            "demo", "Note", None, deep, 1, None
        )
        with self.assertRaises(GeneratedExecutionError) as raised:
            self.executor.bind_forward_connection(deep_call)
        self.assertEqual(raised.exception.code, "LIMIT_EXCEEDED")

        branch = GeneratedReadAtom(self.owner_eq, ({"string": "alice"},))
        wide = GeneratedReadAnd((branch,) * 16)
        many_nodes = GeneratedReadAnd((wide,) * 4)
        many_nodes_call = GeneratedForwardConnectionCall(
            "demo", "Note", None, many_nodes, 1, None
        )
        with self.assertRaises(GeneratedExecutionError) as raised:
            self.executor.bind_forward_connection(many_nodes_call)
        self.assertEqual(raised.exception.code, "LIMIT_EXCEEDED")

    def test_malformed_unicode_maps_to_fixed_invalid(self):
        call = GeneratedForwardConnectionCall(
            "demo\ud800", "Note", None, None, 1, None
        )
        with self.assertRaises(GeneratedExecutionError) as raised:
            self.executor.bind_forward_connection(call)
        self.assertEqual(raised.exception.code, "INVALID")

    def test_ineligible_mixed_root_refuses_connection_but_keeps_get_many(self):
        algebra = copy.deepcopy(self.algebra)
        note = algebra["roots"]["demo/Note"]
        metric = copy.deepcopy(note)
        metric["module"] = "demo"
        metric["record"] = "Metric"
        metric["fromSql"] = 'FROM "plugin_demo"."metrics" AS "r"'
        metric["getMany"]["sourceSqlTemplate"] = metric["getMany"][
            "sourceSqlTemplate"
        ].replace('"notes"', '"metrics"')
        metric["getMany"]["sourceTemplateSha256"] = hashlib.sha256(
            metric["getMany"]["sourceSqlTemplate"].encode()
        ).hexdigest()
        metric["forwardConnectionSupport"] = {
            "profile": "weft.generated-forward-connection/1",
            "status": "unsupported",
            "reason": "ROOT_OUTSIDE_PROFILE",
        }
        metric.pop("forwardConnection")
        algebra["roots"]["demo/Metric"] = metric
        mixed_manifest, mixed_files, mixed_trusted, mixed_target = _v5_artifact(
            algebra_override=algebra
        )
        mixed = prepare_generated(
            mixed_manifest, mixed_files, mixed_trusted, mixed_target
        )
        self.assertEqual(mixed.read_profile, "weft.generated-read-algebra/5")
        self.assertEqual(metric["getMany"]["profile"], "weft.generated-key-batch/1")
        with self.assertRaises(GeneratedExecutionError):
            mixed.bind_forward_connection(
                GeneratedForwardConnectionCall("demo", "Metric", None, None, 1, None)
            )
        ordinary = mixed.bind_read_v3(
            GeneratedReadCallV2("demo", "Metric", None, None, (), 1, "all", None),
            self.scope,
        )
        self.assertIn('FROM "plugin_demo"."metrics"', ordinary.sql)
        request_scope = ExecutionScope(
            "app",
            "principal",
            "mixed-get-many",
            time.monotonic() + 30,
            "lease",
            consistency="request-snapshot/1",
        )
        batch = mixed.bind_get_many(
            GeneratedGetManyCall(
                "demo", "Metric", "primary", (({"string": "m1"},),), ("demo/id",)
            ),
            request_scope,
        )
        self.assertIn('"metrics"', batch.sql)
        self.assertEqual(
            mixed.validate_get_many_key(
                "demo", "Metric", "primary", ({"string": "m1"},)
            ),
            ("m1",),
        )

    def test_rehashed_template_tampering_is_rejected_at_admission(self):
        _manifest, _files, _trusted, _target = _v5_artifact()
        algebra = json.loads(_files.mapping["algebra/read.json"])
        forward = algebra["roots"]["demo/Note"]["forwardConnection"]["forward"]
        forward["sqlTemplate"] += " "
        forward["templateSha256"] = hashlib.sha256(
            forward["sqlTemplate"].encode()
        ).hexdigest()
        with self.assertRaises(GeneratedExecutionError):
            prepare_generated(*_v5_artifact(algebra_override=algebra))

    def test_unknown_connection_members_and_oid_drift_refuse(self):
        _manifest, _files, _trusted, _target = _v5_artifact()
        algebra = json.loads(_files.mapping["algebra/read.json"])
        algebra["roots"]["demo/Note"]["forwardConnection"]["surprise"] = True
        with self.assertRaises(GeneratedExecutionError):
            prepare_generated(*_v5_artifact(algebra_override=algebra))

        algebra = json.loads(_files.mapping["algebra/read.json"])
        outputs = algebra["roots"]["demo/Note"]["forwardConnection"]["fieldOutputs"]
        outputs[0]["output"]["oid"] = 1043
        with self.assertRaises(GeneratedExecutionError):
            prepare_generated(*_v5_artifact(algebra_override=algebra))


if __name__ == "__main__":
    unittest.main()
