// SPDX-License-Identifier: MIT OR Apache-2.0
// Regenerate only from the existing TypeScript admission inspector.
import {readFileSync, writeFileSync} from 'node:fs';
import {inspectAccessViews} from '../../src/compilation/admission/access/index';
import type {Document} from '../../src/model/types';
const root = new URL('../../', import.meta.url);
const load = (path:string) => JSON.parse(readFileSync(new URL(path,root),'utf8'));
const base = load('fixtures/access/commerce/engine-only.json');
const ref = {module:'commerce',element:'Order'};
const cases: {id:string;request:any;expected?:unknown}[] = [];
function add(id:string, change:(request:any)=>void = ()=>{}) {
 const request = {document:structuredClone(base),selected:[structuredClone(ref)]};
 change(request);cases.push({id,request});
}
add('default-instant');
add('empty-selection', r=>r.selected=[]);
add('date-instant-local', r=>{
 const m=r.document.modules[0],record=m.elements.find((e:any)=>e.id==='Order'),view=m.extensions['umf.access'].views[0];
 for(const [id,scalar,temporal] of [['civilDate','date',undefined],['civilTime','timestamp','local']]) {
  m.elements.push({id,kind:'field',scalarType:scalar,cardinality:'one',nullability:'required',extensions:{}});
  record.members.push({module:'commerce',element:id});
  const field=structuredClone(view.fields[3]);field.field.element=id;
  if(temporal)field.temporal=temporal;else delete field.temporal;
  view.fields.push(field);
 }
 r.sourceId='logical/temporal-😀';
});
add('duplicate-selection', r=>r.selected.push(structuredClone(ref)));
add('foreign-selection', r=>r.selected.push({module:'foreign',element:'Order'}));
add('missing-temporal-selection',r=>delete r.document.modules[0].extensions['umf.access'].views[0].fields[3].temporal);
add('unknown-temporal-selection',r=>r.document.modules[0].extensions['umf.access'].views[0].fields[3].temporal='future');
add('unsupported-refinement',r=>r.document.modules[0].elements[3].facets={futurePrecision:9});
add('presence-conflict',r=>r.document.modules[0].extensions['umf.access'].views[0].fields[0].row.null=true);
add('temporal-key',r=>{r.document.modules[0].elements[0].scalarType='timestamp';r.document.modules[0].extensions['umf.access'].views[0].fields[0].temporal='instant';});
add('foreign-selected-key',r=>r.document.modules[0].extensions['umf.access'].views[0].selectedKey.key='foreign');
add('duplicate-view',r=>r.document.modules[0].extensions['umf.access'].views.push(structuredClone(r.document.modules[0].extensions['umf.access'].views[0])));
add('selected-unknown-content',r=>r.document.modules[0].elements[5].futureMeaning={exact:'9007199254740993\n\ud800'});
add('unselected-unknown-content',r=>{
 r.document.vocabularies['future.extension']={version:'1.0.0'};
 r.document.modules[0].elements.push({id:'opaque',kind:'record',members:[],extensions:{'future.extension':{exact:'9007199254740993\n😀'}}});
});
for(const id of ['bound','duplicate-binding','foreign-binding']) {
 const request:any={document:load('fixtures/access/commerce/postgresql18.json'),selected:[ref],bindings:[{sourceId:'orders-binding',document:load('fixtures/access/commerce/postgresql18-binding.json')}],sourceId:'model-exact'};
 if(id==='duplicate-binding')request.bindings.push(structuredClone(request.bindings[0]));
 if(id==='foreign-binding')request.bindings[0].sourceId='foreign';
 cases.push({id,request});
}
for(const row of cases) {
 const r=row.request,before=JSON.stringify(r);
 row.expected=inspectAccessViews(r.document as Document,r.selected,r.bindings,r.sourceId);
 if(JSON.stringify(r)!==before)throw Error('Oracle mutated '+row.id);
}
const out = new URL('fixtures/access-inspection/cases.json',import.meta.url);
writeFileSync(out,JSON.stringify({oracle:'src/compilation/admission/access/index.ts#inspectAccessViews',cases},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,path:out.pathname}));
