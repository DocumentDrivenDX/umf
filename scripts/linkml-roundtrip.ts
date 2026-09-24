import {createHash} from 'node:crypto';
import {importLinkmlDocument,exportLinkmlDocument,inspectLinkmlDocument,proposeLinkmlDocumentNodeEdit,readDocument,writeDocument} from '../src';
const metamodel=process.argv.includes('--metamodel');
const source=await Bun.file('native/linkml/sources/manifest.json').json(),base=metamodel?'fixtures/linkml/metamodel/':'fixtures/linkml/',results=[];
const files=metamodel?source.files.filter((f:any)=>f.upstreamPath.startsWith('linkml_model/model/schema/')&&f.upstreamPath.endsWith('.yaml')):[...source.files.filter((f:any)=>f.upstreamPath.startsWith('tests/input/examples/')&&f.upstreamPath.endsWith('.yaml')),{path:'native/linkml/examples/people.yaml'}];
for(const [i,f] of files.entries()){
 const id=String(i).padStart(3,'0'),raw=await Bun.file(f.path).text();
 try{const d=importLinkmlDocument(raw,{id,format:'yaml'}),obj=JSON.parse(exportLinkmlDocument(d,'json')),editPath=typeof obj.description==='string'?'/description':'/name',value=editPath==='/name'?'reviewed_umf_fixture':'Reviewed UMF fixture',candidate=proposeLinkmlDocumentNodeEdit(d,editPath,JSON.stringify(value));
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);if(exportLinkmlDocument(restored)!==raw)throw Error('Original archive differs');await Bun.write(base+id+'.'+format+'.json',exportLinkmlDocument(restored,'json'));await Bun.write(base+id+'.edited.'+format+'.json',exportLinkmlDocument(readDocument(writeDocument(candidate.document,format),format),'json'));}
 results.push({id,path:f.path,sourceSha256:createHash('sha256').update(raw).digest('hex'),editPath,value,validation:inspectLinkmlDocument(d),candidateValidation:candidate.validation});
 }catch(error){results.push({id,path:f.path,error:String(error)});}
}
await Bun.write(base+'results.json',JSON.stringify({results},null,2)+'\n');console.log({cases:results.length,preserved:results.filter(r=>!('error' in r)).length,errors:results.filter(r=>'error' in r)});
