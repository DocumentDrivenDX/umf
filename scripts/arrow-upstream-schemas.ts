import {importArrowSchema,exportArrowSchema,readDocument,writeDocument} from '../src';
const base='fixtures/arrow/upstream/',manifest=await Bun.file(base+'schema-manifest.json').json(),results=[];
for(const c of manifest.cases){let doc;
 try{doc=importArrowSchema(await Bun.file(base+c.schema).text(),{id:c.source});}catch(error){results.push({...c,status:'rejected',message:(error as Error).message});continue;}
 const expected=exportArrowSchema(doc);for(const format of ['json','yaml'] as const)if(exportArrowSchema(readDocument(writeDocument(doc,format),format))!==expected)throw Error('Schema round trip changed '+c.source);results.push({...c,status:'round-tripped'});
}
if(results.length!==91||results.some(r=>r.status!=='round-tripped'))throw Error('Upstream schema baseline changed');
await Bun.write(base+'schema-results.json',JSON.stringify({cases:results.length,passed:results.filter(r=>r.status==='round-tripped').length,results},null,2)+'\n');console.log({cases:results.length,rejected:results.filter(r=>r.status==='rejected')});
