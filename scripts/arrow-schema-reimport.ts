import {RecordBatchReader} from 'apache-arrow';
import {describe} from '../native/arrow/schema-probe';
const source=await Bun.file('fixtures/arrow/capability-results.json').json();
const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const results=[];
for(const row of source.results){
 if(row.status==='unsupported')continue;
 const reader=RecordBatchReader.from(new Uint8Array(await Bun.file('fixtures/arrow/'+row.id+'.python.arrow').arrayBuffer())).open();
 const reimported=describe(reader.schema);results.push({id:row.id,equal:canonical(reimported)===canonical(row.after),reimported});
}
await Bun.write('fixtures/arrow/reimport-results.json',JSON.stringify({cases:results.length,equal:results.filter(r=>r.equal).length,changed:results.filter(r=>!r.equal).length,results},null,2)+'\n');console.log({cases:results.length,changed:results.filter(r=>!r.equal).map(r=>r.id)});
if(results.length!==49||results.filter(r=>!r.equal).map(r=>r.id).join(',')!=='dictionary-large-id')throw Error('Cross-runtime schema baseline changed');
