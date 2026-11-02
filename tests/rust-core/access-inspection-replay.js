// SPDX-License-Identifier: MIT OR Apache-2.0
// Shared real native/browser assertions; this module has no host APIs.
function canonical(value) {
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function check(value,message){if(!value)throw Error(message);}
export function replayAccessInspection(engine,cases) {
 let assertions=0;
 for(const row of cases) {
  const r=row.request,before=JSON.stringify(r);
  const response=engine.call('inspectAccessViews',r);
  check(equal(response,{ok:true,result:row.expected}),row.id+' dispatcher parity: '+JSON.stringify(response));assertions++;
  const result=engine.inspectAccessViews(r.document,r.selected,r.bindings,r.sourceId);
  check(equal(result,row.expected),row.id+' facade parity');assertions++;
  check(JSON.stringify(r)===before,row.id+' source/reference/binding custody');assertions++;
  result.records.push({changedByCaller:true});result.diagnostics.push({changedByCaller:true});
  check(equal(engine.inspectAccessViews(r.document,r.selected,r.bindings,r.sourceId),row.expected),row.id+' output isolation');assertions++;
 }
 const first=cases[0].request;
 const malformed=[{...first,unknown:true},{...first,selected:{}},{...first,selected:[{...first.selected[0],extra:true}]},{...first,bindings:{}},{...first,bindings:[{sourceId:'x'}]},{...first,bindings:[{sourceId:'x',document:first.document,extra:true}]},{...first,sourceId:null},{...first,sourceId:'\ud800'},{selected:first.selected},{document:first.document}];
 for(const request of malformed){
  const result=engine.call('inspectAccessViews',request);
  check(result.ok===false&&result.error.code==='REQUEST','malformed request must refuse: '+JSON.stringify(result));assertions++;
 }
 return {cases:cases.length,assertions};
}
export function inspectAccessControls(create,resources,request) {
 let active=false,total=0,stop=Infinity,mode='observe';
 const engine=create(resources,{controls:{meter(n){if(active){total+=n;if(mode==='meter'&&total>stop)throw Error('inspection meter');}},isCancelled:()=>active&&mode==='cancel'&&total>stop,now:()=>active&&mode==='deadline'&&total>stop?2:0,deadlineMs:1}});
 active=true;engine.inspectAccessViews(request.document,request.selected);
 const work=total;check(work>1000,'measured inspection work');
 for(const [kind,code] of [['meter','METER_FAILURE'],['cancel','CANCELLED'],['deadline','DEADLINE']]) {
  total=0;stop=Math.floor(work*0.75);mode=kind;
  let failure;try{engine.inspectAccessViews(request.document,request.selected);}catch(error){failure=error;}
  check(failure?.code===code,'terminal '+kind+' failure: '+failure?.code);
  check(total>stop&&total<work,'interrupted inspection');
 }
 engine.dispose?.();
 const limited=create(resources,{controls:{maxWork:work-1}});
 let failure;try{limited.inspectAccessViews(request.document,request.selected);}catch(error){failure=error;}
 check(failure?.code==='RESOURCE_LIMIT','public work budget refusal');limited.dispose?.();
 return {work,controls:4};
}

export function inspectSourceIdentityRefusals(engine, request) {
 let assertions=0;
 for(const location of ['sourceId','binding'])for(const surrogate of ['\ud800','\udfff']) {
  const input=JSON.parse(JSON.stringify(request)),rawId='source/'+surrogate+'/exact';
  input.document.unknownSourceContent={raw:'kept'+surrogate+'exact'};
  if(location==='sourceId')input.sourceId=rawId;
  else input.bindings=[{sourceId:rawId,document:input.document}];
  const before=JSON.stringify(input),response=engine.call('inspectAccessViews',input);
  check(response.ok===false&&response.error.code==='REQUEST'&&!('result' in response),location+' must refuse without coercion');assertions++;
  let failure;try{engine.inspectAccessViews(input.document,input.selected,input.bindings,input.sourceId);}catch(error){failure=error;}
  check(failure?.code==='REQUEST',location+' facade refusal');assertions++;
  check(JSON.stringify(input)===before,location+' input custody');assertions++;
  const scalar=JSON.parse(before);
  if(location==='sourceId')scalar.sourceId=rawId.replace(surrogate,'\ufffd');
  else scalar.bindings[0].sourceId=rawId.replace(surrogate,'\ufffd');
  check(engine.call('inspectAccessViews',scalar).ok===true,location+' scalar replacement control');assertions++;
 }
 return {cases:4,assertions};
}
