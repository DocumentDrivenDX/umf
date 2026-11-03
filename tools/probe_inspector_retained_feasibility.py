#!/usr/bin/env python3
"""Private installed-owner measurement. No release, enrollment or PG operation."""
from __future__ import annotations
import argparse
from collections import Counter
import csv
import hashlib
import importlib.metadata
import io
import json
from pathlib import Path
import platform
import subprocess
import sys
import sysconfig
import zipfile

SOURCE_S = 'e3f38ef6f05ae636d2837f9d69f8d6805222664b'
LIMIT = 1_000_000
MODE = 'retained-native/1'
PINS = 'tests/qualification/fixtures/inspector-retained-resources.json'
CORPUS = 'tests/rust-core/fixtures/access-inspection/cases.json'
CORPUS_SHA = '2e939f0d0f68f71a6b78c38e4fcd151e7b363513311f1aed170f9576333cbdc3'
NAMES = ('coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy', 'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage')
PUBLISHED_NATIVE = '7716d79ae0c85ac92ba679d531c213811fe66501397b0ec0f78e8bad53c296da'


def digest(raw): return hashlib.sha256(raw).hexdigest()


def require(value, message):
    if not value: raise ValueError(message)


def resources(root, expected_pins):
    path = root / PINS
    require(digest(path.read_bytes()) == expected_pins, 'Diagnostic resource payload differs')
    value = json.loads(path.read_bytes())
    require(type(value) is dict and set(value) == {'profile','sourceS','maximumWork','resourceMode','resources'}
            and value['profile'] == 'umf.inspector-retained-feasibility-resources/1'
            and type(value['maximumWork']) is int, 'Closed diagnostic resource profile required')
    require(value['sourceS'] == SOURCE_S and value['maximumWork'] == LIMIT and value['resourceMode'] == MODE,
            'Frozen source/mode/allowance differs')
    require(set(value['resources']) == set(NAMES), 'Exactly nine resources required')
    result = {}
    for name, row in value['resources'].items():
        require(type(row) is dict and set(row) == {'path','bytes','sha256'} and type(row['bytes']) is int,
                'Closed resource digest row required')
        path = root / row['path']
        require(not path.is_symlink() and path.resolve().is_relative_to(root.resolve()), 'Unsafe resource path')
        raw = path.read_bytes()
        require(len(raw) == row['bytes'] and digest(raw) == row['sha256'], 'Resource bytes differ: ' + name)
        result[name] = json.loads(raw)
    require(digest((root / CORPUS).read_bytes()) == CORPUS_SHA, 'Original inspection oracle differs')
    return result, value


class Observer:
    """Pass-through observation; each charge delegates once with unchanged controls.

    No engine field or allowance is patched. Observation counters are not used
    for admission. The original owner _host_work closure remains the authority.
    """
    def __init__(self, compiler):
        self.compiler = compiler
        self.originals = {}
        self.rows = []
        self.phase = 'host-boundary'
        self.current = None

    def begin(self, label):
        self.current = {'operation': label, 'maximumWork': LIMIT, 'attemptedWork': 0,
                        'returnedWork': 0, 'peakAttemptedWork': 0, 'peakReturnedWork': 0,
                        'phaseAttempts': Counter(), 'phaseReturned': Counter(), 'failures': []}
        self.rows.append(self.current)

    def __enter__(self):
        compiler = self.compiler
        for name in ('_host_work', '_native_control', '_wire', '_from_wire', '_serialization_bound'):
            self.originals[name] = getattr(compiler, name)
        def host_work(maximum, *controls):
            require(maximum == LIMIT, 'Every measured lifetime must use exactly 1M')
            delegate = self.originals['_host_work'](maximum, *controls)
            row = self.current
            require(row is not None, 'Measurement lifetime missing')
            def work(amount):
                require(type(amount) is int and amount >= 0, 'Invalid observed work charge')
                row['attemptedWork'] += amount
                row['peakAttemptedWork'] = max(row['peakAttemptedWork'], row['attemptedWork'])
                row['phaseAttempts'][self.phase] += amount
                try:
                    outcome = delegate(amount)
                except BaseException as error:
                    row['failures'].append({'phase': self.phase, 'amount': amount, 'code': getattr(error, 'code', type(error).__name__),
                                            'attemptedAtRefusal': row['attemptedWork']})
                    raise
                row['returnedWork'] += amount
                row['peakReturnedWork'] = max(row['peakReturnedWork'], row['returnedWork'])
                row['phaseReturned'][self.phase] += amount
                return outcome
            return work
        def native_control(work):
            delegate = self.originals['_native_control'](work)
            def control(amount, phase=None):
                prior, self.phase = self.phase, phase or 'native-ordinary'
                try: return delegate(amount, phase)
                finally:
                    control.failure = delegate.failure
                    self.phase = prior
            control.failure = None
            return control
        compiler._host_work, compiler._native_control = host_work, native_control
        for name, phase in (('_wire', 'host-wire-conversion'), ('_from_wire', 'host-result-or-snapshot-copy'),
                            ('_serialization_bound', 'host-serialization-bound-walk')):
            def wrap(*args, _name=name, _phase=phase, **kwargs):
                prior, self.phase = self.phase, _phase
                try: return self.originals[_name](*args, **kwargs)
                finally: self.phase = prior
            setattr(compiler, name, wrap)
        return self

    def __exit__(self, *exc):
        for name, function in self.originals.items(): setattr(self.compiler, name, function)


def installed_wheel(wheel, dist):
    rows = []
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate wheel members')
        for name in names:
            require(not name.startswith('/') and '..' not in Path(name).parts, 'Unsafe wheel member')
            raw = archive.read(name)
            rows.append({'name': name, 'bytes': len(raw), 'sha256': digest(raw)})
            if name.startswith('umf/'):
                actual = Path(dist.locate_file(name))
                require(actual.is_file() and not actual.is_symlink() and actual.read_bytes() == raw,
                        'Installed candidate differs from actual candidate wheel: ' + name)
        record = next(n for n in names if n.endswith('.dist-info/RECORD'))
        import base64
        record_rows = list(csv.reader(io.StringIO(archive.read(record).decode())))
        require(len(record_rows) == len(names) and {r[0] for r in record_rows} == set(names), 'Incomplete or duplicate wheel RECORD')
        for name, checksum, size in record_rows:
            require(name in names, 'RECORD names an absent member')
            if name == record:
                require(checksum == size == '', 'RECORD self row must be unhashed')
                continue
            require(checksum.startswith('sha256='), 'Unhashed payload member')
            if checksum:
                raw = archive.read(name)
                require(checksum == 'sha256=' + base64.urlsafe_b64encode(hashlib.sha256(raw).digest()).rstrip(b'=').decode()
                        and int(size) == len(raw), 'Candidate wheel RECORD differs')
    return rows


def run(root, wheel, expected_source, expected_pins, output):
    require(sys.flags.isolated and sys.dont_write_bytecode, 'Use installed isolated -I -B')
    require(platform.python_version() == '3.11.17' and platform.system() == 'Linux' and platform.machine() == 'x86_64',
            'Only selected Linux311 host is admitted')
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    require(source == expected_source and source != SOURCE_S, 'Actual private source differs or was relabelled S')
    require(not subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=root), 'Tracked source was mutated')
    supplied, pins = resources(root, expected_pins)
    import umf
    import umf._rust_core as native
    import umf.rust_codegen as compiler
    dist = importlib.metadata.distribution('umf-core')
    require(dist.version == '0.10.8', 'Unexpected inherited distribution metadata')
    inventory = installed_wheel(wheel, dist)
    package = Path(umf.__file__).parent
    require(package.is_relative_to(Path(sysconfig.get_path('purelib'))), 'Candidate did not load from isolated install')
    native_path = Path(native.__file__)
    require(digest(native_path.read_bytes()) != PUBLISHED_NATIVE, 'Old published native cannot supply the new capability')
    require(hasattr(native, 'create_codegen_resources'), 'Candidate native export missing')
    require(native_path.parent == package and Path(compiler.__file__) == package/'rust_codegen.py', 'Loaded module owner differs')
    for name, row in pins['resources'].items():
        raw = (package/'action_runtime_resources'/(name+'.json')).read_bytes()
        require(digest(raw) == row['sha256'] and len(raw) == row['bytes'], 'Installed canonical resource differs')
    before = {str(p.relative_to(package)): digest(p.read_bytes()) for p in package.rglob('*') if p.is_file()}
    receipt = {'profile': 'umf.private-inspector-retained-feasibility/1', 'privateFeasibilityOnly': True,
               'publishable': False, 'readyForEnrollment': False, 'status': 'unmeasured',
               'actualCandidateSource': source, 'actualCandidateTree': subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),
               'canonicalResourceSourceS': SOURCE_S, 'resourceMode': MODE, 'maximumWork': LIMIT,
               'actualPython': platform.python_version(), 'platform': platform.platform(),
               'inheritedDistributionVersion': dist.version, 'newReleaseVersionAllocated': False,
               'wheel': {'name': wheel.name, 'bytes': wheel.stat().st_size, 'sha256': digest(wheel.read_bytes()), 'members': inventory},
               'engineVersion': native.engine_version(), 'codegenProtocol': native.codegen_protocol_version(),
               'loadedModules': {str(p): digest(p.read_bytes()) for p in (Path(umf.__file__),Path(compiler.__file__),package/'_rust.py',native_path)},
               'resourcePins': pins, 'operations': [], 'parity': [], 'scope': 'No PG, Truss enrollment, publication, Weft or platform-matrix proof. Inherited resource compiler attestations describe original S resources, not this new native adapter closure.'}
    def write():
        receipt['operations'] = observer.rows
        output.write_text(json.dumps(receipt, indent=2) + '\n')
    observer = Observer(compiler)
    try:
        with observer:
            observer.begin('legacy-construction-1M')
            try: compiler.CodegenEngine(supplied, max_work=LIMIT)
            except compiler.UmfCoreError as error:
                require(error.code == 'RESOURCE_LIMIT', 'Legacy refusal classification changed')
                receipt['legacyConstruction'] = {'status': 'refused', 'code': error.code}
            else: raise ValueError('Legacy canonical constructor unexpectedly passed 1M')
            observer.begin('retained-cold-construction-1M')
            try: engine = compiler.CodegenEngine(supplied, max_work=LIMIT, resource_mode=MODE)
            except compiler.UmfCoreError as error:
                receipt['status'] = 'resource-limited' if error.code == 'RESOURCE_LIMIT' else 'failed'
                receipt['refusal'] = {'code': error.code, 'message': str(error), 'phase': observer.current['failures'][-1]['phase'] if observer.current['failures'] else 'native-admission'}
                receipt['remainingChecks'] = '17/51 public parity, warm calls and public late controls were not reached; no bounded capability claimed'
                write()
                return 2
            # Mutating supplied resources cannot mutate the native-owned handle.
            supplied['coreSchema'] = {'callerMutationAfterConstruction': True}
            cases = json.loads((root/CORPUS).read_bytes())['cases']
            require(len(cases) == 17, 'Expected complete original 17-vector oracle')
            for row in cases:
                request = row['request']; original = json.dumps(request, ensure_ascii=True)
                for carrier in ('dispatcher', 'list', 'tuple'):
                    observer.begin(row['id'] + '/' + carrier)
                    if carrier == 'dispatcher':
                        actual = engine.call('inspectAccessViews', request)
                        require(actual == {'ok': True, 'result': row['expected']}, 'Dispatcher parity differs')
                    else:
                        bindings = list(request.get('bindings', ())) if carrier == 'list' else tuple(request.get('bindings', ()))
                        actual = engine.inspect_access_views(request['document'], request['selected'], bindings, request.get('sourceId','logical'))
                        require(actual == row['expected'], 'Facade parity differs')
                    require(json.dumps(request, ensure_ascii=True) == original, 'Request custody differs')
                    receipt['parity'].append({'case':row['id'],'carrier':carrier,'resultSHA256':digest(json.dumps(actual,ensure_ascii=True,sort_keys=True).encode())})
                    actual.clear()
            observer.begin('hostile-over-1M-call')
            try: engine.call('inspectAccessViews', {'document': {'oversize': 'x' * 500_001}, 'selected': []})
            except compiler.UmfCoreError as error: require(error.code == 'RESOURCE_LIMIT', 'Hostile request must remain RESOURCE_LIMIT')
            else: raise ValueError('Hostile call escaped its 1M allowance')
            resources(root, expected_pins)
            require({str(p.relative_to(package)):digest(p.read_bytes()) for p in package.rglob('*') if p.is_file()} == before,
                    'Installed candidate files changed during inspection')
            receipt['status'] = 'measured-fit'; receipt['inspectionCases'] = 17; receipt['inspectionCalls'] = 51
            receipt['requestCustodyPreserved'] = True; receipt['installedFilesUnchanged'] = True
            # Native contract tests and all review gates remain separate requirements.
            write(); return 0
    except BaseException as error:
        receipt['status'] = 'resource-limited' if getattr(error,'code',None) == 'RESOURCE_LIMIT' else 'failed'; receipt['exception'] = {'type':type(error).__name__,'message':str(error),'code':getattr(error,'code',None)}
        write(); raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True);parser.add_argument('--wheel',type=Path,required=True)
    parser.add_argument('--source-sha',required=True);parser.add_argument('--resource-pins-sha256',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    raise SystemExit(run(args.root.resolve(),args.wheel.resolve(),args.source_sha,args.resource_pins_sha256,args.output))
