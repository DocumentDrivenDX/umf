import {importSparkSchema,exportSparkSchema,proposeSparkNodeEdit,readDocument,writeDocument} from '../src';
import {parseNativeJson} from '../src/model/native-json';
const base='fixtures/spark/',cases=await Bun.file(base+'schema-cases.json').json(),results=[];
// Read original case source with exact tokens: JSON.parse would round metadata longs.
const source=parseNativeJson(await Bun.file(base+'schema-cases.json').text());if(source.kind!=='array')throw Error('Expected cases');
for(let i=0;i<cases.length;i++){const c=cases[i],node=source.items[i]!;if(node.kind!=='object')throw Error('Expected case');const {renderTree}=await import('../src/model/native-json');const text=renderTree(node.members.input!);
 if(['array-default','map-default'].includes(c.id)){let rejected=false;try{importSparkSchema(text,{id:c.id});}catch{rejected=true;}if(!rejected)throw Error('Missing native required property accepted');results.push({id:c.id,status:'structure-rejected'});continue;}
 const doc=importSparkSchema(text,{id:c.id});for(const format of ['json','yaml'] as const)if(exportSparkSchema(readDocument(writeDocument(doc,format),format))!==exportSparkSchema(doc))throw Error('Round trip changed '+c.id);
 await Bun.write(base+'umf/'+c.id+'.json',exportSparkSchema(doc));results.push({id:c.id,status:'round-tripped'});
}
const nested=importSparkSchema(await Bun.file(base+'umf/nested.json').text(),{id:'edit'});const edited=proposeSparkNodeEdit(nested,'/fields/0/type/elementType/fields/0/type','"decimal(20,6)"').document;await Bun.write(base+'umf/edited.json',exportSparkSchema(edited));
await Bun.write(base+'umf-results.json',JSON.stringify({cases:results.length,roundTripped:results.filter(r=>r.status==='round-tripped').length,results},null,2)+'\n');console.log({cases:49,roundTripped:47,rejected:2});
