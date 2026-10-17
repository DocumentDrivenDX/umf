"""Exercising refusal controls for TD-087/088 adoption evidence custody."""

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from conformance.qualification_packet import (
    _REQUIREMENTS,
    AdoptionIncomplete,
    check_adoption_packet,
)


class AdoptionPacketTests(unittest.TestCase):
    def setUp(self):
        self.expected_engine, self.expected_scope = "ashlar", "reads-non-temporal"
        self.pins = {
            name: name + "-exact"
            for name in (
                "engineVersion",
                "adapterVersion",
                "runtimeAbi",
                "weftVersion",
                "bindingVersion",
                "catalogRevision",
            )
        }
        self.receipts = {}
        self.packet = {
            "contract": "umf.access-adoption/1",
            "engine": "ashlar",
            "scope": "reads-non-temporal",
            "nativePins": self.pins.copy(),
            "catalogTargets": ["ashlar-databricks-qualified"],
            "authorityRefs": ["engine/owned-contract"],
            "outcome": "qualified",
            "temporalQualification": "held",
            "conformanceEvidence": [],
            "futureExtension": {"opaque": [1, 2]},
        }
        self.packet.update(
            {k: self.pins[k] for k in ("engineVersion", "adapterVersion", "runtimeAbi")}
        )
        cases, witnesses = _REQUIREMENTS[("ashlar", "reads-non-temporal")]
        for kind, names in (("conformance", cases), ("engine", witnesses)):
            for case in names:
                self.add_receipt(kind, case)

    def add_receipt(self, kind, case, **changes):
        receipt = {
            "kind": kind,
            "case": case,
            "pins": self.pins,
            "status": "passed",
            "future": {"preserved": True},
        }
        receipt.update(changes)
        body = json.dumps(receipt).encode()
        digest = hashlib.sha256(body).hexdigest()
        self.receipts[digest] = body
        item = {"kind": kind, "case": case, "receiptSha256": digest}
        self.packet["conformanceEvidence"].append(item)
        return item

    def check(self):
        check_adoption_packet(
            self.packet,
            expected_engine=self.expected_engine,
            expected_scope=self.expected_scope,
            expected_pins=self.pins,
            load_receipt=self.receipts.__getitem__,
        )

    def test_complete_non_temporal_profile_and_unknowns_preserved(self):
        before = copy.deepcopy(self.packet)
        self.check()
        self.assertEqual(self.packet, before)
        self.assertEqual(self.packet["temporalQualification"], "held")

    def test_every_missing_case_and_witness_refuses(self):
        for index in range(len(self.packet["conformanceEvidence"])):
            with self.subTest(index=index):
                item = self.packet["conformanceEvidence"].pop(index)
                with self.assertRaises(AdoptionIncomplete):
                    self.check()
                self.packet["conformanceEvidence"].insert(index, item)

    def test_pin_drift_and_missing_pin_refuse(self):
        for key in self.pins:
            for change in ("changed", None):
                with self.subTest(key=key, change=change):
                    original = self.packet["nativePins"].pop(key)
                    if change is not None:
                        self.packet["nativePins"][key] = change
                    with self.assertRaises(AdoptionIncomplete):
                        self.check()
                    self.packet["nativePins"][key] = original
        self.packet["engineVersion"] = "other"
        with self.assertRaises(AdoptionIncomplete):
            self.check()

    def test_duplicate_missing_corrupt_and_foreign_receipts_refuse(self):
        item = self.packet["conformanceEvidence"][0]
        self.packet["conformanceEvidence"].append(item)
        with self.assertRaises(AdoptionIncomplete):
            self.check()
        self.packet["conformanceEvidence"].pop()
        digest = item["receiptSha256"]
        original = self.receipts.pop(digest)
        with self.assertRaises(AdoptionIncomplete):
            self.check()
        self.receipts[digest] = original + b" "
        with self.assertRaises(AdoptionIncomplete):
            self.check()
        self.receipts[digest] = original
        for changes in (
            {"status": "failed"},
            {"status": "skipped"},
            {"pins": {"other": "pin"}},
            {"case": "wrong"},
        ):
            body = json.dumps(dict(json.loads(original), **changes)).encode()
            replacement = hashlib.sha256(body).hexdigest()
            self.receipts[replacement] = body
            item["receiptSha256"] = replacement
            with self.assertRaises(AdoptionIncomplete):
                self.check()
        item["receiptSha256"] = digest
        self.check()

    def test_duplicate_json_keys_and_bad_shapes_refuse(self):
        item = self.packet["conformanceEvidence"][0]
        body = b'{"status":"failed","status":"passed"}'
        digest = hashlib.sha256(body).hexdigest()
        self.receipts[digest] = body
        item["receiptSha256"] = digest
        with self.assertRaises(AdoptionIncomplete):
            self.check()

    def test_temporal_hold_cannot_be_promoted_to_complete(self):
        self.packet["scope"] = "complete"
        self.expected_scope = "complete"
        self.add_receipt("conformance", "values.instant_micros")
        self.add_receipt("engine", "values.instant_micros")
        with self.assertRaises(AdoptionIncomplete):
            self.check()

    def test_no_partial_claim_or_unknown_scope(self):
        self.packet["scope"] = "reads"
        with self.assertRaises(AdoptionIncomplete):
            self.check()
        self.packet["scope"] = "reads-non-temporal"
        self.packet["outcome"] = "success"
        with self.assertRaises(AdoptionIncomplete):
            self.check()

    def test_each_declared_scope_requires_every_case_and_native_witness(self):
        # Synthetic receipt controls exercise the validator only, never engines.
        for (engine, scope), (cases, witnesses) in _REQUIREMENTS.items():
            with self.subTest(engine=engine, scope=scope):
                self.expected_engine, self.expected_scope = engine, scope
                self.packet.update(
                    engine=engine,
                    scope=scope,
                    temporalQualification="qualified"
                    if scope == "complete"
                    else "held",
                    conformanceEvidence=[],
                )
                for kind, names in (("conformance", cases), ("engine", witnesses)):
                    for case in names:
                        self.add_receipt(kind, case)
                self.check()
                for index in range(len(self.packet["conformanceEvidence"])):
                    item = self.packet["conformanceEvidence"].pop(index)
                    with self.assertRaises(AdoptionIncomplete):
                        self.check()
                    self.packet["conformanceEvidence"].insert(index, item)

    def test_packet_cannot_select_another_engine_or_weaker_scope(self):
        self.packet["engine"] = "truss"
        with self.assertRaisesRegex(AdoptionIncomplete, "caller selection"):
            self.check()
        self.packet["engine"] = "ashlar"
        self.packet["scope"] = "complete"
        with self.assertRaisesRegex(AdoptionIncomplete, "caller selection"):
            self.check()


if __name__ == "__main__":
    unittest.main()
