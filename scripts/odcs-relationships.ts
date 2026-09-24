import {createHash} from 'node:crypto';
import {importOdcsDocument,exportOdcsDocument,inspectOdcsRelationships,readDocument,writeDocument} from '../src';
const base='fixtures/odcs/relationships/',path='native/odcs/sources/docs/examples/references/relationships.odcs.yaml',raw=await Bun.file(path).text(),native=JSON.parse(exportOdcsDocument(importOdcsDocument(raw,{id:'upstream',format:'yaml'}),'json'));
const fixed=structuredClone(native);fixed.schema[1].properties[2].name='address_street';
const cases:{id:string;source:any;expected:string;code?:string}[]=[{id:'upstream',source:native,expected:'blocked',code:'ODCS_REFERENCE_MISSING'},{id:'paired',source:fixed,expected:'checked'}];
function add(id:string,code:string,edit:(n:any)=>void){const n=structuredClone(fixed);edit(n);cases.push({id,source:n,expected:'blocked',code});}
add('arity','ODCS_RELATIONSHIP_ARITY',n=>n.schema[2].relationships[0].to.pop());
add('property-from','ODCS_RELATIONSHIP_FROM',n=>n.schema[2].properties[1].relationships[0].from='orders.customer_id');
add('mixed-shapes','ODCS_RELATIONSHIP_SHAPE',n=>n.schema[2].relationships[0].from='orders.customer_id');
add('duplicate-id','ODCS_RELATIONSHIP_ID',n=>n.schema[2].properties[1].relationships.push(structuredClone(n.schema[2].properties[1].relationships[0])));
add('property-array','ODCS_RELATIONSHIP_PROPERTY_ARRAY',n=>n.schema[2].properties[1].relationships[0].to=['customers.id']);
add('unknown-type','ODCS_RELATIONSHIP_TYPE',n=>n.schema[2].relationships[0].type='association');
add('external','ODCS_REFERENCE_EXTERNAL',n=>n.schema[2].properties[1].relationships[0].to='other.yaml#/schema/customers_obj/properties/customer_id_prop');
const results=[];
for(const c of cases){const text=JSON.stringify(c.source),d=importOdcsDocument(text,{id:c.id,format:'json'});await Bun.write(base+c.id+'.json',text+'\n');
 for(const f of ['json','yaml'] as const){const report=inspectOdcsRelationships(readDocument(writeDocument(d,f),f));if(report.status!==c.expected||c.code&&![...report.diagnostics,...report.relationships.flatMap(r=>r.diagnostics)].some(x=>x.code===c.code))throw Error(c.id+' differs');await Bun.write(base+c.id+'.'+f+'.report.json',JSON.stringify(report,null,2)+'\n');}
 results.push({id:c.id,expected:c.expected,...(c.code?{code:c.code}:{}),sourceSha256:createHash('sha256').update(text+'\n').digest('hex')});
}
await Bun.write(base+'results.json',JSON.stringify({authority:'Pinned references.md runtime arity/context rules plus authored variations of the official example; pairing does not enforce data constraints',upstreamPath:path,upstreamSha256:createHash('sha256').update(raw).digest('hex'),results},null,2)+'\n');console.log({cases:cases.length,formatReports:cases.length*2});
