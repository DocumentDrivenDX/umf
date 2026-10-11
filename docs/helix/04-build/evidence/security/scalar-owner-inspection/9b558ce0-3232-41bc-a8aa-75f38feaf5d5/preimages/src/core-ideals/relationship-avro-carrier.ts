import {copyJson} from '../model/json';
import {UmfError,type Json} from '../model/types';
export interface AvroRelationshipCarrier {
 recordName:string;namespace:string;fieldName:string;keyRecordName:string;
 shape:'one'|'nullable-one'|'array';
 components:{name:string;type:'boolean'|'int'|'long'|'float'|'double'|'bytes'|'string'}[];
}
const primitives=new Set(['null','boolean','int','long','float','double','bytes','string']);
const name=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]*(?![\s\S])/.test(v);
/** Internal wire builder: callers must separately verify authored mapping and report semantic losses. */
export function buildAvroRelationshipCarrier(input:AvroRelationshipCarrier):string {
 const r=copyJson(input) as unknown as AvroRelationshipCarrier;
 const fail=()=>{throw new UmfError('AVRO_RELATIONSHIP_CARRIER','Invalid explicit native carrier request; no normalization or partial schema');};
 if(!r||typeof r!=='object'||Array.isArray(r))return fail();
 if(Object.keys(r).some(k=>!['recordName','namespace','fieldName','keyRecordName','shape','components'].includes(k)))return fail();
 if(!name(r.recordName)||!name(r.keyRecordName)||!name(r.fieldName)||r.recordName===r.keyRecordName||primitives.has(r.recordName)||primitives.has(r.keyRecordName))return fail();
 if(typeof r.namespace!=='string'||r.namespace!==''&&!r.namespace.split('.').every(name))return fail();
 if(!['one','nullable-one','array'].includes(r.shape)||!Array.isArray(r.components)||!r.components.length)return fail();
 const names=new Set<string>();
 for(const c of r.components){
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['name','type'].includes(k))||!name(c.name)||names.has(c.name)||typeof c.type!=='string'||!primitives.has(c.type)||(c.type as string)==='null')return fail();
  names.add(c.name);
 }
 const key:Json={type:'record',name:r.keyRecordName,fields:r.components.map(c=>({name:c.name,type:c.type}))};
 const type:Json=r.shape==='array'?{type:'array',items:key}:r.shape==='nullable-one'?['null',key]:key;
 return JSON.stringify({type:'record',name:r.recordName,...(r.namespace?{namespace:r.namespace}:{}),fields:[{name:r.fieldName,type}]})+'\n';
}
