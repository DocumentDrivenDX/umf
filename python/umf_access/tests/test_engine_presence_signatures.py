# SPDX-License-Identifier: MIT OR Apache-2.0
"""Signature-only presence controls and actual original0.1 byte preservation.

Missing-only signatures are hypothetical: real Core0.8 absent Fields also admit
null. These controls do not claim native engine0.2 qualification.
"""
import hashlib
import json
import unittest
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from umf_access.engine_catalog import (
    EngineRead,
    _engine_fields,
    _engine_scalar_signature,
)
from umf_access.reviewed import ReadBuildError, _carrier, _fields
from umf_access.types import MISSING, StrictModel


class Parameters(StrictModel):
    status: str
class Row(StrictModel):
    id: str
    status: str

class EnginePresenceSignatureTests(unittest.TestCase):
    def test_four_scalar_families_retain_null_and_missing_separately(self):
        for scalar, family in ((str,"string"),(bool,"boolean"),(int,"integer"),(Decimal,"decimal")):
            for nullable in (False,True):
                for missing in (False,True):
                    annotation = scalar | None if nullable else scalar
                    if missing: annotation = annotation | MISSING
                    expected = {"carrier":family,"nullable":nullable,"missing":missing}
                    self.assertEqual(_engine_scalar_signature(annotation), expected)
                    self.assertEqual(_engine_scalar_signature(Annotated[annotation,"outer"]),expected)
            self.assertEqual(_engine_scalar_signature(Annotated[scalar | None,"inner"] | MISSING),
                             {"carrier":family,"nullable":True,"missing":True})

    def test_output_only_missing_model_does_not_widen_raw_signatures(self):
        class Optional(StrictModel):
            text: str | None | MISSING = MISSING
        self.assertEqual(_engine_fields(Optional),[{"name":"text","carrier":"string","nullable":True,"missing":True}])
        with self.assertRaises(ReadBuildError): _fields(Optional,parameter=False)
        with self.assertRaises(ReadBuildError): _carrier(str | MISSING)
        with self.assertRaises(ReadBuildError): _carrier(str | None | MISSING)

    def test_unsupported_or_multiple_carriers_refuse(self):
        for annotation in (str | int | MISSING,bytes | MISSING,list[str],float,MISSING,type(None)):
            with self.subTest(annotation=annotation),self.assertRaises(ReadBuildError):
                _engine_scalar_signature(annotation)

    def test_actual_original_legacy_wrappers_keep_exact_bytes(self):
        root=Path(__file__).resolve().parents[3]/"fixtures/access/engine-catalog-legacy"
        expected=json.loads((root/"expected-wrapper-hashes.json").read_text())
        for name, record in expected.items():
            with self.subTest(name=name):
                original=(root/(name+".json")).read_text()
                self.assertEqual(hashlib.sha256(original.encode()).hexdigest(),record["originalSha256"])
                entry=EngineRead.from_original(original,parameters=Parameters,result=Row)
                self.assertEqual(hashlib.sha256(entry.artifact_json.encode()).hexdigest(),record["wrapperSha256"])
                self.assertEqual(entry.originals(),original)
                self.assertEqual(entry.artifact()["version"],record["programVersion"])

    def test_actual_original_successor_retains_logical_presence(self):
        class Empty(StrictModel):
            pass
        class PresenceRow(StrictModel):
            id: str
            status: str | None | MISSING = MISSING
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor"
        original = (root / "ordinary-presence-original.json").read_text()
        entry = EngineRead.from_original(original, parameters=Empty, result=PresenceRow)
        program = entry.artifact()
        self.assertEqual(program["version"], "weft.engine-read/0.2")
        self.assertEqual(entry.originals(), original)
        self.assertFalse(program["artifact"]["columns"][1]["nullable"])
        self.assertTrue(program["outputs"][1]["nullable"])
        self.assertTrue(program["outputs"][1]["missing"])
        class NarrowNull(StrictModel):
            id: str
            status: str | MISSING = MISSING
        class NarrowMissing(StrictModel):
            id: str
            status: str | None
        for model in (NarrowNull, NarrowMissing):
            with self.subTest(model=model), self.assertRaises(ReadBuildError):
                EngineRead.from_original(original, parameters=Empty, result=model)

    def test_actual_successor_custody_faults_refuse_after_valid_digest(self):
        class Empty(StrictModel):
            pass
        class PresenceRow(StrictModel):
            id: str
            status: str | None | MISSING = MISSING
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor"
        original = json.loads((root / "ordinary-presence-original.json").read_text())
        from umf_access.engine_catalog import canonical_json
        faults = (
            lambda p: p["outputs"][1].update(missing=False),
            lambda p: p["outputs"][1].update(nullable=False),
            lambda p: p["outputs"][1]["source"].update(element="foreign"),
            lambda p: p["outputs"][1].update(modelPins=[]),
            lambda p: p["artifact"]["columns"][1].update(sourceIdentities=[]),
            lambda p: p["outputs"][1]["representation"].update(nativeNull=False),
        )
        import copy
        for fault in faults:
            changed = copy.deepcopy(original)
            fault(changed)
            structural = dict(changed)
            structural.pop("structuralDigest")
            changed["structuralDigest"]["sha256"] = hashlib.sha256(canonical_json(structural).encode()).hexdigest()
            with self.subTest(fault=fault), self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(changed), parameters=Empty, result=PresenceRow)

    def test_original_ordered_page_uses_checked_key_ordinals(self):
        class Empty(StrictModel):
            pass
        class PresenceRow(StrictModel):
            id: str
            status: str | None | MISSING = MISSING
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor"
        original = (root / "ordered-page-original.json").read_text()
        entry = EngineRead.from_original(original, parameters=Empty, result=PresenceRow)
        program = entry.artifact()
        self.assertEqual(program["page"]["visibleOutputs"], 2)
        self.assertEqual(program["page"]["keySlots"], [1, 2])
        self.assertEqual(len(program["page"]["sortSlots"]), 3)
        self.assertEqual(entry.originals(), original)

    def test_explicit_key_packet_routing_preserves_owner_requests(self):
        from umf_access.engine_catalog import _related_packet
        key = {"module": "sales", "record": "order", "key": "alternate"}
        source_key = {"module": "sales", "record": "customer", "key": "source-alternate"}
        request = {"sql": "target", "parameters": {}}
        source = {**request, "sql": "source"}
        relation = {"module": "sales", "id": "customers", "direction": "inverse"}
        packet = _related_packet(request, source, relation, "ashlar-spark4-sdk-pages", 2, key, source_key)
        self.assertEqual(packet["version"], "weft.engine-related-page/0.2")
        self.assertEqual(packet["selectedKey"], key)
        self.assertEqual(packet["sourceSelectedKey"], source_key)
        self.assertEqual(packet["source"], source)
        ordered = _related_packet(request, source, relation, "ashlar-spark4-sdk", None, None, source_key, key)
        self.assertEqual(ordered["orderKey"], key)
        self.assertEqual(ordered["sourceSelectedKey"], source_key)
        with self.assertRaises(ReadBuildError):
            _related_packet(request, source, relation, "ashlar-spark4-sdk-pages", 2, key, source_key, key)
        for method in ("ashlar-spark4", "ashlar-spark4-pages", "truss-runtime"):
            with self.subTest(method=method), self.assertRaises(ReadBuildError):
                _related_packet(request, source, relation, method, 2, key, source_key)
        with self.assertRaises(ReadBuildError):
            _related_packet(request, source, relation, "ashlar-spark4-sdk", None, key, source_key)

    def test_page_compile_routes_exact_original_request_and_key(self):
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor"
        original = (root / "ordered-page-original.json").read_text()
        program = json.loads(original)
        class OwnerReplay:
            def compile_engine_page_json(self, packet):
                self.packet = json.loads(packet)
                return original
        owner = OwnerReplay()
        self.assertEqual(EngineRead.compile_original(owner, program["request"],
            method=program["compiler"], page_size=program["pageSize"],
            selected_key=program["selectedKey"]), original)
        self.assertEqual(owner.packet, {"version": "weft.engine-page/0.2",
            "compiler": program["compiler"], "request": program["request"],
            "selectedKey": program["selectedKey"], "pageSize": program["pageSize"]})
        with self.assertRaises(ReadBuildError):
            EngineRead.compile_original(owner, program["request"], method=program["compiler"], page_size=2)
        with self.assertRaises(ReadBuildError):
            EngineRead.compile_original(owner, program["request"], method="ashlar-spark4-pages",
                page_size=2, selected_key=program["selectedKey"])

    def test_original_page_hidden_slot_metadata_faults_refuse(self):
        import copy

        from umf_access.engine_catalog import canonical_json
        class Empty(StrictModel):
            pass
        class PresenceRow(StrictModel):
            id: str
            status: str | None | MISSING = MISSING
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor"
        original = json.loads((root / "ordered-page-original.json").read_text())
        faults = (
            lambda p: p["page"].update(visibleOutputs=3),
            lambda p: p["page"].update(keySlots=[0, 2]),
            lambda p: p["page"].update(keyOutputs=[2, 6]),
            lambda p: p["page"]["sortSlots"][0].update(direction="asc"),
            lambda p: p["selectedKey"].update(key="foreign"),
        )
        for fault in faults:
            changed = copy.deepcopy(original)
            fault(changed)
            structural = dict(changed)
            structural.pop("structuralDigest")
            changed["structuralDigest"]["sha256"] = hashlib.sha256(canonical_json(structural).encode()).hexdigest()
            with self.subTest(fault=fault), self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(changed), parameters=Empty, result=PresenceRow)

    def test_actual_source_ordered_and_related_originals_retain_separate_keys(self):
        class Empty(StrictModel):
            pass
        class Target(StrictModel):
            id: str
        class PresenceRow(StrictModel):
            id: str
            status: str | None | MISSING = MISSING
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor/final-ordered-8bb6ded"
        for name in ("ordered-read", "related-read", "related-page", "page"):
            original = (root / (name + ".json")).read_text()
            entry = EngineRead.from_original(original, parameters=Empty,
                result=PresenceRow if name in ("ordered-read", "page") else Target)
            with self.subTest(name=name):
                self.assertEqual(entry.originals(), original)
                self.assertEqual(json.loads(entry.artifact_json)["version"], "umf.engine-catalog/0.2")
        for name, page in (("related-read", False), ("related-page", True)):
            original = (root / (name + ".json")).read_text()
            program = json.loads(original)
            packet = program["relatedRequest"]
            class ReplayOwner:
                def __init__(self, response):
                    self.response = response
                def compile_engine_related_read_json(self, raw):
                    self.packet = json.loads(raw)
                    return self.response
                compile_engine_related_page_json = compile_engine_related_read_json
            owner = ReplayOwner(original)
            actual = EngineRead.compile_original(owner, program["request"],
                method=program["compiler"], page_size=program.get("pageSize"),
                related_source=packet["source"], relationship=packet["relationship"],
                selected_key=packet.get("selectedKey"), source_selected_key=packet["sourceSelectedKey"],
                order_key=packet.get("orderKey"))
            self.assertEqual(actual, original)
            self.assertEqual(owner.packet, packet)

    def test_original_with_keys_uses_actual_generated_key_transport(self):
        import importlib
        import sys

        from umf_access.codec_support import make_projection_model
        from umf_access.related_keys import make_related_result_model
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor"
        sys.path.insert(0, str(root / "public-stage-one"))
        try:
            generated = importlib.import_module("engine_presence")
            row = make_projection_model("OriginalRelatedProjection", (("id", generated.Order, "id"),))
            original = (root / "final-ordered-8bb6ded/with-keys.json").read_text()
            program = json.loads(original)
            output = program["outputs"][1]
            result = make_related_result_model("OriginalWithKeysTransport", row, generated.CustomerKey,
                output["name"], output["decoder"], generated.Order)
            class Empty(StrictModel):
                pass
            entry = EngineRead.from_original(original, parameters=Empty, result=result)
            self.assertEqual(entry.originals(), original)
            self.assertIs(entry.result.UMF_RELATED_OUTPUT[1], generated.CustomerKey)
        finally:
            sys.path.pop(0)

    def test_original_budget_precedes_first_parser_call(self):
        from unittest.mock import patch
        for original in (None, b"{}", " " * 4_194_305):
            with self.subTest(kind=type(original)), patch("umf_access.engine_catalog.program_json") as parser:
                with self.assertRaisesRegex(ReadBuildError, "bounded original"):
                    EngineRead.from_original(original, parameters=Parameters, result=Row)
                parser.assert_not_called()

    def test_binary_signature_requires_explicit_output_profile(self):
        for annotation, nullable, missing in ((bytes, False, False), (bytes | None | MISSING, True, True)):
            with self.assertRaises(ReadBuildError):
                _engine_scalar_signature(annotation)
            self.assertEqual(_engine_scalar_signature(annotation, allow_binary=True),
                {"carrier": "binary", "nullable": nullable, "missing": missing})
        for annotation in (list[bytes], bytes | str):
            with self.assertRaises(ReadBuildError):
                _engine_scalar_signature(annotation, allow_binary=True)
        with self.assertRaises(ReadBuildError):
            _carrier(bytes)

    def test_actual_truss_binary_originals_have_independent_cursor_profile(self):
        class Empty(StrictModel):
            pass
        class BinaryRow(StrictModel):
            label: str
            blob: bytes
            optional_blob: bytes | None | MISSING = MISSING
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor/final-binary-8bb6ded"
        for name in ("read", "page"):
            original = (root / (name + ".json")).read_text()
            entry = EngineRead.from_original(original, parameters=Empty, result=BinaryRow)
            program = entry.artifact()
            self.assertEqual(entry.originals(), original)
            self.assertEqual({k: program["outputs"][0][k] for k in ("name", "carrier", "nullable", "missing")}, {"name": "label", "carrier": "string", "nullable": False, "missing": False})
            self.assertEqual(program["outputs"][1]["stateDomain"]["states"], ["value"])
            self.assertEqual(program["outputs"][2]["stateDomain"]["states"], ["missing", "null", "value"])
            if name == "page":
                self.assertNotIn("sortSlots", program["page"])
                self.assertEqual(program["selectedKey"]["key"], program["artifact"]["logicalPlan"]["pageKey"]["id"])

    def test_actual_truss_binary_domain_and_key_faults_refuse(self):
        import copy

        from umf_access.engine_catalog import canonical_json
        class Empty(StrictModel):
            pass
        class BinaryRow(StrictModel):
            label: str
            blob: bytes
            optional_blob: bytes | None | MISSING = MISSING
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor/final-binary-8bb6ded"
        original = json.loads((root / "page.json").read_text())
        faults = (
            lambda p: p["outputs"][1]["stateDomain"].update(states=["null", "value"]),
            lambda p: p["outputs"][2].update(nullable=False),
            lambda p: p["outputs"][1].update(decoder={"profile": "ashlar-binary/0.1"}),
            lambda p: p["selectedKey"].update(key="z-alt"),
            lambda p: p["page"].update(keyOutputs=[0, 4]),
            lambda p: p.update(compiler="ashlar-spark4-sdk-pages"),
        )
        for fault in faults:
            changed = copy.deepcopy(original)
            fault(changed)
            structural = dict(changed)
            structural.pop("structuralDigest")
            changed["structuralDigest"]["sha256"] = hashlib.sha256(canonical_json(structural).encode()).hexdigest()
            with self.subTest(fault=fault), self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(changed), parameters=Empty, result=BinaryRow)

    def test_nonobject_original_wrapper_and_related_roots_refuse(self):
        import copy

        from umf_access.engine_catalog import canonical_json
        class Empty(StrictModel):
            pass
        class Target(StrictModel):
            id: str
        for value in (None, [], 1, True, "text"):
            raw = json.dumps(value)
            with self.subTest(value=value), self.assertRaises(ReadBuildError):
                EngineRead.from_original(raw, parameters=Empty, result=Target)
            with self.subTest(wrapper=value), self.assertRaises(ReadBuildError):
                EngineRead(raw, Empty, Target).artifact()
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor/final-ordered-8bb6ded"
        original = json.loads((root / "related-read.json").read_text())
        for value in (None, 1, True, []):
            changed = copy.deepcopy(original)
            changed["relatedRequest"] = value
            structural = dict(changed)
            structural.pop("structuralDigest")
            changed["structuralDigest"]["sha256"] = hashlib.sha256(canonical_json(structural).encode()).hexdigest()
            with self.subTest(packet=value), self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(changed), parameters=Empty, result=Target)

    def test_actual_optional_truss_scalar_cannot_narrow_missing(self):
        class Empty(StrictModel):
            pass
        class Present(StrictModel):
            label: str
            blob: bytes
            optional_blob: str | None | MISSING = MISSING
        class Narrow(StrictModel):
            label: str
            blob: bytes
            optional_blob: str | None
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor/final-binary-8bb6ded"
        original = (root / "optional-scalar-sibling.json").read_text()
        program = EngineRead.from_original(original, parameters=Empty, result=Present).artifact()
        self.assertTrue(program["outputs"][2]["missing"])
        self.assertTrue(program["outputs"][2]["nullable"])
        with self.assertRaises(ReadBuildError):
            EngineRead.from_original(original, parameters=Empty, result=Narrow)

    def test_truss_binary_navigation_refuses_before_owner_invocation(self):
        root = Path(__file__).resolve().parents[3] / "fixtures/access/engine-catalog-successor/final-binary-8bb6ded"
        request = json.loads((root / "read.json").read_text())["request"]
        class NoDispatch:
            def __getattr__(self, name):
                raise AssertionError("unsupported profile must not invoke owner: " + name)
        with self.assertRaisesRegex(ReadBuildError, "no navigation/ordered-read extension"):
            EngineRead.compile_original(NoDispatch(), request, method="truss-runtime-binary",
                related_source=request, relationship={"module": "m", "id": "A-B", "direction": "forward"},
                source_selected_key={"module": "m", "record": "A", "key": "a-primary"})
