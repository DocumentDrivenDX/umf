import {copyJson} from '../model/json';
import {UmfError,type Document,type Json} from '../model/types';
import {resolveBit128ModelSources} from './bit128-model';
import {bit128FileFields} from './bit128-file-model';
import {bit128RefKey,type Bit128Ref} from '../extensions/binding/bit128-layout';
import {encodeBit128Record,decodeBit128Record,type Bit128RecordValue} from '../extensions/binding/bit128-record';
function locate(binding:Document,source:Document,identityInput:Bit128Ref){
 const resolved=resolveBit128ModelSources(binding,source),identity=copyJson(identityInput) as unknown as Bit128Ref;
 if(!identity||Object.keys(identity).sort().join(',')!=='element,module')throw new UmfError('BIT128_RECORD_IDENTITY','Exact Record identity required');
 if(!['avro','parquet','tablespec'].includes(resolved.payload.target.system))throw new UmfError('BIT128_FILE_TARGET','File/model target required');
 const record=resolved.layout.records.find(r=>bit128RefKey(r.identity)===bit128RefKey(identity));if(!record)throw new UmfError('BIT128_RECORD_IDENTITY','Unknown Record');
 if(resolved.payload.target.system==='tablespec'&&record.fields.some(f=>!['uuid-text','hex128-text'].includes(f.carrier.kind)))throw new UmfError('BIT128_TABLESPEC_CARRIER','Unsupported selected carrier');
 return {...resolved,record,identity};
}
/** JSON-safe native datum tokens; driver converts exact decimal/hex tokens to native long/bytes. */
export function encodeBit128FileRecord(bindingInput:Document,sourceInput:Document,identity:Bit128Ref,values:Bit128RecordValue[]):Record<string,Json>{
 const {binding,source,record}=locate(bindingInput,sourceInput,identity),slots=encodeBit128Record(binding,source,identity,values);
 return Object.fromEntries(bit128FileFields(record.fields).map(({field:f,name,paired})=>[name,paired?(slots[f.slots[0]!]===null?null:Object.fromEntries(f.slots.map(n=>[n,slots[n]!]))):slots[f.slots[0]!]!]));
}
export function decodeBit128FileRecord(bindingInput:Document,sourceInput:Document,identity:Bit128Ref,input:Record<string,Json>):Bit128RecordValue[]{
 const {binding,source,record}=locate(bindingInput,sourceInput,identity),datum=copyJson(input) as Record<string,Json>,fields=bit128FileFields(record.fields);
 if(!datum||Array.isArray(datum)||typeof datum!=='object'||Object.keys(datum).length!==fields.length||fields.some(f=>!Object.hasOwn(datum,f.name)))throw new UmfError('BIT128_FILE_VALUE','Exact complete native datum required');
 const slots:Record<string,string|null>=Object.create(null);
 for(const {field:f,name,paired} of fields){
  const value=datum[name];
  if(paired&&value!==null){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||f.slots.some(n=>!Object.hasOwn(value,n)))throw new UmfError('BIT128_FILE_VALUE','Exact complete pair group required');for(const n of f.slots){if(typeof value[n]!=='string')throw new UmfError('BIT128_FILE_VALUE','Present pair requires two nonnull exact word tokens');slots[n]=value[n];}}
  else{if(value!==null&&typeof value!=='string')throw new UmfError('BIT128_FILE_VALUE','Exact string token or null required');for(const n of f.slots)slots[n]=value;}
 }
 return decodeBit128Record(binding,source,identity,slots);
}
