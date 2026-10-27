# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import unittest

from umf_access.lifecycle.catalog import CatalogError
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
    # CONTRACT-081 U1 uses options 0.2 with execution profile 0.1.
    return {'steps':steps,'phases':phases,
            'options':{'version':'umf.table-migration-options/0.2'},
            'executionProfile':{
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


if __name__ == '__main__':
    unittest.main()
