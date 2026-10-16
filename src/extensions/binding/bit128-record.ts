import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import type {CoreLiteral} from '../../model/schema-literals';
import {inspectBit128Binding,encodeBit128CarrierValue,decodeBit128CarrierValue,type Bit128BindingPayload} from './bit128';
import {resolveBit128ModelLayout,bit128RefKey,type Bit128Ref} from './bit128-layout';
export interface Bit128RecordValue {field:Bit128Ref;value:CoreLiteral}
function locate(bindingInput:Document,sourceInput:Document,identityInput:Bit128Ref){
 const binding=copyJson(bindingInput) as unknown as Document,source=copyJson(sourceInput) as unknown as Document,identity=copyJson(identityInput) as unknown as Bit128Ref;
 if(!identity||Object.keys(identity).sort().join(',')!=='element,module')throw new UmfError('BIT128_RECORD_IDENTITY','Exact Record identity required');
 const validation=inspectBit128Binding(binding,source);if(!validation.valid||!validation.complete)throw new UmfError('BIT128_RECORD_SOURCE','Incomplete carrier layout');
 const layout=resolveBit128ModelLayout(binding.extensions!['umf.binding'] as unknown as Bit128BindingPayload,source);
 const record=layout.records.find(r=>bit128RefKey(r.identity)===bit128RefKey(identity));if(!record)throw new UmfError('BIT128_RECORD_IDENTITY','Record not bound');
 return {binding,source,record};
}
/** Full rows only: every Field explicitly supplied, all paired slots decoded together. No mutation execution. */
export function encodeBit128Record(bindingInput:Document,sourceInput:Document,identity:Bit128Ref,input:Bit128RecordValue[]):Record<string,string|null>{
 const {binding,source,record}=locate(bindingInput,sourceInput,identity),values=copyJson(input) as unknown as Bit128RecordValue[];
 if(!Array.isArray(values)||values.length!==record.fields.length)throw new UmfError('BIT128_RECORD_VALUE','Exact complete logical row required');
 const map=new Map<string,CoreLiteral>();for(const item of values){if(!item||Object.keys(item).sort().join(',')!=='field,value'||!item.field||Object.keys(item.field).sort().join(',')!=='element,module'||map.has(bit128RefKey(item.field)))throw new UmfError('BIT128_RECORD_VALUE','Malformed or duplicate Field');map.set(bit128RefKey(item.field),item.value);}
 const output:Record<string,string|null>=Object.create(null);
 for(const f of record.fields){const key=bit128RefKey(f.identity);if(!map.has(key))throw new UmfError('BIT128_RECORD_VALUE','Missing Field');Object.assign(output,encodeBit128CarrierValue(binding,source,f.identity,map.get(key)!));}
 return copyJson(output) as Record<string,string|null>;
}
export function decodeBit128Record(bindingInput:Document,sourceInput:Document,identity:Bit128Ref,input:Record<string,string|null>):Bit128RecordValue[]{
 const {binding,source,record}=locate(bindingInput,sourceInput,identity),slots=copyJson(input) as Record<string,string|null>;
 const names=record.fields.flatMap(f=>f.slots);
 if(!slots||Array.isArray(slots)||typeof slots!=='object'||Object.keys(slots).length!==names.length||names.some(n=>!Object.hasOwn(slots,n)))throw new UmfError('BIT128_RECORD_VALUE','Exact complete native row required');
 return record.fields.map(f=>({field:f.identity,value:decodeBit128CarrierValue(binding,source,f.identity,Object.fromEntries(f.slots.map(n=>[n,slots[n]!])))}));
}
