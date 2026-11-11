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
    for needle in ('Arc::ptr_eq(bank,root_bank)','top.max_depth.checked_sub(top.depth)','next>ctx.limits().max_values','roots.push(total)','base:total,end:next','total=next','roles.try_reserve_exact(root_count)','roots.try_reserve_exact(root_count)','facts.try_reserve_exact(root_count)'):
        if needle not in view:raise ValueError('view role/lineage/limit/reserve missing: '+needle)
    # Bind logical role zero from the compiled root, then use the retained
    # resources parent for Meta catalogue rows. A missing parent falls back to
    # the bank's catalogue selector. Core keeps its original per-row selector.
    root_role='bind_role!(bank.structure_role(*role,ctx)?);'
    parent_route=('ifroot_count>1&&matches!(role,admitted_bank::BankRoot::Meta){'
        'letparent=bank.resources_parent(ctx)?;forlogical_rolein1..root_count{'
        'ctx.charge_work(2,Utf16::default())?;bind_role!(match&parent{'
        'Some(parent)=>parent.select(logical_role-1,ctx)?,None=>bank.structure_catalogue(logical_role-1,ctx)?,});}}'
        'else{forlogical_rolein1..root_count{bind_role!(bank.structure_catalogue(logical_role-1,ctx)?);}}')
    if view.count(root_role)!=1:raise ValueError('compiled logical role zero selector differs')
    if parent_route not in view:raise ValueError('Meta parent/select/fallback and Core per-row route differs')
    if not (view.index(root_role)<view.index(parent_route)):
        raise ValueError('role zero must be bound before parent-view catalogue selection')
    # Keep original traversal/read bounds, not only the new view fast route.
    for needle in ('checked_add(count)','if id>=ctx.limits().max_values'):
        if needle not in source:raise ValueError('original structural bound missing')

def validate_root_selection(source):
    wrapper=compact(raw_body(source,'compile_inner'))
    expected='{Self::compile_inner_with_bank::<false>(schema,resources,dialect,strict,regex_profile,resolve_references_at_compile,apply_local_reference_gate,allow_duplicate_schema_keys,finite_binary64_admission,root_keyword_policy,ctx,None,false,None)}'
    if wrapper!=expected:raise ValueError('ordinary compiler does not forward same context/None/false/finalNone')
    shared=compact(raw_body(source,'compile_with_dialect_catalogue'))
    mode='{Self::compile_inner_with_bank::<false>(schema,resources,dialect,strict,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,None,false,catalogue)}'
    if shared!=mode:raise ValueError('shared dialect compiler changed closed mode/Context/catalogue')
    public=compact(raw_body(source,'compile_with_dialect'))
    if public!='{Self::compile_with_dialect_catalogue(schema,resources,dialect,strict,ctx,None)}':
        raise ValueError('ordinary dialect entry received a catalogue')
    entry=compact(raw_body(source,'compile_with_codegen_catalogue'))
    if entry!='{ctx.with_work_phase(,|ctx|{letdialect=select_dialect(schema)?;Self::compile_with_dialect_catalogue(schema,&SchemaResources::default(),dialect,true,ctx,Some(catalogue))})}':
        raise ValueError('Codegen entry lost original dialect/root/strict/same-context forwarding')
    text=compact(raw_body(source,'compile_inner_with_bank'))
    if text.count('SchemaRoot::same_anchor_free_role')!=1 or text.count('construction_catalogue_view(resources_view,ctx)?')!=1:
        raise ValueError('root selection/admission census differs')
    count='letresources_count=resources_view.len_with_context(ctx)?;'
    row='let(retrieval,candidate)=resources_view.get_with_context(ordinal,ctx)?.expect();'
    root_loop='ifeligible{forordinalin0..resources_count{'+row+'ifSchemaRoot::same_anchor_free_role(schema,retrieval,ctx)?&&construction_equal(schema,candidate,ctx)?{ctx.charge_work(1,Utf16::default())?;share_candidate=Some(ordinal);break;}}}'
    root_copy='letroot_copy=ifshare_candidate.is_some(){schema_json_with_mode(schema,ctx,false,false)?;None}else{Some(ifallow_duplicate_schema_keys{copy_schema_json(schema,ctx,true)?}elseiffinite_binary64_admission{copy_schema_json(schema,ctx,false)?}else{copy_json(schema,ctx)?})};'
    if text.count(count)!=1 or text.count(root_loop)!=1 or text.count(root_copy)!=1:
        raise ValueError('paid root extent/ordered lookup/original first root validation differs')
    positions=[text.index(count),text.index(root_loop),text.index(root_copy),text.index('catalogue.completed(dialect,ctx)?'),text.index('construction_catalogue_view(resources_view,ctx)?')]
    if positions!=sorted(positions):raise ValueError('root selection/validation must precede catalogue checks')
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


def validate_counted_constructor_routing(source, extra_sources=None):
    raw=lambda name:re.sub(r'\s+','',raw_body(source,name))
    validate_root_selection(source)
    ordinary=raw('compile_inner')
    if ordinary.count('compile_inner_with_bank::<false>(')!=1 or 'compile_inner_with_bank::<true>' in ordinary:
        raise ValueError('ordinary compile_inner must use only the same-context uncounted route')
    if 'ctx,None,false,None' not in ordinary:raise ValueError('ordinary compile_inner bank/cursor handoff changed')
    bank_wrapper=raw('compile_input_bank')
    if bank_wrapper!='{Self::compile_input_bank_for::<false>(bank,role,ctx)}':
        raise ValueError('default bank wrapper is not explicitly uncounted')
    bank=raw('compile_input_bank_for')
    true_call='Self::compile_inner_with_bank::<true>(bank.root(selected),&SchemaResources::default(),dialect,true,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,Some((retained,selected)),admitted,None)'
    false_call='Self::compile_inner_with_bank::<false>(bank.root(selected),&SchemaResources::default(),dialect,true,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,Some((retained,selected)),admitted,None)'
    route='ifCOUNTED{ctx.charge_work(16,Utf16::default())?;ifadmitted&&bank.is_counted_core(){return'+true_call+';}}'+false_call
    if bank.count(route)!=1 or bank.count('compile_inner_with_bank::<true>(')!=1 or bank.count('compile_inner_with_bank::<false>(')!=1:
        raise ValueError('counted bank gate/precharge/explicit fallback tuple differs')
    if bank.index('ctx.charge_work(16,Utf16::default())?')>bank.index('ifadmitted&&bank.is_counted_core()'):
        raise ValueError('counted bank reservation must precede the identity guard')
    inner=raw('compile_inner_with_bank')
    root_call='compiled.preflight_located_for::<COUNTED>(&*compiled.schema,&root_origin,&root_scope,0,compiled.root_keyword_policy,ctx,&mutBTreeSet::new(),root_cursor,)'
    catalogue_call='compiled.preflight_located_for::<COUNTED>(resource,&Utf16::new(root_path),&retrieval,0,compiled.root_keyword_policy,ctx,&mutBTreeSet::new(),resource_cursor,)'
    if inner.count(root_call)!=1 or inner.count(catalogue_call)!=1:
        raise ValueError('generic route must reach root and catalogue preflight with original context/cursor')
    preflight=raw('preflight_located_for')
    if 'self.preflight_carried::<COUNTED>(schema,&mutowned,scope,depth,inherited_policy,ctx,seen,cursor)' not in preflight:
        raise ValueError('COUNTED is not forwarded unchanged into owned preflight')
    semantic=raw('preflight_semantic')
    counted_call='self.resolve_ref_location_impl::<true>(val,&reference_path,Some(scope.as_str()),false,ctx).map(|(target,path,_)|(target,path))'
    branch='letresolved=ifR::COUNTED{ctx.charge_work(12,Utf16::default())?;iftext=="$ref"{'+counted_call+'}else{self.resolve_ref_unplanned(val,&reference_path,Some(scope.as_str()),ctx)}}else{self.resolve_ref_unplanned(val,&reference_path,Some(scope.as_str()),ctx)}'
    if semantic.count(branch)!=1:
        raise ValueError('counted resolver is restricted to the paid static $ref route with exact scope/tracked/context/arity')
    expected_calls=[
      ('crates/umf-core/src/schema.rs','preflight_semantic','true','val,&reference_path,Some(scope.as_str()),false,ctx'),
      ('crates/umf-core/src/schema.rs','resolve_ref_unplanned','false','reference,path,scope_override,false,ctx'),
      ('crates/umf-core/src/schema.rs','resolve_ref_unplanned_located','false','reference,path,scope_override,true,ctx'),
      ('crates/umf-core/src/schema_preflight_reference_independent_tests.rs','counted_pointer_path_matches_original_target_and_utf16_with_paid_move','false','&reference,&path,Some(base),false,ctx'),
      ('crates/umf-core/src/schema_preflight_reference_independent_tests.rs','counted_pointer_path_matches_original_target_and_utf16_with_paid_move','true','&reference,&path,Some(base),false,ctx'),
      ('crates/umf-core/src/schema_preflight_reference_independent_tests.rs','counted_pointer_path_matches_original_target_and_utf16_with_paid_move','false','&reference,&path,Some(base),true,ctx'),
      ('crates/umf-core/src/schema_preflight_reference_independent_tests.rs','counted_pointer_path_matches_original_target_and_utf16_with_paid_move','true','&reference,&path,Some(base),true,ctx'),
      ('crates/umf-core/src/schema_preflight_reference_independent_tests.rs','counted_pointer_path_matches_original_target_and_utf16_with_paid_move','true','&reference,&path,Some(base),false,ctx'),
    ]
    actual_calls=[]
    declarations=0
    rust_root=ROOT/'crates/umf-core/src'
    for rust_file in sorted(rust_root.glob('*.rs')):
        relative=rust_file.relative_to(ROOT)
        raw_text=source if relative.as_posix()=='crates/umf-core/src/schema.rs' else (extra_sources or {}).get(relative.as_posix(),rust_file.read_text());masked=code_only(raw_text)
        declaration=list(re.finditer(r'\bfn\s+resolve_ref_location_impl\b',masked))
        for hit in re.finditer(r'\bresolve_ref_location_impl\b',masked):
            declaration_name=next((d for d in declaration if hit.start()==d.end()-len('resolve_ref_location_impl')),None)
            if declaration_name:
                declarations+=1
                if relative.as_posix()!='crates/umf-core/src/schema.rs':raise ValueError('resolver declaration moved outside its reviewed module')
                signature="fnresolve_ref_location_impl<'a,constCOUNTED:bool>(&'aself,reference:&Value,path:&Utf16,scope_override:Option<&str>,tracked:bool,ctx:&mutContext<'_>)->Result<(&'aValue,Utf16,Option<OwnerCursor>),EngineError>{"
                if compact(raw_text).count(signature)!=1:raise ValueError('resolver exact const-generic declaration signature differs')
                continue
            raw_tail=raw_text[hit.start():]
            call=re.match(r'resolve_ref_location_impl::<(true|false)>\(',raw_tail)
            if not call:raise ValueError('resolver occurrence is not a canonical exact specialized call')
            generic=call.group(1)
            fn_hits=list(re.finditer(r'\bfn\s+(\w+)',masked[:hit.start()]))
            if not fn_hits:raise ValueError('resolver call has no enclosing function')
            caller=fn_hits[-1].group(1);end=hit.end();depth=1
            paren=masked.find('(',hit.end())
            if paren<0:raise ValueError('resolver call lacks argument list')
            end=paren+1;depth=1
            while depth:
                depth+=(masked[end]=='(')-(masked[end]==')');end+=1
            args=compact(masked[paren+1:end-1])
            actual_calls.append((relative.as_posix(),caller,generic,args))
    if declarations!=1:raise ValueError('resolver declaration census differs')
    if sorted(actual_calls)!=sorted(expected_calls):raise ValueError('resolver exact caller/specialization/argument inventory differs')
    sidecar_path='crates/umf-core/src/schema_preflight_reference_independent_tests.rs'
    sidecar=(extra_sources or {}).get(sidecar_path,(ROOT/sidecar_path).read_text())
    validate_reference_test_protocol(sidecar)
    if raw('resolve_ref_unplanned')!='{let(value,path,_)=self.resolve_ref_location_impl::<false>(reference,path,scope_override,false,ctx)?;Ok((value,path))}':
        raise ValueError('ordinary reference path must preserve untracked false specialization and tuple')
    if raw('resolve_ref_unplanned_located')!='{self.resolve_ref_location_impl::<false>(reference,path,scope_override,true,ctx)}':
        raise ValueError('located reference path must preserve tracked false specialization and tuple')
    resolver=compact(raw_body(source,'resolve_ref_location_impl'))
    paid_move='ifCOUNTED{ctx.charge_work(16,Utf16::default())?;ifidentity_path&&!std::ptr::eq(current,root)&&!std::ptr::eq(current,&*self.schema){sp=next_path;continue;}}if!matches!(self.regex_profile,RegexProfile::Python(_)){letnormalized=self.effective_schema_path(current,&next_path,ctx)?;letentered_resource=schema_id(current).is_some();sp=preserve_schema_fragment(&normalized,&next_path,entered_resource,ctx,)?;'
    if resolver.count(paid_move)!=1:raise ValueError('paid identity move must precede original resource normalization/fragment fallback exactly')
    identity='letidentity_path=ifCOUNTED{ctx.charge_work(49,Utf16::default())?;!tracked&&!effective_base.is_empty()&&self.counted_pointer_root(indexed_root,ctx)?}else{false};'
    if resolver.count(identity)!=1:
        raise ValueError('resolver counted selector must precharge then retain tracked/base/context refusal')
    root=raw('counted_pointer_root')
    guards=('!bank.is_counted_core()','!Arc::ptr_eq(bank,root_bank)','ctx.profile()!=crate::context::ResourceProfile::Cooperative',
      '!self.strict','self.dialect!=SchemaDialect::Draft2020_12','!matches!(self.regex_profile,RegexProfile::Ecma262Unicode)',
      '!self.resolve_references_at_compile','self.root_keyword_policy!=KeywordPolicy::DRAFT2020','!bank.input_compatible(ctx)?',
      'SchemaRoot::Bank(root_bank,admitted_bank::BankRoot::Core(primary))',
      'bank.root_checked(admitted_bank::BankRoot::Core(*primary))','bank.get(role-1).map(|(_,value)|value)',
      'std::ptr::eq(actual,expected)')
    condition='if!bank.is_counted_core()||!Arc::ptr_eq(bank,root_bank)||ctx.profile()!=crate::context::ResourceProfile::Cooperative||!self.strict||self.dialect!=SchemaDialect::Draft2020_12||!matches!(self.regex_profile,RegexProfile::Ecma262Unicode)||!self.resolve_references_at_compile||self.root_keyword_policy!=KeywordPolicy::DRAFT2020||!bank.input_compatible(ctx)?{returnOk(false);}'
    if compact(root).count(condition)!=1 or any(g not in root for g in guards):raise ValueError('counted pointer selector exact combined guards differ')

def validate_reference_test_protocol(sidecar):
    test=re.sub(r'\s+','',raw_body(sidecar,'counted_pointer_path_matches_original_target_and_utf16_with_paid_move'))
    ordered=(
      'fortextin["#/$defs/id","#/%24defs/id","#/$defs/scalarType/anyOf/0"]{',
      'let(old_node,old_path,_)=owner.resolve_ref_location_impl::<false>(&reference,&path,Some(base),false,ctx)?;',
      'letold_work=ctx.charged_work()-before;',
      'let(new_node,new_path,cursor)=owner.resolve_ref_location_impl::<true>(&reference,&path,Some(base),false,ctx)?;',
      'assert!(std::ptr::eq(old_node,new_node));assert_eq!(old_path.units(),new_path.units());assert!(cursor.is_none());assert!(ctx.charged_work()-before<old_work);',
      'let(old,old_path,_)=owner.resolve_ref_location_impl::<false>(&reference,&path,Some(base),true,ctx)?;',
      'let(tracked,tracked_path,cursor)=owner.resolve_ref_location_impl::<true>(&reference,&path,Some(base),true,ctx)?;',
      'assert!(std::ptr::eq(old,tracked));assert_eq!(old_path,tracked_path);ifletSome(cursor)=cursor{assert!(std::ptr::eq(cursor.get(&owner,ctx)?,tracked));}',
      'denied_amount.set(Some(16));',
      'leterror=matchowner.resolve_ref_location_impl::<true>(&reference,&path,Some(base),false,ctx){Ok(_)=>panic!("deniedidentity-pathmovemustnotresolve"),Err(error)=>error,};',
      'assert!(refused.get());assert_eq!(error.code,"COUNTED_HOST");assert_eq!(error.path,Utf16::from("#/host"));')
    positions=[]
    for needle in ordered:
        if test.count(needle)!=1:raise ValueError('paid edge/move/legacy fallback test assertion differs')
        positions.append(test.index(needle))
    if positions!=sorted(positions):raise ValueError('paid edge/move/refusal test ordering differs')


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
          'resolve_eval_ref_located':3,'resolve_eval_location_impl':4,
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
        mutations=[source.replace('struct Descriptor {','struct Descriptor {\n    cached: Utf16,',1),source.replace('u32::try_from(root)','root as u32',1),source.replace('roles.try_reserve_exact(root_count)','roles.reserve(root_count)',1),source.replace('bank.structure_role(*role,ctx)?','bank.structure_catalogue(0,ctx)?',1),source.replace('parent.select(logical_role-1,ctx)?','parent.select(0,ctx)?',1),source.replace('None=>bank.structure_catalogue(logical_role-1,ctx)?','None=>return Ok(None)',1),source.replace('if root_count>1 && matches!(role,admitted_bank::BankRoot::Meta)','if root_count>1',1),source.replace('for logical_role in 1..root_count {\n                    bind_role!(bank.structure_catalogue(logical_role-1,ctx)?);','for logical_role in 1..root_count {\n                    bind_role!(bank.structure_catalogue(0,ctx)?);',1),source.replace('next>ctx.limits().max_values','false',1)]
        for i,mutant in enumerate(mutations):
            with self.subTest(mutation=i):
                self.assertNotEqual(mutant,source)
                with self.assertRaises(ValueError):validate_coordinate_storage(mutant)
    def test_counted_route_has_exact_source_calls_guards_and_refusal_mutants(self):
        source=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        validate_counted_constructor_routing(source)
        true_call='Self::compile_inner_with_bank::<true>(bank.root(selected),&SchemaResources::default(),dialect,true,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,Some((retained,selected)),admitted,None)'
        false_call='Self::compile_inner_with_bank::<false>(bank.root(selected),&SchemaResources::default(),dialect,true,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,Some((retained,selected)),admitted,None)'
        counted='self.resolve_ref_location_impl::<true>(val, &reference_path, Some(scope.as_str()), false, ctx)\n                                    .map(|(target, path, _)| (target, path))'
        mutations=[
            ('compile_inner_with_bank::<false>(schema,resources,dialect,strict,regex_profile','compile_inner_with_bank::<true>(schema,resources,dialect,strict,regex_profile'),
            ('root_keyword_policy,ctx,None,false,None)','root_keyword_policy,other,None,false,None)'),
            ('root_keyword_policy,ctx,None,false,None)','root_keyword_policy,ctx,Some((bank,selected)),true,None)'),
            ('if COUNTED {\n            ctx.charge_work(16, Utf16::default())?;','if COUNTED {'),
            ('if COUNTED {\n            ctx.charge_work(16, Utf16::default())?;','ctx.charge_work(16, Utf16::default())?;'),
            ('compiled.preflight_located_for::<COUNTED>(\n            &*compiled.schema','compiled.preflight_located_for::<false>(\n            &*compiled.schema'),
            ('let resolved = if R::COUNTED {','let resolved = {'),
            ('if admitted && bank.is_counted_core() {','if admitted {'),
            (true_call,true_call.replace('::<true>','::<false>')),
            (false_call,false_call.replace('::<false>','::<true>')),
            (counted,counted.replace('Some(scope.as_str())','None')),
            (counted,counted.replace(', false, ctx)',', true, ctx)')),
            (counted,counted.replace(', false, ctx)',', false, other)')),
            (counted,counted.replace('Some(scope.as_str()), false, ctx','Some(scope.as_str()), false')),
            ('ctx.charge_work(12, Utf16::default())?;','other.charge_work(12, Utf16::default())?;'),
            ('ctx.charge_work(12, Utf16::default())?;\n                            if text == "$ref"','if text == "$ref"'),
            ('ctx.charge_work(49, Utf16::default())?;','other.charge_work(49, Utf16::default())?;'),
            ('!tracked && !effective_base.is_empty() && self.counted_pointer_root(indexed_root, ctx)?','!effective_base.is_empty() && self.counted_pointer_root(indexed_root, ctx)?'),
            ('!Arc::ptr_eq(bank, root_bank)','true'),
            ('|| !Arc::ptr_eq(bank, root_bank)','&& !Arc::ptr_eq(bank, root_bank)'),
            ('|| ctx.profile() != crate::context::ResourceProfile::Cooperative','|| true'),
        ]
        for i,(old,new) in enumerate(mutations):
            with self.subTest(mutation=i):
                mutant=changed_mutant(source,old,new)
                with self.assertRaises(ValueError):validate_counted_constructor_routing(mutant)
        resolver_body=raw_body(source,'resolve_ref_location_impl')
        for i,(old,new) in enumerate((
            ('ctx.charge_work(16, Utf16::default())?;',''),
            ('if identity_path && !std::ptr::eq(current, root) && !std::ptr::eq(current, &*self.schema) {','if identity_path {'),
            ('sp = next_path;\n                            continue;','sp = normalized;'),
        )):
            mutated_body=changed_mutant(resolver_body,old,new)
            mutant=source.replace(resolver_body,mutated_body,1)
            with self.subTest(production_move_mutation=i):
                with self.assertRaises(ValueError):validate_counted_constructor_routing(mutant)
        injected=source.replace('let resolved = if R::COUNTED {','self.resolve_ref_location_impl::<true>(val, &reference_path, Some(scope.as_str()), false, ctx);\n                        let resolved = if R::COUNTED {',1)
        self.assertNotEqual(injected,source)
        with self.assertRaises(ValueError):validate_counted_constructor_routing(injected)
        foreign='fn injected_caller() { let _ = owner.resolve_ref_location_impl::<true>(&reference, &path, Some(base), false, ctx); }'
        with self.assertRaises(ValueError):validate_counted_constructor_routing(source,{'crates/umf-core/src/schema_path_facts_independent_tests.rs':foreign})
        spaced='fn injected_caller() { let _ = owner.resolve_ref_location_impl ::<true>(&reference, &path, Some(base), false, ctx); }'
        with self.assertRaises(ValueError):validate_counted_constructor_routing(source,{'crates/umf-core/src/schema_path_facts_independent_tests.rs':spaced})
        sidecar_path='crates/umf-core/src/schema_preflight_reference_independent_tests.rs'
        sidecar=(ROOT/sidecar_path).read_text()
        for old,new in (('assert!(ctx.charged_work() - before < old_work);','assert!(ctx.charged_work() <= old_work);'),
                        ('denied_amount.set(Some(16));','denied_amount.set(Some(15));')):
            mutant=changed_mutant(sidecar,old,new)
            with self.assertRaises(ValueError):validate_reference_test_protocol(mutant)
        for spelling in ('::< true>','::<false >'):
            malformed=source.replace('resolve_ref_location_impl::<true>(val, &reference_path',
                                      'resolve_ref_location_impl'+spelling+'(val, &reference_path',1)
            self.assertNotEqual(malformed,source)
            with self.assertRaises(ValueError):validate_counted_constructor_routing(malformed)

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
        for i,(old,new) in enumerate(rows):
            with self.subTest(mutation=i):
                mutant=changed_mutant(source,old,new)
                with self.assertRaises(ValueError):validate_root_selection(mutant)


if __name__=='__main__':unittest.main()
