# SPDX-License-Identifier: MIT OR Apache-2.0
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('restore', Path(__file__).resolve().parents[1] / 'scripts/restore-optional-assets.py')
RESTORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RESTORE)


class OptionalAssets(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.output = self.root / 'replay'
        self.original_root = RESTORE.ROOT
        RESTORE.ROOT = self.repo
        self.addCleanup(setattr, RESTORE, 'ROOT', self.original_root)
        self.git('init', '-q')
        (self.repo / 'assets').mkdir()
        self.raw = bytes(range(256)) * 1024
        (self.repo / 'assets/raw.bin').write_bytes(self.raw)
        (self.repo / 'assets/retained.txt').write_text('local input')
        (self.repo / 'assets/executable').write_text('#!/bin/sh\nexit 0\n')
        (self.repo / 'assets/executable').chmod(0o755)
        self.git('add', 'assets')
        self.manifest = {'revision': self.git('write-tree').decode().strip(), 'groups': [
            {'id': 'fixtures', 'roots': ['assets/'], 'retained': ['assets/retained.txt']}]}

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, stderr=subprocess.PIPE)

    def test_round_trip_and_retained_exclusion(self):
        result = RESTORE.restore(self.manifest, 'fixtures', self.output)
        self.assertEqual(result['files'], 2)
        self.assertEqual((self.output / 'assets/raw.bin').read_bytes(), self.raw)
        self.assertTrue((self.output / 'assets/executable').stat().st_mode & 0o111)
        self.assertFalse((self.output / 'assets/retained.txt').exists())
        self.assertEqual(RESTORE.restore(self.manifest, 'fixtures', self.output)['files'], 2)

    def test_changed_destination_is_never_overwritten(self):
        (self.output / 'assets').mkdir(parents=True)
        path = self.output / 'assets/raw.bin'
        path.write_bytes(b'edited')
        with self.assertRaisesRegex(ValueError, 'overwrite changed'):
            RESTORE.restore(self.manifest, 'fixtures', self.output)
        self.assertEqual(path.read_bytes(), b'edited')
        self.assertFalse((self.output / 'assets/executable').exists())

    def test_symlink_escape_is_rejected_before_writing(self):
        self.output.mkdir()
        (self.root / 'outside').mkdir()
        (self.output / 'assets').symlink_to(self.root / 'outside', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            RESTORE.restore(self.manifest, 'fixtures', self.output)
        self.assertEqual(list((self.root / 'outside').iterdir()), [])

    def test_verify_only_and_selection(self):
        result = RESTORE.restore(self.manifest, 'fixtures', self.output, 'assets/raw.bin', True)
        self.assertEqual(result['files'], 1)
        self.assertEqual(result['bytes'], len(self.raw))
        self.assertFalse(self.output.exists())
        with self.assertRaisesRegex(ValueError, 'No optional assets'):
            RESTORE.restore(self.manifest, 'fixtures', self.output, 'missing')

    def test_missing_revision_fails_without_writing(self):
        self.manifest['revision'] = '0' * 40
        with self.assertRaises(subprocess.CalledProcessError):
            RESTORE.restore(self.manifest, 'fixtures', self.output)
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
