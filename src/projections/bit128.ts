import {copyJson,LIMITS} from '../model/json';
import {assertBit128OutputBudget} from './bit128-output-budget';
import {UmfError,type Document,type Json,type Diagnostic,pointer} from '../model/types';
import {inspectBit128Binding,type Bit128BindingPayload} from '../extensions/binding/bit128';
import {validateDocument} from '../validation/document';
import {canonicalSchemaJson} from '../model/schema-literals';
export type Bit128Obligation='bits'|'availability'|'equality'|'ordering'|'enforcement';
export interface Bit128ProjectionPolicy {lossPolicy:'strict'|'report';obligations:Bit128Obligation[]}
export interface Bit128NativeProjection {
 operation:'project-bit128-carrier-schema';version:'1.0.0';source:Document;binding:Document;identity:{module:string;element:string};policy:Bit128ProjectionPolicy;
 outcomes:{obligation:Bit128Obligation;outcome:'exact'|'unknown'|'not-expressible';reason:string}[];
 diagnostics:Diagnostic[];mapping:{idealPath:string;targetSlots:string[];bindingVersion:'0.3.0';target:Bit128BindingPayload['target']};
 status:'projected'|'reported'|'blocked';candidate?:{format:'sql'|'avro'|'parquet'|'tablespec';text:string};
}
function fail(message:string):never{throw new UmfError('BIT128_PROJECTION',message);}
/** Bounded one-Field native schema proposal; native execution/adoption is separately qualified. */
export function projectBit128CarrierSchema(bindingInput:Document,logicalInput:Document,identityInput:{module:string;element:string},policyInput:Bit128ProjectionPolicy):Bit128NativeProjection{
 const source=copyJson(logicalInput) as unknown as Document,binding=copyJson(bindingInput) as unknown as Document,identity=copyJson(identityInput) as unknown as {module:string;element:string},policy=copyJson(policyInput) as unknown as Bit128ProjectionPolicy;
 if(!identity||Object.keys(identity).sort().join(',')!=='element,module')fail('Explicit Field identity required');
 if(!policy||Object.keys(policy).sort().join(',')!=='lossPolicy,obligations'||!['strict','report'].includes(policy.lossPolicy)||!Array.isArray(policy.obligations)||new Set(policy.obligations).size!==policy.obligations.length||!policy.obligations.length||policy.obligations.some(o=>!['bits','availability','equality','ordering','enforcement'].includes(o)))fail('Explicit loss policy and obligations required');
 const validation=inspectBit128Binding(binding,source);if(!validation.valid||!validation.complete)fail(JSON.stringify(validation.diagnostics));
 const payload=binding.extensions!['umf.binding'] as unknown as Bit128BindingPayload;
 const row=payload.fields.find(r=>r.module===identity.module&&r.element===identity.element),field=source.modules.find(m=>m.id===identity.module)?.elements.find(e=>e.id===identity.element);
 if(row?.storage!=='scalar-carrier'||!field)fail('Selected scalar carrier Field required');
 const c=row.carrier,system=payload.target.system,version=payload.target.version;
 const outcomes:Bit128NativeProjection['outcomes']=[];
 const owner=source.modules.flatMap(m=>m.elements.filter(e=>e.kind==='record'&&((e.members??[]) as {module:string;element:string}[]).some(r=>r.module===identity.module&&r.element===identity.element)).map(e=>({module:m.id,element:e.id})))[0];
 const table=payload.elements.find(e=>e.module===identity.module&&e.element===identity.element)?.table??payload.elements.find(e=>e.module===owner?.module&&e.element===owner?.element)?.table;
 if(!table)fail('Exact table/record binding required');
 const required=field.nullability==='required',native=c.kind==='native-uuid',pair=c.kind==='words64';
 const names=pair?[c.highColumn,c.lowColumn]:[c.column];
 for(const name of [table,...names]){
  if(system==='postgresql'&&name.length>63||system==='sqlserver'&&name.length>128)fail('Native identifier exceeds target limit');
  for(let i=0;i<name.length;i++){const unit=name.charCodeAt(i);if(unit===0||unit>=0xdc00&&unit<=0xdfff)fail('Invalid native identifier text');if(unit>=0xd800&&unit<=0xdbff){const low=name.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))fail('Invalid native identifier text');}}
  if(system==='sqlserver'&&!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))fail('Initial SQL Server carrier subset requires ASCII identifier grammar');
  if(system==='postgresql'&&new TextEncoder().encode(name).length>63||system==='sqlserver'&&name.length>128)fail('Native identifier exceeds target limit');
 }
 if(system==='sqlserver'&&new Set(names.map(n=>n.toLowerCase())).size!==names.length)fail('Native SQL Server column names collide under the selected case-insensitive profile');
 let candidate:Bit128NativeProjection['candidate'];let supported=payload.target.subset==='uuid-carrier1';
 const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
 const b=(name:string)=>'['+name.replaceAll(']',']]')+']';
 if(system==='postgresql'&&/^17(?:\.|$)/.test(version)){
  if(pair&&!c.signed)supported=false;
  const type=pair?'bigint':native?'uuid':c.kind==='bytes16'?'bytea':c.kind==='uuid-text'?'varchar(36)':'varchar(32)';
  const columns=names.map(n=>q(n)+' '+type+(required?' NOT NULL':''));
  if(c.kind==='bytes16')columns.push('CHECK (octet_length('+q(c.column)+') = 16)');
  if(pair&&!required)columns.push('CHECK (('+q(c.highColumn)+' IS NULL) = ('+q(c.lowColumn)+' IS NULL))');
  candidate={format:'sql',text:'CREATE TABLE '+q(table)+' ('+columns.join(', ')+');'};
 }else if(system==='sqlserver'&&/^2022(?:\.|$)/.test(version)){
  if(pair&&!c.signed)supported=false;
  const type=pair?'bigint':native?'uniqueidentifier':c.kind==='bytes16'?'varbinary(16)':c.kind==='uuid-text'?'varchar(36)':'varchar(32)';
  const columns=names.map(n=>b(n)+' '+type+(required?' NOT NULL':' NULL'));
  if(c.kind==='bytes16')columns.push('CHECK (DATALENGTH('+b(c.column)+') = 16)');
  if(pair&&!required)columns.push('CHECK (('+b(c.highColumn)+' IS NULL AND '+b(c.lowColumn)+' IS NULL) OR ('+b(c.highColumn)+' IS NOT NULL AND '+b(c.lowColumn)+' IS NOT NULL))');
  candidate={format:'sql',text:'CREATE TABLE '+b(table)+' ('+columns.join(', ')+');'};
 }else if(system==='avro'&&version==='1.12.0'){
  if(['null','boolean','int','long','float','double','bytes','string'].includes(table)||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)||names.some(n=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)))fail('Native Avro names invalid');
  if(pair&&!c.signed)supported=false;
  const fixedName=table==='Umf128Value'?'Umf128ValueField':'Umf128Value';
  const nativeType=pair?'long':native?{type:'fixed',name:fixedName,size:16,logicalType:'uuid'}:c.kind==='bytes16'?{type:'fixed',name:fixedName,size:16}:c.kind==='uuid-text'?{type:'string',logicalType:'uuid'}:'string';
  candidate={format:'avro',text:JSON.stringify({type:'record',name:table,fields:names.map(name=>({name,type:required?nativeType:['null',nativeType]}))})};
 }else if(system==='parquet'&&version==='2.11.0'){
  const columns=names.map(name=>({name,physicalType:pair?'INT64':native||c.kind==='bytes16'?'FIXED_LEN_BYTE_ARRAY':'BYTE_ARRAY',...(native||c.kind==='bytes16'?{length:16}:{}),...(native?{logicalType:'UUID'}:pair?{logicalType:'INTEGER',bitWidth:64,isSigned:c.signed}:{logicalType:c.kind==='bytes16'?null:'STRING'}),nullable:!required}));
  candidate={format:'parquet',text:JSON.stringify({name:table,columns})};
 }else if(system==='tablespec'&&version==='1.0'){
  // The pinned model has no qualified 64-bit or native UUID carrier.
  if(pair||native||c.kind==='bytes16')supported=false;
  candidate={format:'tablespec',text:JSON.stringify({version:'1.0',table_name:table,columns:names.map(name=>({name,data_type:'VARCHAR',length:c.kind==='uuid-text'?36:32,nullable:!required}))})};
 }else supported=false;
 for(const obligation of policy.obligations){
  let outcome:'exact'|'unknown'|'not-expressible'='exact',reason='Explicit carrier recipe preserves all 128 bits';
  if(!supported){outcome='not-expressible';reason='Selected carrier is outside the versioned target subset';}
  else if(obligation==='ordering'){outcome='unknown';reason='Native order is not qualified as portable unsigned byte order';}
  else if(obligation==='equality'&&!native&&!pair&&c.kind!=='bytes16'){outcome='unknown';reason='Native text collation/external-write canonicality requires separate qualification';}
  else if(obligation==='enforcement'&&(c.kind==='uuid-text'||c.kind==='hex128-text')){outcome='not-expressible';reason='Text carrier schema does not enforce complete canonical logical grammar';}
  else if(obligation==='enforcement'&&(field.allowedValues||field.default||field.facets)){outcome='not-expressible';reason='Field refinements/defaults are retained but not emitted by this bounded proposal';}
  else if(obligation==='availability'&&pair&&!required&&['avro','parquet'].includes(system)){outcome='not-expressible';reason='Independent nullable slots do not enforce all-or-none absence';}
  else if(obligation!=='bits'&&system==='tablespec'){outcome='unknown';reason='Declared TableSpec schema does not certify Spark/native value semantics';}
  outcomes.push({obligation,outcome,reason});
 }
 // Semantic defaults and allowed values cannot disappear even when only bit fidelity was requested.
 for(const [name,obligation] of [['allowedValues','enforcement'],['default','enforcement'],['facets','enforcement']] as const)if(field[name]!==undefined&&!outcomes.some(o=>o.obligation===obligation&&o.outcome!=='exact'))outcomes.push({obligation,outcome:'not-expressible',reason:name+' retained in source but not emitted'});
 if(payload.elements.some(e=>e.partition!==undefined&&e.partition!==null&&(e.module===identity.module&&e.element===identity.element||e.module===owner?.module&&e.element===owner?.element)))outcomes.push({obligation:'enforcement',outcome:'not-expressible',reason:'Selected partition layout retained but not emitted by the one-Field proposal'});
 const loss=outcomes.some(o=>o.outcome!=='exact');
 const status=!supported||loss&&policy.lossPolicy==='strict'?'blocked':loss?'reported':'projected';
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]!.elements.findIndex(e=>e.id===identity.element);
 const mapping={idealPath:`/modules/${mi}/elements/${ei}`,targetSlots:names.map(n=>'/tables/'+pointer(table)+'/columns/'+pointer(n)),bindingVersion:'0.3.0' as const,target:payload.target};
 const diagnostics=validateDocument(source).diagnostics;
 if(c.kind==='uuid-text'||c.kind==='hex128-text')diagnostics.push({code:'BIT128_TEXT_NOT_ENFORCED',path:mapping.idealPath,message:'Canonical carrier writes preserve bits; the target schema does not establish complete text grammar, collation or external-writer enforcement',severity:'warning'});
 if(pair&&!required&&['avro','parquet'].includes(system))diagnostics.push({code:'BIT128_PAIR_PRESENCE_NOT_ENFORCED',path:mapping.idealPath,message:'The native schema permits partial-null pairs; the portable decoder refuses them',severity:'warning'});
 if(system==='tablespec')diagnostics.push({code:'BIT128_TABLESPEC_MODEL_ONLY',path:mapping.idealPath,message:'This target is the captured native model; checked-in JSON Schema agreement and Spark execution are not established',severity:'warning'});
 if(candidate&&candidate.text.length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Native proposal exceeds text limit');
 const result=copyJson({operation:'project-bit128-carrier-schema',version:'1.0.0',source,binding,identity,policy,outcomes,status,diagnostics,mapping,...(status!=='blocked'&&candidate?{candidate}:{})}) as unknown as Bit128NativeProjection;
 assertBit128OutputBudget(result as unknown as Json);return result;
}
/** Exact artifact/source recovery; not independent native semantic classification. */
export function recoverBit128CarrierProjection(input:Bit128NativeProjection,nativeText:string):{logical:Document;binding:Document}{
 const report=copyJson(input) as unknown as Bit128NativeProjection;
 const expected=projectBit128CarrierSchema(report.binding,report.source,report.identity,report.policy);
 if(canonicalSchemaJson(report)!==canonicalSchemaJson(expected)||!expected.candidate||nativeText!==expected.candidate.text)fail('Stale/forged projection or changed native artifact');
 return {logical:expected.source,binding:expected.binding};
}
export interface Bit128NativeTypeInput {system:'postgresql'|'sqlserver'|'avro'|'parquet';version:string;definition:Json}
/** Classify only explicit native type identity/annotation; never a name, string value or column pair. */
export function classifyBit128NativeType(input:Bit128NativeTypeInput):{source:Bit128NativeTypeInput;scalarType?:'uuid'|'bits128';basis:'native-type-identity'|'unclassified'}{
 const source=copyJson(input) as unknown as Bit128NativeTypeInput;
 if(!source||Object.keys(source).sort().join(',')!=='definition,system,version'||!['postgresql','sqlserver','avro','parquet'].includes(source.system)||typeof source.version!=='string'||!source.version)fail('Explicit native type descriptor required');
 const d=source.definition as Record<string,unknown>|null;let scalarType:'uuid'|undefined;
 if(d&&typeof d==='object'&&!Array.isArray(d)){
  if(source.system==='postgresql'&&/^17(?:\.|$)/.test(source.version)&&d.schema==='pg_catalog'&&d.name==='uuid'&&d.kind==='b')scalarType='uuid';
  if(source.system==='sqlserver'&&source.version==='2022'&&d.schema==='sys'&&d.name==='uniqueidentifier'&&d.systemTypeId===36)scalarType='uuid';
  if(source.system==='avro'&&source.version==='1.12.0'&&d.logicalType==='uuid'&&(d.type==='string'||d.type==='fixed'&&d.size===16))scalarType='uuid';
  if(source.system==='parquet'&&source.version==='2.11.0'&&d.logicalType==='UUID'&&d.physicalType==='FIXED_LEN_BYTE_ARRAY'&&d.length===16)scalarType='uuid';
 }
 return {source,...(scalarType?{scalarType}:{}),basis:scalarType?'native-type-identity':'unclassified'};
}
