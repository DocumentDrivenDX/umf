# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual offline CLI/chain behavior with byte and source tamper controls."""
import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

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

    def test_v03_approved_digest_alone_does_not_create_host_receipt(self):
        plan=_host_plan()
        with patch('umf_codegen.verify_table_migration',return_value=plan), \
             patch('psycopg.connect',side_effect=AssertionError('must not connect')), \
             contextlib.redirect_stderr(io.StringIO()) as errors:
            result=main(['apply','--plan',str(FIXTURES/'plan-001.json'),
                '--approved-digest',plan['digest'],'--expected-head','a'*64,
                *_host_args()])
        self.assertEqual(result,1)
        self.assertEqual(json.loads(errors.getvalue())['code'],'approval-receipt-required')

    def test_approve_persists_explicit_host_identity_and_returns_receipt_id(self):
        plan=_host_plan()
        receipt=SimpleNamespace(receipt_id='receipt-123',decision='approved',
            binding_digest='b'*64,
            decider='trusted_admin',decided_at='2026-10-21T12:00:00+00:00',
            qualification_profile='local-pg18-v1',evidence_digest='c'*64)
        host=SimpleNamespace(record_approval=lambda request,**kwargs:receipt)
        connection=MagicMock()
        with patch('umf_codegen.verify_table_migration',return_value=plan), \
             patch('psycopg.connect',return_value=connection), \
             patch('umf_access.lifecycle.cli._execute'), \
             patch('umf_access.lifecycle.cli.PsycopgMigrationHost',return_value=host), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            result=main(['approve','--plan',str(FIXTURES/'plan-001.json'),
                '--expected-head','a'*64,*_host_args()])
        self.assertEqual(result,0)
        payload=json.loads(output.getvalue())
        self.assertEqual(payload['receiptId'],'receipt-123')
        self.assertEqual(payload['installationId'],'stable-test')

    def test_v03_apply_routes_exact_receipt_identifier_and_sanitizes_dsn(self):
        plan=_host_plan()
        connection=MagicMock()
        host=object()
        with patch('umf_codegen.verify_table_migration',return_value=plan), \
             patch('psycopg.connect',return_value=connection), \
             patch('umf_access.lifecycle.cli._execute'), \
             patch('umf_access.lifecycle.cli.PsycopgMigrationHost',return_value=host), \
             patch('umf_access.lifecycle.cli.apply_migration_on_host',return_value={'status':'committed'}) as apply, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            result=main(['apply','--plan',str(FIXTURES/'plan-001.json'),
                '--expected-head','a'*64,'--approval-id','receipt-123',*_host_args()])
        self.assertEqual(result,0)
        self.assertEqual(json.loads(output.getvalue())['status'],'committed')
        self.assertEqual(apply.call_args.kwargs['approval_id'],'receipt-123')

    def test_v03_apply_process_boundary_sanitizes_dsn(self):
        plan=_host_plan()
        with patch('umf_codegen.verify_table_migration',return_value=plan), \
             patch('psycopg.connect',side_effect=RuntimeError('postgresql://secret@db/password')), \
             patch('umf_access.lifecycle.cli._execute'), \
             contextlib.redirect_stderr(io.StringIO()) as errors:
            result=main(['apply','--plan',str(FIXTURES/'plan-001.json'),
                '--expected-head','a'*64,'--approval-id','receipt-123',
                '--dsn','postgresql://secret@db/password',*_host_args()])
        self.assertEqual(result,1)
        rendered=errors.getvalue()
        self.assertNotIn('secret',rendered)
        self.assertNotIn('password',rendered)
        self.assertEqual(json.loads(rendered)['code'],'LIFECYCLE_FAILED')


def _host_plan():
    return {'version':'umf.table-migration/0.3','digest':'d'*64,
        'approvalProfile':{'version':'umf.table-migration-approval/0.1',
            'relation':'umf_lifecycle_approvals','ownerOnly':True},
        'next':{'configuration':{'ownerRole':'test_owner'}}}


def _host_args():
    return ['--installation-id','stable-test','--target-profile','local-pg18',
        '--qualification-profile','local-pg18-v1','--evidence-digest','c'*64]


if __name__=='__main__':
    unittest.main()
