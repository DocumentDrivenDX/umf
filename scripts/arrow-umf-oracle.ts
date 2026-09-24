import {importArrowSchema,exportArrowSchema,readDocument,writeDocument} from '../src';
import {probe} from '../native/arrow/schema-probe';
const cases=await Bun.file('fixtures/arrow/schema-cases.json').json();
const baseline=await Bun.file('fixtures/arrow/capability-results.json').json();
let decoded=0,unsupported=0;
for(const c of cases){
 const doc=importArrowSchema(JSON.stringify(c.input),{id:c.id});
 const restored=readDocument(writeDocument(doc,'yaml'),'yaml');const native=JSON.parse(exportArrowSchema(restored));
 if(JSON.stringify(native)!==JSON.stringify(c.input))throw Error('Native schema content changed through UMF '+c.id);
 const expected=baseline.results.find((r:any)=>r.id===c.id);let actual;
 try{actual=probe(native);}catch(e){if(expected.status!=='unsupported')throw e;unsupported++;continue;}
 if(expected.status==='unsupported'||JSON.stringify(actual.before)!==JSON.stringify(expected.before)||JSON.stringify(actual.after)!==JSON.stringify(expected.after))throw Error('Native behavior changed after UMF '+c.id);decoded++;
}
if(decoded!==49||unsupported!==3)throw Error('Incomplete native behavior matrix');
await Bun.write('fixtures/arrow/umf-oracle-results.json',JSON.stringify({cases:cases.length,exactContentPreserved:true,nativeDecoded:decoded,nativeUnsupportedRetained:unsupported,scope:'Exact UMF schema JSON preservation and unchanged pinned native decoder behavior. Known native losses remain reported by the capability probe; no public IPC conversion claim.'},null,2)+'\n');console.log({decoded,unsupported});
