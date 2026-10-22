"""Fault controls for the actual native statement-outcome classifier; no DB needed."""
import ast,re,types,unittest
from pathlib import Path
source=Path(__file__).with_name('pg18-column-withhold.py')
tree=ast.parse(source.read_text());definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='classify_statement_refusal')
namespace={'re':re};exec(compile(ast.Module(body=[definition],type_ignores=[]),str(source),'exec'),namespace)
classify=namespace['classify_statement_refusal']
class RefusalClassification(unittest.TestCase):
 def result(self,code=3,stdout='',stderr='ERROR:  42501: permission denied for column secret\nLOCATION: aclcheck_error, aclchk.c:1\n'):
  return types.SimpleNamespace(returncode=code,stdout=stdout,stderr=stderr)
 def test_native_primary_permission_error(self):
  self.assertEqual(classify(self.result()),dict(status='refused',scope='statement',sqlstate='42501',rows=[]))
 def test_other_outcomes_cannot_supply_permission_evidence(self):
  cases=[self.result(code=0),self.result(code=1),self.result(code=2),self.result(code=-15),self.result(stdout='private-A\n'),self.result(stdout='\n'),self.result(stdout=' '),self.result(stderr='ERROR:  22012: message happens to mention 42501\n'),self.result(stderr='FATAL:  42501: connection refused\n'),self.result(stderr='PANIC:  42501: unavailable\n'),self.result(stderr='transport failed (42501)\n'),self.result(stderr='ERROR:  42501: denied\nERROR:  22012: another error\n'),self.result(stderr='ERROR:  42501: denied\nFATAL:  08006: closed\n'),self.result(stderr='')]
  for value in cases:
   with self.subTest(value=value):
    with self.assertRaises(AssertionError):classify(value)
if __name__=='__main__':unittest.main()
