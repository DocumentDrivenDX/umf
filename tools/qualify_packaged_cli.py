#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Prepare an unchanged packaged CLI copy and verify an existing Saga host report.

Never executes the CLI. H owns the actual invocation, transport and gate mapping:
UMF_SAGA_CLI=<copy> UMF_SAGA_RESULT_PATH=<report> bun scripts/saga-portable/other-hosts.ts cli
"""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import stat
import struct
import zipfile
from email.parser import BytesParser

SOURCE = 'e3f38ef6f05ae636d2837f9d69f8d6805222664b'
PINS = {
    'linux-x86_64': {
        'wheel': '2dd4f00869240b37aa89fb9009e0663bf4c78cde103995d9d5c6e6b2333d92dd',
        'cli': '5c685f7bc53a29fafbcf8cf965c91ccfe748bb51096b099172c3816f16f0e2a9',
        'tag': 'cp311-abi3-manylinux_2_34_x86_64', 'runtime': {'platform': 'linux', 'arch': 'x64'},
    },
    'macos-arm64': {
        'wheel': '0eb762d4f95c6f29ae97c02d8859bbe65a3f9124579e5d48e42fefbf7458f603',
        'cli': 'baf21fe9806dd08a468b7a1986c5b188be9bfb19238776ca54043e315d5569cc',
        'tag': 'cp311-abi3-macosx_11_0_arm64', 'runtime': {'platform': 'darwin', 'arch': 'arm64'},
    },
}
CLI_MEMBER = 'umf/_bin/umf'
NATIVE_MEMBER = 'umf/_rust_core.abi3.so'
PLATFORM_HELPER_SHA = '5856eb375d176af7671ad22981d983a14cec24663e3a8bc466446b433c2cd7b1'
ROOT = Path(__file__).resolve().parents[1]


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def insist(condition, message):
    if not condition:
        raise ValueError(message)


def read(path: Path) -> bytes:
    insist(path.is_file() and not path.is_symlink(), 'Missing or unsafe material: ' + str(path))
    return path.read_bytes()


def input_paths(root: Path) -> list[str]:
    text = read(root / 'scripts/saga-portable/custody.ts').decode()
    match = re.search(r'export const SAGA_QUALIFICATION_INPUTS=\[(.*?)\] as const;', text, re.S)
    insist(match is not None, 'Existing custody input roster unavailable')
    tokens = re.findall(r"'([^']+)'", match.group(1))
    insist(tokens and len(set(tokens)) == len(tokens), 'Malformed custody input roster')
    insist(re.sub(r"'[^']+'|[\s,]", '', match.group(1)) == '', 'Dynamic custody input roster refused')
    return tokens


def snapshot(root: Path) -> dict:
    paths = input_paths(root) + ['python/_native_platform.py', 'tools/qualify_packaged_cli.py']
    for name in paths:
        insist(not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unsafe custody input')
    return {name: sha(read(root / name)) for name in paths}


def native_platform(raw: bytes, target: str, root: Path):
    if target == 'linux-x86_64':
        insist(len(raw) >= 64 and raw[:7] == b'\x7fELF\x02\x01\x01', 'Expected ELF64 little-endian native member')
        kind, machine, version = struct.unpack_from('<HHI', raw, 16)
        insist(kind in (2, 3) and machine == 62 and version == 1, 'Wrong ELF native platform')
    else:
        path = root / 'python/_native_platform.py'
        insist(sha(read(path)) == PLATFORM_HELPER_SHA, 'Native-platform inspector pin differs')
        spec = importlib.util.spec_from_file_location('packaged_cli_native_platform', path)
        insist(spec is not None and spec.loader is not None, 'Native-platform inspector unavailable')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.inspect_macho_bytes(raw, 'arm64')
        insist(sha(read(path)) == PLATFORM_HELPER_SHA, 'Native-platform inspector changed')


def wheel_cli(wheel: Path, target: str, root: Path) -> bytes:
    insist(target in PINS, 'Unselected platform')
    pin = PINS[target]
    raw = read(wheel)
    insist(sha(raw) == pin['wheel'], 'Pinned wheel hash differs')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = archive.infolist()
        names = [item.filename for item in infos]
        insist(len(names) == len(set(names)), 'Duplicate wheel member')
        for item in infos:
            name = item.filename
            insist(not name.startswith('/') and '\\' not in name and '\x00' not in name
                   and all(part not in ('', '.', '..') for part in name.rstrip('/').split('/')), 'Unsafe wheel member')
            insist(not stat.S_ISLNK(item.external_attr >> 16), 'Symlink wheel member')
        files = {item.filename for item in infos if not item.is_dir()}
        metadata_names = [name for name in files if name.endswith('.dist-info/METADATA')]
        insist(len(metadata_names) == 1, 'One wheel metadata required')
        prefix = metadata_names[0].removesuffix('/METADATA')
        insist({name.split('/')[0] for name in files if '.dist-info/' in name} == {prefix}, 'Ambiguous wheel metadata')
        metadata = BytesParser().parsebytes(archive.read(metadata_names[0]))
        insist(metadata.get('Name', '').lower().replace('_', '-') == 'umf-core' and metadata['Version'] == '0.10.8', 'Wrong wheel identity')
        tags = BytesParser().parsebytes(archive.read(prefix + '/WHEEL'))
        insist(tags.get_all('Tag') == [pin['tag']] and tags['Root-Is-Purelib'] == 'false', 'Wrong wheel platform tag')
        record_name = prefix + '/RECORD'
        rows = list(csv.reader(io.StringIO(archive.read(record_name).decode()), strict=True))
        insist(all(len(row) == 3 for row in rows), 'Malformed wheel RECORD')
        record = {row[0]: row[1:] for row in rows}
        insist(len(rows) == len(record) and set(record) == files, 'Wheel RECORD inventory differs')
        for name, (digest, size) in record.items():
            if name == record_name:
                insist(digest == size == '', 'Wheel RECORD self-entry differs')
            else:
                payload = archive.read(name)
                expected = 'sha256=' + base64.urlsafe_b64encode(hashlib.sha256(payload).digest()).decode().rstrip('=')
                insist(digest == expected and size == str(len(payload)), 'Wheel RECORD payload differs')
        insist(CLI_MEMBER in files and NATIVE_MEMBER in files, 'Packaged CLI/native member missing')
        cli = archive.read(CLI_MEMBER)
        insist(sha(cli) == pin['cli'], 'Pinned packaged CLI hash differs')
        native_platform(cli, target, root)
        native_platform(archive.read(NATIVE_MEMBER), target, root)
        return cli


def prepare(wheel: Path, output: Path, target: str, root: Path = ROOT) -> dict:
    wheel, root = wheel.absolute(), root.resolve()
    before = snapshot(root)
    cli = wheel_cli(wheel, target, root)
    insist(not output.exists() and not output.is_symlink(), 'Output must be new')
    output.mkdir(parents=True)
    copy = output.resolve() / 'umf'
    with copy.open('xb') as stream:
        stream.write(cli)
    copy.chmod(0o700)
    insist(read(copy) == cli, 'Extracted executable bytes differ')
    insist(snapshot(root) == before, 'Qualification materials changed during prepare')
    insist(sha(read(wheel)) == PINS[target]['wheel'], 'Wheel changed during prepare')
    state = {'profile': 'umf.packaged-cli-prepare/1', 'sourceS': SOURCE, 'target': target,
             'root': str(root), 'wheel': str(wheel), 'copy': str(copy),
             'wheelSha256': PINS[target]['wheel'], 'cliSha256': sha(cli), 'materials': before}
    with (output / 'prepare.json').open('x') as stream:
        json.dump(state, stream, indent=2)
    return state


def verify(prepared: Path, prepared_sha: str, report: Path, report_sha: str) -> dict:
    state_raw, report_raw = read(prepared), read(report)
    insist(sha(state_raw) == prepared_sha and sha(report_raw) == report_sha, 'Prepared/report hash differs')
    state, result = json.loads(state_raw), json.loads(report_raw)
    insist(state.get('profile') == 'umf.packaged-cli-prepare/1' and state.get('sourceS') == SOURCE, 'Wrong preparation identity')
    target = state['target']
    insist(target in PINS, 'Unselected platform')
    pin = PINS[target]
    insist(state['wheelSha256'] == pin['wheel'] and state['cliSha256'] == pin['cli'], 'Preparation pins differ')
    root, wheel, copy = Path(state['root']), Path(state['wheel']), Path(state['copy'])
    before = snapshot(root)
    insist(state['materials'] == before, 'Qualification materials changed after prepare')
    cli = wheel_cli(wheel, target, root)
    insist(read(copy) == cli and copy.stat().st_mode & 0o111, 'Packaged CLI copy changed or is not executable')
    insist(result.get('profile') == 'umf.saga.portable-host-receipt/2'
           and result.get('host') == result.get('hostId') == 'cli', 'Wrong actual CLI host receipt')
    insist(result.get('runtime') == pin['runtime'], 'Wrong actual host platform')
    corpus = json.loads(read(root / 'fixtures/saga/portable.json'))
    vectors = corpus['cases']
    insist(len(vectors) == 19 and len({v['id'] for v in vectors}) == 19, 'Expected existing independent 19-vector corpus')
    expected = [{'id': v['id'], 'covers': v['covers'], 'passed': True} for v in vectors]
    insist(type(result.get('cases')) is int and type(result.get('passed')) is int
           and result['cases'] == result['passed'] == 19
           and json.dumps(result.get('results'), sort_keys=True) == json.dumps(expected, sort_keys=True), 'Incomplete or failed vector roster')
    inputs = {name: before[name] for name in input_paths(root)}
    insist(result.get('qualificationInputs') == inputs and result.get('corpusSha256') == inputs['fixtures/saga/portable.json'], 'Report input/oracle hashes differ')
    insist(result.get('artifacts') == {'cliBinary': {'path': str(copy), 'sha256': pin['cli']}}, 'Report targets a different CLI artifact')
    insist(snapshot(root) == before and read(copy) == cli and sha(read(wheel)) == pin['wheel'], 'Materials changed during verify')
    insist(read(prepared) == state_raw and read(report) == report_raw, 'Prepared/report changed during verify')
    after = snapshot(root)
    insist(after == before, 'Qualification materials changed after report verification')
    return {'profile': 'umf.packaged-cli-verification/1', 'sourceS': SOURCE, 'target': target,
            'status': 'passed', 'cases': 19, 'passed': 19, 'wheelSha256': pin['wheel'],
            'cliSha256': pin['cli'], 'preparedSha256': prepared_sha, 'reportSha256': report_sha,
            'beforeMaterials': before, 'afterMaterials': after,
            'scope': 'Existing CLI19 report for exact wheel-carried CLI copy; helper executes no native code'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('prepare')
    p.add_argument('--wheel', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--platform', choices=PINS, required=True)
    p.add_argument('--root', type=Path, default=ROOT)
    v = commands.add_parser('verify')
    for name in ('prepared', 'report'):
        v.add_argument('--' + name, type=Path, required=True)
        v.add_argument('--' + name + '-sha256', required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        result = prepare(args.wheel, args.output, args.platform, args.root)
    else:
        result = verify(args.prepared, args.prepared_sha256, args.report, args.report_sha256)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
