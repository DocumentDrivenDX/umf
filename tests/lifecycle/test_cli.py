# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual offline CLI/chain behavior with byte and source tamper controls."""
import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from umf_access.lifecycle import CatalogError
from umf_access.lifecycle.cli import check_chain, main

FIXTURES=Path(__file__).resolve().parents[2]/'fixtures/table-lifecycle/legal'


class LifecycleCLI(unittest.TestCase):
    def test_chain_closes_over_terminal_source_and_pinned_bytes(self):
        paths=[FIXTURES/('plan-'+number+'.json') for number in ('001','002','003')]
        manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
        current=json.loads(paths[-1].read_text())['next']
        with patch('psycopg.connect',side_effect=AssertionError('offline operation attempted DB access')):
            self.assertEqual(check_chain(paths,current_bundle=current,manifest=manifest)['status'],'checked')
            with self.assertRaisesRegex(CatalogError,'migration-chain-mismatch'):
                check_chain(paths[::-1])
            with self.assertRaisesRegex(CatalogError,'migration-terminal-source-mismatch'):
                check_chain(paths,current_bundle=json.loads(paths[0].read_text())['next'])

    def test_original_file_digest_rejects_whitespace_edit(self):
        with tempfile.TemporaryDirectory() as directory:
            source=FIXTURES/'plan-001.json';path=Path(directory)/source.name
            path.write_bytes(source.read_bytes()+b'\n')
            with self.assertRaisesRegex(CatalogError,'migration-file-digest-conflict'):
                check_chain([path],manifest={source.name:hashlib.sha256(source.read_bytes()).hexdigest()})

    def test_new_checks_original_source_and_never_overwrites_existing_output(self):
        plan=json.loads((FIXTURES/'plan-002.json').read_text())
        request={key:plan[key] for key in ('id','predecessor','previous','next','options')}
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            path=Path(directory)/'request.json';output=Path(directory)/'migration.json'
            path.write_text(json.dumps(request))
            self.assertEqual(main(['new','--request',str(path),'--output',str(output)]),0)
            self.assertEqual(json.loads(output.read_text()),plan)
            original=output.read_bytes()
            self.assertEqual(main(['new','--request',str(path),'--output',str(output)]),1)
            self.assertEqual(output.read_bytes(),original)

    def test_apply_refuses_wrong_approval_before_connect(self):
        with patch('psycopg.connect',side_effect=AssertionError('unapproved connection')),contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(main(['apply','--plan',str(FIXTURES/'plan-001.json'),'--approved-digest','wrong','--expected-head','initial']),1)
            self.assertEqual(json.loads(errors.getvalue())['code'],'approval-required')


if __name__=='__main__':
    unittest.main()
