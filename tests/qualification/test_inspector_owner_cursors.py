"""Pure tuple/custody integration guards, not Rust typechecking or native tests."""
import json
import re
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
REGISTRY_PROFILE=json.loads((ROOT/'spec/release.json').read_text())['rustVersion']=='0.10.11'

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

def changed_mutant(source, old, new, expected_count=1):
    """A source discriminator must really alter its reviewed intended site."""
    if source.count(old)!=expected_count:
        raise AssertionError(('Mutation needle census differs',old,source.count(old),expected_count))
    mutant=source.replace(old,new,1)
    if mutant==source:raise AssertionError('Mutation is identity')
    return mutant

def validate_node_inner_protocol(source):
    text=code_only(source);decl=re.search(r'\bfn\s+node_inner\b',text)
    if not decl:raise ValueError('missing node_inner declaration')
    params=[compact(p) for p in parenthesized_fields(text,text.index('(',decl.end())+1)]
    expected=['&self','owner:&CompiledSchema','schema:&Value','_path:&Utf16','compiler:bool',
              'cursor:Option<&OwnerCursor>',"checked:Option<&owner_locations::BorrowedCheckedLocation<'_>>",'ctx:&mutContext<\'_>',
              "#[cfg(test)]mutevent:Option<&mutdynFnMut(&'staticstr)>"]
    if params!=expected:raise ValueError('node_inner declaration production/test protocol differs')
    calls=list(re.finditer(r'\.node_inner\s*\(',text))
    if len(calls)!=2:raise ValueError('node_inner call census differs')
    expected_calls={'node':['owner','schema','path','compiler','Some(&cursor)','None','ctx','#[cfg(test)]None'],
                    'node_at_impl':['owner','schema','path','compiler','Some(cursor)','Some(&checked)','ctx','#[cfg(test)]event']}
    for caller,wanted in expected_calls.items():
        caller_text=body(source,caller);sites=list(re.finditer(r'\.node_inner\s*\(',caller_text))
        if len(sites)!=1:raise ValueError('node_inner attached to wrong caller')
        fields=[compact(f) for f in parenthesized_fields(caller_text,sites[0].end())]
        if fields!=wanted:raise ValueError('node_inner checked/observer/same-context custody differs: '+caller)
        for enabled,arity in ((False,7),(True,8)):
            selected=[f for f in fields if enabled or not f.startswith('#[cfg(test)]')]
            if len(selected)!=arity:raise ValueError('node_inner cfg projection differs')
    ordinary=compact(raw_body(source,'node'));located=compact(raw_body(source,'node_at_impl'))
    for caller_text in (ordinary,located):
        if 'ctx.with_constructor_site(' not in caller_text or '|ctx|{' not in caller_text or 'if!self.belongs_to(owner,ctx)?{returnOk(None);}' not in caller_text:
            raise ValueError('node_inner caller loses original owner/same-context gate')
    if 'letSome(cursor)=owner.location_for_root_value(schema,ctx)?else{returnOk(None);};' not in ordinary:
        raise ValueError('ordinary node loses genuine root cursor')
    table='letSome(table)=&owner.owner_locationselse{returnOk(None);};'
    checked='letSome(checked)=table.checked_borrowed(owner,cursor,ctx)?else{returnOk(None);};'
    read='if!checked.read(owner,ctx)?.is_some_and(|node|std::ptr::eq(node,schema)){returnOk(None);}'
    consume='self.node_inner(owner,schema,path,compiler,Some(cursor),Some(&checked),ctx,#[cfg(test)]event)'
    if table+checked+read not in located or not (located.index(table)<located.index(checked)<located.index(read)<located.index(consume)):
        raise ValueError('borrowed checked-location admission/readback/consumer custody differs')
    if 'checked_borrowed(owner,cursor,ctx)?' not in located:
        raise ValueError('current BorrowedCheckedLocation producer/type binding missing')
    if 'Some(checked)=>checked.read(owner,ctx)?' not in compact(raw_body(source,'node_inner')):
        raise ValueError('node_inner no longer consumes actual borrowed owner readback')

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

def validate_registry_catalogue_selection(source, text, root_copy):
    ordinary=compact(raw_body(source,'compile'))
    expected='{ctx.with_work_phase(,|ctx|{letdialect=matchselect_dialect(schema){Ok(dialect)=>dialect,Err(error)=>{clear_registry_catalogue_proof(ctx);returnErr(error);}};Self::compile_with_dialect_catalogue(schema,resources,dialect,true,ctx,None,true)})}'
    if ordinary!=expected:
        raise ValueError('only the ordinary compile entry opts in; dialect refusal clears proof')
    eligibility='letregistry_attempt_path=registry_scope_entry&&eligible&&codegen_catalogue.is_none()&&supplied_bank.is_none()&&!input_admitted;'
    stamp='letmutregistry_attempt=ifregistry_attempt_path{'
    admission='registry_catalogue_attempt(resources,dialect,eligibility,ctx)?}else{None};'
    codegen='let(epoch,prior)=catalogue.completed(dialect,ctx)?;'
    first=('ifprior.is_some(){prior}elseifletSome(attempt)=registry_attempt.take(){'
           'ifletSome(cached)=attempt.cached{Some(cached)}elseifattempt.first{'
           'letbefore=ctx.charged_work();letmatched=construction_catalogue_view(resources_view,ctx)?;'
           'letcomparison_work=ctx.charged_work().saturating_sub(before);')
    remaining=('matched}else{construction_catalogue_view(resources_view,ctx)?}}else{'
               'letbefore=ctx.charged_work();letmatched=construction_catalogue_view(resources_view,ctx)?;')
    for needle in (eligibility,stamp,admission,codegen,first,remaining):
        if text.count(needle)!=1:
            raise ValueError('Registry attempt or exclusive paid catalogue fallback differs: '+needle)
    positions=[text.index(n) for n in (eligibility,root_copy,stamp,admission,codegen,first,remaining)]
    if positions!=sorted(positions):
        raise ValueError('Registry and Codegen reuse must follow first root validation')


def validate_root_selection(source, registry=REGISTRY_PROFILE):
    wrapper=compact(raw_body(source,'compile_inner'))
    expected='{Self::compile_inner_with_bank(schema,resources,dialect,strict,regex_profile,resolve_references_at_compile,apply_local_reference_gate,allow_duplicate_schema_keys,finite_binary64_admission,root_keyword_policy,ctx,None,false,None'+(',false' if registry else '')+')}'
    if wrapper!=expected:raise ValueError('ordinary compiler does not forward same context/None/false/finalNone')
    shared=compact(raw_body(source,'compile_with_dialect_catalogue'))
    mode='{Self::compile_inner_with_bank(schema,resources,dialect,strict,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,None,false,catalogue'+(',registry_scope_entry' if registry else '')+')}'
    if shared!=mode:raise ValueError('shared dialect compiler changed closed mode/Context/catalogue')
    public=compact(raw_body(source,'compile_with_dialect'))
    if public!='{Self::compile_with_dialect_catalogue(schema,resources,dialect,strict,ctx,None'+(',false' if registry else '')+')}':
        raise ValueError('ordinary dialect entry received a catalogue')
    entry=compact(raw_body(source,'compile_with_codegen_catalogue'))
    if entry!='{ctx.with_work_phase(,|ctx|{letdialect=select_dialect(schema)?;Self::compile_with_dialect_catalogue(schema,&SchemaResources::default(),dialect,true,ctx,Some(catalogue)'+(',false' if registry else '')+')})}':
        raise ValueError('Codegen entry lost original dialect/root/strict/same-context forwarding')
    text=compact(raw_body(source,'compile_inner_with_bank'))
    if text.count('SchemaRoot::same_anchor_free_role')!=1 or text.count('construction_catalogue_view(resources_view,ctx)?')!=(3 if registry else 1):
        raise ValueError('root selection/admission census differs')
    count='letresources_count=resources_view.len_with_context(ctx)?;'
    row='let(retrieval,candidate)=resources_view.get_with_context(ordinal,ctx)?.expect();'
    root_loop='ifeligible{forordinalin0..resources_count{'+row+'ifSchemaRoot::same_anchor_free_role(schema,retrieval,ctx)?&&construction_equal(schema,candidate,ctx)?{ctx.charge_work(1,Utf16::default())?;share_candidate=Some(ordinal);break;}}}'
    root_copy='letroot_copy=ifshare_candidate.is_some(){schema_json_with_mode(schema,ctx,false,false)?;None}else{Some(ifallow_duplicate_schema_keys{copy_schema_json(schema,ctx,true)?}elseiffinite_binary64_admission{copy_schema_json(schema,ctx,false)?}else{copy_json(schema,ctx)?})};'
    if text.count(count)!=1 or text.count(root_loop)!=1 or text.count(root_copy)!=1:
        raise ValueError('paid root extent/ordered lookup/original first root validation differs')
    positions=[text.index(count),text.index(root_loop),text.index(root_copy),text.index('catalogue.completed(dialect,ctx)?'),text.index('construction_catalogue_view(resources_view,ctx)?')]
    if positions!=sorted(positions):raise ValueError('root selection/validation must precede catalogue checks')
    if registry:
        validate_registry_catalogue_selection(source,text,root_copy)
    for needle in ('ifcatalogue.entries.len()==resources_count{root=Some(SchemaRoot::Catalogue(Arc::clone(catalogue),ordinal));}',
                   'letbank_input=ifinput_admitted{supplied_bank.as_ref()}else{None};','SchemaRoot::Bank(Arc::clone(bank),*role)',
                   'letresources_view=matchcodegen_catalogue{Some(catalogue)=>admitted_bank::Catalogue::Codegen(catalogue),None=>matchsupplied_bank.as_ref(){Some((bank,_))=>admitted_bank::Catalogue::Bank(bank),None=>admitted_bank::Catalogue::Borrowed(&resources.entries)}};'):
        if needle not in text:raise ValueError('root role/dedup/custody safeguard missing')
    if 'NodeLocator::locate' in text:raise ValueError('reverse locator search')
    catalogue=compact(raw_body(source,'construction_catalogue_view'))
    paid='letcount=state.borrow().catalogues.len();ctx.charge_work(count,Utf16::default())?;letcandidates=state.borrow().catalogues.clone();'
    ordered='for(limits,candidate)incandidates{iflimits!=ctx.limits()||candidate.entries.len()!=resources.len_with_context(ctx)?{continue;}letmutequal=true;for(index,(aid,av))incandidate.entries.iter().enumerate(){let(bid,bv)=resources.get_with_context(index,ctx)?.expect();ctx.charge_work(aid.len().min(bid.len()),Utf16::default())?;ifaid!=bid||!construction_equal(av,bv,ctx)?{equal=false;break;}}ifequal{ctx.charge_work(1,Utf16::default())?;returnOk(Some(candidate));}}'
    if catalogue.count(paid)!=1 or catalogue.count(ordered)!=1 or catalogue.index(paid)>catalogue.index(ordered):
        raise ValueError('complete paid ordered same-context catalogue equality missing')

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
          'frame_inner':6,'node_inner':7,'preflight_located':8,'location_root':3,
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
                        self.assertEqual(len(fields),8)
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
        ordinary='self.node_inner(owner, schema, path, compiler, Some(&cursor), None, ctx, #[cfg(test)] None)'
        located='self.node_inner(owner,schema,path,compiler,Some(cursor),Some(&checked),ctx,#[cfg(test)] event)'
        rows=[
            (ordinary,ordinary.replace('#[cfg(test)] None','None')),
            ('Some(&checked),ctx,#[cfg(test)] event)','Some(&checked),ctx,event)'),
            ("#[cfg(test)] mut event: Option<&mut dyn FnMut(&'static str)>","mut event: Option<&mut dyn FnMut(&'static str)>"),
            (ordinary,ordinary.replace('ctx, #[cfg(test)] None)','other, #[cfg(test)] None)')),
            (ordinary,ordinary[:-1]+', None)'),
            (ordinary,ordinary.replace('Some(&cursor), None','Some(&cursor)')),
            (ordinary,ordinary.replace('Some(&cursor), None','Some(&cursor), Some(&checked)')),
            (located,located.replace('Some(&checked)','None')),
            (located,located.replace('Some(&checked)','Some(&foreign)')),
            (located,located.replace(',ctx,#[cfg(test)] event)',',other,#[cfg(test)] event)')),
            (located,located.replace('#[cfg(test)] event','#[cfg(test)] None')),
            (ordinary,ordinary.replace('None, ctx, #[cfg(test)] None','#[cfg(test)] None, ctx, None')),
            ('table.checked_borrowed(owner,cursor,ctx)?','table.checked_borrowed(owner,cursor,other)?'),
            ('if !checked.read(owner,ctx)?.is_some_and(|node|std::ptr::eq(node,schema)){return Ok(None);}','if !checked.read(foreign,ctx)?.is_some_and(|node|std::ptr::eq(node,schema)){return Ok(None);}'),
        ]
        rows.append(('let Some(checked)=table.checked_borrowed(owner,cursor,ctx)? else{return Ok(None);};\n            if !checked.read(owner,ctx)?','let Some(checked)=table.checked_borrowed(owner,cursor,ctx)? else{return Ok(None);};\n            return Ok(None);\n            if !checked.read(owner,ctx)?'))
        if len(rows)!=15:raise AssertionError('owner-cursor mutation census must preserve14 and add1 early-return control')
        for i,(old,new) in enumerate(rows):
            with self.subTest(mutation=i):
                mutant=changed_mutant(source,old,new)
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
        rows=[
            ('if catalogue.entries.len()==resources_count','if true'),
            ('SchemaRoot::Catalogue(Arc::clone(catalogue),ordinal)','SchemaRoot::Catalogue(Arc::clone(catalogue),0)'),
            ('root_keyword_policy,ctx,None,false,None)','root_keyword_policy,other,None,false,None)'),
            ('construction_catalogue_view(resources_view,ctx)?','{ SchemaRoot::same_anchor_free_role(schema,retrieval,ctx)?; construction_catalogue_view(resources_view,ctx)? }'),
            ('root_keyword_policy,ctx,None,false,None)','root_keyword_policy,ctx,None,false,Some(unreviewed))'),
            ('let resources_count=resources_view.len_with_context(ctx)?;','let resources_count=resources_view.len();'),
            ('let resources_count=resources_view.len_with_context(ctx)?;','let resources_count=resources_view.len_with_context(other)?;'),
            ('resources_view.get_with_context(ordinal,ctx)?.expect("actual immutable catalogue row");\n                if SchemaRoot::same_anchor_free_role','resources_view.get_with_context(0,ctx)?.expect("actual immutable catalogue row");\n                if SchemaRoot::same_anchor_free_role'),
            ('candidate.entries.len() != resources.len_with_context(ctx)?','candidate.entries.len() != resources.len_with_context(other)?'),
            ('candidate.entries.iter().enumerate()','candidate.entries.iter().rev().enumerate()'),
            ('resources.get_with_context(index,ctx)?','resources.get_with_context(0,ctx)?'),
            ('resources.get_with_context(index,ctx)?','resources.get_with_context(index,other)?'),
            ('aid != bid || !construction_equal(av,bv,ctx)?','!construction_equal(av,bv,ctx)?'),
            ('aid != bid || !construction_equal(av,bv,ctx)?','aid != bid'),
            ('ctx.charge_work(aid.len().min(bid.len()), Utf16::default())?;',''),
            ('schema_json_with_mode(schema,ctx,false,false)?;None','None'),
            ('schema_json_with_mode(schema,ctx,false,false)?;None','schema_json_with_mode(schema,other,false,false)?;None'),
            ('KeywordPolicy::DRAFT2020,ctx,None,false,catalogue)','KeywordPolicy::DRAFT2020,other,None,false,catalogue)'),
            ('schema,resources,dialect,strict,ctx,None)','schema,resources,dialect,strict,ctx,Some(unreviewed))'),
            ('dialect,true,ctx,Some(catalogue))','dialect,false,ctx,Some(catalogue))'),
        ]
        if REGISTRY_PROFILE:
            # Keep the original mutation intents and target the reviewed .11
            # forwarding suffixes and an exact first-attempt fallback site.
            for index, suffix in ((2,',false'),(4,',false'),(17,',registry_scope_entry'),(18,',false'),(19,',false')):
                rows[index]=tuple(value[:-1]+suffix+')' for value in rows[index])
            old,new=rows[3]
            prefix='else if attempt.first {\n                    let before = ctx.charged_work();\n                    let matched = '
            rows[3]=(prefix+old,prefix+new)
            rows.extend([
                ('dialect, true, ctx, None, true)', 'dialect, true, ctx, None, false)'),
                ('dialect,true,ctx,Some(catalogue),false)', 'dialect,true,ctx,Some(catalogue),true)'),
                ('registry_scope_entry && eligible && codegen_catalogue.is_none()', 'registry_scope_entry && eligible'),
                ('&& supplied_bank.is_none() && !input_admitted;', '&& !input_admitted;'),
                ('if let Some(cached) = attempt.cached { Some(cached) }',
                 'if let Some(cached) = attempt.cached { None }'),
                ('registry_catalogue_attempt(resources, dialect, eligibility, ctx)?',
                 'registry_catalogue_attempt(resources, dialect, eligibility, other)?'),
                ('clear_registry_catalogue_proof(ctx);\n                return Err(error);',
                 'return Err(error);'),
            ])
        for i,(old,new) in enumerate(rows):
            with self.subTest(mutation=i):
                mutant=changed_mutant(source,old,new)
                with self.assertRaises(ValueError):validate_root_selection(mutant)


if __name__=='__main__':unittest.main()
