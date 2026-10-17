"""Custody/type refusal controls. Native owner correspondence is tested in E2Es."""

import hashlib
import json
import unittest
from dataclasses import replace
from typing import ClassVar

from umf_access.adoption import TargetIdentity
from umf_access.engine_catalog import EngineRead
from umf_access.native_program import canonical_json
from umf_access.reviewed import ReadBuildError
from umf_access.types import StrictModel


class Parameters(StrictModel):
    name: str


class Result(StrictModel):
    value: str


class Nullable(StrictModel):
    value: str | None


class Wrong(StrictModel):
    value: int


class Compiler:
    def compile_engine_read_json(self, original):
        request = json.loads(original)
        value = {
            "version": "weft.engine-read/0.1",
            "status": "compiled",
            "compiler": request["compiler"],
            "request": request["request"],
            "artifact": {"opaque": "owner-tested independently"},
            "outputs": [{"name": "value", "carrier": "string", "nullable": False}],
        }
        value["structuralDigest"] = {
            "owner": "weft-runtime-engine-read",
            "version": "0.1",
            "sha256": hashlib.sha256(canonical_json(value).encode()).hexdigest(),
        }
        return canonical_json(value)


class EngineCatalogTests(unittest.TestCase):
    def test_related_transport_preserves_whole_original_requests(self):
        class RelatedCompiler(Compiler):
            def compile_engine_related_read_json(self, original):
                self.packet = json.loads(original)
                value = json.loads(super().compile_engine_read_json(canonical_json({
                    "compiler": self.packet["compiler"], "request": self.packet["target"],
                })))
                value.pop("structuralDigest")
                value["relatedRequest"] = self.packet
                value["structuralDigest"] = {
                    "owner": "weft-runtime-engine-read", "version": "0.1",
                    "sha256": hashlib.sha256(canonical_json(value).encode()).hexdigest(),
                }
                return canonical_json(value)

        compiler = RelatedCompiler()
        target = {"sql": "SELECT value FROM Target LIMIT 3", "parameters": {"name": {"family": "string", "value": "雪"}}, "context": {"revision": 1}}
        source = {**target, "sql": "SELECT id FROM Source WHERE name = :name"}
        relationship = {"module": "domain", "id": "owns", "direction": "inverse"}
        entry = EngineRead.build(compiler, target, parameters=Parameters, result=Result,
                                 method="truss-runtime", related_source=source, relationship=relationship)
        self.assertEqual(compiler.packet["source"], source)
        self.assertEqual(compiler.packet["target"], target)
        self.assertEqual(entry.artifact()["relatedRequest"], compiler.packet)
        self.assertEqual(json.loads(entry.originals())["request"], target)
        for changed in ({**source, "context": {"revision": True}},
                        {**source, "parameters": {}}, {**source, "extra": "unowned"}):
            with self.assertRaises(ReadBuildError):
                EngineRead.compile_original(compiler, target, method="truss-runtime",
                                            related_source=changed, relationship=relationship)
        with self.assertRaises(ReadBuildError):
            EngineRead.compile_original(compiler, target, method="truss-runtime",
                                        related_source=source, relationship={**relationship, "extra": "unowned"})

    def entry(self):
        return EngineRead.build(
            Compiler(),
            {"parameters": {"name": {"family": "string", "value": "雪"}}},
            parameters=Parameters,
            result=Result,
            method="truss-runtime",
        )

    def test_transport_selection_uses_one_unchanged_original_compile(self):
        class CountingCompiler(Compiler):
            calls = 0
            def compile_engine_read_json(self, original):
                self.calls += 1
                return super().compile_engine_read_json(original)
        compiler = CountingCompiler()
        request = {"parameters": {"name": {"family": "string", "value": "雪"}}}
        original = EngineRead.compile_original(compiler, request, method="truss-runtime")
        entry = EngineRead.from_original(original, parameters=Parameters, result=Result)
        self.assertEqual(compiler.calls, 1)
        self.assertEqual(entry.originals(), original)
        self.assertEqual(entry.artifact_json, self.entry().artifact_json)

    def test_originals_roundtrip_and_result_signature_refusal(self):
        entry = self.entry()
        self.assertEqual(
            json.loads(entry.originals())["request"]["parameters"]["name"]["value"],
            "雪",
        )
        with self.assertRaises(ReadBuildError):
            replace(entry, result=Wrong).artifact()

    def test_outer_and_original_inner_tampering_refuse(self):
        entry = self.entry()
        for repair_outer in (False, True):
            wrapper = json.loads(entry.artifact_json)
            original = json.loads(wrapper["programJson"])
            original["artifact"]["opaque"] = "altered"
            wrapper["programJson"] = canonical_json(original)
            if repair_outer:
                wrapper.pop("catalogDigest")
                wrapper["catalogDigest"] = hashlib.sha256(
                    canonical_json(wrapper).encode()
                ).hexdigest()
            with self.assertRaises(ReadBuildError):
                replace(entry, artifact_json=canonical_json(wrapper)).artifact()

    def test_parameter_inventory_family_and_nullability_are_closed(self):
        for parameters in (
            {},
            {"extra": {"family": "string", "value": "x"}},
            {"name": {"family": "integer", "value": "1"}},
        ):
            with self.assertRaises(ReadBuildError):
                EngineRead.build(
                    Compiler(),
                    {"parameters": parameters},
                    parameters=Parameters,
                    result=Result,
                    method="truss-runtime",
                )

    def test_generation_is_checked_before_target_dispatch(self):
        entry = self.entry()

        class Changed(Parameters):
            UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "a" * 64
            UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = (
                "umf_access",
                "0.1.0.dev0",
                "umf-access-runtime/0.1",
            )

        with self.assertRaises(ReadBuildError):
            replace(entry, parameters=Changed).artifact()

    def test_publication_vector_changes_identity_without_changing_legacy_digest(self):
        identity = TargetIdentity(
            "ashlar", "id", "version", "profile", "a" * 64, (("spark", "4.0.1"),)
        )
        first = replace(identity, context_json='{"uuid":"original","version":1}')
        second = replace(identity, context_json='{"uuid":"original","version":2}')
        self.assertNotEqual(first.digest(), second.digest())
        self.assertNotEqual(identity.digest(), first.digest())
        value = {
            "kind": "ashlar",
            "backendId": "id",
            "backendVersion": "version",
            "targetProfile": "profile",
            "bindingSha256": "a" * 64,
            "platform": [{"name": "spark", "version": "4.0.1"}],
        }
        self.assertEqual(
            identity.digest(),
            hashlib.sha256(
                json.dumps(
                    value,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode()
            ).hexdigest(),
        )
