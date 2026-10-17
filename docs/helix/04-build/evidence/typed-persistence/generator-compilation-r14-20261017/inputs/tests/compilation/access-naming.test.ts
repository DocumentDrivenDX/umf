import {expect,test} from 'bun:test';
import {generateAccessPackage} from '../../src/compilation/index';
import {profile,request,mutateSource} from './access-fixtures';
// @covers US-080-AC4
 test('unsafe_names_and_limits_refuse',()=>{
 for(const name of ['c','objects','alias','model_config','test_reserved','KEY_IDENTITY','UMF_PROJECTION_FIELDS','UMF_UPDATE_FIELDS','ActionSource','ActionProfile','FieldValidator','seal_model','unhashable_key','ValueNormalizer','encode_model','decode_model','initialize_rejection','initialize_action_rejection','Join','RequiredJoin','OptionalJoin','JoinProjection','Actions','ReplayingActions','ActionEndpoint','ActionExecutor','OriginalOutcome']){const req=request();req.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:name}];const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('refused');expect(r.diagnostics.some(d=>d.code==='NAME')).toBe(true);expect(r.files).toEqual([]);}
 for(const name of ['decimal','pydantic','umf_access']){const req=request();req.package=name;expect(generateAccessPackage(req,profile()).diagnostics.some(d=>d.code==='NAME')).toBe(true);}
 for(const name of ['../evil','NotAPackage']){const req=request();req.package=name;expect(()=>generateAccessPackage(req,profile())).toThrow();}
 const req=request();for(let i=1;i<33;i++)req.sources.push({id:`extra${i}`,format:'json',text:req.sources[0]!.text});const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('refused');expect(r.diagnostics.some(d=>d.code==='LIMIT')).toBe(true);
 });
// @covers US-080-AC4
 test('metadata cannot choose a profile or template and must remain inert',()=>{
 const req=request();const hostile='\"\'\n\\\u2028__import__(\"os\").system(\"false\")';mutateSource(req,d=>{Object.assign(d.modules[0]!.elements[0]!,{description:hostile});});const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');expect(JSON.parse(r.files.find(f=>f.path==='shop/_umf/sources.json')!.text)).toEqual(req.sources);
 });
// @covers US-080-AC4
 test('hostile authored identities emit only inert Python literals',async()=>{
 const req=request(),hostile='id\"\'\\\n\u2028__import__(\"os\")';
 mutateSource(req,d=>{
  d.id=hostile;
  const walk=(value:unknown)=>{if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){if(key==='element'&&child==='orderId')(value as Record<string,unknown>)[key]=hostile;else walk(child);}};walk(d);d.modules[0]!.elements[0]!.id=hostile;
 });
 req.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:'safe_identity'}];
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');
 const probe=Bun.spawn(['python3','-c','import ast,json,sys; data=json.load(sys.stdin); found=[]\nfor f in data["files"]:\n if f["path"].endswith(".py"):\n  tree=ast.parse(f["text"]); found += [n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str)]\nassert data["hostile"] in found\nprint("syntax and literal round-trip pass")'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 probe.stdin.write(JSON.stringify({files:r.files,hostile}));probe.stdin.end();const [code,stderr]=await Promise.all([probe.exited,new Response(probe.stderr).text()]);expect(stderr).toBe('');expect(code).toBe(0);
 });
// @covers US-080-AC4
 test('selected element and action count bounds refuse before resolving',()=>{
 const elements=request();elements.records=Array.from({length:10001},(_,i)=>({module:'commerce',element:'r'+i}));expect(generateAccessPackage(elements,profile()).diagnostics.some(d=>d.code==='LIMIT')).toBe(true);
 const actions=request();actions.actions=Array.from({length:1001},(_,i)=>({module:'commerce',action:'a'+i}));expect(generateAccessPackage(actions,profile()).diagnostics.some(d=>d.code==='LIMIT')).toBe(true);
 });
// @covers US-080-AC4
 test('malformed and ambiguous profile pins refuse as PROFILE',()=>{
 for(const change of [(p:ReturnType<typeof profile>)=>{p.dependencies=[null as never];},(p:ReturnType<typeof profile>)=>{p.checkers=[null as never];},(p:ReturnType<typeof profile>)=>{p.dependencies.push({...p.dependencies[0]!});},(p:ReturnType<typeof profile>)=>{p.dependencies[0]!.version='>=0.1';}]){const p=profile();change(p);const r=generateAccessPackage(request(),p);expect(r.outcome).toBe('refused');expect(r.diagnostics.some(d=>d.code==='PROFILE')).toBe(true);}
 });

// @covers US-080-AC4
 test('action input and output aliases cannot overwrite a declared parameter',async()=>{
 const actionFixture=await Bun.file(new URL('../../fixtures/access/commerce/actions.json',import.meta.url)).json();
 for(const group of ['parameters','outputs'] as const){
  const req=request();req.sources[0]!.text=JSON.stringify(actionFixture);req.actions=[{module:'commerce',action:'shipOrder'}];
  if(group==='outputs'){
   const doc=JSON.parse(req.sources[0]!.text),action=doc.modules[0].extensions['umf.actions'].actions[0];
   action.outputs.push({...action.outputs[0],id:'secondAmount'});req.sources[0]!.text=JSON.stringify(doc);
  }
  req.names=[0,1].map(i=>({sourceId:'logical',pointer:`/modules/0/extensions/umf.actions/actions/0/${group}/${i}`,python:'same'}));
  const result=generateAccessPackage(req,profile());
  expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);
  expect(result.diagnostics.some(d=>d.code==='NAME'&&d.pointer===`/modules/0/extensions/umf.actions/actions/0/${group}/1`)).toBe(true);
 }
 });

// @covers US-080-AC4
test('generated provenance and join imports cannot be shadowed',()=>{
 for(const python of ['GeneratedSource','UMF_GENERATED_SOURCE','UMF_SOURCE','Join','RequiredJoin','OptionalJoin','JoinProjection','AliasOwner','RecordAlias','alias_column','alias_record','alias_relationship','cast']){
  const req=request();req.names=[{sourceId:'logical',pointer:'/modules/0/elements/5',python}];
  const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('refused');expect(result.diagnostics.some(d=>d.code==='NAME')).toBe(true);
 }
});

// @covers US-080-AC4 -- joined projection descriptors are public symbols too.
test('joined projection descriptor names cannot shadow another projection model',()=>{
 const q=request();q.projections=[{name:'summary',record:q.records[0]!,fields:[{module:'commerce',element:'orderId'}]},{name:'summaryProjection',record:q.records[0]!,fields:[{module:'commerce',element:'amount'}]}];
 const result=generateAccessPackage(q,profile());expect(result.outcome).toBe('refused');expect(result.diagnostics.some(d=>d.code==='NAME')).toBe(true);
});

// Generated endpoint names must be legal even when their class name is legal.
test('action endpoint keyword and case-fold collisions refuse before emission',()=>{
 for(const collision of [false,true]){
  const req=request();req.sources[0]!.text=JSON.stringify(require('../../fixtures/access/commerce/actions.json'));
  req.actions=[{module:'commerce',action:'shipOrder'}];
  if(!collision){req.names=[{sourceId:'logical',pointer:'/modules/0/extensions/umf.actions/actions/0',python:'Class'}];}
  else {
   mutateSource(req,d=>{const actions=(d.modules[0]!.extensions as any)['umf.actions'].actions;actions.push({...structuredClone(actions[0]),id:'otherAction'});});
   req.actions.push({module:'commerce',action:'otherAction'});
   req.names=[{sourceId:'logical',pointer:'/modules/0/extensions/umf.actions/actions/0',python:'SHIPOrder'},{sourceId:'logical',pointer:'/modules/0/extensions/umf.actions/actions/1',python:'Shiporder'}];
  }
  const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('refused');expect(result.diagnostics.some(d=>d.code==='NAME')).toBe(true);expect(result.files).toEqual([]);
 }
});
