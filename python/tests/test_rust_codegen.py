# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive compiler binding controls and carrier invariants."""
import json
import sys
from pathlib import Path

import pytest
from umf._rust import UmfCoreError, _from_wire, _rust_core, _wire
from umf.rust_codegen import CodegenEngine

NAMES = ('coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy', 'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage')


def test_constructor_copy_observes_controls():
    resources = {name: {} for name in NAMES}
    for controls, code in [({'max_work': 0}, 'RESOURCE_LIMIT'), ({'is_cancelled': lambda: True}, 'CANCELLED'),
                           ({'now': lambda: 2, 'deadline_ms': 1}, 'DEADLINE')]:
        with pytest.raises(UmfCoreError) as failure:
            CodegenEngine(resources, **controls)
        assert failure.value.code == code
    with pytest.raises(UmfCoreError) as failure:
        CodegenEngine(resources, profile='hard-isolated')
    assert failure.value.code == 'RESOURCE_PROFILE_UNAVAILABLE'


def test_host_callback_cannot_spoof_semantic_origin_and_preserves_text():
    text = 'host \U0001f600 \ud83d\ude00 \ud800'
    def meter(_):
        raise UmfCoreError('VALUE_INVALID', text)
    with pytest.raises(UmfCoreError) as failure:
        CodegenEngine({name: {} for name in NAMES}, meter=meter)
    assert failure.value.code == 'METER_FAILURE'
    assert str(failure.value) == text


def test_native_control_error_retains_python_origin_and_remains_an_operation_error():
    text = 'host \U0001f600 \ud83d\ude00 \ud800'
    # A trusted binding-owned hook may deliberately use a semantic-looking code.
    # Its provenance must survive the Rust compiler transport as an exception.
    request = json.dumps(_wire({'op': 'codegen/compileTableDeployment', 'request': {}}))
    with pytest.raises(UmfCoreError) as failure:
        _rust_core.execute_codegen_wire(request, control=lambda _: ('VALUE_INVALID', text, '/host'))
    assert failure.value.code == 'VALUE_INVALID'
    assert str(failure.value) == text
    assert failure.value.path == '/host'


def test_carrier_copy_is_controlled_and_keeps_utf16_and_negative_zero():
    import math
    source = {'text': '\ud800\ud83d\ude00', 'zero': -0.0, 'array': [1]}
    amounts = []
    result = _from_wire(_wire(source, work=amounts.append), amounts.append)
    # The core carrier is UTF-16; explicit adjacent pairs coalesce on projection.
    assert result['text'].encode('utf-16-le', 'surrogatepass') == source['text'].encode('utf-16-le', 'surrogatepass')
    assert math.copysign(1, result['zero']) == -1
    result['array'].append(2)
    assert source['array'] == [1]
    assert sum(amounts) > 10


def test_installed_codegen_late_controls_and_output_isolation():
    root = Path(__file__).resolve().parents[2]
    paths = dict(zip(NAMES, ('spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
                           'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
                           'spec/metamodel/generated/domain-policy.json', 'spec/extensions/tables/package.json',
                           'spec/extensions/actions/package.json', 'spec/extensions/binding/package.json', 'spec/extensions/binding-stable/package.json')))
    resources = {key: json.loads((root / path).read_text()) for key, path in paths.items()}
    corpus = json.loads((root / 'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json').read_text())
    row = next(row for row in corpus['cases'] if row['operation'] == 'generatePythonClient' and row['expected']['ok'])
    state = {'active': False, 'charged': 0, 'stop': float('inf'), 'mode': 'observe'}
    def meter(amount):
        if state['active']:
            state['charged'] += amount
            if state['mode'] == 'meter' and state['charged'] > state['stop']:
                raise RuntimeError('late Python meter')
    def stopped(mode):
        return state['active'] and state['mode'] == mode and state['charged'] > state['stop']
    engine = CodegenEngine(resources, meter=meter, is_cancelled=lambda: stopped('cancel'),
                           now=lambda: 2 if stopped('deadline') else 0, deadline_ms=1)
    state['active'] = True
    first = engine.call(row['operation'], row['request'])
    assert first['ok'] is True
    total = state['charged']
    assert total > 1000
    retained = json.dumps(first, sort_keys=True)
    first['result']['changedByCaller'] = True
    assert json.dumps(engine.call(row['operation'], row['request']), sort_keys=True) == retained
    for mode, code in [('meter', 'METER_FAILURE'), ('cancel', 'CANCELLED'), ('deadline', 'DEADLINE')]:
        state.update(mode=mode, charged=0, stop=int(total * 0.75))
        with pytest.raises(UmfCoreError) as failure:
            engine.call(row['operation'], row['request'])
        assert failure.value.code == code
        assert state['stop'] < state['charged'] < total


def test_codegen_import_fails_closed_without_native_artifact(tmp_path):
    import shutil
    import subprocess
    package = tmp_path / 'umf'
    package.mkdir()
    (package / '__init__.py').write_text('')
    source = Path(__file__).resolve().parents[1] / 'src/umf'
    for name in ('_rust.py', 'rust_codegen.py'):
        shutil.copyfile(source / name, package / name)
    result = subprocess.run([sys.executable, '-I', '-S', '-c',
                             'import sys; sys.path.insert(0, sys.argv[1]); import umf.rust_codegen', str(tmp_path)],
                            capture_output=True, text=True, check=False)
    assert result.returncode != 0
    assert 'umf-core was installed without its required Rust engine' in result.stderr


def test_cached_resources_are_charged_before_json_serialization(monkeypatch):
    import umf.rust_codegen as compiler
    state = {'armed': False}
    resources = {name: {} for name in NAMES}
    resources['coreSchema'] = {'catalog': 'x' * 10000}
    def meter(amount):
        if state['armed'] and amount >= 10000:
            raise RuntimeError('cached catalog serialization denied')
    engine = CodegenEngine(resources, meter=meter)
    def forbidden_serializer(*args, **kwargs):
        raise AssertionError('serialization started before cached resources were charged')
    monkeypatch.setattr(compiler.json, 'dumps', forbidden_serializer)
    state['armed'] = True
    with pytest.raises(UmfCoreError) as failure:
        engine.call('compileTableDeployment', {})
    assert failure.value.code == 'METER_FAILURE'
    assert str(failure.value) == 'cached catalog serialization denied'


def test_wire_serialization_bound_covers_ascii_growth():
    from umf.rust_codegen import _serialization_bound
    value = _wire({'unicode': '\U0001f600\ud800\n', 'list': [None, True, -0.0, 1.0, {}]})
    assert _serialization_bound(value, lambda _: None) >= len(json.dumps(value, separators=(',', ':')))
