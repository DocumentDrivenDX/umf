# SPDX-License-Identifier: MIT OR Apache-2.0
"""Real public shared-dispatch and convenience parity with the TS inspector."""
import json
from pathlib import Path

import pytest
from umf._rust import UmfCoreError
from umf.rust_codegen import CodegenEngine

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / 'tests/rust-core/fixtures/access-inspection/cases.json').read_text())['cases']
PATHS = dict(zip(
    ('coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy', 'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage'),
    ('spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json', 'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json', 'spec/metamodel/generated/domain-policy.json', 'spec/extensions/tables/package.json', 'spec/extensions/actions/package.json', 'spec/extensions/binding/package.json', 'spec/extensions/binding-stable/package.json')))


def resources():
    return {name: json.loads((ROOT / path).read_text()) for name, path in PATHS.items()}


@pytest.fixture(scope='module')
def engine():
    return CodegenEngine(resources())


@pytest.mark.parametrize('row', CASES, ids=lambda row: row['id'])
def test_python_dispatcher_and_facade_match_existing_inspector(engine, row):
    request = row['request']
    original = json.dumps(request, ensure_ascii=True)
    assert engine.call('inspectAccessViews', request) == {'ok': True, 'result': row['expected']}
    for binding_carrier in (list, tuple):
        actual = engine.inspect_access_views(request['document'], request['selected'],
                                            binding_carrier(request.get('bindings', ())),
                                            request.get('sourceId', 'logical'))
        assert actual == row['expected']
        actual['records'].append({'changedByCaller': True})
        actual['diagnostics'].append({'changedByCaller': True})
    assert json.dumps(request, ensure_ascii=True) == original
    if row['id'] == 'default-instant':
        assert engine.inspect_access_views(request['document'], request['selected']) == row['expected']


def test_python_malformed_requests_refuse_without_partial_result(engine):
    request = CASES[0]['request']
    for change in ({'unexpected': True}, {'selected': {}}, {'bindings': {}}, {'sourceId': None}, {'sourceId': '\ud800'},
                   {'bindings': [{'sourceId': 'x'}]}, {'selected': [{**request['selected'][0], 'extra': True}]}):
        response = engine.call('inspectAccessViews', {**request, **change})
        assert response['ok'] is False
        assert response['error']['code'] == 'REQUEST'
        assert 'result' not in response


def test_python_inspection_controls_are_terminal():
    state = {'active': False, 'total': 0, 'stop': float('inf'), 'mode': 'observe'}
    def meter(amount):
        if state['active']:
            state['total'] += amount
            if state['mode'] == 'meter' and state['total'] > state['stop']:
                raise RuntimeError('inspection meter')
    def stopped(mode):
        return state['active'] and state['mode'] == mode and state['total'] > state['stop']
    engine = CodegenEngine(resources(), meter=meter, is_cancelled=lambda: stopped('cancel'),
                           now=lambda: 2 if stopped('deadline') else 0, deadline_ms=1)
    state['active'] = True
    request = CASES[0]['request']
    assert engine.inspect_access_views(request['document'], request['selected']) == CASES[0]['expected']
    total = state['total']
    assert total > 1000
    for mode, code in (('meter', 'METER_FAILURE'), ('cancel', 'CANCELLED'), ('deadline', 'DEADLINE')):
        state.update(total=0, stop=int(total * .75), mode=mode)
        with pytest.raises(UmfCoreError) as failure:
            engine.inspect_access_views(request['document'], request['selected'])
        assert failure.value.code == code
        assert state['stop'] < state['total'] < total

    limited = CodegenEngine(resources(), max_work=total - 1)
    with pytest.raises(UmfCoreError) as failure:
        limited.inspect_access_views(request['document'], request['selected'])
    assert failure.value.code == 'RESOURCE_LIMIT'
