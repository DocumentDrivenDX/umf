# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import unittest

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
                with self.assertRaisesRegex(CatalogError, 'mixed-phase-profile'):
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


if __name__ == '__main__':
    unittest.main()
