import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreCardinalityDeclaration,type CoreCardinalityDeclaration} from '../model/cardinality';
import {importTableSpec,exportTableSpec} from '../adapters/tablespec';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';
import kinds from '../../spec/core/cardinality-operation.schema.json';
import schema from '../../spec/core/cardinality-tablespec-projection.schema.json';
export {default as cardinalityTableSpecProjectionSchema} from '../../spec/core/cardinality-tablespec-projection.schema.json';
export interface CardinalityTableSpecRequest {id:string;tableName:string;columnName:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'FLOAT'|'TEXT'|'VARCHAR'|'CHAR'|'DATE'|'DATETIME'|'TIMESTAMP'|'EMBEDDING';dimension:number|null;requireExactValues:boolean;profile:'generated-json'|'generated-spark'|'unresolved';mode:'strict'|'report'}
const binding=schema.properties.binding.const;
export interface CardinalityTableSpecProjection {
 operation:'project-cardinality-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreCardinalityDeclaration;request:CardinalityTableSpecRequest;target?:Document;binding:typeof binding;diagnostics?:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/columns/0';cardinality:'one'|'array'|'map'|'unspecified';encoding:'scalar'|'embedding'|'carrier-only';profile:CardinalityTableSpecRequest['profile'];itemPath:string|null;outcome:'exact'|'approximated'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'approximated'|'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(containers);validator.addSchema(kinds);const check=validator.compile(schema);
const checkRequest=validator.compile({...schema.properties.request});
export function projectCardinalityToTableSpec(input:CoreCardinalityDeclaration,options:CardinalityTableSpecRequest):CardinalityTableSpecProjection & {diagnostics:Diagnostic[]} {
 const copied=copyJson(input) as unknown as CoreCardinalityDeclaration;
 const author=verifyCoreCardinalityDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as CardinalityTableSpecRequest;
 if(source.umf!=='0.4.0')throw new UmfError('CARDINALITY_TABLESPEC_VERSION','This binding requires a core 0.4.0 declaration; facet-envelope projection requires a separately qualified binding');
 if(!checkRequest(request))throw new UmfError('CARDINALITY_TABLESPEC_REQUEST',JSON.stringify(checkRequest.errors));
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const result:CardinalityTableSpecProjection={operation:'project-cardinality-tablespec',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/cardinality',nativePath:'/columns/0',cardinality:author.provenance.cardinality,encoding:request.nativeType==='EMBEDDING'?'embedding':'scalar',profile:request.profile,itemPath:null,outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'approximated'|'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});
 if(element.name!==undefined&&element.name!==request.columnName)loss(path+'/name',element.name,'Explicit native column name differs from ideal name','not-expressible');
 // Closed projection scope: every source property outside the implemented mapping is disclosed.
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata is retained but not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  if(m.namespace)loss(`/modules/${i}/namespace`,m.namespace,'This TableSpec binding has no namespace representation','not-expressible');
  for(const [key,value] of Object.entries(m))if(!['id','namespace','elements'].includes(key))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','description','scalarType','cardinality','itemType'].includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained but not projected');
 const cardinality=author.provenance.cardinality;
 if(request.requireExactValues)loss(path,element,request.profile==='generated-spark'&&['FLOAT','EMBEDDING'].includes(request.nativeType)?'Binary32 storage fails requested value exactness: 1.0000000000000002 narrows to 1.0':'This schema-shape binding does not establish exact value-domain conversion','approximated');
 if(request.profile==='unresolved')loss(path+'/cardinality',cardinality,'No execution profile selected; carrier acceptance does not establish shape enforcement');
 if(cardinality==='map'||cardinality==='array'&&request.nativeType!=='EMBEDDING'||cardinality==='one'&&request.nativeType==='EMBEDDING'){
  result.mapping.encoding='carrier-only';loss(path+'/cardinality',cardinality,'Selected native carrier cannot express this shape; no map/text or child-table encoding is implied','not-expressible');
 }
 if(request.nativeType==='EMBEDDING'){
  // Dimension remains mandatory native metadata even where the selected executor
  // ignores it. It is not an ideal array-length assertion.
  loss(path+'/cardinality',cardinality,request.profile==='generated-spark'?'Native vector dimension is required metadata but is not enforced by the generated Spark schema':'Native embedding adds fixed length and numeric item restrictions absent from general ideal arrays','approximated');
 }
 if(element.itemType!==undefined){
  const ref=element.itemType as {module:string;element:string};const im=source.modules.findIndex(m=>m.id===ref.module),ie=source.modules[im]!.elements.findIndex(e=>e.id===ref.element);
  const item=source.modules[im]!.elements[ie]!;result.mapping.itemPath=`/modules/${im}/elements/${ie}`;
  loss(path+'/itemType',element.itemType,'Item reference and its full definition require retained recovery; no recursive native type is fabricated',request.nativeType==='EMBEDDING'?'approximated':'not-expressible');
  if(request.nativeType==='EMBEDDING'){
   if(item.scalarType!==undefined&&item.scalarType!=='float')loss(result.mapping.itemPath+'/scalarType',item.scalarType,'Embedding numeric/float items do not express the selected item family','not-expressible');
   if(item.scalarType==='float')loss(result.mapping.itemPath+'/scalarType',item.scalarType,request.profile==='generated-spark'?'Binary32 storage may narrow unqualified float values, including the permanent binary64 counterexample':'JSON numeric items do not establish a native floating-point representation','approximated');
   if(item.cardinality!==undefined&&!['one','unspecified'].includes(item.cardinality as string)||item.itemType!==undefined)loss(result.mapping.itemPath,item,'Nested/repeated item definitions have no TableSpec EMBEDDING representation','not-expressible');
   if(item.nullability!==undefined)loss(result.mapping.itemPath+'/nullability',item.nullability,request.profile==='generated-spark'?'Generated Spark embedding permits null items; ideal availability remains independently asserted':'Generated JSON embedding rejects null items; ideal availability remains independently asserted','approximated');
  }
 }else if(cardinality==='array'&&request.nativeType==='EMBEDDING')loss(path+'/cardinality',cardinality,'Unspecified item meaning cannot be equated with native numeric/float items','approximated');
 const text=JSON.stringify({version:'1.0',table_name:request.tableName,columns:[{name:request.columnName,data_type:request.nativeType,...(request.dimension!==null?{dimension:request.dimension}:{}),...(element.description!==undefined?{description:element.description}:{})}]})+'\n';
 const target=importTableSpec(text,{id:request.id,format:'json'});
 if(element.scalarType!==undefined&&element.scalarType!==target.modules[0]!.elements[0]!.scalarType)loss(path+'/scalarType',element.scalarType,'Explicit native type does not establish the stated scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else result.target=target;
 result.diagnostics=result.residuals.map(r=>({code:'CARDINALITY_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('CARDINALITY_TABLESPEC_RESULT',JSON.stringify(check.errors));return output as unknown as CardinalityTableSpecProjection & {diagnostics:Diagnostic[]};
}
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export function recoverCardinalityFromTableSpec(input:CardinalityTableSpecProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as CardinalityTableSpecProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('CARDINALITY_TABLESPEC_RECEIPT','Expected projected receipt');
 const expected:CardinalityTableSpecProjection=projectCardinalityToTableSpec(receipt.author,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('CARDINALITY_TABLESPEC_RECEIPT','Receipt does not match retained source and binding');
 if(typeof nativeText!=='string'||nativeText!==exportTableSpec(receipt.target))throw new UmfError('CARDINALITY_TABLESPEC_STALE','Native target changed; retained report cannot assert recovery');
 return copyJson(receipt.source) as unknown as Document;
}
