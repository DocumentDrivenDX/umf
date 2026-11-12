"""The public Key validator shares the binder's actual Rust-issued codec path."""

from __future__ import annotations

import json
import time
import unittest
from pathlib import Path

from umf_access_generated_executor import (
    ExecutionScope,
    GeneratedExecutionError,
    GeneratedFiles,
    GeneratedGetManyCall,
    GeneratedManifest,
    TargetBinding,
    TrustedArtifactRef,
    prepare_generated,
)

FIXTURE = Path(__file__).parent / "fixtures" / "generated_read_algebra_v4_runtime"


class GeneratedGetManyKeyValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        manifest = GeneratedManifest.from_json((FIXTURE / "manifest.json").read_bytes())
        files = GeneratedFiles.from_mapping(
            {
                "algebra/read.json": (FIXTURE / "files/algebra/read.json").read_bytes(),
                "native/native-table-source.json": (
                    FIXTURE / "files/native/native-table-source.json"
                ).read_bytes(),
            }
        )
        trust_value = json.loads((FIXTURE / "trusted-artifact.json").read_bytes())
        receipt = json.loads((FIXTURE / "receipt.json").read_bytes())
        cls.trusted = TrustedArtifactRef(
            trust_value["artifactId"],
            trust_value["artifactDigest"],
            trust_value["receiptDigest"],
            receipt["payloadDigest"],
            trust_value["sourceDigest"],
            trust_value["targetBindingDigest"],
            tuple(tuple(entry) for entry in trust_value["inventory"]),
            trust_value["issuer"],
            trust_value["buildId"],
        )
        target_value = json.loads((FIXTURE / "target.json").read_bytes())
        target = TargetBinding(
            target_value["id"],
            target_value["profile"],
            target_value["version"],
            target_value["bindingDigest"],
        )
        cls.executor = prepare_generated(manifest, files, cls.trusted, target)

    def test_validator_accepts_exact_rust_issued_text_key(self):
        normalized = self.executor.validate_get_many_key(
            "demo", "Note", "primary", ({"string": "fixture-note-1"},)
        )
        self.assertEqual(normalized, ("fixture-note-1",))

    def test_validator_refuses_wrapper_and_key_identity_drift(self):
        with self.assertRaises(GeneratedExecutionError) as wrapper_error:
            self.executor.validate_get_many_key(
                "demo", "Note", "primary", ({"integerToken": "1"},)
            )
        self.assertEqual(wrapper_error.exception.code, "INVALID")
        with self.assertRaises(GeneratedExecutionError) as key_error:
            self.executor.validate_get_many_key(
                "demo", "Note", "other-key", ({"string": "fixture-note-1"},)
            )
        self.assertEqual(key_error.exception.code, "INVALID")

    def test_validator_bounds_node_key_components(self):
        with self.assertRaises(GeneratedExecutionError) as error:
            self.executor.validate_get_many_key(
                "demo", "Note", "primary", ({"string": "x" * 4_194_305},)
            )
        self.assertEqual(error.exception.code, "LIMIT_EXCEEDED")

    def test_binder_uses_the_same_normalized_components(self):
        call = GeneratedGetManyCall(
            "demo",
            "Note",
            "primary",
            (({"string": "fixture-note-1"},),),
            ("demo/id",),
        )
        scope = ExecutionScope(
            "host",
            "principal",
            "get-many-key-validation",
            time.monotonic() + 10,
            "lease-1",
            consistency="request-snapshot/1",
        )
        bound = self.executor.bind_get_many(call, scope)
        self.assertEqual(
            bound.parameters,
            (
                0,
                *self.executor.validate_get_many_key(
                    "demo", "Note", "primary", call.keys[0]
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
