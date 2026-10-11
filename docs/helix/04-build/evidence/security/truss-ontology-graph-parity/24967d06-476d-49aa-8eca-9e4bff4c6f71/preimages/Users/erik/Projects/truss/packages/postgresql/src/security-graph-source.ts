/** Private candidate source construction. Original catalog/namespace custody,
 * complete source admission and current authority remain host obligations.
 * This is neither an installed view nor a permit. */
export interface CandidateGraphField { propertyId:string; column:string; scalar:'string'|'boolean' }
export interface CandidateGraphSource { readonly sql:string; readonly validitySql:string }
const issued=new WeakSet<object>();
const sourcePopulations=new WeakMap<object,string>();
const sourceKinds=new WeakMap<object,'object'|'edge'>();
const fail=():never=>{throw Error('TRUSS_SECURITY_GRAPH_SOURCE_UNSUPPORTED');};
function data(value:unknown,names:readonly string[]):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail();
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).length!==names.length||names.some(name=>!Object.hasOwn(descriptors,name)||!Object.hasOwn(descriptors[name]!,'value')||!descriptors[name]!.enumerable))return fail();
 return Object.fromEntries(names.map(name=>[name,descriptors[name]!.value]));
}
function integer(value:unknown):string {
 if(typeof value!=='string'||value.length>11||!/^(0|-?[1-9][0-9]*)$/.test(value))return fail();
 const n=BigInt(value);if(n< -2147483648n||n>2147483647n)return fail();return value;
}
function identifier(value:unknown):string {
 if(typeof value!=='string'||!value||new TextEncoder().encode(value).length>63||value.includes('\0')||[...value].some(c=>c.codePointAt(0)!>=0xd800&&c.codePointAt(0)!<=0xdfff))return fail();
 return '"'+value.replaceAll('"','""')+'"';
}
/** Only fixed native tables/operators and validated metadata enter this SQL.
 * Both invalid rows and missing fields remain visible. Consumers must execute
 * validitySql before using sql; an inner join cannot establish completeness. */
export function createCandidateGraphSource(input:{kind:'object'|'edge';typeId:string;propertyOwnerTypeId:string|null;fields:readonly CandidateGraphField[]}):CandidateGraphSource {
 const packet=data(input,['kind','typeId','propertyOwnerTypeId','fields']);
 input=packet as unknown as typeof input;
 if(!['object','edge'].includes(input.kind)||!Array.isArray(input.fields)||Object.getPrototypeOf(input.fields)!==Array.prototype)return fail();
 const length=Object.getOwnPropertyDescriptor(input.fields,'length')?.value;
 if(!Number.isSafeInteger(length)||length<0||length>256||Reflect.ownKeys(input.fields).length!==length+1)return fail();
 const fields:CandidateGraphField[]=[];
 for(let i=0;i<length;i++){const descriptor=Object.getOwnPropertyDescriptor(input.fields,String(i));if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)return fail();fields.push(data(descriptor.value,['propertyId','column','scalar']) as unknown as CandidateGraphField);}
 const typeId=integer(input.typeId),owner=input.propertyOwnerTypeId===null?null:integer(input.propertyOwnerTypeId);
 if(owner===null?(input.kind!=='edge'||fields.length!==0):fields.length===0)return fail();
 const cast=(value:string)=>"'"+value+"'::pg_catalog.int4";
 if(input.kind==='object'&&typeId!==owner)return fail();
 const seenColumns=new Set<string>(['native_id','native_type','source_id','source_type','target_id','target_type','source_key_hex','target_key_hex']),seenProperties=new Set<string>();
 const columns:string[]=[],valid:string[]=[],metadata:string[]=[];
 for(const field of fields){
  const property=integer(field.propertyId),column=identifier(field.column);
  if(!['string','boolean'].includes(field.scalar)||seenColumns.has(field.column)||seenProperties.has(property))return fail();seenColumns.add(field.column);seenProperties.add(property);
  const value=`g.props OPERATOR(pg_catalog.->) '${property}'::pg_catalog.text`;
  const kind=`pg_catalog.jsonb_typeof(${value}) OPERATOR(pg_catalog.=) '${field.scalar}'::pg_catalog.text`;
  columns.push(`CASE WHEN ${kind} THEN (g.props OPERATOR(pg_catalog.->>) '${property}'::pg_catalog.text)::pg_catalog.${field.scalar==='boolean'?'bool':'text'} ELSE NULL END AS ${column}`);
  valid.push('('+kind+') IS TRUE');
  metadata.push(`EXISTS(SELECT 1 FROM truss.prop_def p WHERE p.type_id OPERATOR(pg_catalog.=) ${cast(owner!)} AND p.prop_id OPERATOR(pg_catalog.=) ${cast(property)} AND p.home OPERATOR(pg_catalog.=) 'json'::pg_catalog.text AND p.scalar_type OPERATOR(pg_catalog.=) '${field.scalar}'::pg_catalog.text AND p.nullability OPERATOR(pg_catalog.=) 'required'::pg_catalog.text AND p.cardinality OPERATOR(pg_catalog.=) 'one'::pg_catalog.text AND p.retired_rev IS NULL)`);
 }
 const relation=input.kind==='object'?'truss.object':'truss.edge',typeColumn=input.kind==='object'?'type_id':'rel_type_id';
 const selection=`g.${typeColumn} OPERATOR(pg_catalog.=) ${cast(typeId)}`;
 if(owner!==null)metadata.push(`EXISTS(SELECT 1 FROM truss.type_def t WHERE t.type_id OPERATOR(pg_catalog.=) ${cast(owner)} AND t.kind OPERATOR(pg_catalog.=) 'record'::pg_catalog.text AND NOT t.provisional AND t.retired_rev IS NULL)`);
 if(input.kind==='edge')metadata.push(`EXISTS(SELECT 1 FROM truss.rel_def r WHERE r.rel_type_id OPERATOR(pg_catalog.=) ${cast(typeId)} AND ${owner===null?'r.assoc_type_id IS NULL':'r.assoc_type_id OPERATOR(pg_catalog.=) '+cast(owner)} AND r.retired_rev IS NULL)`);
 const native=['g.id::pg_catalog.text AS native_id','g.'+typeColumn+'::pg_catalog.text AS native_type',...(input.kind==='edge'?['source_id','source_type','target_id','target_type'].map(name=>'g.'+name+'::pg_catalog.text AS '+name):[])];
 const from=' FROM '+relation+' g WHERE '+selection;
 const result=Object.freeze({sql:'SELECT '+[...native,...columns].join(',')+from,validitySql:'SELECT ('+metadata.join(' AND ')+' AND NOT EXISTS(SELECT 1'+from+' AND NOT ('+(valid.length?valid.join(' AND '):'TRUE')+')))::pg_catalog.text AS valid'});
 issued.add(result);sourceKinds.set(result,input.kind);sourcePopulations.set(result,input.kind+':'+typeId);return result;
}
/** Private issuance check; does not authenticate a database cut. */
export function isCandidateGraphSource(source:unknown):source is CandidateGraphSource {return typeof source==='object'&&source!==null&&issued.has(source);}
/** Native population identity retained across property/key projections. */
export function candidateGraphSourcePopulation(source:CandidateGraphSource):string {requireCandidateGraphSource(source);return sourcePopulations.get(source)??fail();}
export function requireCandidateGraphSource(source:CandidateGraphSource):void {if(!issued.has(source))return fail();}

/** Exact namespace/key-number selection is host-attested, not authenticated here.
 * Aggregate lateral joins preserve every original edge even with zero/multiple
 * endpoint buckets. Complete validity must succeed before consuming key bytes.
 * This does not decode UMF tuples or establish current source/cut authority. */
export function createCandidateGraphEndpointKeys(input:{source:CandidateGraphSource;sourceKey:{typeId:string;keyNumber:string;namespaceHex:string};targetKey:{typeId:string;keyNumber:string;namespaceHex:string}}):CandidateGraphSource {
 const packet=data(input,['source','sourceKey','targetKey']);
 const source=packet.source as CandidateGraphSource;
 requireCandidateGraphSource(source);if(sourceKinds.get(source)!=='edge')return fail();
 const joins:string[]=[],valid:string[]=[],metadata:string[]=[],columns:string[]=[];
 for(const role of ['source','target'] as const){
  const key=data(packet[role+'Key'],['typeId','keyNumber','namespaceHex']);
  const typeId=integer(key.typeId),keyNumber=integer(key.keyNumber),namespace=key.namespaceHex;
  if(BigInt(keyNumber)<-32768n||BigInt(keyNumber)>32767n||typeof namespace!=='string'||!namespace.length||namespace.length>131072||namespace.length%2||!/^[0-9a-f]+$/.test(namespace))return fail();
  const alias=role+'_bucket';
  const selection=`b.type_id OPERATOR(pg_catalog.=) '${typeId}'::pg_catalog.int4 AND b.key_num OPERATOR(pg_catalog.=) '${keyNumber}'::pg_catalog.int2 AND b.object_id OPERATOR(pg_catalog.=) q.${role}_id::pg_catalog.int8 AND q.${role}_type::pg_catalog.int4 OPERATOR(pg_catalog.=) '${typeId}'::pg_catalog.int4 AND b.namespace_bytes OPERATOR(pg_catalog.=) pg_catalog.decode('${namespace}'::pg_catalog.text,'hex'::pg_catalog.text)`;
  joins.push(` LEFT JOIN LATERAL (SELECT pg_catalog.count(*) AS matches,pg_catalog.max(pg_catalog.encode(b.key_bytes,'hex'::pg_catalog.text)) AS key_hex FROM truss.object_key_bucket b WHERE ${selection}) ${alias} ON TRUE`);
  valid.push(`${alias}.matches OPERATOR(pg_catalog.=) '1'::pg_catalog.int8`);
  valid.push(`EXISTS(SELECT 1 FROM truss.object endpoint_object WHERE endpoint_object.id OPERATOR(pg_catalog.=) q.${role}_id::pg_catalog.int8 AND endpoint_object.type_id OPERATOR(pg_catalog.=) q.${role}_type::pg_catalog.int4)`);
  metadata.push(`EXISTS(SELECT 1 FROM truss.key_def k WHERE k.type_id OPERATOR(pg_catalog.=) '${typeId}'::pg_catalog.int4 AND k.key_num OPERATOR(pg_catalog.=) '${keyNumber}'::pg_catalog.int2 AND k.retired_rev IS NULL)`);
  metadata.push(`EXISTS(SELECT 1 FROM truss.type_def endpoint_type WHERE endpoint_type.type_id OPERATOR(pg_catalog.=) '${typeId}'::pg_catalog.int4 AND endpoint_type.kind OPERATOR(pg_catalog.=) 'record'::pg_catalog.text AND NOT endpoint_type.provisional AND endpoint_type.retired_rev IS NULL)`);
  columns.push(`CASE WHEN ${alias}.matches OPERATOR(pg_catalog.=) '1'::pg_catalog.int8 THEN ${alias}.key_hex ELSE NULL END AS ${role}_key_hex`);
 }
 const from=' FROM ('+source.sql+') q'+joins.join('');
 const result=Object.freeze({sql:'SELECT q.*,'+columns.join(',')+from,validitySql:'SELECT (((SELECT valid FROM ('+source.validitySql+') source_validity)::pg_catalog.bool) AND '+metadata.join(' AND ')+' AND NOT EXISTS(SELECT 1'+from+' WHERE NOT ('+valid.join(' AND ')+')))::pg_catalog.text AS valid'});
 issued.add(result);sourcePopulations.set(result,candidateGraphSourcePopulation(source));return result;
}
