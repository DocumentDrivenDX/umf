# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import unittest

from umf_access.lifecycle.catalog import CatalogError
from umf_access.lifecycle.generation_ingress import (
    GenerationAdmission, GenerationIngressProvider, TargetCustodian,
    TargetCustody, OwnerEnrollmentRequest, EpochProvisionRequest,
    EpochProvisionReservation,
)
from umf_access.lifecycle.phase_policy import (
    DERIVED_ADMIN_MODULE_PROFILE,
    FieldReplacementExecutionPolicy,
    PhaseBudgetCounter,
    PhaseDeadline,
    _ConfirmedAbortProof,
    _validated_marker_rows,
    require_original_policy,
    require_retry_after_confirmed_abort,
    validate_phase_budget_receipt,
)


class G11ExecutionPolicyTests(unittest.TestCase):
    def test_policy_defaults_are_immutable_and_have_exact_canonical_binding(self):
        policy = FieldReplacementExecutionPolicy()
        expected = (b'{"aggregateAffectedRows":100000,'
                    b'"derivedModuleProfile":"weft.table-operation-module/0.2",'
                    b'"lockTimeoutMs":5000,"phaseTimeoutMs":30000,'
                    b'"statementTimeoutMs":30000,'
                    b'"version":"umf.g11.execution-policy/0.1"}')
        self.assertEqual(policy.canonical_bytes(), expected)
        self.assertEqual(policy.digest, __import__('hashlib').sha256(expected).hexdigest())
        self.assertEqual(policy.normal_form()['derivedModuleProfile'],
                         DERIVED_ADMIN_MODULE_PROFILE)
        with self.assertRaises((AttributeError, TypeError)):
            policy.phase_timeout_ms = 10

    def test_policy_rejects_boolean_unknown_and_out_of_range_values(self):
        bad_values = [
            {'phase_timeout_ms': True},
            {'aggregate_affected_rows': False},
            {'statement_timeout_ms': True},
            {'lock_timeout_ms': False},
            {'unknown': 1},
            {'phase_timeout_ms': 0},
            {'phase_timeout_ms': 300_001},
            {'aggregate_affected_rows': -1},
            {'aggregate_affected_rows': 1_000_001},
            {'phase_timeout_ms': 10, 'statement_timeout_ms': 11},
            {'statement_timeout_ms': 10, 'lock_timeout_ms': 11},
        ]
        for values in bad_values:
            with self.subTest(values=values):
                with self.assertRaisesRegex(CatalogError, 'phase-policy-invalid'):
                    FieldReplacementExecutionPolicy.from_trusted_mapping(values)

    def test_original_policy_digest_is_mandatory_across_resume(self):
        initial = FieldReplacementExecutionPolicy()
        resumed = FieldReplacementExecutionPolicy(
            aggregate_affected_rows=99_999)
        require_original_policy(initial, initial.digest)
        with self.assertRaisesRegex(CatalogError, 'phase-policy-mismatch'):
            require_original_policy(resumed, initial.digest)
        with self.assertRaisesRegex(CatalogError, 'phase-policy-mismatch'):
            require_original_policy(initial, 'a' * 63)

    def test_deadline_clamps_each_dispatch_and_commit_to_positive_remaining(self):
        now = [1_000_000_000]
        policy = FieldReplacementExecutionPolicy(
            phase_timeout_ms=10, statement_timeout_ms=8, lock_timeout_ms=5)
        deadline = PhaseDeadline(policy, clock_ns=lambda: now[0])
        self.assertEqual(deadline.native_transaction_timeout_ms, 10)
        self.assertEqual(deadline.before_dispatch().statement_timeout_ms, 8)
        self.assertEqual(deadline.before_dispatch().lock_timeout_ms, 5)
        now[0] += 7_000_000
        self.assertEqual(deadline.before_commit().statement_timeout_ms, 3)
        self.assertEqual(deadline.before_commit().lock_timeout_ms, 3)
        now[0] += 3_000_000
        with self.assertRaisesRegex(CatalogError, 'phase-deadline-exceeded'):
            deadline.before_dispatch()
        with self.assertRaisesRegex(CatalogError, 'phase-clock-invalid'):
            PhaseDeadline(policy, clock_ns=lambda: True)

    def test_actual_marker_rows_are_charged_once_per_fill_including_same_row(self):
        policy = FieldReplacementExecutionPolicy(aggregate_affected_rows=3)
        counter = PhaseBudgetCounter(policy)
        two_rows = _validated_marker_rows(
            ['umf_affected'], 'umf_affected', [(1,), (1,)], 2)
        one_row = _validated_marker_rows(
            ['umf_affected'], 'umf_affected', [(1,)], 1)
        counter.charge(step_id='step-00001', operation='first',
                      validated_rows=two_rows)
        counter.charge(step_id='step-00002', operation='second',
                      validated_rows=one_row)
        receipt = counter.receipt()
        self.assertEqual(receipt, {
            'profile': 'umf.g11.phase-budget-receipt/0.1',
            'policyDigest': policy.digest,
            'affectedRows': 3,
            'fillEffects': [
                {'stepId': 'step-00001', 'operation': 'first', 'rows': 2},
                {'stepId': 'step-00002', 'operation': 'second', 'rows': 1},
            ],
            'nativeTransactionTimeoutMs': 30_000,
        })
        validate_phase_budget_receipt(receipt, policy)

    def test_zero_effect_fill_and_no_fill_have_distinct_receipts(self):
        policy = FieldReplacementExecutionPolicy(aggregate_affected_rows=0)
        no_fill = PhaseBudgetCounter(policy).receipt()
        invoked_empty_fill = PhaseBudgetCounter(policy)
        invoked_empty_fill.charge(
            step_id='step-00001', operation='fill',
            validated_rows=_validated_marker_rows(
                ['umf_affected'], 'umf_affected', [], 1))
        empty_fill = invoked_empty_fill.receipt()
        self.assertEqual(no_fill['affectedRows'], 0)
        self.assertEqual(no_fill['fillEffects'], [])
        self.assertEqual(empty_fill['affectedRows'], 0)
        self.assertEqual(empty_fill['fillEffects'], [
            {'stepId': 'step-00001', 'operation': 'fill', 'rows': 0}])

    def test_later_fill_overflow_poison_refuses_receipt_dispatch_and_commit(self):
        policy = FieldReplacementExecutionPolicy(aggregate_affected_rows=2)
        counter = PhaseBudgetCounter(policy)
        two = _validated_marker_rows(
            ['umf_affected'], 'umf_affected', [(1,), (1,)], 2)
        one = _validated_marker_rows(
            ['umf_affected'], 'umf_affected', [(1,)], 1)
        counter.charge(step_id='step-00001', operation='first', validated_rows=two)
        before = copy.deepcopy(counter.receipt())
        with self.assertRaisesRegex(CatalogError, 'phase-budget-exceeded'):
            counter.charge(step_id='step-00002', operation='second', validated_rows=one)
        self.assertEqual(counter.affected_rows, before['affectedRows'])
        for action in (counter.receipt, counter.before_dispatch, counter.before_commit):
            with self.subTest(action=action.__name__):
                with self.assertRaisesRegex(CatalogError, 'phase-budget-poisoned'):
                    action()

    def test_invalid_late_marker_poison_refuses_receipt_and_commit(self):
        counter = PhaseBudgetCounter(FieldReplacementExecutionPolicy())
        counter.charge_marker(
            step_id='step-00001', operation='first',
            column_names=['umf_affected'], expected_marker='umf_affected',
            rows=[(1,)], max_rows=1)
        with self.assertRaisesRegex(CatalogError, 'phase-budget-marker-invalid'):
            counter.charge_marker(
                step_id='step-00002', operation='second',
                column_names=['wrong'], expected_marker='umf_affected',
                rows=[(1,)], max_rows=1)
        with self.assertRaisesRegex(CatalogError, 'phase-budget-poisoned'):
            counter.receipt()
        with self.assertRaisesRegex(CatalogError, 'phase-budget-poisoned'):
            counter.before_commit()

    def test_fill_effect_identity_and_256_entry_bound_are_enforced(self):
        zero = _validated_marker_rows(
            ['umf_affected'], 'umf_affected', [], 1)
        duplicate = PhaseBudgetCounter(FieldReplacementExecutionPolicy())
        duplicate.charge(step_id='step-00001', operation='same', validated_rows=zero)
        with self.assertRaisesRegex(CatalogError, 'phase-budget-marker-invalid'):
            duplicate.charge(step_id='step-00001', operation='same', validated_rows=zero)
        with self.assertRaisesRegex(CatalogError, 'phase-budget-poisoned'):
            duplicate.receipt()

        bad = PhaseBudgetCounter(FieldReplacementExecutionPolicy())
        for step in ('step-1', 'step-00001x'):
            with self.subTest(step=step):
                with self.assertRaisesRegex(CatalogError, 'phase-budget-marker-invalid'):
                    bad.charge(step_id=step, operation='op', validated_rows=zero)
                with self.assertRaisesRegex(CatalogError, 'phase-budget-poisoned'):
                    bad.receipt()
            bad = PhaseBudgetCounter(FieldReplacementExecutionPolicy())
        with self.assertRaisesRegex(CatalogError, 'phase-budget-marker-invalid'):
            bad.charge(step_id='step-00001', operation='x' * 257, validated_rows=zero)
        with self.assertRaisesRegex(CatalogError, 'phase-budget-poisoned'):
            bad.before_dispatch()

        bounded = PhaseBudgetCounter(FieldReplacementExecutionPolicy())
        for index in range(1, 257):
            bounded.charge(step_id=f'step-{index:05d}', operation='op',
                           validated_rows=zero)
        self.assertEqual(len(bounded.receipt()['fillEffects']), 256)
        with self.assertRaisesRegex(CatalogError, 'phase-budget-marker-invalid'):
            bounded.charge(step_id='step-00257', operation='op', validated_rows=zero)
        with self.assertRaisesRegex(CatalogError, 'phase-budget-poisoned'):
            bounded.receipt()

    def test_marker_shape_and_per_fill_max_rows_are_checked_before_aggregate_charge(self):
        invalid = [
            (['wrong'], 'umf_affected', [(1,)], 1),
            (['umf_affected', 'extra'], 'umf_affected', [(1,)], 1),
            (['umf_affected'], 'umf_affected', [(0,)], 1),
            (['umf_affected'], 'umf_affected', [(True,)], 1),
            (['umf_affected'], 'umf_affected', [(1,), (1,)], 1),
            (['umf_affected'], 'umf_affected', [], True),
        ]
        for args in invalid:
            with self.subTest(args=args):
                with self.assertRaisesRegex(CatalogError, 'phase-budget-marker-invalid'):
                    _validated_marker_rows(*args)

    def test_receipt_rejects_extra_fields_boolean_counts_and_wrong_sum(self):
        policy = FieldReplacementExecutionPolicy()
        base = PhaseBudgetCounter(policy).receipt()
        mutations = [
            lambda value: value.update(extra=True),
            lambda value: value.update(affectedRows=True),
            lambda value: value.update(nativeTransactionTimeoutMs=True),
            lambda value: value.update(fillEffects=[{'stepId': 's', 'operation': 'o', 'rows': 1}]),
        ]
        for mutate in mutations:
            value = copy.deepcopy(base)
            mutate(value)
            with self.subTest(value=value):
                with self.assertRaisesRegex(CatalogError, 'phase-budget-receipt-invalid'):
                    validate_phase_budget_receipt(value, policy)

    def test_fresh_retry_requires_nonserializable_native_abort_proof(self):
        policy = FieldReplacementExecutionPolicy()
        abort_parameters = __import__('inspect').signature(
            _ConfirmedAbortProof).parameters
        self.assertIn('phase_completion_absent', abort_parameters)
        self.assertNotIn('progress_absent', abort_parameters)
        for forged in (True, {}, {'rollbackConfirmed': True}):
            with self.subTest(forged=forged):
                with self.assertRaisesRegex(CatalogError, 'phase-retry-native-proof-required'):
                    require_retry_after_confirmed_abort(policy, policy.digest, forged)

    def test_ingress_protocol_types_do_not_mint_native_capabilities(self):
        for capability in (TargetCustody, GenerationAdmission,
                           OwnerEnrollmentRequest, EpochProvisionRequest,
                           EpochProvisionReservation):
            with self.subTest(capability=capability.__name__):
                with self.assertRaisesRegex(TypeError, 'issued by a trusted provider'):
                    capability(None, None, None)
        self.assertTrue(hasattr(GenerationIngressProvider, '__protocol_attrs__')
                        or getattr(GenerationIngressProvider, '_is_protocol', False))
        self.assertTrue(hasattr(TargetCustodian, '__protocol_attrs__')
                        or getattr(TargetCustodian, '_is_protocol', False))
        self.assertEqual(
            TargetCustodian.register_target.__annotations__['owner_enrollment'],
            'OwnerEnrollmentRequest')
        self.assertEqual(
            TargetCustodian.reserve_epoch_provision.__annotations__['request'],
            'EpochProvisionRequest')
        self.assertEqual(
            TargetCustodian.reserve_epoch_provision.__annotations__['return'],
            'EpochProvisionReservation')
        self.assertEqual(
            GenerationIngressProvider.prepare_epoch_provision_request.__annotations__['return'],
            'EpochProvisionRequest')
        self.assertEqual(
            GenerationIngressProvider.provision_disabled_epoch.__annotations__['reservation'],
            'EpochProvisionReservation')
        self.assertEqual(
            TargetCustodian.observe_epoch_provision.__annotations__['reservation'],
            'EpochProvisionReservation')
        self.assertEqual(
            TargetCustodian.confirm_epoch_provision.__annotations__['reservation'],
            'EpochProvisionReservation')
        self.assertEqual(
            TargetCustodian.reserve_transition.__annotations__['request'],
            'GenerationIngressRequest')


if __name__ == '__main__':
    unittest.main()
