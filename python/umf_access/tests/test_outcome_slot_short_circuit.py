# SPDX-License-Identifier: MIT OR Apache-2.0
"""Occupied-slot refusals stop before mutation effects and receipt insertion."""
import unittest
from types import SimpleNamespace

from umf_access.unified import SessionError, SessionIdentity, table_writes
from umf_access.unified.outcome_values import outcome_record, outcome_slot


class Probe:
    def __init__(self, before, stored):
        self.before = before
        self.stored = stored
        self.events = []

    def operation_steps(self):
        self.events.append("operation")
        yield "operation"
        return self.before

    def outcome_steps(self, stage, *args):
        self.events.append(stage)
        yield stage
        if stage == "read":
            return self.stored
        return None


class OccupiedSlotShortCircuit(unittest.TestCase):
    secret = b"occupied-slot-test-secret-32-bytes"
    identity = SessionIdentity("person", "alice")

    def _run(self, stored):
        before = {"principalOid": 73, "roleScopeDigest": "7" * 64}
        probe = Probe(before, stored)
        scope = {
            "schema": "plugin",
            "module": "demo", "operation": "create", "sourceDigest": "1" * 64,
            "configurationDigest": "2" * 64, "bundleDigest": "3" * 64,
            "headDigest": "4" * 64, "inputsDigest": "8" * 64,
        }
        program = {
            "idempotencyKey": "client-key", "operation": "create",
            "declarationDigest": "5" * 64, "callKind": "write",
            "nativeInputs": [{}], "result": {"maxRows": 10},
        }
        writer = object.__new__(table_writes.SyncTableWriter)
        writer._secret = self.secret
        writer._session = SimpleNamespace(transaction_owner="caller")
        writer._before = lambda *args: None
        steps = writer._steps(self.identity, (probe, program, scope, None, None), False)
        first = next(steps)
        self.assertEqual(first, "operation")
        second = steps.send(before)
        self.assertEqual(second, "lock")
        third = steps.send(None)
        self.assertEqual(third, "read")
        try:
            steps.send(stored)
        except SessionError:
            pass
        else:
            self.fail("occupied slot did not refuse")
        return probe.events

    def _receipt(self, metadata, slot, *, signature=None):
        row = outcome_record(self.secret, 73, slot, metadata, [1], {"rows": []})
        if signature is not None:
            row["signature"] = signature
        return tuple(row[key] for key in ("invocationDigest", "scopeDigest", "payload", "signature"))

    def test_forged_occupied_slot_refuses_without_effects_or_insert(self):
        scope = {"schema": "plugin", "module": "demo"}
        metadata = {
            "module": "demo", "operation": "create", "sourceDigest": "1" * 64,
            "configurationDigest": "2" * 64, "bundleDigest": "3" * 64,
            "headDigest": "4" * 64, "invocationDigest": "5" * 64,
            "scopeDigest": "6" * 64,
        }
        slot = outcome_slot(self.identity, 73, scope, "create", "client-key")
        forged = list(self._receipt(metadata, slot))
        forged[3] = "0" * 64
        self.assertEqual(self._run(tuple(forged)), ["operation", "lock", "read"])

    def test_authenticated_mismatched_occupied_slot_refuses_without_effects_or_insert(self):
        scope = {"schema": "plugin", "module": "demo"}
        metadata = {
            "module": "other", "operation": "create", "sourceDigest": "1" * 64,
            "configurationDigest": "2" * 64, "bundleDigest": "3" * 64,
            "headDigest": "4" * 64, "invocationDigest": "5" * 64,
            "scopeDigest": "6" * 64,
        }
        slot = outcome_slot(self.identity, 73, scope, "create", "client-key")
        stored = self._receipt(metadata, slot)
        self.assertEqual(self._run(stored), ["operation", "lock", "read"])


if __name__ == "__main__":
    unittest.main()
