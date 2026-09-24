import {importOdcsDocument,exportOdcsDocument,proposeOdcsElementRename,readDocument,writeDocument} from '../src';
import {createHash} from 'node:crypto';
const base='fixtures/odcs/rename/',obj=await Bun.file('fixtures/odcs/relationships/paired.json').json();
obj.customProperties=[{property:'uninterpreted-expression',value:'orders.customer_id'}];
obj.schema[1].properties.push({id:'location',name:'location',logicalType:'object',properties:[{id:'zip',name:'zip',logicalType:'string'}]});
obj.schema[2].properties.push({id:'shipping_zip',name:'shipping_zip',logicalType:'string',relationships:[{id:'fk_zip',to:'addresses.location.zip'}]});
obj.schema[2].properties[1].relationships.push({id:'fk_stable',to:'schema/customers_obj/properties/customer_id_prop'});
const raw=JSON.stringify(obj)+'\n';await Bun.write(base+'source.json',raw);const d=importOdcsDocument(raw,{id:'rename-source',format:'json'}),results=[];
for(const c of [
 {id:'object',reference:'schema/orders_obj',name:'purchases',paths:['/schema/2/name','/schema/2/relationships/0/from/0','/schema/2/relationships/0/from/1']},
 {id:'target',reference:'schema/customers_obj/properties/customer_id_prop',name:'customer_key',paths:['/schema/0/properties/0/name','/schema/2/properties/1/relationships/0/to']},
 {id:'nested',reference:'schema/addresses_obj/properties/location',name:'postal',paths:['/schema/1/properties/3/name','/schema/2/properties/3/relationships/0/to']},
 {id:'source-property',reference:'schema/orders_obj/properties/order_customer_prop',name:'buyer_id',paths:['/schema/2/properties/1/name','/schema/2/relationships/0/from/0']},
]){
 const r=proposeOdcsElementRename(d,c);if(!r.candidate||JSON.stringify(r.changes.map(c=>c.path))!==JSON.stringify(c.paths))throw Error(c.id+' expected changes differ');
 for(const f of ['json','yaml'] as const){await Bun.write(base+c.id+'.'+f+'.json',exportOdcsDocument(readDocument(writeDocument(r.candidate,f),f),'json'));}
 results.push({...c,changes:r.changes});
}
await Bun.write(base+'results.json',JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),results,scope:'Authored extension of paired relationship example; only local known foreign-key name references rewritten'},null,2)+'\n');console.log({cases:results.length,exports:results.length*2});
