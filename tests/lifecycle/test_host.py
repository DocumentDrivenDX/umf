# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure contract checks for U5 host capabilities and approval bindings."""
import unittest

from umf_access.lifecycle import CatalogError
from umf_access.lifecycle.approval import ApprovalBinding, ApprovalReceipt, TargetIdentity
from umf_access.lifecycle.host import HostCapabilities


class MigrationHostContracts(unittest.TestCase):
    def setUp(self):
        self.target = TargetIdentity(
            engine="postgresql", profile="postgresql/18.6",
            system_id="7351243056048184231", database_oid=16384,
            database="umf_test", schema="legal_lifecycle",
            module="legal_lifecycle", owner_role="legal_lifecycle_owner",
        )
        self.binding = ApprovalBinding(
            target=self.target, migration_id="legal_lifecycle-004",
            plan_digest="a" * 64, file_digest="b" * 64,
            source_bundle_digest="c" * 64, expected_head="d" * 64,
            phase_digests=("e" * 64, "f" * 64),
            qualification_profile="postgresql/18.6-mixed-v1",
            evidence_digest="1" * 64,
        )

    def test_binding_digest_closes_over_target_source_file_head_and_ordered_phases(self):
        digest = self.binding.digest
        changed = ApprovalBinding(
            target=self.target, migration_id=self.binding.migration_id,
            plan_digest=self.binding.plan_digest, file_digest="2" * 64,
            source_bundle_digest=self.binding.source_bundle_digest,
            expected_head=self.binding.expected_head,
            phase_digests=self.binding.phase_digests,
            qualification_profile=self.binding.qualification_profile,
            evidence_digest=self.binding.evidence_digest,
        )
        self.assertNotEqual(digest, changed.digest)
        reordered = ApprovalBinding(
            target=self.target, migration_id=self.binding.migration_id,
            plan_digest=self.binding.plan_digest, file_digest=self.binding.file_digest,
            source_bundle_digest=self.binding.source_bundle_digest,
            expected_head=self.binding.expected_head,
            phase_digests=tuple(reversed(self.binding.phase_digests)),
            qualification_profile=self.binding.qualification_profile,
            evidence_digest=self.binding.evidence_digest,
        )
        self.assertNotEqual(digest, reordered.digest)

    def test_receipt_must_match_exact_binding_and_accepted_native_evidence(self):
        receipt = ApprovalReceipt(
            receipt_id="57ec6bb3-47c4-4b51-96ad-5741697fa38c",
            binding_digest=self.binding.digest, decision="approved",
            decider="migration_admin", decided_at="2026-10-21T14:00:00+00:00",
            qualification_profile=self.binding.qualification_profile,
            evidence_digest=self.binding.evidence_digest,
        )
        receipt.verify(self.binding)
        wrong_evidence = ApprovalBinding(
            target=self.target, migration_id=self.binding.migration_id,
            plan_digest=self.binding.plan_digest, file_digest=self.binding.file_digest,
            source_bundle_digest=self.binding.source_bundle_digest,
            expected_head=self.binding.expected_head,
            phase_digests=self.binding.phase_digests,
            qualification_profile=self.binding.qualification_profile,
            evidence_digest="2" * 64,
        )
        with self.assertRaisesRegex(CatalogError, "approval-receipt-mismatch"):
            receipt.verify(wrong_evidence)

    def test_host_capabilities_refuse_statement_only_or_unfenced_adapters(self):
        valid = HostCapabilities(True, True, True, True, True, True,
                                 True, True, True, True)
        valid.require(uses_concurrent=True)
        invalid = HostCapabilities(True, True, True, True, False, True,
                                   True, True, True, True)
        with self.assertRaisesRegex(CatalogError, "host-capability-unsupported"):
            invalid.require(uses_concurrent=False)
        without_autocommit = HostCapabilities(True, True, True, True, True, True,
                                              True, True, True, False)
        with self.assertRaisesRegex(CatalogError, "host-capability-unsupported"):
            without_autocommit.require(uses_concurrent=True)


if __name__ == "__main__":
    unittest.main()
