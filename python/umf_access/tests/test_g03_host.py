# SPDX-License-Identifier: MIT OR Apache-2.0
"""G03 host custody admission and required-phase recovery controls."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timezone
import unittest
from unittest.mock import patch

from umf_access.lifecycle.approval import (
    APPROVAL_PROFILE,
    ApprovalReceipt,
    TargetIdentity,
)
from umf_access.lifecycle.catalog import CatalogError
from umf_access.lifecycle.host import (
    HostCapabilities,
    HostOutcomeUnknown,
    PhaseReceipt,
    apply_migration_on_host,
)
from umf_access.lifecycle.progress import _phase_digest, _verified_phases


_TARGET = {"table": "items", "field": {"module": "demo", "element": "total"}}
_PATH = "/modules/0/extensions/umf.tables/tables/0/columns/0/default"
_PROFILE = {"version": "umf.table-migration-execution/0.4",
            "progressRelation": "umf_lifecycle_progress", "ownerOnly": True}


def g03_plan():
    step = {
        "id": "step-00001", "kind": "table", "transaction": "required",
        "sourcePath": _PATH,
        "sql": 'ALTER TABLE "app"."items" ALTER COLUMN "total" SET DEFAULT 0',
        "operation": "set-default", "phaseOperation": "change-default",
        "phaseTarget": _TARGET,
    }
    phase = {"id": "phase-00001", "kind": "default-change",
             "transaction": "required", "steps": [step["id"]]}
    return {
        "version": "umf.table-migration/0.5",
        "options": {"version": "umf.table-migration-options/0.5",
                    "backfills": [], "concurrentIndexes": [], "validations": [],
                    "reviewedChanges": [{"id": "review-1", "kind": "change-default",
                                         "path": _PATH, "oldDigest": "a" * 64,
                                         "newDigest": "b" * 64}]},
        "executionProfile": _PROFILE,
        "approvalProfile": APPROVAL_PROFILE,
        "phases": [phase], "steps": [step],
        "id": "g03-host-1", "digest": "c" * 64,
        "toBundleDigest": "d" * 64, "fromBundleDigest": "e" * 64,
        "predecessor": {"id": "prior", "digest": "f" * 64},
        "previous": {"bundleDigest": "e" * 64,
                      "configuration": {"schema": "app"}},
        "next": {"bundleDigest": "d" * 64,
                 "configuration": {"schema": "app"},
                 "expectedCatalog": {"columns": [{"table": "items",
                     "field": {"module": "demo", "element": "total"},
                     "sourcePath": _PATH[:-len("/default")]}]}},
    }


class FakePhase:
    def __init__(self, lease):
        self.lease = lease

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def verify_boundary(self, plan, phase, prior):
        self.lease.boundary_checks += 1

    def observe_prefix(self, plan):
        return self.lease.witness

    def execute_statement(self, statement):
        self.lease.statements.append(statement)

    def execute_data_step(self, plan, step):
        raise AssertionError("G03 must never dispatch a data operation")

    def record_completion(self, receipt):
        self.lease.stored = receipt
        if self.lease.lose_commit:
            raise HostOutcomeUnknown("simulated COMMIT response loss")


class FakeLease:
    target = TargetIdentity("postgresql", "local-postgresql18", "test-installation",
                            42, "testdb", "app", "demo", "app_owner")

    def __init__(self, *, prior=None, lose_commit=False, absent_after_unknown=False,
                 bad_approval=False):
        self.stored = prior
        self.lose_commit = lose_commit
        self.absent_after_unknown = absent_after_unknown
        self.bad_approval = bad_approval
        self.witness = {"native": "same-before-and-after"}
        self.statements = []
        self.acquired = 0
        self.fenced = 0
        self.finalized = 0
        self.boundary_checks = 0
        self._binding = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read_approval(self, binding):
        self._binding = binding
        digest = "0" * 64 if self.bad_approval else binding.digest
        return ApprovalReceipt("approval-1", digest, "approved", "reviewer",
            datetime.now(timezone.utc).isoformat(), binding.qualification_profile,
            binding.evidence_digest)

    def verify_predecessor(self, request):
        pass

    def observe_final_publication(self, request, approval):
        return None

    def read_progress(self, binding):
        if self.absent_after_unknown and self.statements:
            return None
        return self.stored

    def observe_prefix(self, plan):
        return self.witness

    def begin(self, request, initial):
        self.stored = initial

    def fence_head(self, request):
        self.fenced += 1

    def required_phase(self, phase, *, prior):
        return FakePhase(self)

    def finalize(self, request, approval):
        self.finalized += 1
        return {"status": "committed", "generation": 2}


class FakeHost:
    capabilities = HostCapabilities(*(True for _ in range(10)))

    def __init__(self, lease):
        self.lease = lease

    @contextmanager
    def acquire(self, plan, *, expected_head, file_digest):
        self.lease.acquired += 1
        yield self.lease


def run(plan, lease):
    host = FakeHost(lease)
    with patch("umf_access.lifecycle.ledger._verified_plan", side_effect=lambda value: value), \
         patch("umf_access.lifecycle.ledger._authorize_new_effects"):
        result = apply_migration_on_host(host, plan, expected_head="1" * 64,
            file_digest="2" * 64, qualification_profile="local-g03",
            evidence_digest="3" * 64, approval_id="approval-1")
    return host, result


class G03HostTests(unittest.TestCase):
    def test_catalog_equal_witness_still_dispatches_one_ddl_phase(self):
        plan = g03_plan()
        lease = FakeLease()
        host, result = run(plan, lease)
        self.assertEqual(_verified_phases(plan), plan["phases"])
        self.assertEqual(lease.statements, [plan["steps"][0]["sql"]])
        self.assertEqual(lease.witness, {"native": "same-before-and-after"})
        self.assertEqual(result["status"], "committed")
        self.assertEqual(lease.finalized, 1)

    def test_authenticated_complete_progress_finalizes_without_redispatch(self):
        plan = g03_plan()
        phase = plan["phases"][0]
        receipt = PhaseReceipt(1, _phase_digest(phase, plan["steps"]),
                               ("step-00001",), {"native": "same-before-and-after"})
        lease = FakeLease(prior=receipt)
        host, result = run(plan, lease)
        self.assertEqual(lease.statements, [])
        self.assertEqual(lease.fenced, 1)
        self.assertEqual(lease.finalized, 1)
        self.assertEqual(result["status"], "committed")

    def test_lost_phase_commit_is_observed_and_not_redispatched(self):
        plan = g03_plan()
        lease = FakeLease(lose_commit=True)
        host, result = run(plan, lease)
        self.assertEqual(len(lease.statements), 1)
        self.assertEqual(lease.stored.phase_index, 1)
        self.assertEqual(lease.stored.completed_steps, ("step-00001",))
        self.assertEqual(lease.finalized, 1)
        self.assertEqual(result["status"], "committed")

    def test_unknown_outcome_without_progress_refuses_same_call_retry(self):
        plan = g03_plan()
        lease = FakeLease(lose_commit=True, absent_after_unknown=True)
        with self.assertRaisesRegex(CatalogError, "migration-outcome-unknown-observe-progress"):
            run(plan, lease)
        self.assertEqual(len(lease.statements), 1)
        self.assertEqual(lease.finalized, 0)

    def test_g03_phase_shape_rejects_extra_or_mismatched_effects(self):
        mutations = [
            lambda value: value["phases"].append({"id": "phase-00002", "kind": "default-change",
                "transaction": "required", "steps": ["step-00001"]}),
            lambda value: value["phases"][0].update(transaction="forbidden"),
            lambda value: value["phases"][0].update(kind="transaction"),
            lambda value: value["steps"][0].update(phaseOperation="install-default"),
            lambda value: value["steps"][0].update(operation="backfill"),
            lambda value: value["steps"][0].update(sourcePath=_PATH + "/other"),
            lambda value: value["options"]["validations"].append({"unexpected": True}),
        ]
        for mutate in mutations:
            value = g03_plan()
            mutate(value)
            with self.subTest(mutation=mutate):
                with self.assertRaises(CatalogError):
                    _verified_phases(value)

    def test_bad_approval_and_progress_refuse_before_ddl(self):
        plan = g03_plan()
        lease = FakeLease(bad_approval=True)
        with self.assertRaisesRegex(CatalogError, "approval-receipt-mismatch"):
            run(plan, lease)
        self.assertEqual(lease.statements, [])

        plan = g03_plan()
        receipt = PhaseReceipt(1, "0" * 64, ("wrong-step",), {"native": "same-before-and-after"})
        lease = FakeLease(prior=receipt)
        with self.assertRaises(CatalogError):
            run(plan, lease)
        self.assertEqual(lease.statements, [])

    def test_cli_and_ordinary_mixed_runner_keep_separate_admission(self):
        from umf_access.lifecycle.cli import _require_host_profile
        from umf_access.lifecycle.mixed import apply_mixed_migration

        for plan_version, options_version in (
                ("umf.table-migration/0.3", "umf.table-migration-options/0.3"),
                ("umf.table-migration/0.4", "umf.table-migration-options/0.4"),
                ("umf.table-migration/0.5", "umf.table-migration-options/0.5")):
            candidate = g03_plan()
            candidate["version"] = plan_version
            candidate["options"]["version"] = options_version
            _require_host_profile(candidate)

        crossed = g03_plan()
        crossed["version"] = "umf.table-migration/0.4"
        with self.assertRaisesRegex(CatalogError, "host-migration-profile"):
            _require_host_profile(crossed)

        candidate = g03_plan()
        with patch("umf_access.lifecycle.mixed._verified_plan", side_effect=lambda value: value):
            with self.assertRaisesRegex(CatalogError, "mixed-phase-profile"):
                apply_mixed_migration(object(), candidate, approved_digest=candidate["digest"],
                                      expected_head="1" * 64, person_roles=())

    def test_wrong_target_and_crossed_profiles_refuse_before_acquire(self):
        plan = g03_plan()
        plan["steps"][0]["phaseTarget"] = {"table": "other", "field": _TARGET["field"]}
        lease = FakeLease()
        with self.assertRaisesRegex(CatalogError, "mixed-phase-profile"):
            run(plan, lease)
        self.assertEqual(lease.acquired, 0)

        for plan_version, options_version in (
                ("umf.table-migration/0.4", "umf.table-migration-options/0.5"),
                ("umf.table-migration/0.5", "umf.table-migration-options/0.4")):
            forged = g03_plan()
            forged["version"] = plan_version
            forged["options"]["version"] = options_version
            lease = FakeLease()
            with self.assertRaisesRegex(CatalogError, "host-migration-profile"):
                run(forged, lease)
            self.assertEqual(lease.acquired, 0)

    def test_g11_host_dispatch_remains_fail_closed_before_host_custody(self):
        candidate = g03_plan()
        candidate['version'] = 'umf.table-migration/0.6'
        candidate['options']['version'] = 'umf.table-migration-options/0.6'
        candidate['executionProfile'] = {
            'version': 'umf.table-migration-execution/0.5',
            'progressRelation': 'umf_lifecycle_progress', 'ownerOnly': True}
        lease = FakeLease()
        host = FakeHost(lease)
        with patch("umf_access.lifecycle.ledger._verified_plan", side_effect=lambda value: value):
            with self.assertRaisesRegex(CatalogError, 'host-migration-profile'):
                apply_migration_on_host(host, candidate, expected_head='1' * 64,
                    file_digest='2' * 64, qualification_profile='local-g11',
                    evidence_digest='3' * 64)
        self.assertEqual(lease.acquired, 0)
        from umf_access.lifecycle.cli import _require_host_profile
        with self.assertRaisesRegex(CatalogError, 'host-migration-profile'):
            _require_host_profile(candidate)


if __name__ == "__main__":
    unittest.main()
