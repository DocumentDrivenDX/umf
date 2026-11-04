"""Pure tuple/custody integration guards, not Rust typechecking or native tests."""
import re
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]

def code_only(source):
    # Mask comments and strings before balancing delimiters. Retain source
    # offsets/newlines; Rust lifetimes are not treated as character literals.
    pattern=r'//[^\n]*|/\*.*?\*/|r(?P<hashes>\#*)".*?"(?P=hashes)|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])\''
    return re.sub(pattern,lambda m:''.join('\n'if c=='\n'else' 'for c in m.group()),source,flags=re.S)

def body(source,name):
    text=code_only(source);m=re.search(r'\bfn\s+'+re.escape(name)+r'\b',text)
    if not m:raise ValueError('missing function '+name)
    start=text.index('{',m.end());depth=1;end=start+1
    while depth:
        depth+=(text[end]=='{')-(text[end]=='}');end+=1
    return text[start:end]

def ok_tuple_arities(source,name):
    text=body(source,name);rows=[]
    for match in re.finditer(r'\bOk\s*\(\s*\(',text):
        start=match.end();end=start;depth=0;count=1
        while True:
            c=text[end]
            if c==')'and depth==0:break
            if c in '([{':depth+=1
            elif c in ')]}':depth-=1
            elif c==','and depth==0:count+=1
            end+=1
        if text[start:end].rstrip().endswith(','):count-=1
        rows.append(count)
    return rows

def validate_returns(source,name,arity):
    rows=ok_tuple_arities(source,name)
    if not rows or any(n!=arity for n in rows):raise ValueError((name,arity,rows))

def parenthesized_fields(text,start):
    """Split a masked Rust argument/tuple list, retaining nested type structure."""
    fields=[];begin=start;depth=0;end=start
    while True:
        c=text[end]
        if c==')' and depth==0:
            if text[begin:end].strip():fields.append(text[begin:end].strip())
            return fields
        if c in '(<[{':depth+=1
        elif c in ')>]}':depth-=1
        elif c==',' and depth==0:
            fields.append(text[begin:end].strip());begin=end+1
        end+=1


def validate_annotation_staging(source):
    """Check the actual producer/helper/consumer protocol behind the four E0308s."""
    text=code_only(source)
    declaration=re.search(r'\bfn\s+eval_keyword_annotations\b',text)
    if declaration is None:raise ValueError('missing annotation staging helper')
    params=parenthesized_fields(text,text.index('(',declaration.end())+1)
    for name in ('unevaluated_properties','unevaluated_items'):
        selected=[p.split(':',1)[1] for p in params if p.split(':',1)[0].strip()==name]
        if len(selected)!=1:raise ValueError('missing/duplicate staging parameter '+name)
        compact=re.sub(r'\s+','',selected[0])
        match=re.fullmatch(r"&mutOption<\((.*)\)>",compact)
        fields=parenthesized_fields(match.group(1)+')',0) if match else []
        if fields!=["&'aValue",'Utf16','Option<OwnerCursor>']:
            raise ValueError('annotation staging signature loses value lifetime/path/cursor: '+name)
    calls=list(re.finditer(r'\.eval_keyword_annotations\s*\(',text))
    if len(calls)!=2:raise ValueError('annotation caller census differs')
    for call in calls:
        args=parenthesized_fields(text,call.end())
        if [re.sub(r'\s+','',a) for a in args[-2:]]!=['&mutunevaluated_properties','&mutunevaluated_items']:
            raise ValueError('annotation caller does not pass both matching staging slots')
    stores=body(source,'eval_keyword_annotations')
    finish=body(source,'finish_eval_inner')
    for name in ('unevaluated_properties','unevaluated_items'):
        rows=list(re.finditer(r'\*'+name+r'\s*=\s*Some\s*\(\s*\(',stores))
        if len(rows)!=1:raise ValueError('annotation store census differs')
        fields=parenthesized_fields(stores,rows[0].end())
        if len(fields)!=3 or not re.search(r'\bclone_owner_cursor\s*\(\s*evaluated\.selected_cursor\.as_ref\s*\(',fields[2]):
            raise ValueError('annotation store loses selected cursor')
        if not re.search(r'if\s+let\s+Some\s*\(\(rule,\s*kp,\s*cursor\)\)\s*=\s*'+name,finish):
            raise ValueError('annotation terminal consumer loses staged cursor')


class OwnerCursorSourceControls(unittest.TestCase):
    def test_all_located_and_legacy_reference_return_shapes_remain_distinct(self):
        schema=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        plans=(ROOT/'crates/umf-core/src/schema_owned_plans.rs').read_text()
        for text,name,arity in [(schema,'resolve_ref_unplanned',2),(schema,'resolve_ref_location_impl',3),
          (schema,'resolve_eval_ref_unplanned',3),(schema,'resolve_eval_location_impl',4),
          (plans,'resolve_inner',3),(plans,'resolve_eval_inner',4)]:
            with self.subTest(name=name):validate_returns(text,name,arity)
        # Reproduce the exact reviewed draft integration error without invoking
        # Cargo. A four-item declaration must not hide a three-item early return.
        broken=schema.replace('return Ok((target,target_path,id_applied,cursor));','return Ok((target,target_path,id_applied));',1)
        self.assertNotEqual(broken,schema)
        with self.assertRaises(ValueError):validate_returns(broken,'resolve_eval_location_impl',4)
        self.assertIn('return Ok((target,target_path,id_applied,cursor));',schema)
    def test_every_new_reference_frame_node_and_preflight_call_keeps_its_argument_protocol(self):
        expected={'resolve_ref_unplanned_located':4,'resolve_eval_ref_unplanned_located':3,
          'resolve_eval_ref_located':3,'resolve_ref_location_impl':5,'resolve_eval_location_impl':4,
          'resolve_located':5,'resolve_eval_located':4,'frame_at':6,'node_at':6,
          'frame_inner':6,'node_inner':6,'preflight_located':8,'location_root':3,
          'location_for_root_value':2,'member_cursor':4,'build_with_events':3}
        counts={name:0 for name in expected}
        for file in (ROOT/'crates/umf-core/src').glob('*.rs'):
            text=code_only(file.read_text())
            for name,arity in expected.items():
                for match in re.finditer(r'(?:\.|::)'+name+r'\s*\(',text):
                    start=match.end();end=start;depth=0;count=1
                    while True:
                        c=text[end]
                        if c==')'and depth==0:break
                        if c in '([{':depth+=1
                        elif c in ')]}':depth-=1
                        elif c==','and depth==0:count+=1
                        end+=1
                    if text[start:end].rstrip().endswith(','):count-=1
                    self.assertEqual(count,arity,(file.name,name,text[:start].count('\n')+1))
                    counts[name]+=1
        self.assertTrue(all(counts.values()),counts)
    def test_annotation_helper_matches_actual_staging_callers_stores_and_consumers(self):
        source=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        validate_annotation_staging(source)
        # The genuine failed declaration, each independently stale parameter,
        # and caller/store custody losses must all refuse without Cargo/native.
        for name in ('unevaluated_properties','unevaluated_items'):
            needle=name+": &mut Option<(&'a Value, Utf16, Option<OwnerCursor>)>"
            broken=source.replace(needle,name+": &mut Option<(&'a Value, Utf16)>",1)
            self.assertNotEqual(broken,source)
            with self.assertRaises(ValueError):validate_annotation_staging(broken)
        call=re.search(r'\.eval_keyword_annotations\s*\(',code_only(source)).start()
        broken=source[:call]+source[call:].replace('&mut unevaluated_items,','&mut unevaluated_properties,',1)
        self.assertNotEqual(broken,source)
        with self.assertRaises(ValueError):validate_annotation_staging(broken)
        needle='Some((rule, kp.clone(), clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?))'
        broken=source.replace(needle,'Some((rule, kp.clone()))',1)
        self.assertNotEqual(broken,source)
        with self.assertRaises(ValueError):validate_annotation_staging(broken)
    def test_no_reverse_locator_search_or_callback_after_reference_publication(self):
        plans=(ROOT/'crates/umf-core/src/schema_owned_plans.rs').read_text()
        self.assertNotIn('NodeLocator::locate',plans)
        self.assertNotIn('impl NodeLocator',plans)
        for name,cache in [('resolve_inner','references'),('resolve_eval_inner','evaluations')]:
            text=body(plans,name);publication=text.rindex('publish_plan(&self.'+cache)
            self.assertNotRegex(text[publication:],r'\b(?:charge_work\w*|clone_owner_cursor)\s*\(')
    def test_table_contains_structural_coordinates_not_persistent_node_addresses(self):
        source=(ROOT/'crates/umf-core/src/schema_owner_locations.rs').read_text()
        descriptor=source[source.index('struct Descriptor'):source.index('impl OwnerLocations')]
        self.assertNotRegex(descriptor,r'\*(?:const|mut)|HashMap|BTreeMap|\bString\b|\bUtf16\b')
        self.assertIn('try_reserve_exact',source)
        self.assertIn('checked_add(count)',source)
        self.assertIn('if id>=ctx.limits().max_values',source)
        self.assertIn('event("publish")',source)
    def test_root_role_selection_does_not_rescan_after_catalogue_admission(self):
        source=(ROOT/'crates/umf-core/src/schema.rs').read_text();text=body(source,'compile_inner')
        self.assertEqual(text.count('SchemaRoot::same_anchor_free_role'),1)
        self.assertIn('if catalogue.entries.len()==resources.entries.len()',text)
        self.assertIn('SchemaRoot::Catalogue(Arc::clone(catalogue),ordinal)',text)
        self.assertNotIn('NodeLocator::locate',text)

if __name__=='__main__':unittest.main()
