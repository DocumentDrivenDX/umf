# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure synthetic archive/report controls. No native CLI execution or qualification."""
import base64
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('qualify_packaged_cli', ROOT / 'tools/qualify_packaged_cli.py')
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)


def elf(machine=62):
    return b'\x7fELF\x02\x01\x01' + bytes(9) + struct.pack('<HHI', 3, machine, 1) + bytes(40)


class PackagedCliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'root'
        for name in ('fixtures/saga/portable.json', 'scripts/saga-portable/verify.ts',
                     'scripts/saga-portable/other-hosts.ts', 'python/_native_platform.py',
                     'tools/qualify_packaged_cli.py'):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        (self.root / 'scripts/saga-portable/custody.ts').write_text(
            "export const SAGA_QUALIFICATION_INPUTS=['fixtures/saga/portable.json',"
            "'scripts/saga-portable/verify.ts','scripts/saga-portable/other-hosts.ts',"
            "'scripts/saga-portable/custody.ts'] as const;")
        self.wheel = Path(self.tmp.name) / 'synthetic.whl'
        self.output = Path(self.tmp.name) / 'prepared'
        self.members = {'umf/_bin/umf': elf(), 'umf/_rust_core.abi3.so': elf(),
                        'umf_core-0.10.8.dist-info/METADATA': b'Name: umf-core\nVersion: 0.10.8\n',
                        'umf_core-0.10.8.dist-info/WHEEL': b'Root-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n'}
        self.pins = copy.deepcopy(HELPER.PINS)
        self.pins['linux-x86_64']['cli'] = HELPER.sha(elf())
        self.pin_patch = patch.object(HELPER, 'PINS', self.pins)
        self.pin_patch.start(); self.addCleanup(self.pin_patch.stop)
        self.write_wheel()

    def write_wheel(self, damage_record=False):
        rows = []
        for name, raw in self.members.items():
            digest = base64.urlsafe_b64encode(bytes.fromhex(HELPER.sha(raw))).decode().rstrip('=')
            rows.append([name, 'sha256=' + digest, str(len(raw))])
        if damage_record:
            rows[0][1] = 'sha256=wrong'
        rows.append(['umf_core-0.10.8.dist-info/RECORD', '', ''])
        record = io.StringIO(); csv.writer(record).writerows(rows)
        with zipfile.ZipFile(self.wheel, 'w') as archive:
            for name, raw in self.members.items():
                archive.writestr(name, raw)
            archive.writestr(rows[-1][0], record.getvalue())
        self.pins['linux-x86_64']['wheel'] = HELPER.sha(self.wheel.read_bytes())

    def prepare(self):
        return HELPER.prepare(self.wheel, self.output, 'linux-x86_64', self.root)

    def report(self, state):
        vectors = json.loads((self.root / 'fixtures/saga/portable.json').read_text())['cases']
        return {'profile': 'umf.saga.portable-host-receipt/2', 'hostId': 'cli', 'host': 'cli',
                'runtime': {'platform': 'linux', 'arch': 'x64'}, 'cases': 19, 'passed': 19,
                'results': [{'id': v['id'], 'covers': v['covers'], 'passed': True} for v in vectors],
                'qualificationInputs': {k: state['materials'][k] for k in HELPER.input_paths(self.root)},
                'corpusSha256': state['materials']['fixtures/saga/portable.json'],
                'artifacts': {'cliBinary': {'path': state['copy'], 'sha256': state['cliSha256']}}}

    def verify(self, report=None, expected_report_sha=None):
        state = json.loads((self.output / 'prepare.json').read_text())
        report = self.report(state) if report is None else report
        path = Path(self.tmp.name) / 'synthetic-report.json'
        path.write_text(json.dumps(report))
        prepared = self.output / 'prepare.json'
        return HELPER.verify(prepared, HELPER.sha(prepared.read_bytes()), path,
                             expected_report_sha or HELPER.sha(path.read_bytes()))

    def test_unchanged_executable_copy_and_existing_report_shape(self):
        state = self.prepare()
        self.assertEqual(Path(state['copy']).read_bytes(), self.members['umf/_bin/umf'])
        result = self.verify()
        self.assertEqual(result['beforeMaterials'], result['afterMaterials'])
        self.assertEqual(result['passed'], 19)

    def test_wrong_wheel_hash_refuses_before_extract(self):
        self.wheel.write_bytes(self.wheel.read_bytes() + b'altered')
        with self.assertRaisesRegex(ValueError, 'wheel hash'):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_changed_cli_member_refuses_even_with_new_archive_pin(self):
        self.members['umf/_bin/umf'] += b'changed'; self.write_wheel()
        with self.assertRaisesRegex(ValueError, 'CLI hash'):
            self.prepare()

    def test_invalid_record_refuses_even_with_matching_archive_pin(self):
        self.write_wheel(damage_record=True)
        with self.assertRaisesRegex(ValueError, 'RECORD payload'):
            self.prepare()

    def test_missing_member_refuses(self):
        del self.members['umf/_bin/umf']; self.write_wheel()
        with self.assertRaisesRegex(ValueError, 'member missing'):
            self.prepare()

    def test_wrong_native_platform_refuses(self):
        self.members['umf/_rust_core.abi3.so'] = elf(machine=183); self.write_wheel()
        with self.assertRaisesRegex(ValueError, 'native platform'):
            self.prepare()

    def test_wrong_wheel_platform_refuses(self):
        self.members['umf_core-0.10.8.dist-info/WHEEL'] = b'Root-Is-Purelib: false\nTag: cp311-abi3-linux_aarch64\n'
        self.write_wheel()
        with self.assertRaisesRegex(ValueError, 'platform tag'):
            self.prepare()

    def test_failed_missing_reordered_and_integer_boolean_vectors_refuse(self):
        state = self.prepare()
        for mutation in ('failed', 'missing', 'reordered', 'integer'):
            report = self.report(state)
            if mutation == 'failed': report['results'][0]['passed'] = False
            elif mutation == 'missing': report['results'].pop()
            elif mutation == 'reordered': report['results'].reverse()
            else: report['results'][0]['passed'] = 1
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, 'vector roster'):
                self.verify(report)

    def test_wrong_report_hash_refuses(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'report hash'):
            self.verify(expected_report_sha='0' * 64)

    def test_wrong_platform_and_standalone_target_report_refuse(self):
        state = self.prepare()
        report = self.report(state); report['runtime']['arch'] = 'arm64'
        with self.assertRaisesRegex(ValueError, 'host platform'): self.verify(report)
        report = self.report(state); report['artifacts']['cliBinary']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'different CLI'): self.verify(report)
        report = self.report(state); report['artifacts']['cliBinary']['path'] = '/standalone/umf'
        with self.assertRaisesRegex(ValueError, 'different CLI'): self.verify(report)

    def test_changed_materials_or_copied_executable_refuse(self):
        state = self.prepare()
        Path(state['copy']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'copy changed'): self.verify()
        Path(state['copy']).write_bytes(self.members['umf/_bin/umf'])
        (self.root / 'scripts/saga-portable/verify.ts').write_text('changed oracle')
        with self.assertRaisesRegex(ValueError, 'materials changed'): self.verify()

    def test_altered_report_oracle_hash_refuses(self):
        state = self.prepare(); report = self.report(state)
        report['qualificationInputs']['scripts/saga-portable/verify.ts'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'oracle hashes'): self.verify(report)

    def test_prepare_never_overwrites_existing_output(self):
        self.output.mkdir()
        with self.assertRaisesRegex(ValueError, 'Output must be new'): self.prepare()

    def test_macos_inspector_accepts_arm64_and_refuses_wrong_cpu(self):
        raw = struct.pack('<IiiIIIII', 0xfeedfacf, 0x0100000c, 0, 2, 1, 24, 0, 0)
        raw += struct.pack('<IIIIII', 0x32, 24, 1, 11 << 16, 11 << 16, 0)
        HELPER.native_platform(raw, 'macos-arm64', self.root)
        wrong = bytearray(raw); struct.pack_into('<i', wrong, 4, 0x01000007)
        with self.assertRaisesRegex(ValueError, 'CPU'):
            HELPER.native_platform(bytes(wrong), 'macos-arm64', self.root)


if __name__ == '__main__':
    unittest.main()
