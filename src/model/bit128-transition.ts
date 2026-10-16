import {checkSchemaProperties} from '../validation/schema-properties';
import {copyJson} from './json';
import {UmfError,type Document,type Json,pointer} from './types';
import {validateDocument} from '../validation/document';
import {canonicalSchemaJson} from './schema-literals';
export interface Bit128UpgradeOptions {collisions:{path:string;expected:Json;replacement:Json}[]}
export interface Bit128UpgradeReceipt {operation:'upgrade-bit128-envelope';version:'1.0.0';source:Document;options:Bit128UpgradeOptions;target:Document}
function fail(message:string):never{throw new UmfError('BIT128_MIGRATION',message);}
export function upgradeBit128Envelope(input:Document,optionsInput:Bit128UpgradeOptions):Bit128UpgradeReceipt{
 const source=copyJson(input) as unknown as Document,options=copyJson(optionsInput) as unknown as Bit128UpgradeOptions;
 if(source.umf!=='0.8.0'||!checkSchemaProperties(source))fail('Expected structurally valid core 0.8.0');
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).length!==1||!Array.isArray(options.collisions))fail('Explicit collisions required');
 const collisions=new Map<string,{node:Record<string,unknown>;key:string}>();
 const target=copyJson(source) as unknown as Document;
 const literals=(node:Record<string,unknown>,key:string,path:string)=>{
  const value=node[key];if(!value||typeof value!=='object'||Array.isArray(value))return;
  const object=value as Record<string,unknown>;
  if(Object.hasOwn(object,'uuid')||Object.hasOwn(object,'bits128Hex')){collisions.set(path,{node,key});return;}
  if(Array.isArray(object.array))object.array.forEach((_,i)=>literals(object.array as unknown as Record<string,unknown>,String(i),path+'/array/'+i));
  if(object.map&&typeof object.map==='object'&&!Array.isArray(object.map))for(const k of Object.keys(object.map))literals(object.map as Record<string,unknown>,k,path+'/map/'+pointer(k));
 };
 target.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{
  const path=`/modules/${mi}/elements/${ei}`;
  if(['bits128','uuid'].includes(e.scalarType??''))collisions.set(path+'/scalarType',{node:e,key:'scalarType'});
  for(const k of ['examples','allowedValues'])if(Array.isArray(e[k]))(e[k] as unknown[]).forEach((_,i)=>literals(e[k] as Record<string,unknown>,String(i),`${path}/${k}/${i}`));
  if(e.default&&typeof e.default==='object')literals(e.default as Record<string,unknown>,'value',path+'/default/value');
  const range=(e.facets as {range?:Record<string,unknown>}|undefined)?.range;
  if(range)for(const k of ['min','max'])literals(range,k,path+'/facets/range/'+k);
 }));
 const seen=new Set<string>();
 for(const row of options.collisions){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='expected,path,replacement'||typeof row.path!=='string')fail('Invalid collision mapping');
  const location=collisions.get(row.path);if(!location||seen.has(row.path))fail('Duplicate, overlapping or noncollision edit');
  if(canonicalSchemaJson(location.node[location.key])!==canonicalSchemaJson(row.expected))fail('Stale expected collision');
  location.node[location.key]=copyJson(row.replacement);seen.add(row.path);
 }
 if(seen.size!==collisions.size)fail('Unresolved collision');
 target.umf='0.9.0';if(!validateDocument(target).valid)fail('Invalid migrated target');
 return {operation:'upgrade-bit128-envelope',version:'1.0.0',source,options,target};
}
export function rollbackBit128Envelope(input:Bit128UpgradeReceipt,currentInput:Document):{restored:Document;later:Document}{
 const receipt=copyJson(input) as unknown as Bit128UpgradeReceipt,current=copyJson(currentInput) as unknown as Document;
 if(!receipt||receipt.operation!=='upgrade-bit128-envelope'||receipt.version!=='1.0.0')fail('Invalid migration record');
 const expected=upgradeBit128Envelope(receipt.source,receipt.options);
 if(canonicalSchemaJson(expected)!==canonicalSchemaJson(receipt)||canonicalSchemaJson(current)!==canonicalSchemaJson(expected.target))fail('Forged or stale migration record');
 return {restored:expected.source,later:current};
}
