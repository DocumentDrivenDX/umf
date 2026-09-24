import {importRdfNQuads,exportRdfNQuads,getRdfQuads,proposeRdfQuadEdit,readDocument,writeDocument} from '../src';
const manifest=await Bun.file('native/rdf/sources/manifest.json').json(),results=[];
for(const c of [...manifest.cases,{id:'authored-schema',positive:true,path:'native/rdf/examples/schema.nq',type:'authored'}]){const raw=await Bun.file(c.path).text();let d;try{d=importRdfNQuads(raw,{id:c.id});}catch(e){if(c.positive)throw Error(c.id+': '+String(e));results.push({...c,status:'rejected'});continue;}if(!c.positive)throw Error('Negative accepted: '+c.id);
 const quads=getRdfQuads(d);let candidate;const index=quads.findIndex(q=>q.object.kind==='literal');if(index>=0){const q=quads[index]!;candidate=proposeRdfQuadEdit(d,index,{...q,object:{kind:'literal',value:'UMF reviewed literal',datatype:'http://www.w3.org/2001/XMLSchema#string'}}).document;}
 const exports=[];for(const format of ['json','yaml'] as const){if(exportRdfNQuads(readDocument(writeDocument(d,format),format))!==raw)throw Error('Original differs');if(candidate){const output=exportRdfNQuads(readDocument(writeDocument(candidate,format),format)),path='fixtures/rdf/nquads/'+c.id+'.'+format+'.edited.nq';await Bun.write(path,output);exports.push({format,path});}}
 results.push({...c,status:'accepted',quads:quads.length,terms:quads,editIndex:index,exports});
}
await Bun.write('fixtures/rdf/nquads/results.json',JSON.stringify({results},null,2)+'\n');console.log({cases:results.length,accepted:results.filter(r=>r.status==='accepted').length,edited:results.filter(r=>r.exports?.length).length});
