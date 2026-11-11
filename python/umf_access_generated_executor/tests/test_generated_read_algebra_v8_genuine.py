"""Pure full-path admission for genuine Weft67 profile-8 artifacts.

These fixtures preserve the exact Build28/Weft67 algebra, native-source3
projection, manifest, local receipt/trust reference, and target. They do not
represent production trust and do not execute SQL.
"""
from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path
from typing import Mapping

from umf_access_generated_executor import (
    GeneratedFiles,
    GeneratedJoinedAtom,
    GeneratedJoinedField,
    GeneratedJoinedOrder,
    GeneratedJoinedReadCall,
    GeneratedJoinedReadResult,
    GeneratedManifest,
    TargetBinding,
    TrustedArtifactRef,
    canonical_json,
    prepare_generated,
)


_FIXTURES = Path(__file__).parent / "fixtures" / "generated_read_algebra_v8_genuine"
_VARIANTS = ("root-positive", "nonpk-source-fk", "same-name-fields")


def _read_fixture(name: str):
    folder = _FIXTURES / name
    manifest = GeneratedManifest.from_json((folder / "artifact" / "manifest.json").read_bytes())
    artifact = folder / "artifact"
    files = GeneratedFiles.from_mapping({
        "algebra/read.json": (artifact / "algebra" / "read.json").read_bytes(),
        "native/native-table-source.json": (artifact / "native" / "native-table-source.json").read_bytes(),
    })
    manifest_value = manifest.copied_value()
    receipt = json.loads((folder / "receipt.json").read_bytes())
    trusted_value = json.loads((folder / "trusted-artifact.json").read_bytes())
    target_value = json.loads((folder / "target.json").read_bytes())
    target = TargetBinding(
        target_value["id"],
        target_value["profile"],
        target_value["version"],
        target_value["bindingDigest"],
    )
    trusted = TrustedArtifactRef(
        trusted_value["artifactId"],
        trusted_value["artifactDigest"],
        trusted_value["receiptDigest"],
        receipt["payloadDigest"],
        trusted_value["sourceDigest"],
        trusted_value["targetBindingDigest"],
        tuple(tuple(entry) for entry in trusted_value["inventory"]),
        trusted_value["issuer"],
        trusted_value["buildId"],
    )
    assert manifest_value["artifactId"] == trusted.artifact_id
    assert manifest_value["artifactDigest"] == trusted.artifact_digest
    assert receipt["receiptDigest"] == trusted.receipt_digest
    assert receipt["payloadDigest"] == trusted.payload_digest
    assert files.inventory == trusted.inventory
    assert target.binding_digest == trusted.target_binding_digest
    return folder, manifest, files, trusted, target


def _joined_call(algebra: Mapping[str, object], variant: str) -> GeneratedJoinedReadCall:
    roots = algebra["roots"]
    root = roots["demo/Task"]
    catalog = root["requiredInnerJoins"]
    descriptor = catalog["relationships"]["demo/TaskNote"]
    root_value_predicate = next(
        identity
        for identity, predicate in descriptor["predicates"]["root"].items()
        if predicate["fieldId"] == "demo/taskValue" and predicate["operator"] == "eq"
    )
    target_value_order = next(
        identity
        for identity, order in descriptor["orders"]["target"].items()
        if order["fieldId"] == "demo/payload" and order["direction"] == "asc"
    )
    return GeneratedJoinedReadCall(
        "demo",
        "Task",
        "demo",
        "TaskNote",
        (
            GeneratedJoinedField("demo", "Task", "demo/taskValue"),
            GeneratedJoinedField("demo", "Note", "demo/payload"),
        ),
        GeneratedJoinedAtom(
            "demo", "Task", root_value_predicate, ({"string": "task-value-a"},)
        ),
        (GeneratedJoinedOrder("demo", "Note", target_value_order),),
        17,
    )


class GenuineGeneratedReadAlgebraV8Tests(unittest.TestCase):
    def test_exact_external_fixture_bytes_and_per_root_catalog_shape(self) -> None:
        provenance = json.loads((_FIXTURES / "provenance.json").read_bytes())
        self.assertEqual(provenance["packages"]["weft-sql"], "0.4.67.dev1")
        self.assertEqual(provenance["packages"]["umf-access-build"], "0.1.0.dev28")
        self.assertEqual(provenance["packages"]["umf-access-generated-executor"], "0.1.0a10")
        self.assertEqual(len(provenance["fixtures"]), 3)
        for variant, pinned in zip(_VARIANTS, provenance["fixtures"], strict=True):
            folder, manifest, files, trusted, target = _read_fixture(variant)
            self.assertEqual(pinned["name"], variant)
            self.assertEqual(
                hashlib.sha256((folder / "source.umf.json").read_bytes()).hexdigest(),
                pinned["sourceSha256"],
            )
            self.assertEqual(
                hashlib.sha256((folder / "artifact" / "manifest.json").read_bytes()).hexdigest(),
                pinned["manifestSha256"],
            )
            self.assertEqual(manifest.value["artifactDigest"], pinned["artifactDigest"])
            self.assertEqual(trusted.receipt_digest, pinned["receiptDigest"])
            self.assertEqual(target.binding_digest, pinned["targetBindingDigest"])
            self.assertEqual(
                hashlib.sha256((folder / "artifact" / "algebra/read.json").read_bytes()).hexdigest(),
                pinned["algebraSha256"],
            )
            self.assertEqual(
                hashlib.sha256((folder / "artifact" / "native/native-table-source.json").read_bytes()).hexdigest(),
                pinned["nativeSourceSha256"],
            )
            algebra = json.loads(files.mapping["algebra/read.json"])
            self.assertEqual(algebra["version"], "weft.generated-read-algebra/8")
            self.assertNotIn("requiredInnerJoins", algebra)
            for root in algebra["roots"].values():
                catalog = root["requiredInnerJoins"]
                self.assertEqual(
                    catalog["profile"], "weft.generated-required-inner-join-catalog/1"
                )
                self.assertIn("demo/TaskNote", catalog["relationships"])
            self.assertEqual(manifest.value["source"]["sha256"], pinned["sourceSha256"])

    def test_real_artifacts_admit_and_validate_public_join_frames(self) -> None:
        expected_join_column = {
            "root-positive": '"task_id"',
            "nonpk-source-fk": '"note_ref"',
            "same-name-fields": '"task_id"',
        }
        for variant in _VARIANTS:
            with self.subTest(variant=variant):
                _folder, manifest, files, trusted, target = _read_fixture(variant)
                executor = prepare_generated(manifest, files, trusted, target)
                self.assertEqual(executor.read_profile, "weft.generated-read-algebra/8")
                self.assertEqual(
                    [
                        (root.root_id, root.relationship_module, root.relationship_id)
                        for root in executor.joined_read_roots
                    ],
                    [("demo/Task", "demo", "TaskNote")],
                )
                algebra = json.loads(executor.read_algebra_json)
                call = _joined_call(algebra, variant)
                bound = executor.prepare_joined_read(call)
                self.assertIn("INNER JOIN", bound.sql)
                self.assertIn(expected_join_column[variant], bound.sql)
                self.assertEqual(bound.parameters, ("task-value-a", 17))
                self.assertEqual(
                    [field.field_id for field in bound.selection],
                    ["demo/taskValue", "demo/payload"],
                )
                self.assertEqual(
                    [output["ordinal"] for output in bound.outputs], [0, 1]
                )
                if variant == "same-name-fields":
                    self.assertEqual(
                        [output["owner"] for output in bound.outputs],
                        [
                            {"module": "demo", "record": "Task"},
                            {"module": "demo", "record": "Note"},
                        ],
                    )
                    self.assertNotEqual(
                        bound.outputs[0]["sourceField"], bound.outputs[1]["sourceField"]
                    )

                frame = {
                    "version": "umf.generated-read-result/3",
                    "artifactId": manifest.value["artifactId"],
                    "artifactDigest": manifest.value["artifactDigest"],
                    "receiptDigest": trusted.receipt_digest,
                    "sourceDigest": bound.source_digest,
                    "targetBindingDigest": bound.target_digest,
                    "algebraDigest": hashlib.sha256(files.mapping["algebra/read.json"]).hexdigest(),
                    "root": {"module": "demo", "record": "Task"},
                    "relationship": {"module": "demo", "id": "TaskNote"},
                    "callDigest": bound.call_digest,
                    "selection": [
                        {
                            "owner": dict(output["owner"]),
                            "fieldId": field.field_id,
                            "ordinal": output["ordinal"],
                            "output": {
                                key: output[key]
                                for key in (
                                    "name",
                                    "carrier",
                                    "nullable",
                                    "nativeType",
                                    "oid",
                                    "valueCodec",
                                )
                            },
                        }
                        for field, output in zip(bound.selection, bound.outputs, strict=True)
                    ],
                    "rows": [[1, {"string": "task-value-a"}, {"string": "note-a"}]],
                }
                public_result = GeneratedJoinedReadResult.from_mapping(frame)
                response = {
                    "schema": bound.source_digest,
                    "table": public_result.to_mapping(),
                }
                self.assertTrue(executor.validate_joined_result(call, response))

                tampered = json.loads(canonical_json(frame))
                tampered["selection"][0]["owner"] = {"module": "demo", "record": "Note"}
                tampered_result = GeneratedJoinedReadResult.from_mapping(tampered)
                self.assertFalse(
                    executor.validate_joined_result(
                        call,
                        {"schema": bound.source_digest, "table": tampered_result.to_mapping()},
                    )
                )


if __name__ == "__main__":
    unittest.main()
