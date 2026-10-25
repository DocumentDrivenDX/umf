import {readFileSync} from 'node:fs';
import {validateCoreRecordValues} from '../../../../../../src/index';
const packet=JSON.parse(readFileSync(new URL('frozen-typescript.json',import.meta.url),'utf8'));
let checked=0;
for (const c of packet.cases) {
  let actual:any;
  try { actual={result:validateCoreRecordValues(c.source,c.identity,c.values)}; }
  catch(e:any) { actual={thrown:{code:e.code??null,path:e.path??null,message:e.message}}; }
  const expected=c.thrown?{thrown:{code:c.thrown.code,path:c.thrown.path,message:c.thrown.message}}:{result:c.result};
  if (JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error(`${c.id}: frozen TypeScript outcome changed`);
  checked++;
}
const base=packet.cases.find((c:any)=>c.id==='sol-array-record-identity');
const absent={field:{module:'fixture',element:'label'},state:'absent'};
let largeError:any;
try {validateCoreRecordValues(base.source,{module:'fixture',element:'item'},Array.from({length:packet.largeCase.count},()=>absent));}
catch(e:any){largeError={code:e.code,path:e.path,message:e.message};}
if(JSON.stringify(largeError)!==JSON.stringify(packet.largeCase.expectedError))throw new Error('large duplicate absent vector changed');
let nested:any=null;
for(let i=0;i<packet.depthCase.depth;i++)nested={x:nested};
const deepSource={...base.source,'x-deep':nested};
let deepError:any;
try {validateCoreRecordValues(deepSource,{module:'fixture',element:'item'},[{field:{module:'fixture',element:'label'},state:'present',value:{string:'x'}}]);}
catch(e:any){deepError={code:e.code,path:e.path,message:e.message};}
if(JSON.stringify(deepError)!==JSON.stringify(packet.depthCase.expectedError))throw new Error('nested output limit vector changed');
console.log(`verified ${checked} frozen predecessor cases plus 15,000-item and nested-output resource controls`);
