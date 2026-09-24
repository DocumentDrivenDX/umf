import {createHash} from 'node:crypto';
import {backend} from '../native/arrow/runtime';
import {importArrowSchema,exportArrowSchemaIpc,proposeArrowNodeEdit} from '../src';
const cases=await Bun.file('fixtures/arrow/schema-cases.json').json();const results=[];
for(const c of cases){
 const doc=importArrowSchema(JSON.stringify(c.input),{id:c.id});
 try{const bytes=exportArrowSchemaIpc(doc,backend);const file=c.id+'.umf.arrow';await Bun.write('fixtures/arrow/'+file,bytes);results.push({id:c.id,status:'exported',file,sha256:createHash('sha256').update(bytes).digest('hex')});}
 catch(e){results.push({id:c.id,status:'blocked',message:(e as Error).message});}
}
const blocked=results.filter(r=>r.status==='blocked').map(r=>r.id);
if(blocked.join(',')!=='type-47,type-48,type-49,duplicate-metadata'||results.length!==52)throw Error('Unexpected public IPC baseline');
const doc=importArrowSchema(JSON.stringify(cases[1].input),{id:'edit'});const edit=proposeArrowNodeEdit(doc,'/fields/0/name','"edited_field"').document;
await Bun.write('fixtures/arrow/edited.umf.arrow',exportArrowSchemaIpc(edit,backend));
await Bun.write('fixtures/arrow/public-ipc-results.json',JSON.stringify({backend:backend.identity,cases:52,exported:48,blocked:4,results},null,2)+'\n');console.log({exported:48,blocked:4,edited:true});
