# SPDX-License-Identifier: MIT OR Apache-2.0
"""Command selection retains complete captured ActionSource custody."""
import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import patch

from umf_access.build.commands import CommandBuildError, emit_command
from umf_access.capture import CapturedDeclaration, CapturedVariant
from umf_access.dsl import Node
from umf_access.types import ActionRef, ActionSource, StrictModel


class Empty(StrictModel):
    pass


class CommandSourceTests(unittest.TestCase):
    def test_action_source_refuses_historical_core_pin(self):
        with self.assertRaisesRegex(ValueError, 'unsupported original action source profile'):
            ActionSource('document', '0.8.0', 'commerce', 'approve', 'a' * 64,
                         '/modules/0/extensions/umf.actions/actions/0', 'umf.actions.tx', '1')

    def test_exact_action_source_compiles_but_same_ids_changed_source_refuse(self):
        source = ActionSource('document', '0.10.0', 'commerce', 'approve', 'a' * 64,
                              '/modules/0/extensions/umf.actions/actions/0', 'umf.actions.tx', '1')
        reference = ActionRef('commerce', 'approve', Empty, Empty, source)
        variant = CapturedVariant((), Node('update', ()), ())
        declaration = CapturedDeclaration('approve_drafts', 'command', (), (variant,), source)
        target = {'id': 'pg', 'kind': 'postgresql', 'backendId': 'pg', 'backendVersion': '18',
                  'targetProfile': 'postgresql18', 'binding': {}, 'platform': []}
        request = {'original': 'owner request'}
        manifest = {'inputDigest': 'b' * 64, 'symbols': [
            {'role': 'action-ref', 'pointer': source.action_pointer, 'symbol': 'Approve'}]}
        def emit(captured):
            return emit_command(object(), captured, object(), [target],
                                {('pg', 'commerce', 'approve'): request}, [reference], manifest,
                                0, 'approve_drafts', 'commerce', lambda *_: 'str')
        program = SimpleNamespace(original_json='{}', statements_json='[]', bundle_input_digest='b' * 64)
        with patch('umf_access.build.commands.compile_command', return_value=program) as compile_command:
            lines, entries = emit(declaration)
            compile_command.assert_called_once()
            self.assertIs(compile_command.call_args.args[1], declaration)
            self.assertIs(compile_command.call_args.args[5], request)
            self.assertEqual(len(entries), 1)
            self.assertTrue(any('Approve' in line for line in lines))
        for changed in (replace(source, document_sha256='c' * 64),
                        replace(source, document_id='different-document'),
                        replace(source, action_pointer='/modules/1/extensions/umf.actions/actions/0'), None):
            with self.subTest(source=changed), patch('umf_access.build.commands.compile_command') as compile_command:
                with self.assertRaisesRegex(CommandBuildError, 'action source'):
                    emit(replace(declaration, action=changed))
                compile_command.assert_not_called()
