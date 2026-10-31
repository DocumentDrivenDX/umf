// SPDX-License-Identifier: MIT OR Apache-2.0
/** Browser-compatible independent expectation oracle; never derives expected values from a host. */
export interface SagaVector {id:string;covers:number[];source:any;expected:any}
export interface SagaSubject {inspectSagas(source:unknown):any;declareSaga(source:unknown,module:string,definition:unknown):any;editSaga(source:unknown,identity:unknown,replacement:unknown):any;assessSaga(source:unknown,identity:unknown,capabilities:unknown):any}
const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const insist=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
const actionWarnings=(paths:string[])=>paths.map(path=>({code:'ACTION_UNCHECKED',path,severity:'warning'}));
const actionDiagnosticProfiles:Record<string,any[]>={
 'inert-handler-actions':actionWarnings(Array.from({length:4},(_,i)=>[`/modules/0/extensions/umf.actions/actions/${i}/authorization`,`/modules/0/extensions/umf.actions/actions/${i}/binding/handler`]).flat()),
 'recipe-action':[],
 'unknown-native-and-inert-actions':[{code:'UNKNOWN_EXTENSION',path:'/vocabularies/vendor.native',severity:'warning'},...actionWarnings(Array.from({length:4},(_,i)=>[`/modules/0/extensions/umf.actions/actions/${i}/authorization`,`/modules/0/extensions/umf.actions/actions/${i}/binding/handler`]).flat())],
 'different-key-action-errors':[{code:'KEY_DUPLICATE_SET',path:'/modules/0/elements/2/keys/1/fields',severity:'error'},...Array.from({length:4},(_,i)=>[{code:'ACTION_STRUCTURE',path:`/modules/0/extensions/umf.actions/actions/${i}/writes/0/selector`,severity:'error'},...actionWarnings([`/modules/0/extensions/umf.actions/actions/${i}/authorization`,`/modules/0/extensions/umf.actions/actions/${i}/binding/handler`])]).flat()],
 'external-action-meaning':[...actionWarnings(['/modules/0/extensions/umf.actions/actions/0/externalEffects','/modules/0/extensions/umf.actions/actions/0/writes/0/selector']),...Array.from({length:4},(_,i)=>actionWarnings([`/modules/0/extensions/umf.actions/actions/${i}/authorization`,`/modules/0/extensions/umf.actions/actions/${i}/binding/handler`])).flat()]
};
export function verifySagaVectors(engine:SagaSubject,vectors:SagaVector[]) {
 const results:{id:string;covers:number[];passed:boolean;failure?:string}[]=[];
 for(const vector of vectors){try{
  const before=JSON.stringify(vector.source),expect=vector.expected;
  let inspection:any;
  try{inspection=engine.inspectSagas(vector.source);}catch(error){
   const code=(error as {code?:string}).code;
   if(expect.limit&&['LIMIT','SAGA_LIMIT','RESOURCE_LIMIT'].includes(code??'')){insist(JSON.stringify(vector.source)===before,'limit mutated source');results.push({id:vector.id,covers:vector.covers,passed:true});continue;}
   throw error;
  }
  insist(inspection.validation.valid===expect.valid,`valid expected ${expect.valid}: ${JSON.stringify(inspection.validation)}`);
  if(expect.complete!==undefined)insist(inspection.validation.complete===expect.complete,`complete expected ${expect.complete}: ${JSON.stringify(inspection.validation)}`);
  insist(equal(inspection.source,vector.source),'inspection dropped or changed source content');
  if(vector.id==='external-action-meaning')insist(inspection.source.modules[0].extensions['umf.actions'].actions[0].atomicity==='single-store','external meaning relabeled action atomicity');
  const diagnostics=inspection.validation.diagnostics;
  if(expect.sagaDiagnostics){
   const actual=diagnostics.map((d:any)=>({code:d.code,path:d.path,severity:d.severity}));
   const actionProfile=actionDiagnosticProfiles[expect.actionDiagnosticProfile];
   insist(actionProfile!==undefined,`unknown independent action diagnostic profile ${expect.actionDiagnosticProfile}`);
   insist(equal(actual,[...actionProfile!,...expect.sagaDiagnostics!]),`diagnostics differ from the complete independent code/path/severity inventory: ${JSON.stringify(actual)}`);
  }
  if(expect.code)insist(diagnostics.some((d:any)=>d.code===expect.code&&(!expect.at||d.path===expect.at)),`missing ${expect.code} at exact path ${expect.at??'*'}: ${JSON.stringify(diagnostics)}`);
  if(expect.noCode)insist(!diagnostics.some((d:any)=>d.code===expect.noCode),`unexpected ${expect.noCode}`);
  if(expect.limit)insist(diagnostics.some((d:any)=>['LIMIT','SAGA_LIMIT','RESOURCE_LIMIT'].includes(d.code)),`missing explicit limit diagnosis`);
  if(expect.stepIds){insist(equal(inspection.entries[0].definition.steps.map((s:any)=>s.id),expect.stepIds),'step identity/order changed');const comps=inspection.entries[0].definition.steps.map((s:any)=>({action:s.compensation.action,binding:s.compensation.binding,inputs:s.compensation.inputs}));const original=vector.source.modules[0].extensions['umf.actions.saga'].sagas[0].steps.map((s:any)=>({action:s.compensation.action,binding:s.compensation.binding,inputs:s.compensation.inputs}));insist(equal(comps,original),'compensation source bindings changed');}
  if(expect.obligations){const obligations=inspection.entries[0].obligations;insist(equal(obligations.map((o:any)=>({id:o.id,path:o.path,kind:o.kind,status:o.status})),expect.obligations),'complete ordered obligation inventory differs from independent expectation');}
  if(expect.finality){const finality=inspection.entries[0].obligations.filter((o:any)=>o.id.startsWith('saga.invocation.finality/'));insist(equal(finality.map((o:any)=>o.id),expect.finality),'incorrect finality obligation identities');insist(finality.every((o:any)=>o.kind==='recovery'&&o.status==='unchecked'),'finality is a separate unchecked provider obligation');}
  if(expect.unknown)insist(inspection.entries[0].obligations.some((o:any)=>o.kind==='unknown'&&o.status==='unchecked'),'unknown recovery meaning was interpreted');
  if(inspection.validation.valid&&inspection.entries.length){
   const entry=inspection.entries[0],identity={module:entry.module,saga:entry.definition.id};
   const capabilities={id:'independent-portable-oracle',version:'1',coreVersion:'0.10.0',sagaVersion:'0.1.0',coordination:'supported',claims:(expect.obligations?.map((o:any)=>o.id)??entry.obligations.map((o:any)=>o.id)).map((id:string)=>({obligation:id,status:'supported',evidence:['urn:synthetic:test-only']})),source:vector.source,identity};
   if(expect.compatible!==undefined){
    const assessed=engine.assessSaga(vector.source,identity,capabilities);
    insist(assessed.executionVerified===false,'portable claims became execution evidence');
    if(expect.compatible===true)insist(assessed.declarationCompatible===true,'fully supported exact declaration did not qualify');
    if(expect.compatible===false)insist(assessed.declarationCompatible===false,'unsupported meaning became compatible');
   }
   if(expect.editRefused){let refused=false;try{engine.editSaga(vector.source,identity,entry.definition);}catch(error){refused=(error as {code?:string}).code==='SAGA_UNCHECKED';}insist(refused,'unsafe edit did not refuse with SAGA_UNCHECKED');}
   if(expect.authoring){
    const fresh=structuredClone(entry.definition);fresh.id='fresh-authored-id';
    const declared=engine.declareSaga(vector.source,entry.module,fresh);
    insist(declared.modules[0].extensions['umf.actions.saga'].sagas.some((d:any)=>d.id===fresh.id),'declare replaced caller stable id');
    let conflict=false;try{engine.declareSaga(vector.source,entry.module,entry.definition);}catch{conflict=true;}insist(conflict,'duplicate authored id accepted');
    const edited=engine.editSaga(vector.source,identity,{...entry.definition,name:'Edited display name'});
    const editedDefinition=edited.modules[0].extensions['umf.actions.saga'].sagas[0];
    insist(editedDefinition.id===identity.saga,'edit replaced stable id');
    insist(editedDefinition.name==='Edited display name','edit did not apply the requested replacement');
    const expectedEdited=structuredClone(vector.source);expectedEdited.modules[0].extensions['umf.actions.saga'].sagas[0]={...expectedEdited.modules[0].extensions['umf.actions.saga'].sagas[0],name:'Edited display name'};
    insist(equal(edited,expectedEdited),'edit changed fields outside the requested replacement or dropped source content');
    let replaced=false;try{engine.editSaga(vector.source,identity,{...entry.definition,id:'different-id'});}catch{replaced=true;}insist(replaced,'edit accepted identity replacement');
   }
   if(vector.id==='recipe-declaration'){
    for(const change of ['source','identity','duplicate','missing-finality','missing-action','unsupported','unknown','coordination','saga-version']){
     const bad=structuredClone(capabilities);
     if(change==='source')bad.source={...bad.source,id:'wrong-source'};
     if(change==='identity')bad.identity={...bad.identity,saga:'wrong-saga'};
     if(change==='duplicate')bad.claims.push(bad.claims[0]);
     if(change==='missing-finality')bad.claims=bad.claims.filter((o:any)=>!o.obligation.startsWith('saga.invocation.finality/'));
     if(change==='missing-action')bad.claims=bad.claims.filter((o:any)=>o.obligation!=='action:approve:/modules/0/extensions/umf.actions/actions/0/binding/effects/0');
     if(change==='unsupported')bad.claims[0].status='unsupported';
     if(change==='unknown')bad.claims[0].status='unknown';
     if(change==='coordination')bad.coordination='unsupported';
     if(change==='saga-version')bad.sagaVersion='0.2.0';
     let refused=false;try{const result=engine.assessSaga(vector.source,identity,bad);refused=result.declarationCompatible===false&&result.executionVerified===false;}catch(error){refused=['SAGA_PROFILE','SAGA_STRUCTURE','SAGA_REFERENCE'].includes((error as {code?:string}).code??'');}
     insist(refused,`capability ${change} mismatch qualified`);
    }
   }
  }
  insist(JSON.stringify(vector.source)===before,'operation mutated source');
  if(inspection.source&&typeof inspection.source==='object'){
   inspection.source.id='detached-result-mutation';
   insist(JSON.stringify(vector.source)===before,'returned source aliases caller input');
   insist(equal(engine.inspectSagas(vector.source).source,vector.source),'returned result mutation poisoned later inspection');
  }
  results.push({id:vector.id,covers:vector.covers,passed:true});
 }catch(error){results.push({id:vector.id,covers:vector.covers,passed:false,failure:String(error)});}}
 return {profile:'umf.saga.portable-result/1',cases:results.length,passed:results.filter(r=>r.passed).length,results};
}

/** Real shared serializer exchange, including retained unfamiliar recovery/native data. */
export function verifySagaExchange(core:{readValue(source:string,format:'json'|'yaml'):unknown;writeValue(value:unknown,format:'json'|'yaml'):string},engine:SagaSubject,source:unknown):void {
 const original=JSON.stringify(source);
 for(const format of ['json','yaml'] as const){
  const encoded=core.writeValue(source,format),decoded=core.readValue(encoded,format);
  insist(equal(decoded,source),`${format} exchange changed retained saga/native meaning`);
  const inspected=engine.inspectSagas(decoded);
  insist(equal(inspected.source,source),`${format} exchanged inspection lost source`);
  insist(inspected.validation.complete===false,`${format} unknown meaning became complete`);
 }
 insist(JSON.stringify(source)===original,'exchange mutated caller source');
}
