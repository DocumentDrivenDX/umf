import {createHash} from 'node:crypto';
import {importOdcsDocument,exportOdcsDocument,inspectOdcsDocument,proposeOdcsDocumentNodeEdit,readDocument,writeDocument} from '../src';
const source=await Bun.file('native/odcs/sources/manifest.json').json(),base='fixtures/odcs/',results=[];
for(const [i,f] of source.files.filter((f:any)=>f.upstreamPath.endsWith('.yaml')).entries()){
 const id=String(i).padStart(3,'0'),raw=await Bun.file(f.path).text();
 try{const d=importOdcsDocument(raw,{id,format:'yaml'}),obj=JSON.parse(exportOdcsDocument(d,'json')),editPath=typeof obj.name==='string'?'/name':'/version',value='Reviewed UMF fixture',candidate=proposeOdcsDocumentNodeEdit(d,editPath,JSON.stringify(value));
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);if(exportOdcsDocument(restored)!==raw)throw Error('Original archive differs');await Bun.write(base+id+'.'+format+'.json',exportOdcsDocument(restored,'json'));await Bun.write(base+id+'.edited.'+format+'.json',exportOdcsDocument(readDocument(writeDocument(candidate.document,format),format),'json'));}
 results.push({id,path:f.path,sourceSha256:createHash('sha256').update(raw).digest('hex'),apiVersion:obj.apiVersion,editPath,value,validation:inspectOdcsDocument(d),candidateValidation:candidate.validation});
 }catch(error){results.push({id,path:f.path,error:String(error)});}
}
await Bun.write(base+'results.json',JSON.stringify({results},null,2)+'\n');console.log({cases:results.length,preserved:results.filter(r=>!('error' in r)).length,errors:results.filter(r=>'error' in r)});
