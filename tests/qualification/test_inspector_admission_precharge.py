"""Source-only regression guards; native denial controls remain unexecuted."""
from pathlib import Path
import re
import json
import unittest
ROOT=Path(__file__).resolve().parents[2]
BASE='73357488c642429ecf8c99737604f22288b13faf'
def body(source,signature):
    start=source.index(signature);start=source.index('{',start);depth=1;end=start+1
    while depth:
        depth += (source[end]=='{')-(source[end]=='}');end+=1
    return source[start:end]
def key_storage_guard(source):
    text=body(source,'fn schema_admission_key_with_copy(')
    if 'comparisons.saturating_add(units).saturating_add(1)' not in text:raise ValueError('Independent full key-copy/storage fee absent')
    if not text.index('charge_work_u64_with_path')<text.index('keys.insert(materialize(key))'):raise ValueError('Key materializer precedes admission')
def owned_path_guard(source):
    start=source.index('fn schema_admission_error(') if 'fn schema_admission_error(' in source else source.index('fn schema_json_with_mode(')
    text=source[start:source.index('fn schema_id_metered(',start)]
    if 'path.clone()' in text:raise ValueError('Eager owned diagnostic path clone')
    node=body(source,'fn schema_admission_node(')
    if not node.index('charge_work_with_path(1,path)')<node.index('checked_add(1)')<node.index('check_tree_value_count_with_path')<node.index('depth>'):raise ValueError('Node/count/depth order or movable custody absent')
class AdmissionPrechargeSourceControls(unittest.TestCase):
    def setUp(self):
        self.current=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        self.baseline=json.loads((ROOT/'tests/qualification/fixtures/inspector-admission-precharge-baseline.json').read_text())
        self.assertEqual(self.baseline['source'],BASE)
        self.original=self.baseline['schemaAdmission']
    def test_first_key_materializer_requires_independent_storage_before_effect(self):
        with self.assertRaises(ValueError):key_storage_guard(self.original)
        key_storage_guard(self.current)
    def test_owned_path_node_count_guards_refuse_original_and_accept_movable_custody(self):
        with self.assertRaises(ValueError):owned_path_guard(self.original)
        owned_path_guard(self.current)
    def test_wide_scratch_and_count_use_existing_single_state_machine_and_predicate(self):
        current=(ROOT/'crates/umf-core/src/context.rs').read_text()
        original=self.baseline['contextWork']
        self.assertEqual(body(current,'fn charge_work_path('),body(original,'fn charge_work_path('))
        self.assertIn('WorkPath::Scratch(path)',body(current,'fn charge_work_u64_with_path('))
        self.assertIn('WorkPath::Scratch(path)',body(current,'fn check_tree_value_count_with_path('))
        count=body(current,'fn check_tree_value_count_path(')
        self.assertIn('count>self.limits.max_values',count)
        self.assertIn('"JSON structural value limit exceeded"',count)
        self.assertNotIn('charge_work',count)
if __name__=='__main__':unittest.main()
