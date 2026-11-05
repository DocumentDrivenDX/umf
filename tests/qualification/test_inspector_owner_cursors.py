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

def raw_body(source,name):
    masked=code_only(source);match=re.search(r'\bfn\s+'+re.escape(name)+r'\b',masked)
    if not match:raise ValueError('missing function '+name)
    begin=masked.index('{',match.end());end=begin+1;depth=1
    while depth:
        depth+=(masked[end]=='{')-(masked[end]=='}');end+=1
    return source[begin:end]

def compact(source):return re.sub(r'\s+','',code_only(source))

def validate_node_inner_protocol(source):
    text=code_only(source);decl=re.search(r'\bfn\s+node_inner\b',text)
    if not decl:raise ValueError('missing node_inner declaration')
    params=parenthesized_fields(text,text.index('(',decl.end())+1)
    names=[p.split(':',1)[0].strip() for p in params[:-1]]
    if names!=['&self','owner','schema','_path','compiler','cursor','ctx'] or not re.fullmatch(r"#\[cfg\(test\)\]mutevent:Option<&mutdynFnMut\(&'staticstr\)>",re.sub(r'\s+','',params[-1])):
        raise ValueError('node_inner declaration production/test protocol differs')
    calls=list(re.finditer(r'\.node_inner\s*\(',text))
    if len(calls)!=2:raise ValueError('node_inner call census differs')
    for call in calls:
        fields=parenthesized_fields(text,call.end())
        if len(fields)!=7 or compact(fields[5])!='ctx' or re.sub(r'\s+','',fields[-1]) not in ('#[cfg(test)]None','#[cfg(test)]event'):
            raise ValueError('node_inner conditional argument/context differs')
        # cfg(test)=false must keep six explicit arguments; true keeps seven.
        for enabled,arity in ((False,6),(True,7)):
            selected=[f for f in fields if enabled or not f.strip().startswith('#[cfg(test)]')]
            if len(selected)!=arity:raise ValueError('node_inner cfg projection differs')
    if '#[cfg(test)]None' not in compact(raw_body(source,'node')) or '#[cfg(test)]event' not in compact(raw_body(source,'node_at_impl')):
        raise ValueError('node_inner observer attached to wrong caller')

def validate_coordinate_storage(source):
    text=code_only(source);start=re.search(r'\bstruct\s+Descriptor\s*\{',text)
    if not start:raise ValueError('missing descriptor')
    begin=start.end();end=begin;depth=1
    while depth:
        depth+=(text[end]=='{')-(text[end]=='}');end+=1
    fields=[compact(f) for f in text[begin:end-1].split(',') if f.strip()]
    if fields!=[n+':u32' for n in ('root','parent','edge','first','count','depth')]:raise ValueError('descriptor stored fields differ')
    for needle in ('u32::try_from(root)','u32::try_from(value)','u32::try_from(edge)','u32::try_from(first)','u32::try_from(count)','u32::try_from(depth)','value==Self::NO_PARENT'):
        if needle not in compact(raw_body(source,'checked')):raise ValueError('descriptor checked narrowing/sentinel missing')
    legacy=raw_body(source,'build_observed')
    for needle in ('try_reserve_exact(roots)','checked_add(1)','roots>ctx.limits().max_values','event("publish")'):
        if needle not in re.sub(r'\s+','',legacy):raise ValueError('legacy storage bound/publication missing')
    view=compact(raw_body(source,'bind_admitted_impl'))
    for needle in ('Arc::ptr_eq(bank,root_bank)','top.max_depth.checked_sub(top.depth)','next>ctx.limits().max_values','forlogical_rolein0..root_count','bank.structure_catalogue(logical_role-1,ctx)?','roots.push(total)','base:total,end:next','total=next','roles.try_reserve_exact(root_count)','roots.try_reserve_exact(root_count)','facts.try_reserve_exact(root_count)'):
        if needle not in view:raise ValueError('view role/lineage/limit/reserve missing: '+needle)
    # Keep original traversal/read bounds, not only the new view fast route.
    for needle in ('checked_add(count)','if id>=ctx.limits().max_values'):
        if needle not in source:raise ValueError('original structural bound missing')

def validate_root_selection(source):
    wrapper=compact(raw_body(source,'compile_inner'))
    expected='{Self::compile_inner_with_bank(schema,resources,dialect,strict,regex_profile,resolve_references_at_compile,apply_local_reference_gate,allow_duplicate_schema_keys,finite_binary64_admission,root_keyword_policy,ctx,None,false)}'
    if wrapper!=expected:raise ValueError('ordinary compiler does not forward same context/None/false')
    text=compact(raw_body(source,'compile_inner_with_bank'))
    if text.count('SchemaRoot::same_anchor_free_role')!=1 or text.count('construction_catalogue_view(resources_view,ctx)?')!=1:raise ValueError('root selection/admission census differs')
    select=text.index('SchemaRoot::same_anchor_free_role');admit=text.index('construction_catalogue_view(resources_view,ctx)?')
    if not select<admit:raise ValueError('root rescan after admission')
    for needle in ('construction_equal(schema,candidate,ctx)?','share_candidate=Some(ordinal)','ifcatalogue.entries.len()==resources_view.len(){root=Some(SchemaRoot::Catalogue(Arc::clone(catalogue),ordinal));}','letbank_input=ifinput_admitted{supplied_bank.as_ref()}else{None};','SchemaRoot::Bank(Arc::clone(bank),*role)'):
        if needle not in text:raise ValueError('root role/dedup/custody safeguard missing')
    if 'NodeLocator::locate' in text:raise ValueError('reverse locator search')
    catalogue=compact(raw_body(source,'construction_catalogue_view'))
    for needle in ('candidate.entries.len()!=resources.len()','candidate.entries.iter().zip(resources.iter())','construction_equal(av,bv,ctx)?'):
        if needle not in catalogue:raise ValueError('complete ordered catalogue equality missing')

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
        compact_type=re.sub(r'\s+','',selected[0])
        match=re.fullmatch(r"&mutOption<\((.*)\)>",compact_type)
        fields=parenthesized_fields(match.group(1)+')',0) if match else []
        if fields!=["&'aValue",'EvaluationPathPair','Option<OwnerCursor>']:
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
        if [compact(f) for f in fields]!=['rule','kp.clone_with_context(ctx)?','clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?']:
            raise ValueError('annotation store loses paid path-pair/cursor custody')
        paid='ctx.charge_work(std::mem::size_of::<Option<(&Value,EvaluationPathPair,Option<OwnerCursor>)>>().div_ceil(std::mem::size_of::<usize>())+1,Utf16::default())?;'
        if paid+'*'+name+'=Some(' not in compact(stores):raise ValueError('annotation tuple publication precedes debit')
        if not re.search(r'if\s+let\s+Some\s*\(\(rule,\s*kp,\s*cursor\)\)\s*=\s*'+name,finish):
            raise ValueError('annotation terminal consumer loses staged cursor')
    if compact(finish).count('child_annotations.selected_cursor=clone_owner_cursor(cursor.as_ref(),ctx)?;')!=2:
        raise ValueError('annotation consumer fails to restore staged cursor')
    evaluations=list(re.finditer(r'\bself\.eval\s*\(',finish))
    if len(evaluations)!=2:raise ValueError('annotation terminal evaluator census differs')
    for call in evaluations:
        args=parenthesized_fields(finish,call.end())
        if len(args)!=8 or compact(args[3])!='&kp' or compact(args[5])!='ctx':raise ValueError('annotation evaluator loses pair/same context')


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
        validate_node_inner_protocol((ROOT/'crates/umf-core/src/schema_owned_plans.rs').read_text())
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
                    if name=='node_inner':
                        fields=parenthesized_fields(text,start)
                        self.assertEqual(len(fields),7)
                        self.assertIn(compact(fields[-1]),('#[cfg(test)]None','#[cfg(test)]event'))
                        self.assertEqual(compact(fields[-2]),'ctx')
                        count-=1  # production projection; declaration/cfg(test) checked above
                    self.assertEqual(count,arity,(file.name,name,text[:start].count('\n')+1))
                    counts[name]+=1
        self.assertTrue(all(counts.values()),counts)
    def test_annotation_helper_matches_actual_staging_callers_stores_and_consumers(self):
        source=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        validate_annotation_staging(source)
        # The genuine failed declaration, each independently stale parameter,
        # and caller/store custody losses must all refuse without Cargo/native.
        for name in ('unevaluated_properties','unevaluated_items'):
            needle=name+": &mut Option<(&'a Value, EvaluationPathPair, Option<OwnerCursor>)>"
            broken=source.replace(needle,name+": &mut Option<(&'a Value, EvaluationPathPair)>",1)
            self.assertNotEqual(broken,source)
            with self.assertRaises(ValueError):validate_annotation_staging(broken)
        call=re.search(r'\.eval_keyword_annotations\s*\(',code_only(source)).start()
        broken=source[:call]+source[call:].replace('&mut unevaluated_items,','&mut unevaluated_properties,',1)
        self.assertNotEqual(broken,source)
        with self.assertRaises(ValueError):validate_annotation_staging(broken)
        needle='Some((rule, kp.clone_with_context(ctx)?, clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?))'
        broken=source.replace(needle,'Some((rule, kp.clone_with_context(ctx)?))',1)
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
        validate_coordinate_storage(source)
    def test_root_role_selection_does_not_rescan_after_catalogue_admission(self):
        validate_root_selection((ROOT/'crates/umf-core/src/schema.rs').read_text())

    def test_cfg_observer_mutations_cannot_hide_a_production_protocol_change(self):
        source=(ROOT/'crates/umf-core/src/schema_owned_plans.rs').read_text()
        mutations=[source.replace('#[cfg(test)] None','None',1),source.replace('cursor,ctx,#[cfg(test)] event)','cursor,ctx,event)',1),source.replace("#[cfg(test)] mut event: Option<&mut dyn FnMut(&'static str)>","mut event: Option<&mut dyn FnMut(&'static str)>",1),source.replace('compiler, &cursor, ctx, #[cfg(test)] None','compiler, &cursor, other, #[cfg(test)] None',1),source.replace('#[cfg(test)] None','#[cfg(test)] None, None',1)]
        for i,mutant in enumerate(mutations):
            with self.subTest(mutation=i):
                self.assertNotEqual(mutant,source)
                with self.assertRaises(ValueError):validate_node_inner_protocol(mutant)
    def test_pair_slot_debit_clone_cursor_and_terminal_mutations_refuse(self):
        source=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        debit='ctx.charge_work(std::mem::size_of::<Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>>()'
        mutations=[source.replace("unevaluated_properties: &mut Option<(&'a Value, EvaluationPathPair, Option<OwnerCursor>)>","unevaluated_properties: &mut Option<(&'a Value, Utf16, Option<OwnerCursor>)>",1),source.replace('kp.clone_with_context(ctx)?','kp.clone()',1),source.replace(debit,'other.charge_work(std::mem::size_of::<Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>>()',1),source.replace('child_annotations.selected_cursor=clone_owner_cursor(cursor.as_ref(),ctx)?;','child_annotations.selected_cursor=None;',1)]
        # Limit the evaluator mutation to the authentic terminal consumer body.
        begin=source.index('    fn finish_eval_inner');tail=source[begin:]
        mutations.append(source[:begin]+tail.replace('                        &kp,','                        &untracked,',1))
        for i,mutant in enumerate(mutations):
            with self.subTest(mutation=i):
                self.assertNotEqual(mutant,source)
                with self.assertRaises(ValueError):validate_annotation_staging(mutant)
    def test_descriptor_storage_and_view_role_mutations_refuse(self):
        source=(ROOT/'crates/umf-core/src/schema_owner_locations.rs').read_text()
        mutations=[source.replace('struct Descriptor {','struct Descriptor {\n    cached: Utf16,',1),source.replace('u32::try_from(root)','root as u32',1),source.replace('roles.try_reserve_exact(root_count)','roles.reserve(root_count)',1),source.replace('bank.structure_catalogue(logical_role-1,ctx)?','bank.structure_catalogue(0,ctx)?',1),source.replace('next>ctx.limits().max_values','false',1)]
        for i,mutant in enumerate(mutations):
            with self.subTest(mutation=i):
                self.assertNotEqual(mutant,source)
                with self.assertRaises(ValueError):validate_coordinate_storage(mutant)
    def test_root_dedup_ordinal_context_and_repeated_selection_mutations_refuse(self):
        source=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        mutations=[source.replace('if catalogue.entries.len()==resources_view.len()','if true',1),source.replace('SchemaRoot::Catalogue(Arc::clone(catalogue),ordinal)','SchemaRoot::Catalogue(Arc::clone(catalogue),0)',1),source.replace('root_keyword_policy,ctx,None,false)','root_keyword_policy,other,None,false)',1),source.replace('construction_catalogue_view(resources_view, ctx)?','{ SchemaRoot::same_anchor_free_role(schema,retrieval,ctx)?; construction_catalogue_view(resources_view, ctx)? }',1)]
        for i,mutant in enumerate(mutations):
            with self.subTest(mutation=i):
                self.assertNotEqual(mutant,source)
                with self.assertRaises(ValueError):validate_root_selection(mutant)

if __name__=='__main__':unittest.main()
