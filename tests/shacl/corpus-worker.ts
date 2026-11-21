// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import * as u from '../../src/index-node-v4';
assert.ok(process.send,'SHACL corpus worker requires its coordinator');
const disconnected=()=>process.exit(1);
process.on('disconnect',disconnected);
process.on('message',async(message:any)=>{
 if(message===null){process.off('disconnect',disconnected);process.disconnect!();return;}
 try{
  const {kind,index,row:c}=message;
  const raw=await Bun.file(c.shapesPath).text(),dataRaw=await Bun.file(c.dataPath).text();
  const shapes=u.importShaclTurtle(raw,{id:kind==='numeric'?'shapes':'s',baseIRI:'https://example.org/'}),data=u.importRdfTurtle(dataRaw,{id:kind==='numeric'?'data':'d',baseIRI:'https://example.org/'});
  const formats=kind==='numeric'?['json','yaml'] as const:[c.id.endsWith('Exclusive')?'yaml':'json'] as const;
  for(const format of formats){
   const r=await u.proposeShaclEngineValidation(u.readDocument(u.writeDocument(shapes,format),format),u.readDocument(u.writeDocument(data,format),format),{id:kind==='numeric'?'report':'r',blankNodePolicy:'disjoint-inputs'});
   assert.equal(r.status,'evaluated',c.id+': '+JSON.stringify(r.diagnostics));assert.equal(r.engineConforms,c.expected,c.id);
   assert.equal(kind==='strings'?r.stringProfile:r.numericProfile,kind==='strings'?'umf-string-1':'umf-numeric-2',c.id);
   assert.equal(u.exportShaclTurtle(r.shapes),raw,c.id);assert.equal(u.exportRdfTurtle(r.data),dataRaw,c.id);
   assert.equal(u.getRdfQuads(r.report!).filter(q=>q.predicate.value.endsWith('#result')).length,c.expected?0:1,c.id);
  }
  process.send!({index,assertions:formats.length*6});
 }catch(error){console.error(error);process.exit(1);}
});
process.send!({ready:true});
