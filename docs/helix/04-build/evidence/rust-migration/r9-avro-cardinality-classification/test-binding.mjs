import {readFileSync} from 'node:fs';
import {executeAvroCardinalityBindingWire,AVRO_CARDINALITY_BINDING_PROFILE} from '../../../../../../bindings/core/node/index.js';
import {encodeRequestWire,fromWire} from '../../../../../../bindings/core/node/src/wire.js';
const packet=JSON.parse(readFileSync(new URL('./typescript-predecessor.json',import.meta.url),'utf8'));
const row=packet.outcomes['empty-array/present-non-null-schema/strict'];
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function call(op,fields){const r=JSON.parse(executeAvroCardinalityBindingWire(encodeRequestWire({profile:AVRO_CARDINALITY_BINDING_PROFILE,op,...fields})));if(r.status!=='ok')throw Error(JSON.stringify(r));return fromWire(JSON.parse(r.wire));}
const classified=call('classifyAvroCardinality',{source:row.source,request:row.request});if(canonical(classified)!==canonical(row.result))throw Error('classification mismatch');
const verified=call('verifyAvroCardinalityClassification',{receipt:classified,current:classified.target});if(canonical(verified)!==canonical(classified))throw Error('verification mismatch');
const recovered=call('recoverAvroCardinalityBundle',{receipt:classified,current:classified.target});if(canonical(recovered)!==canonical(row.recovered))throw Error('recovery mismatch');
const controlled=JSON.parse(executeAvroCardinalityBindingWire(encodeRequestWire({profile:AVRO_CARDINALITY_BINDING_PROFILE,op:'classifyAvroCardinality',source:row.source,request:{...row.request,profile:'unresolved',mode:'report'}}),()=>encodeRequestWire({ok:false,code:'TEST_CONTROL',message:'host stopped'})));
if(controlled.status!=='error'||controlled.code!=='TEST_CONTROL')throw Error('control failure was lost');
console.log(JSON.stringify({runtime:typeof Bun==='object'?'bun':'node',profile:AVRO_CARDINALITY_BINDING_PROFILE,classify:true,verify:true,recover:true,controlFailure:true}));
