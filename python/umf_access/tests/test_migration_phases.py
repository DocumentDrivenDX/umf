# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import unittest
from unittest.mock import patch

from umf_access.lifecycle.catalog import CatalogError
from umf_access.lifecycle.mixed import (
    _verify_backfill_add_target,
    _verify_backfill_tighten_target,
)
from umf_access.lifecycle.progress import _phase_digest, _verified_phases


def plan():
    steps = [
        {'id':'step-00001','kind':'table','transaction':'required','sql':'ALTER TABLE ...'},
        {'id':'step-00002','kind':'backfill','transaction':'required','operation':'fill'},
        {'id':'step-00003','kind':'index','transaction':'forbidden','sql':'CREATE INDEX CONCURRENTLY ...'},
        {'id':'step-00004','kind':'constraint','transaction':'required','operation':'add-not-valid','constraintKind':'check'},
        {'id':'step-00005','kind':'constraint','transaction':'required','operation':'validate','constraintKind':'check'},
    ]
    phases = [
        {'id':'phase-00001','kind':'transaction','transaction':'required','steps':['step-00001']},
        {'id':'phase-00002','kind':'backfill','transaction':'required','steps':['step-00002']},
        {'id':'phase-00003','kind':'concurrent-index','transaction':'forbidden','steps':['step-00003']},
        {'id':'phase-00004','kind':'constraint-add','transaction':'required','steps':['step-00004']},
        {'id':'phase-00005','kind':'constraint-validation','transaction':'required','steps':['step-00005']},
    ]
    return {'version':'umf.table-migration/0.2','options':{'version':'umf.table-migration-options/0.2'},
            'steps':steps,'phases':phases,'executionProfile':{
        'version':'umf.table-migration-execution/0.1',
        'progressRelation':'umf_lifecycle_progress','ownerOnly':True}}


class MigrationPhaseTests(unittest.TestCase):
    def test_phase_coverage_and_hash_are_stable(self):
        value = plan()
        self.assertEqual(_verified_phases(value), value['phases'])
        digest = _phase_digest(value['phases'][1], [value['steps'][1]])
        changed = copy.deepcopy(value['steps'][1])
        changed['operation'] = 'different'
        self.assertNotEqual(digest, _phase_digest(value['phases'][1], [changed]))

    def test_phase_forgery_refuses(self):
        mutations = [
            lambda value: value['phases'].pop(),
            lambda value: value['phases'][1]['steps'].append('step-00001'),
            lambda value: value['phases'][2].update(transaction='required'),
            lambda value: value['phases'][3].update(kind='transaction'),
            lambda value: value['executionProfile'].update(progressRelation='umf_other'),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                value = copy.deepcopy(plan())
                mutate(value)
                with self.assertRaisesRegex(
                        CatalogError, 'mixed-phase-profile'):
                    _verified_phases(value)

    def test_g02_add_fill_tighten_is_one_exact_ordered_phase(self):
        roles = ['add-column','target-check','backfill','install-default','tighten-not-null']
        steps = [
            {'id':f'step-{index:05d}','kind':'backfill' if role=='backfill' else 'table',
             'transaction':'required','sql':'' if role=='backfill' else 'ALTER ...',
             'phaseOperation':role,'phaseTarget':{'table':'items','field':{'module':'m','element':'total'}}}
            for index,role in enumerate(roles,1)
        ]
        value={'version':'umf.table-migration/0.4','options':{'version':'umf.table-migration-options/0.4'},
               'steps':steps,'phases':[{'id':'phase-00001','kind':'backfill-add','transaction':'required',
                                        'steps':[step['id'] for step in steps]}],
               'executionProfile':{'version':'umf.table-migration-execution/0.3',
                                   'progressRelation':'umf_lifecycle_progress','ownerOnly':True},
               'approvalProfile':{'version':'umf.table-migration-approval/0.1',
                                  'relation':'umf_lifecycle_approvals','ownerOnly':True}}
        self.assertEqual(_verified_phases(value),value['phases'])
        for roles_mutation in ([*roles[:1],'backfill','target-check',*roles[3:]],
                               [*roles[:3],'tighten-not-null','install-default']):
            forged=copy.deepcopy(value)
            for step,role in zip(forged['steps'],roles_mutation): step['phaseOperation']=role
            with self.assertRaisesRegex(CatalogError,'mixed-phase-profile'):
                _verified_phases(forged)

    def test_g02_native_boundary_binds_only_null_permitting_target_checks(self):
        target={'table':'items','field':{'module':'m','element':'total'}}
        source_path='/modules/0/extensions/umf.tables/tables/0/columns/3'
        roles=['add-column','target-check','backfill','install-default','tighten-not-null']
        steps=[{'id':f'step-{index:05d}','kind':'backfill' if role=='backfill' else 'table',
                'transaction':'required','sql':'ALTER ...' if role!='backfill' else '',
                'phaseOperation':role,'phaseTarget':target,
                'sourcePath':'/options/backfills/0' if role=='backfill' else source_path+'/domain' if role=='target-check' else source_path,
                'operation':'derive_total' if role=='backfill' else 'apply-default' if role=='install-default' else None}
               for index,role in enumerate(roles,1)]
        steps[1]['sql']='ALTER TABLE "s"."items" ADD CONSTRAINT "umf_d_total" CHECK ("total" >= 0)'
        plan={'version':'umf.table-migration/0.4','options':{'version':'umf.table-migration-options/0.4',
              'backfills':[{'table':'items','column':target['field'],'operation':'derive_total','scopedRows':True}]},
              'previous':{'expectedCatalog':{'columns':[]}},
              'next':{'configuration':{'schema':'s'},'expectedCatalog':{
                  'columns':[{'table':'items','field':target['field'],'sourcePath':source_path,'nullable':False}],
                  'tables':[{'id':'items','name':'items'}],
                  'checks':[{'table':'items','id':'domain:m.total','definitionSql':'CONSTRAINT "umf_d_total" CHECK ("total" >= 0)'}] }},'steps':steps}
        phase={'steps':[step['id'] for step in steps]}
        _verify_backfill_add_target(plan,phase)
        forged=copy.deepcopy(plan);forged['steps'][1]['sourcePath']='/modules/0/extensions/umf.tables/tables/0/checks/0'
        with self.assertRaisesRegex(CatalogError,'mixed-phase-profile'):
            _verify_backfill_add_target(forged,phase)
        forged=copy.deepcopy(plan);forged['options']['backfills'][0]['column']={'module':'m','element':'other'}
        with self.assertRaisesRegex(CatalogError,'mixed-phase-profile'):
            _verify_backfill_add_target(forged,phase)

    def test_legacy_g01_backfill_tighten_correspondence_remains_bound(self):
        target={'table':'items','field':{'module':'m','element':'value'}}
        column={'module':'m','element':'value'}
        steps=[
            {'id':'step-00001','kind':'backfill','transaction':'required','operation':'fill_value',
             'sourcePath':'/options/backfills/0','phaseTarget':target},
            {'id':'step-00002','kind':'table','transaction':'required','phaseOperation':'tighten-not-null',
             'sourcePath':'/modules/0/extensions/umf.tables/tables/0/columns/1','phaseTarget':target},
        ]
        phase={'steps':['step-00001','step-00002']}
        plan={'options':{'backfills':[{'table':'items','column':column,'operation':'fill_value'}]},
              'next':{'expectedCatalog':{'columns':[{'table':'items','field':column,
                    'sourcePath':'/modules/0/extensions/umf.tables/tables/0/columns/1','nullable':False}]}},
              'steps':steps}
        _verify_backfill_tighten_target(plan,phase)
        forged=copy.deepcopy(plan);forged['steps'][1]['sourcePath']='/modules/0/other/column'
        with self.assertRaisesRegex(CatalogError,'mixed-phase-profile'):
            _verify_backfill_tighten_target(forged,phase)

    def test_g11_field_replacement_accepts_one_closed_ordered_atomic_phase(self):
        from umf_access.lifecycle.approval import APPROVAL_PROFILE

        old_field = {'module': 'm', 'element': 'old'}
        new_field = {'module': 'm', 'element': 'new'}
        steps = [
            {'id': 'step-00001', 'kind': 'table', 'transaction': 'required',
             'sourcePath': '/modules/0/tables/0/keys/0',
             'sql': 'ALTER TABLE "s"."items" DROP CONSTRAINT "old_key"',
             'phaseOperation': 'dependency-drop',
             'phaseDependency': {'table': 'items', 'kind': 'key', 'id': 'old-key',
                 'sourcePath': '/modules/0/tables/0/keys/0',
                 'meaningDigest': 'a' * 64}},
            {'id': 'step-00002', 'kind': 'table', 'transaction': 'required',
             'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/0',
             'sql': 'ALTER TABLE "s"."items" DROP COLUMN "old_name"',
             'phaseOperation': 'drop-column',
             'phaseTarget': {'table': 'items', 'field': old_field}},
            {'id': 'step-00003', 'kind': 'table', 'transaction': 'required',
             'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/1',
             'sql': 'ALTER TABLE "s"."items" ADD COLUMN "new_name" text',
             'phaseOperation': 'add-column',
             'phaseTarget': {'table': 'items', 'field': new_field}},
            {'id': 'step-00004', 'kind': 'backfill', 'transaction': 'required',
             'sourcePath': '/options/backfills/0', 'sql': '', 'operation': 'copy_new',
             'phaseOperation': 'backfill',
             'phaseTarget': {'table': 'items', 'field': new_field}},
            {'id': 'step-00005', 'kind': 'table', 'transaction': 'required',
             'sourcePath': '/modules/1/tables/0/keys/0',
             'sql': 'ALTER TABLE "s"."items" ADD CONSTRAINT "new_key" PRIMARY KEY ("new_name")',
             'phaseOperation': 'dependency-add',
             'phaseDependency': {'table': 'items', 'kind': 'key', 'id': 'new-key',
                 'sourcePath': '/modules/1/tables/0/keys/0',
                 'meaningDigest': 'b' * 64}},
        ]
        phase = {'id': 'phase-00001', 'kind': 'field-replacement',
                 'transaction': 'required', 'steps': [item['id'] for item in steps]}
        candidate = {
            'version': 'umf.table-migration/0.6',
            'options': {'version': 'umf.table-migration-options/0.6',
                'backfills': [{'table': 'items', 'column': new_field,
                               'operation': 'copy_new', 'scopedRows': True}],
                'concurrentIndexes': [], 'reviewedChanges': [], 'validations': []},
            'approvalProfile': APPROVAL_PROFILE,
            'executionProfile': {'version': 'umf.table-migration-execution/0.5',
                'progressRelation': 'umf_lifecycle_progress', 'ownerOnly': True,
                'ingressProfile': 'umf.table-generation-ingress/0.1'},
            'steps': steps, 'phases': [phase],
            'previous': {'expectedCatalog': {'columns': [
                {'table': 'items', 'field': old_field,
                 'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/0'}]}},
            'next': {'expectedCatalog': {'columns': [
                {'table': 'items', 'field': new_field,
                 'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/1'}]}},
        }
        self.assertEqual(_verified_phases(candidate), [phase])
        for mutate in (
                lambda value: value['steps'][0]['phaseDependency'].update(
                    meaningDigest='z' * 64),
                lambda value: value['steps'][0]['phaseDependency'].update(
                    sourcePath='/modules/9/tables/0/keys/0')):
            forged = copy.deepcopy(candidate)
            mutate(forged)
            with (self.subTest(mutation=mutate),
                  self.assertRaisesRegex(CatalogError, 'mixed-phase-profile')):
                _verified_phases(forged)

    def test_g11_execution05_requires_exact_generation_ingress_profile(self):
        candidate = self._g11_minimal_plan()
        # The current compiler emits this exact four-member execution profile.
        candidate['executionProfile'] = {
            'version': 'umf.table-migration-execution/0.5',
            'progressRelation': 'umf_lifecycle_progress',
            'ownerOnly': True,
            'ingressProfile': 'umf.table-generation-ingress/0.1',
        }
        self.assertEqual(_verified_phases(candidate), candidate['phases'])

        for mutate in (
                lambda value: value['executionProfile'].pop('ingressProfile'),
                lambda value: value['executionProfile'].update(
                    ingressProfile='umf.table-generation-ingress/0.2'),
                lambda value: value['executionProfile'].update(extra=True)):
            forged = copy.deepcopy(candidate)
            mutate(forged)
            with (self.subTest(mutation=mutate),
                  self.assertRaisesRegex(CatalogError, 'mixed-phase-profile')):
                _verified_phases(forged)

    def test_g11_native_host_still_refuses_unreleased06_before_acquire(self):
        from umf_access.lifecycle.host import apply_migration_on_host

        candidate = self._g11_minimal_plan()
        candidate['executionProfile'] = {
            'version': 'umf.table-migration-execution/0.5',
            'progressRelation': 'umf_lifecycle_progress',
            'ownerOnly': True,
            'ingressProfile': 'umf.table-generation-ingress/0.1',
        }

        class HostMustNotAcquire:
            def acquire(self, *args, **kwargs):
                raise AssertionError('unreleased .6 reached host acquisition')

        with (patch('umf_access.lifecycle.ledger._verified_plan',
                    return_value=candidate),
              self.assertRaisesRegex(CatalogError, 'host-migration-profile')):
            apply_migration_on_host(
                HostMustNotAcquire(), candidate,
                expected_head='a' * 64, file_digest='b' * 64,
                qualification_profile='test', evidence_digest='c' * 64)

    def test_g11_phase_refuses_forged_role_subject_order_and_omitted_backfill(self):
        import copy

        case = self._g11_minimal_plan()
        mutations = [
            lambda value: value['phases'][0].update(kind='transaction'),
            lambda value: value['steps'][0].update(phaseOperation='add-column'),
            lambda value: value['steps'][0].update(phaseDependency={}),
            lambda value: value['steps'].__setitem__(0, value['steps'][1]),
            lambda value: value['steps'][2].update(sql='not-empty'),
            lambda value: value['options']['backfills'].clear(),
            lambda value: value['previous']['expectedCatalog']['columns'][0].update(
                sourcePath='/modules/0/extensions/umf.tables/tables/0/columns/9'),
            lambda value: value['next']['expectedCatalog']['columns'][0].update(
                sourcePath='/modules/0/extensions/umf.tables/tables/0/columns/9'),
            lambda value: _duplicate_g11_drop(value),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                candidate = copy.deepcopy(case)
                mutate(candidate)
                with self.assertRaisesRegex(
                        CatalogError, 'mixed-phase-profile'):
                    _verified_phases(candidate)

    def test_g11_recovery_witness_selects_predecessor_until_atomic_completion(self):
        from umf_access.lifecycle.mixed import _source_at_phase_prefix

        candidate = self._g11_minimal_plan()
        self.assertIs(_source_at_phase_prefix(candidate, 0), candidate['previous'])
        self.assertIs(_source_at_phase_prefix(candidate, 1), candidate['next'])
        with self.assertRaisesRegex(CatalogError, 'mixed-phase-profile'):
            _source_at_phase_prefix(candidate, 2)
        legacy = {'options': {'version': 'umf.table-migration-options/0.5'},
                  'next': candidate['next']}
        self.assertIs(_source_at_phase_prefix(legacy, 0), legacy['next'])

    def test_g11_native_boundary_checks_the_explicit_source_bundle(self):
        from umf_access.lifecycle.mixed import _verify_phase_source_boundary

        candidate = self._g11_minimal_plan()
        old_source, new_source = candidate['previous'], candidate['next']
        for source, schema, owner in ((old_source, 'old_schema', 'old_owner'),
                                      (new_source, 'new_schema', 'new_owner')):
            source['configuration'] = {'schema': schema, 'ownerRole': owner,
                                       'personRole': 'person', 'batchRole': 'batch'}
            source['expectedCatalog']['tables'] = []
        observed_inventory = []
        observed_roles = []

        def one(_connection, query, parameters):
            if 'pg_roles' in query:
                return ({'old_owner': (1,), 'new_owner': (2,),
                         'person': (3,), 'batch': (4,)}[parameters[0]])
            if 'has_database_privilege' in query:
                return (False,)
            if 'pg_namespace' in query:
                return (10 if parameters[0] == 'old_schema' else 20,)
            raise AssertionError(query)

        def all_rows(_connection, query, parameters):
            if 'nspacl' in query:
                owner = 1 if parameters[0] == 10 else 2
                return [(owner, owner, 'USAGE', False), (owner, 3, 'USAGE', False),
                        (owner, 4, 'USAGE', False)]
            if 'acldefault' in query:
                return [(parameters[0], parameters[0], 'USAGE', False)]
            raise AssertionError(query)

        with (patch('umf_access.lifecycle.mixed._verify_source_metadata_inventory',
                    side_effect=lambda _connection, bundle, approval, **kwargs:
                    observed_inventory.append((bundle, approval, kwargs))),
              patch('umf_access.lifecycle.mixed._verify_history_schema'),
              patch('umf_access.lifecycle.mixed._verify_outcomes'),
              patch('umf_access.lifecycle.mixed._verify_progress_schema'),
              patch('umf_access.lifecycle.mixed._verify_phase_head'),
              patch('umf_access.lifecycle.mixed._one', side_effect=one),
              patch('umf_access.lifecycle.mixed._all', side_effect=all_rows),
              patch('umf_access.lifecycle.mixed.verify_native_role_scope',
                    side_effect=lambda _connection, bundle, *, person_roles:
                    observed_roles.append((bundle, person_roles)))):
            _verify_phase_source_boundary(object(), candidate, {'person'}, old_source)
            _verify_phase_source_boundary(object(), candidate, {'person'}, new_source)
        self.assertIs(observed_inventory[0][0], old_source)
        self.assertIs(observed_inventory[1][0], new_source)
        self.assertIs(observed_roles[0][0], old_source)
        self.assertIs(observed_roles[1][0], new_source)
        self.assertEqual([item[1] for item in observed_inventory],
                         [candidate['approvalProfile']] * 2)

    def test_g11_psycopg_lease_observes_the_requested_recovery_prefix(self):
        from umf_access.lifecycle.host import (
            PhaseReceipt,
            _PsycopgLease,
            _PsycopgRequiredPhase,
        )

        candidate = self._g11_minimal_plan()
        lease = object.__new__(_PsycopgLease)
        lease.connection = object()
        observed = []

        def capture(connection, source):
            observed.append(source)
            return source

        with patch('umf_access.lifecycle.witness._capture_witness', side_effect=capture):
            self.assertIs(lease.observe_prefix(candidate, phase_index=0), candidate['previous'])
            self.assertIs(lease.observe_prefix(candidate, phase_index=1), candidate['next'])
        self.assertEqual(observed, [candidate['previous'], candidate['next']])

        transaction = object.__new__(_PsycopgRequiredPhase)
        transaction.lease = lease
        transaction.prior = PhaseReceipt(0, '0' * 64, (), {}, 'ready')
        transaction.steps = candidate['steps']
        transaction.cursor = 0
        observed.clear()
        with patch('umf_access.lifecycle.witness._capture_witness', side_effect=capture):
            self.assertIs(transaction.observe_prefix(candidate), candidate['previous'])
            transaction.cursor = len(transaction.steps)
            self.assertIs(transaction.observe_prefix(candidate), candidate['next'])
        self.assertEqual(observed, [candidate['previous'], candidate['next']])

    def _g11_minimal_plan(self):
        from umf_access.lifecycle.approval import APPROVAL_PROFILE

        old_field = {'module': 'm', 'element': 'old'}
        new_field = {'module': 'm', 'element': 'new'}
        steps = [
            {'id': 'step-00001', 'kind': 'table', 'transaction': 'required',
             'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/0',
             'sql': 'DROP COLUMN old', 'phaseOperation': 'drop-column',
             'phaseTarget': {'table': 'items', 'field': old_field}},
            {'id': 'step-00002', 'kind': 'table', 'transaction': 'required',
             'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/1',
             'sql': 'ADD COLUMN new text', 'phaseOperation': 'add-column',
             'phaseTarget': {'table': 'items', 'field': new_field}},
            {'id': 'step-00003', 'kind': 'backfill', 'transaction': 'required',
             'sourcePath': '/options/backfills/0', 'sql': '', 'operation': 'copy_new',
             'phaseOperation': 'backfill',
             'phaseTarget': {'table': 'items', 'field': new_field}},
        ]
        phase = {'id': 'phase-00001', 'kind': 'field-replacement',
                 'transaction': 'required', 'steps': [item['id'] for item in steps]}
        return {
            'version': 'umf.table-migration/0.6',
            'options': {'version': 'umf.table-migration-options/0.6',
                'backfills': [{'table': 'items', 'column': new_field,
                               'operation': 'copy_new', 'scopedRows': True}],
                'concurrentIndexes': [], 'reviewedChanges': [], 'validations': []},
            'approvalProfile': APPROVAL_PROFILE,
            'executionProfile': {'version': 'umf.table-migration-execution/0.5',
                'progressRelation': 'umf_lifecycle_progress', 'ownerOnly': True},
            'steps': steps, 'phases': [phase],
            'previous': {'expectedCatalog': {'columns': [
                {'table': 'items', 'field': old_field,
                 'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/0'}]}},
            'next': {'expectedCatalog': {'columns': [
                {'table': 'items', 'field': new_field,
                 'sourcePath': '/modules/0/extensions/umf.tables/tables/0/columns/1'}]}},
        }


def _duplicate_g11_drop(value):
    import copy

    duplicate = copy.deepcopy(value['steps'][0])
    duplicate['id'] = 'step-00004'
    value['steps'].insert(1, duplicate)
    value['phases'][0]['steps'].insert(1, duplicate['id'])


if __name__ == '__main__':
    unittest.main()
