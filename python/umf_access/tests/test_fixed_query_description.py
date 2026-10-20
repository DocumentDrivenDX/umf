# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native types are described once, without inventing expression nullability."""
import unittest
from types import SimpleNamespace

from test_operation_input_snapshot import _fixture
from umf_access.unified import SessionError
from umf_access.unified.table_reads import SyncTableReader


class NativeDescription(unittest.TestCase):
    def reader(self):
        session,binding,_,_=_fixture('query')
        result=SyncTableReader(session,{}, {},binding,cursor_secret=b'x'*32)
        result._queries={'operation':object()}
        return result
    def test_metadata_is_small_and_warm_calls_need_no_description(self):
        reader=self.reader()
        program={'operation':'operation','outputs':[{'name':'average','carrier':'float','nullable':True}]}
        self.assertTrue(reader._needs_description(program))
        reader._accept_description(SimpleNamespace(description=[('average',701)]),program)
        self.assertFalse(reader._needs_description(program))
        self.assertEqual(reader._descriptions,{'operation':(('average',701),)})
        self.assertTrue(program['outputs'][0]['nullable'])
    def test_mismatch_never_warms_the_metadata_cache(self):
        for description in ([('average',1700)],[('average',700)],[('different',701)],[],[('average',)]):
            reader=self.reader()
            program={'operation':'operation','outputs':[{'name':'average','carrier':'float','nullable':True}]}
            with self.assertRaises(SessionError):reader._accept_description(SimpleNamespace(description=description),program)
            self.assertTrue(reader._needs_description(program))
