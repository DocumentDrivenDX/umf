"""Private selected-routine custody controls; no native qualification."""
import json,unittest
from pathlib import Path
module={};exec(compile(Path(__file__).with_name('pg-routine-custody.py').read_bytes(),'pg-routine-custody.py','exec'),module)
InstalledRoutine=module['InstalledRoutine']
ORIGINAL={'oid':'12','owner':'guardian','language':'sql','definer':True,'volatility':'s','signature':'','configuration':['search_path=pg_catalog','debug_print_plan=off','debug_print_parse=off','debug_print_rewritten=off'],'body':'SELECT 1','binary':None,'acl':'{guardian=X/guardian}'}
def fresh():return json.loads(json.dumps(ORIGINAL))
class CustodyTests(unittest.TestCase):
 def test_all_ten_selected_fields_and_unknown_or_missing_fields_refuse(self):
  guard=InstalledRoutine(fresh());guard.admit(fresh())
  for field in ORIGINAL:
   with self.subTest(field=field):
    candidate=fresh();candidate[field]='foreign';self.assertRaises(ValueError,guard.admit,candidate)
    candidate=fresh();del candidate[field];self.assertRaises(ValueError,guard.admit,candidate)
  candidate=fresh();candidate['unregistered']='meaning';self.assertRaises(ValueError,guard.admit,candidate)
 def test_original_and_nested_configuration_are_copied_and_order_retained(self):
  original=fresh();guard=InstalledRoutine(original);original['owner']='attacker';original['configuration'][1]='debug_print_plan=on';guard.admit(fresh());self.assertRaises(ValueError,guard.admit,original)
  candidate=fresh();candidate['configuration'].reverse();self.assertRaises(ValueError,guard.admit,candidate)
 def test_foreign_builtin_subclasses_and_metaclass_comparisons_do_not_run(self):
  touched=[]
  class HostileMeta(type):
   def __eq__(self,other):touched.append('comparison');raise AssertionError('callback')
  class Foreign(int,metaclass=HostileMeta):pass
  class Dict(dict):pass
  class String(str):pass
  guard=InstalledRoutine(fresh())
  for candidate in [Dict(fresh()),{String(k):v for k,v in fresh().items()}]:self.assertRaises(ValueError,guard.admit,candidate)
  candidate=fresh();candidate['oid']=Foreign(12);self.assertRaises(ValueError,guard.admit,candidate);self.assertEqual(touched,[])
 def test_large_and_non_json_selected_values_refuse(self):
  guard=InstalledRoutine(fresh())
  for value in ['x'*65536,object(),float('nan')]:
   candidate=fresh();candidate['body']=value;self.assertRaises(ValueError,guard.admit,candidate)
if __name__=='__main__':unittest.main()
