import {snapshotSchema} from './internal-schema';
import schema from '../../spec/core/schema-properties-document.schema.json';
import {createValidator} from './schema';
// Intentional, known import cycle with ./document (CONTRACT-049); both sides only use the other inside functions.
import {validateDocument} from './document';
import {Registry,type Registration} from '../registry/registry';
import {copyJson} from '../model/json';
import {type Document,type Diagnostic,type Validation,type Element,UmfError,pointer} from '../model/types';
import {checkSchemaLiteral,literalIdentity,schemaCoefficient,type CoreLiteral,schemaPropertyNames,newFacetNames} from '../model/schema-literals';
const validator=createValidator();
export const checkSchemaProperties=validator.compile(snapshotSchema(schema));
export const checkCoreLiteral=validator.compile(snapshotSchema({$defs:schema.$defs,$ref:'#/$defs/literal'}));
export {default as coreSchemaPropertiesDocumentSchema} from '../../spec/core/schema-properties-document.schema.json';
/** Private validation view only. It must never be used as a native downgrade. */
export function schemaPropertiesLegacyView(input:Document):Document {
 const base=copyJson(input) as unknown as Document;base.umf='0.7.0';
 for(const node of [base,...base.modules])for(const key of ['title','aliases'])delete node[key];
 for(const node of base.modules.flatMap(m=>m.elements))for(const key of schemaPropertyNames)delete node[key];
 for(const m of base.modules)for(const e of m.elements){const f=e.facets as Record<string,any>|undefined;if(!f)continue;for(const key of newFacetNames)delete f[key];if(f.length){delete f.length.min;if(f.length.max===undefined||f.length.max===0)delete f.length;}if(['array','map'].includes(e.cardinality as string))delete e.facets;}
 return base;
}
/** Compare against declared domain extrema without expanding the width/precision. */
function atNumericDomainExtreme(field:Element,value:bigint,end:'min'|'max'):boolean {
 const facets=field.facets as Record<string,any>;
 if(field.scalarType==='decimal'){
  if(end==='min'?value>=0n:value<=0n)return false;
  const digits=(value<0n?-value:value).toString();
  return digits.length===facets.precision&&/^9+$/.test(digits);
 }
 const width=facets.integerWidth;if(!width)return false;
 if(end==='min'){
  if(!width.signed)return value===0n;
  const magnitude=-value;
  return value<0n&&magnitude.toString(2).length===width.bits&&(magnitude&(magnitude-1n))===0n;
 }
 if(value<0n)return false;
 const bits=value===0n?0:value.toString(2).length;
 return bits===width.bits-(width.signed?1:0)&&(value&(value+1n))===0n;
}
export function validateSchemaPropertiesDocument(input:unknown,registry=new Registry()):Validation {
 const diagnostics:Diagnostic[]=[];
 const add=(message:string,path:string,severity:'error'|'warning'='error',code='CORE_SCHEMA_PROPERTIES')=>diagnostics.push({code,path,message,severity});
 let doc:Document;try{doc=copyJson(input) as unknown as Document;}catch(error){if(!(error instanceof UmfError))throw error;add(error.message,error.path);return {valid:false,complete:false,diagnostics};}
 if(!checkSchemaProperties(doc)){for(const e of checkSchemaProperties.errors??[])add(e.message??'Invalid schema properties',e.instancePath);return {valid:false,complete:false,diagnostics};}
 // Only core validation uses the compatibility view. Extension validators must
 // inspect an isolated copy of the complete document and its actual version.
 const extensionRegistry=new class extends Registry {
  override get(id:string,version:string):Registration|undefined {
   const entry=registry.get(id,version);if(!entry?.semantics)return entry;
   const semantics=entry.semantics;
   return {...entry,semantics:(payload,context)=>semantics(payload,{...context,document:copyJson(doc) as unknown as Document})};
  }
 };
 diagnostics.push(...validateDocument(schemaPropertiesLegacyView(doc),extensionRegistry).diagnostics);
 // Preserve legacy diagnostic order while avoiding a repeated full-array scan.
 const unknownUnitPaths=new Set(diagnostics.filter(d=>d.code==='UNKNOWN_FACET_UNIT').map(d=>d.path));
 const unknown=(v:Record<string,unknown>,known:string[],path:string)=>{for(const key of Object.keys(v))if(!known.includes(key))add('Qualifier retained without interpretation',path+'/'+pointer(key),'warning','UNKNOWN_SCHEMA_PROPERTY');};
 doc.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{
  const path=`/modules/${mi}/elements/${ei}`,f=e.facets as Record<string,any>|undefined;
  const attempt=(fn:()=>void,at:string)=>{try{fn();}catch(error){if(!(error instanceof UmfError))throw error;add(error.message,at+(error.path||''),error.code==='CORE_SCHEMA_PROPERTY_UNKNOWN'?'warning':'error',error.code);}};
  if(f){
   if(['array','map'].includes(e.cardinality as string))unknown(f,['length','precision','scale','integerWidth','collectionSize','range'],path+'/facets');
   for(const group of ['length','collectionSize'] as const)if(f[group]){
    const b=f[group];unknown(b,group==='length'?['min','max','unit']:['min','max'],path+'/facets/'+group);
    const unitPath=path+'/facets/length/unit';
    if(group==='length'&&!['unicode-scalar','byte'].includes(b.unit)&&!unknownUnitPaths.has(unitPath)){add('Length unit retained without interpretation',unitPath,'warning','UNKNOWN_FACET_UNIT');unknownUnitPaths.add(unitPath);}
    if(b.min!==undefined&&b.max!==undefined&&b.min>b.max)add('Minimum exceeds maximum',path+'/facets/'+group);
    if(group==='collectionSize'&&(e.kind!=='field'||!['array','map'].includes(e.cardinality as string)))add('Collection bounds require array/map Field',path+'/facets/'+group);
   }
   if(f.range){
    const r=f.range;unknown(r,['min','max','minInclusive','maxInclusive'],path+'/facets/range');
    if(e.kind!=='field'||!['integer','decimal'].includes(e.scalarType!))add('Range requires integer/decimal Field',path+'/facets/range');
    else attempt(()=>{
     // Check known numeric obligations independently of preserved unknown siblings.
     const numericFacets:Record<string,unknown>={};
     for(const key of ['precision','scale'])if(Object.hasOwn(f,key))numericFacets[key]=f[key];
     if(f.integerWidth)numericFacets.integerWidth={bits:f.integerWidth.bits,signed:f.integerWidth.signed};
     const unbounded={...e,facets:numericFacets} as Element;delete unbounded.allowedValues;delete unbounded.default;
     for(const end of ['min','max']){if(r[end]!==undefined){if(r[end]===null)throw new UmfError('CORE_SCHEMA_PROPERTIES','Numeric bounds cannot be null','/'+end);checkSchemaLiteral(doc,unbounded,r[end]);}else if(r[end+'Inclusive']!==undefined)add('Inclusive flag requires its bound',path+'/facets/range/'+end+'Inclusive');}
     const wrapper=e.scalarType==='integer'?'integerToken':'decimalToken',scale=e.scalarType==='integer'?0:f.scale;
     const min=r.min===undefined?undefined:schemaCoefficient(r.min[wrapper],scale,f.precision);
     const max=r.max===undefined?undefined:schemaCoefficient(r.max[wrapper],scale,f.precision);
     if(min!==undefined&&max!==undefined&&min+(r.minInclusive===false?1n:0n)>max-(r.maxInclusive===false?1n:0n)
       ||min!==undefined&&r.minInclusive===false&&atNumericDomainExtreme(e,min,'max')
       ||max!==undefined&&r.maxInclusive===false&&atNumericDomainExtreme(e,max,'min'))add('Empty or inverted numeric interval',path+'/facets/range');
    },path+'/facets/range');
   }
  }
  if(e.allowedValues)attempt(()=>{
   const seen=new Set<string>();for(const [i,value] of (e.allowedValues as CoreLiteral[]).entries()){
    const field={...e};delete field.allowedValues;checkSchemaLiteral(doc,field,value);const id=literalIdentity(field,value);if(seen.has(id))add('Duplicate equal allowed value',path+'/allowedValues/'+i);seen.add(id);
   }
  },path+'/allowedValues');
  if(e.examples)for(const [i,value] of (e.examples as CoreLiteral[]).entries())attempt(()=>checkSchemaLiteral(doc,e,value,false),path+'/examples/'+i);
  if(e.default){const d=e.default as {value:CoreLiteral;on:string};unknown(d,['value','on'],path+'/default');attempt(()=>checkSchemaLiteral(doc,e,d.value),path+'/default/value');}
 }));
 return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
