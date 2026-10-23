# SPDX-License-Identifier: MIT OR Apache-2.0
"""G02 row expressions remain migration-only before ordinary runtime effects."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from umf_access.unified.table_reads import SyncTableReader
from umf_access.unified.session_policy import SessionError


class G02OrdinaryRuntimeRefusal(unittest.TestCase):
    def test_v02_operation_refuses_before_compilation_or_sql_preparation(self):
        reader=object.__new__(SyncTableReader)
        declaration={'version':'umf.table-operation/0.2','body':{'kind':'update'}}
        with (patch.object(reader,'_source_for',return_value=(None,{},None,{'derive':declaration})),
              patch.object(reader,'_prepared_for',side_effect=AssertionError('compiler must not be entered')) as prepare):
            with self.assertRaisesRegex(SessionError,'unsupported ordinary table operation version'):
                reader._prepare_owned(None,'derive',{},None,None)
            prepare.assert_not_called()


if __name__=='__main__':
    unittest.main()
