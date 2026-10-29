# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import hashlib
import unittest

from umf_access.lifecycle.catalog import CatalogError
from umf_access.lifecycle.conversion_policy import (
    DEFAULT_CONVERSION_ENTRY_LIMIT,
    DEFAULT_MAX_ISSUED_INSTANCES,
    DEFAULT_RETAINED_LOGICAL_BYTES_LIMIT,
    G04_EXECUTION_POLICY_01,
    G04_EXECUTION_POLICY_02,
    MAX_CONVERSION_ENTRY_LIMIT,
    MAX_ISSUED_INSTANCES,
    MAX_RETAINED_LOGICAL_BYTES_LIMIT,
    G04ExecutionPolicy,
    require_original_policy,
)
from umf_access.lifecycle.phase_policy import FieldReplacementExecutionPolicy


class G04ConversionPolicyTests(unittest.TestCase):
    def test_trusted_nonretained_defaults_keep_exact_01_profile(self):
        policy = G04ExecutionPolicy.trusted_nonretained()
        value = policy.normal_form()
        self.assertEqual(set(value), {
            'version', 'phasePolicy', 'conversionEntryLimit', 'retainedLogicalBytesLimit',
        })
        self.assertEqual(value['version'], G04_EXECUTION_POLICY_01)
        self.assertEqual(value['conversionEntryLimit'], DEFAULT_CONVERSION_ENTRY_LIMIT)
        self.assertEqual(value['retainedLogicalBytesLimit'],
                         DEFAULT_RETAINED_LOGICAL_BYTES_LIMIT)
        self.assertNotIn('maxIssuedInstances', value)
        self.assertEqual(
            policy.canonical_bytes(),
            b'{"conversionEntryLimit":100000,"phasePolicy":{'
            b'"aggregateAffectedRows":100000,'
            b'"derivedModuleProfile":"weft.table-operation-module/0.2",'
            b'"lockTimeoutMs":5000,"phaseTimeoutMs":30000,'
            b'"statementTimeoutMs":30000,'
            b'"version":"umf.g11.execution-policy/0.1"},'
            b'"retainedLogicalBytesLimit":67108864,'
            b'"version":"umf.g04.execution-policy/0.1"}',
        )
        self.assertEqual(policy.digest, hashlib.sha256(policy.canonical_bytes()).hexdigest())
        with self.assertRaises((AttributeError, TypeError)):
            policy.conversion_entry_limit = 1

    def test_trusted_retained_defaults_emit_explicit_02_capacity(self):
        policy = G04ExecutionPolicy.trusted_retained()
        self.assertEqual(policy.version, G04_EXECUTION_POLICY_02)
        self.assertEqual(policy.normal_form()['maxIssuedInstances'],
                         DEFAULT_MAX_ISSUED_INSTANCES)
        self.assertEqual(
            policy.canonical_bytes(),
            b'{"conversionEntryLimit":100000,"maxIssuedInstances":1000000,'
            b'"phasePolicy":{"aggregateAffectedRows":100000,'
            b'"derivedModuleProfile":"weft.table-operation-module/0.2",'
            b'"lockTimeoutMs":5000,"phaseTimeoutMs":30000,'
            b'"statementTimeoutMs":30000,'
            b'"version":"umf.g11.execution-policy/0.1"},'
            b'"retainedLogicalBytesLimit":67108864,'
            b'"version":"umf.g04.execution-policy/0.2"}',
        )
        self.assertEqual(
            G04ExecutionPolicy.from_signed_normal_form(
                policy.normal_form(), retained_originals=True), policy)

    def test_signed_wire_roundtrip_preserves_complete_g11_phase_policy(self):
        phase = FieldReplacementExecutionPolicy(
            phase_timeout_ms=120_000, aggregate_affected_rows=17_000,
            statement_timeout_ms=90_000, lock_timeout_ms=2_000,
        )
        for policy, retained in (
            (G04ExecutionPolicy.trusted_nonretained(phase_policy=phase), False),
            (G04ExecutionPolicy.trusted_retained(phase_policy=phase), True),
        ):
            with self.subTest(version=policy.version):
                decoded = G04ExecutionPolicy.from_signed_normal_form(
                    policy.normal_form(), retained_originals=retained)
                self.assertEqual(decoded.normal_form(), policy.normal_form())
                self.assertEqual(decoded.digest, policy.digest)
                self.assertEqual(decoded.phase_policy, phase)

    def test_retained_mode_requires_02_and_nonretained_requires_01(self):
        old = G04ExecutionPolicy.trusted_nonretained().normal_form()
        retained = G04ExecutionPolicy.trusted_retained().normal_form()
        for value, mode in ((old, True), (retained, False)):
            with (self.subTest(value=value['version'], mode=mode),
                  self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid')):
                G04ExecutionPolicy.from_signed_normal_form(value, retained_originals=mode)
        with self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid'):
            G04ExecutionPolicy.from_signed_normal_form(old, retained_originals=1)

    def test_signed_02_never_defaults_missing_issued_capacity(self):
        value = G04ExecutionPolicy.trusted_retained().normal_form()
        del value['maxIssuedInstances']
        with self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid'):
            G04ExecutionPolicy.from_signed_normal_form(value, retained_originals=True)
        with self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid'):
            G04ExecutionPolicy(
                G04_EXECUTION_POLICY_02, FieldReplacementExecutionPolicy(),
                DEFAULT_CONVERSION_ENTRY_LIMIT, DEFAULT_RETAINED_LOGICAL_BYTES_LIMIT,
            )

    def test_signed_wire_rejects_unknown_or_missing_members_at_each_level(self):
        base = G04ExecutionPolicy.trusted_retained().normal_form()
        mutations = []
        unknown = copy.deepcopy(base)
        unknown['futureLimit'] = 1
        mutations.append(unknown)
        missing = copy.deepcopy(base)
        del missing['conversionEntryLimit']
        mutations.append(missing)
        nested_unknown = copy.deepcopy(base)
        nested_unknown['phasePolicy']['futureSetting'] = 1
        mutations.append(nested_unknown)
        nested_missing = copy.deepcopy(base)
        del nested_missing['phasePolicy']['lockTimeoutMs']
        mutations.append(nested_missing)
        for value in mutations:
            with (self.subTest(value=value),
                  self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid')):
                G04ExecutionPolicy.from_signed_normal_form(value, retained_originals=True)

    def test_signed_wire_rejects_wrong_versions_and_phase_profiles(self):
        base = G04ExecutionPolicy.trusted_retained().normal_form()
        mutations = []
        wrong_version = copy.deepcopy(base)
        wrong_version['version'] = 'umf.g04.execution-policy/0.3'
        mutations.append(wrong_version)
        wrong_phase = copy.deepcopy(base)
        wrong_phase['phasePolicy']['version'] = 'umf.g11.execution-policy/0.2'
        mutations.append(wrong_phase)
        wrong_module = copy.deepcopy(base)
        wrong_module['phasePolicy']['derivedModuleProfile'] = 'other/module/0.1'
        mutations.append(wrong_module)
        for value in mutations:
            with (self.subTest(value=value),
                  self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid')):
                G04ExecutionPolicy.from_signed_normal_form(value, retained_originals=True)

    def test_limits_accept_exact_boundaries_and_reject_bool_or_out_of_range(self):
        for lower, upper in ((0, 0), (MAX_CONVERSION_ENTRY_LIMIT,
                                         MAX_CONVERSION_ENTRY_LIMIT)):
            G04ExecutionPolicy.trusted_nonretained(conversion_entry_limit=lower)
            G04ExecutionPolicy.trusted_nonretained(conversion_entry_limit=upper)
        for lower, upper in ((0, 0), (MAX_RETAINED_LOGICAL_BYTES_LIMIT,
                                         MAX_RETAINED_LOGICAL_BYTES_LIMIT)):
            G04ExecutionPolicy.trusted_nonretained(retained_logical_bytes_limit=lower)
            G04ExecutionPolicy.trusted_nonretained(retained_logical_bytes_limit=upper)
        G04ExecutionPolicy.trusted_retained(max_issued_instances=1)
        G04ExecutionPolicy.trusted_retained(max_issued_instances=MAX_ISSUED_INSTANCES)
        invalid = [
            {'conversion_entry_limit': True},
            {'conversion_entry_limit': -1},
            {'conversion_entry_limit': MAX_CONVERSION_ENTRY_LIMIT + 1},
            {'retained_logical_bytes_limit': False},
            {'retained_logical_bytes_limit': -1},
            {'retained_logical_bytes_limit': MAX_RETAINED_LOGICAL_BYTES_LIMIT + 1},
        ]
        for kwargs in invalid:
            with (self.subTest(kwargs=kwargs),
                  self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid')):
                G04ExecutionPolicy.trusted_nonretained(**kwargs)
        for capacity in (True, 0, MAX_ISSUED_INSTANCES + 1, 1.0):
            with (self.subTest(capacity=capacity),
                  self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid')):
                G04ExecutionPolicy.trusted_retained(max_issued_instances=capacity)

    def test_signed_wire_rejects_bool_numeric_and_wrong_nested_types(self):
        base = G04ExecutionPolicy.trusted_retained().normal_form()
        for key, value in (
            ('conversionEntryLimit', True),
            ('conversionEntryLimit', 1.0),
            ('retainedLogicalBytesLimit', False),
            ('maxIssuedInstances', True),
        ):
            changed = copy.deepcopy(base)
            changed[key] = value
            with (self.subTest(key=key, value=value),
                  self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid')):
                G04ExecutionPolicy.from_signed_normal_form(
                    changed, retained_originals=True)
        changed = copy.deepcopy(base)
        changed['phasePolicy']['phaseTimeoutMs'] = True
        with self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid'):
            G04ExecutionPolicy.from_signed_normal_form(changed, retained_originals=True)
        with self.assertRaisesRegex(CatalogError, 'g04-execution-policy-invalid'):
            G04ExecutionPolicy.from_signed_normal_form([], retained_originals=True)

    def test_resume_requires_original_complete_policy_digest(self):
        original = G04ExecutionPolicy.trusted_retained()
        require_original_policy(original, original.digest)
        changed = G04ExecutionPolicy.trusted_retained(max_issued_instances=999_999)
        with self.assertRaisesRegex(CatalogError, 'g04-execution-policy-mismatch'):
            require_original_policy(changed, original.digest)
        for digest in ('a' * 63, 'A' * 64, 4):
            with (self.subTest(digest=digest),
                  self.assertRaisesRegex(CatalogError, 'g04-execution-policy-mismatch')):
                require_original_policy(original, digest)

    def test_policy_digest_binds_phase_policy_and_limits(self):
        base = G04ExecutionPolicy.trusted_retained()
        variants = [
            G04ExecutionPolicy.trusted_retained(conversion_entry_limit=99_999),
            G04ExecutionPolicy.trusted_retained(retained_logical_bytes_limit=99_999),
            G04ExecutionPolicy.trusted_retained(
                phase_policy=FieldReplacementExecutionPolicy(aggregate_affected_rows=99_999)),
        ]
        self.assertEqual(len({base.digest, *(item.digest for item in variants)}), 4)


if __name__ == '__main__':
    unittest.main()
