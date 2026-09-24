import {importOdcsDocument,resolveOdcsReference,readDocument,writeDocument} from '../src';
import {createHash} from 'node:crypto';
const base='fixtures/odcs/references/',vectors=await Bun.file(base+'cases.json').json(),raw=await Bun.file(vectors.source).text(),d=importOdcsDocument(raw,{id:'relationships',format:'yaml'}),results=[];
for(const c of vectors.cases)for(const f of ['json','yaml'] as const){const r=resolveOdcsReference(readDocument(writeDocument(d,f),f),c);if(c.target?r.target?.path!==c.target:r.status!=='blocked'||!r.diagnostics.some(x=>x.code===c.error))throw Error('Reference outcome differs: '+c.reference);results.push({reference:c.reference,usage:c.usage,format:f,status:r.status,target:r.target,diagnostics:r.diagnostics});}
await Bun.write(base+'results.json',JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),results},null,2)+'\n');console.log({vectors:vectors.cases.length,formatComparisons:results.length});
