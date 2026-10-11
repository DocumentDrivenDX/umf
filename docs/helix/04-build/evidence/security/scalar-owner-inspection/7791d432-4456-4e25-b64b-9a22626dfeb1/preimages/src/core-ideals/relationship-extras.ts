import {Kind,parse,print} from 'graphql';
import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreRelationship,verifyCoreRelationshipOperation,type CoreRelationshipDeclaration,type CoreRelationshipIdentity} from '../model/relationships';
import {validateDocument} from '../validation/document';
import type {RelationshipEndpoint,RelationshipMultiplicity} from '../validation/relationships';
import {importGraphqlSchema,exportGraphqlSchema,getGraphqlAst} from '../adapters/graphql';
import {importRdfNQuads,exportRdfNQuads,getRdfQuads} from '../adapters/rdf';
import {importLinkmlDocument,exportLinkmlDocument,getLinkmlDocumentNode,inspectLinkmlDocument} from '../adapters/linkml';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';import authorSchema from '../../spec/core/relationship-operation.schema.json';
import schema from '../../spec/core/relationship-extras.schema.json';
export {default as relationshipExtrasSchema} from '../../spec/core/relationship-extras.schema.json';
export type RelationshipExtraSystem='graphql'|'rdf'|'linkml';
export type RelationshipExtraArchive={format:'graphql-sdl'|'linkml-json'|'linkml-yaml';text:string}|{format:'rdf-nquads';text:string;blankNodeScope:string};
export interface RelationshipExtraRecord {module:string;element:string;name:string;markerField?:string}
interface CommonRequest {id:string;mode:'strict'|'report';relationship:CoreRelationshipIdentity;records:RelationshipExtraRecord[];orientation?:'source-to-target'}
export type RelationshipExtraRequest=CommonRequest&(
 {system:'graphql';root:{typeName:string;fieldName:string};field:string;inverseField?:string;forwardUnion?:string;inverseUnion?:string}|
 {system:'rdf';predicate:string;inversePredicate?:string;unionPolicy:'owl-union'}|
 {system:'linkml';schemaId:string;schemaName:string;slot:string;inverseSlot?:string}
);
export interface RelationshipExtraClassificationRequest {system:RelationshipExtraSystem;mode:'strict'|'report';archive:RelationshipExtraArchive}
export interface RelationshipExtraObservation {nativePath:string;kind:'graphql-field'|'rdf-domain'|'rdf-range'|'rdf-union'|'rdf-list'|'linkml-class'|'linkml-slot';provenance:'inferred';authorIntent:'unknown'}
interface Loss {path:string;value:Json;outcome:'approximated'|'not-expressible'|'unknown';reason:string;recovery:'retained-source'}
interface BaseReceipt {version:'1.0.0';source:Document;target?:Document;binding:string;outcome:'approximated'|'not-expressible'|'unknown';residuals:Loss[];diagnostics:Diagnostic[]}
export interface RelationshipExtraClassification extends BaseReceipt {operation:'classify-relationship-extra';status:'classified'|'blocked';request:RelationshipExtraClassificationRequest;observations:RelationshipExtraObservation[]}
export interface RelationshipExtraProjection extends BaseReceipt {operation:'project-relationship-extra';status:'projected'|'blocked';author:CoreRelationshipDeclaration;request:RelationshipExtraRequest;nativeArchive?:RelationshipExtraArchive;mappings:{idealPath:string;nativePath:string;outcome:'approximated';provenance:'explicit-author-declaration'}[]}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships,authorSchema])validator.addSchema(s);
const check=validator.compile(schema),projectionRequest=validator.compile({$ref:schema.$id+'#/$defs/projectionRequest'}),classificationRequest=validator.compile({$ref:schema.$id+'#/$defs/classificationRequest'});
const bindings={graphql:'graphql-js-17.0.2_graphql-core-3.2.12_schema-sdl',rdf:'rdf11-nquads_rdflib-7.6.0_owl-union',linkml:'linkml-metamodel-1.11.0_runtime-1.11.0rc2'} as const;
const rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#',rdfs='http://www.w3.org/2000/01/rdf-schema#',owl='http://www.w3.org/2002/07/owl#';
const name=(x:string)=>/^[_A-Za-z][_0-9A-Za-z]*(?![\s\S])/.test(x)&&!x.startsWith('__');
const iri=(x:string)=>/^[A-Za-z][A-Za-z0-9+.-]*:[^<>"{}|^`\\\u0000-\u0020\u007f-\u009f\u2028\u2029]*(?![\s\S])/u.test(x)&&!/[\uD800-\uDFFF]/u.test(x);
const id=(r:{module:string;element:string})=>JSON.stringify([r.module,r.element]);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
function fail(message:string):never{throw new UmfError('RELATIONSHIP_EXTRA',message);}
function finish<T extends RelationshipExtraClassification|RelationshipExtraProjection>(r:T):T{r.diagnostics=r.residuals.map(l=>({code:'RELATIONSHIP_EXTRA_LOSS',path:l.path,message:l.reason,severity:r.status==='blocked'?'error':'warning'}));if(!check(r))fail('Invalid complete relationship extras result: '+JSON.stringify(check.errors));return copyJson(r) as unknown as T;}
function at(source:Document,ref:RelationshipEndpoint){const mi=source.modules.findIndex(m=>m.id===ref.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;if(mi<0||ei<0)fail('Unresolved Record or Field');return source.modules[mi]!.elements[ei]!;}
function systemOf(a:RelationshipExtraArchive):RelationshipExtraSystem{return a.format==='graphql-sdl'?'graphql':a.format==='rdf-nquads'?'rdf':'linkml';}
export function importRelationshipExtraArchive(input:RelationshipExtraArchive,id:string):Document{
 const archive=copyJson(input) as unknown as RelationshipExtraArchive;
 if(!validator.getSchema(schema.$id+'#/$defs/archive')!(archive))fail('Invalid native archive');
 if(archive.format==='graphql-sdl')return importGraphqlSchema(archive.text,{id,mode:'schema'});
 if(archive.format==='rdf-nquads')return importRdfNQuads(archive.text,{id,blankNodeScope:archive.blankNodeScope});
 return importLinkmlDocument(archive.text,{id,format:archive.format==='linkml-json'?'json':'yaml'});
}
function nativeText(system:RelationshipExtraSystem,d:Document):string{return system==='graphql'?exportGraphqlSchema(d):system==='rdf'?exportRdfNQuads(d):exportLinkmlDocument(d);}
function observations(system:RelationshipExtraSystem,source:Document):RelationshipExtraObservation[]{
 const result:RelationshipExtraObservation[]=[];
 const add=(nativePath:string,kind:RelationshipExtraObservation['kind'])=>result.push({nativePath,kind,provenance:'inferred',authorIntent:'unknown'});
 const nativeModule=system==='rdf'?'dataset':'schema',mi=source.modules.findIndex(m=>m.id===nativeModule),ei=source.modules[mi]?.elements.findIndex(e=>e.id===nativeModule)??-1;
 if(mi<0||ei<0)fail('Missing native schema/dataset payload');const base=`/modules/${mi}/elements/${ei}/extensions/umf.${system}`;
 if(system==='graphql'){
  const ast=getGraphqlAst(source),types=new Set(ast.definitions.filter(d=>d.kind===Kind.OBJECT_TYPE_DEFINITION||d.kind===Kind.UNION_TYPE_DEFINITION||d.kind===Kind.INTERFACE_TYPE_DEFINITION).map(d=>d.name.value));
  ast.definitions.forEach((d,di)=>{if(d.kind!==Kind.OBJECT_TYPE_DEFINITION&&d.kind!==Kind.INTERFACE_TYPE_DEFINITION)return;d.fields?.forEach((f,fi)=>{let t=f.type;while(t.kind!==Kind.NAMED_TYPE)t=t.type;if(types.has(t.name.value))add(base+`/ast/definitions/${di}/fields/${fi}`,'graphql-field');});});
 }else if(system==='rdf'){
  getRdfQuads(source).forEach((q,i)=>{const p=q.predicate.value;const kind=p===rdfs+'domain'?'rdf-domain':p===rdfs+'range'?'rdf-range':p===owl+'unionOf'?'rdf-union':p===rdf+'first'||p===rdf+'rest'?'rdf-list':undefined;if(kind)add(base+'/quads/'+i,kind);});
 }else{
  const root=getLinkmlDocumentNode(source,'');if(root.kind!=='object')fail('Expected native LinkML schema object');
  for(const kind of ['classes','slots'] as const){const node=root.members[kind];if(node?.kind==='object')for(const key of Object.keys(node.members))add(base+'/root/members/'+kind+'/members/'+pointer(key),kind==='classes'?'linkml-class':'linkml-slot');}
 }
 return result;
}
/** Native syntax observations only. The source is copied unchanged; no authored assertions are created. */
export function classifyRelationshipExtra(input:Document,options:RelationshipExtraClassificationRequest):RelationshipExtraClassification{
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as RelationshipExtraClassificationRequest;
 if(!classificationRequest(request)||systemOf(request.archive)!==request.system)fail('Invalid classification request or native archive format');
 if(!validateDocument(source).valid)fail('Invalid native source document');
 const fresh=importRelationshipExtraArchive(request.archive,source.id);
 if(nativeText(request.system,source)!==nativeText(request.system,fresh))fail('Native archive does not match current source');
 const ext=source.modules.find(m=>m.id===(request.system==='rdf'?'dataset':'schema'))?.elements.find(e=>e.id===(request.system==='rdf'?'dataset':'schema'))?.extensions['umf.'+request.system];
 const freshExt=fresh.modules[0]!.elements[0]!.extensions['umf.'+request.system];
 // Representation-level unknown fields cannot be silently ignored; unrelated core extensions stay in source.
 if(!same(ext,freshExt))fail('Native payload/refinements do not match retained archive');
 const residuals:Loss[]=[{path:'/',value:copyJson(source),outcome:'not-expressible',reason:'Native syntax does not establish authored relationship identity, target Keys, participation or lifecycle; preserve all original native and unknown source content',recovery:'retained-source'}];
 const unsupported=request.system==='linkml'&&inspectLinkmlDocument(source).diagnostics.some(d=>d.code==='LINKML_VERSION');
 if(unsupported)residuals.push({path:'/',value:copyJson(source),outcome:'unknown',reason:'Unrecognized LinkML metamodel version remains archived without classification',recovery:'retained-source'});
 return finish({operation:'classify-relationship-extra',version:'1.0.0',status:request.mode==='strict'||unsupported?'blocked':'classified',source,request,binding:bindings[request.system],outcome:'unknown',observations:unsupported?[]:observations(request.system,source),residuals,diagnostics:[],...(request.mode==='report'&&!unsupported?{target:copyJson(source) as unknown as Document}:{})});
}
/** Explicit Record-shape down-binding; native-only import never authenticates authored intent. */
export function projectRelationshipToExtra(input:Document,authorInput:CoreRelationshipDeclaration,options:RelationshipExtraRequest):RelationshipExtraProjection{
 const source=copyJson(input) as unknown as Document,author=copyJson(authorInput) as unknown as CoreRelationshipDeclaration,request=copyJson(options) as unknown as RelationshipExtraRequest;
 if(!projectionRequest(request))fail('Invalid complete relationship extras policy: '+JSON.stringify(projectionRequest.errors));
 if(source.umf!=='0.7.0'||!validateDocument(source).valid||author.operation!=='declare-core-relationship')fail('Valid authored core 0.7.0 relationship required');
 verifyCoreRelationshipOperation(author,author.target);
 if(author.target.id!==source.id||author.identity.module!==request.relationship.module||author.request.id!==request.relationship.id)fail('Mismatched author identity');
 const current=lookupCoreRelationship(source,request.relationship),prior=lookupCoreRelationship(author.target,request.relationship),rel=current.relationship;
 if(!same(rel,prior.relationship))fail('Stale authored relationship');
 for(const endpoint of [...rel.source,...rel.target,...(rel.associationRecord?[rel.associationRecord]:[])]){
  const e=at(source,endpoint);if(!same(e,at(author.target,endpoint)))fail('Stale endpoint Record/Key');
  for(const member of (e.members??[]) as RelationshipEndpoint[])if(!same(at(source,member),at(author.target,member)))fail('Stale endpoint Field');
 }
 const result:RelationshipExtraProjection={operation:'project-relationship-extra',version:'1.0.0',status:'projected',source,author,request,binding:bindings[request.system],outcome:'approximated',mappings:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:Loss['outcome']='not-expressible')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'retained-source'});
 let blocked=false;const block=(path:string,value:unknown,reason:string)=>{blocked=true;loss(path,value,reason);};
 loss('/',source,'Only explicit relationship shape is projected; all other logical/native metadata, Record fields, Keys and unknown extensions remain retained');
 for(const key of Object.keys(rel))loss(current.path+'/'+pointer(key),rel[key],'Native schema shape does not establish this authored obligation: stable identity, target Key resolution, participation, lifecycle, inverse consistency or association identity');
 if(current.uninterpretedPaths.length)block(current.path,rel,'Unknown relationship qualifiers cannot govern native lowering');
 if(!rel.directed&&request.orientation!=='source-to-target')block('/request',request,'Undirected relationship needs explicit source-to-target display orientation');
 if(rel.directed&&request.orientation!==undefined)fail('Orientation supplied for a directed assertion');
 const expected=new Set([...rel.source,...rel.target].map(id)),records=new Map<string,RelationshipExtraRecord>(),used=new Set<string>();
 for(const record of request.records){
  if(!expected.has(id(record))||records.has(id(record))||used.has(record.name))fail('Record mappings must cover distinct exact endpoints without native name collisions');
  if(!(request.system==='rdf'?iri(record.name):name(record.name)))fail('Invalid explicit native Record name');
  if(request.system==='graphql'){if(['String','Boolean','Int','Float','ID'].includes(record.name))fail('GraphQL Record name collides with a built-in scalar');if(!record.markerField||!name(record.markerField))fail('GraphQL Record shells need explicit safe marker fields');}
  else if(record.markerField!==undefined)fail('Marker fields belong only to the GraphQL profile');
  records.set(id(record),record);used.add(record.name);
 }
 if(records.size!==expected.size)fail('Every exact endpoint Record requires a native name');
 const named=(r:RelationshipEndpoint)=>records.get(id(r))!.name;
 const graphInverse=request.system==='graphql'?request.inverseField:request.system==='rdf'?request.inversePredicate:request.inverseSlot;
 if(rel.inverse===undefined&&graphInverse!==undefined||rel.inverse!==undefined&&graphInverse===undefined)fail('Inverse native name must match the declared inverse presence');
 let archive:RelationshipExtraArchive|undefined;
 if(request.system==='graphql'){
  const allNames=new Set([...used,'String','Boolean','Int','Float','ID']);
  if(!name(request.root.typeName)||!name(request.root.fieldName)||allNames.has(request.root.typeName))fail('Invalid or colliding GraphQL schema root');allNames.add(request.root.typeName);
  if(!name(request.field)||request.inverseField!==undefined&&!name(request.inverseField))fail('Invalid GraphQL relationship field name');
  const defs:string[]=[],lines=new Map(request.records.map(r=>[r.name,[`  ${r.markerField}: Boolean`]]));
  const output=(refs:RelationshipEndpoint[],union:string|undefined)=>{
   if(refs.length===1){if(union!==undefined)fail('Union policy on homogeneous endpoint');return named(refs[0]!);}
   if(!union||!name(union)||allNames.has(union))fail('Heterogeneous GraphQL output requires explicit distinct union name');allNames.add(union);defs.push(`union ${union} = ${refs.map(named).join(' | ')}`);return union;
  };
  const wrap=(t:string,b:RelationshipMultiplicity)=>b.max==='*'||b.max>1?`[${t}]`:b.min===1?t+'!':t;
  const field=(owner:string,f:string,t:string)=>{const fields=lines.get(owner)!;if(fields.some(l=>l.trimStart().startsWith(f+':')))fail('GraphQL field collision');fields.push(`  ${f}: ${t}`);};
  const target=output(rel.target,request.forwardUnion);for(const s of rel.source)field(named(s),request.field,wrap(target,rel.targetMultiplicity));
  if(request.inverseField){const sourceType=output(rel.source,request.inverseUnion);for(const t of rel.target)field(named(t),request.inverseField,wrap(sourceType,rel.sourceMultiplicity));}else if(request.inverseUnion!==undefined)fail('Inverse union without inverse');
  for(const [type,fields] of lines)defs.push(`type ${type} {\n${fields.join('\n')}\n}`);
  const text=print(parse(`schema { query: ${request.root.typeName} }\ntype ${request.root.typeName} { ${request.root.fieldName}: Boolean }\n${defs.join('\n')}`,{noLocation:true}))+'\n';
  archive={format:'graphql-sdl',text};loss('/request',request,'Explicit Record markers and synthetic query root have no key, resolver or execution semantics; output/list wrappers cannot enforce stored participation','approximated');
 }else if(request.system==='rdf'){
  if(!iri(request.predicate)||request.inversePredicate!==undefined&&!iri(request.inversePredicate)||used.has(request.predicate)||request.inversePredicate!==undefined&&(used.has(request.inversePredicate)||request.inversePredicate===request.predicate))fail('Invalid or colliding predicate IRI');
  const quads:string[]=request.records.map(r=>`<${r.name}> <${rdf}type> <${owl}Class> .`);
  const endpointClass=(refs:RelationshipEndpoint[],label:string)=>{
   if(refs.length===1)return `<${named(refs[0]!)}>`;
   const head=`_:umf_${label}`;quads.push(`${head} <${rdf}type> <${owl}Class> .`,`${head} <${owl}unionOf> _:umf_${label}_0 .`);
   refs.forEach((r,i)=>quads.push(`_:umf_${label}_${i} <${rdf}first> <${named(r)}> .`,`_:umf_${label}_${i} <${rdf}rest> ${i+1===refs.length?`<${rdf}nil>`:`_:umf_${label}_${i+1}`} .`));
   return head;
  };
  const domain=endpointClass(rel.source,'domain'),range=endpointClass(rel.target,'range');
  quads.push(`<${request.predicate}> <${rdf}type> <${owl}ObjectProperty> .`,`<${request.predicate}> <${rdfs}domain> ${domain} .`,`<${request.predicate}> <${rdfs}range> ${range} .`);
  if(request.inversePredicate)quads.push(`<${request.inversePredicate}> <${owl}inverseOf> <${request.predicate}> .`,`<${request.inversePredicate}> <${rdfs}domain> ${range} .`,`<${request.inversePredicate}> <${rdfs}range> ${domain} .`);
  archive={format:'rdf-nquads',text:quads.join('\n')+'\n',blankNodeScope:request.id};
  loss('/request',request,'RDFS domain/range entail class membership rather than validate references; OWL union means a disjunction, not every endpoint class, and inverse properties imply triples without enforcing participation','approximated');
 }else{
  if(!iri(request.schemaId)||!name(request.schemaName)||!name(request.slot)||request.inverseSlot!==undefined&&(!name(request.inverseSlot)||request.inverseSlot===request.slot))fail('Invalid LinkML schema/slot name');
  if(rel.target.length!==1||request.inverseSlot!==undefined&&rel.source.length!==1)block(current.path,rel,'This LinkML class-range profile cannot represent a heterogeneous slot range');
  const classes:Record<string,{slots:string[]}>=Object.create(null),slots:Record<string,{range:string;multivalued:boolean;required:boolean}>=Object.create(null);
  for(const r of request.records)classes[r.name]={slots:[]};
  slots[request.slot]={range:named(rel.target[0]!),multivalued:rel.targetMultiplicity.max==='*'||rel.targetMultiplicity.max>1,required:rel.targetMultiplicity.min>0};
  for(const s of rel.source)classes[named(s)]!.slots.push(request.slot);
  if(request.inverseSlot){slots[request.inverseSlot]={range:named(rel.source[0]!),multivalued:rel.sourceMultiplicity.max==='*'||rel.sourceMultiplicity.max>1,required:rel.sourceMultiplicity.min>0};for(const t of rel.target)classes[named(t)]!.slots.push(request.inverseSlot);}
  archive={format:'linkml-json',text:JSON.stringify({id:request.schemaId,name:request.schemaName,prefixes:{umf:'https://example.org/umf-extra/'},default_prefix:'umf',classes,slots},null,2)+'\n'};
  loss('/request',request,'Slot range, required and multivalued metadata do not name target Keys, enforce distinct-record participation or validate instances; native imports/defaults/facets remain separate','approximated');
 }
 if(blocked||request.mode==='strict'){result.status='blocked';result.outcome=blocked?'not-expressible':'unknown';}
 else{
  result.nativeArchive=archive!;result.target=importRelationshipExtraArchive(archive!,request.id);
  result.mappings=observations(request.system,result.target).map(o=>({idealPath:current.path,nativePath:o.nativePath,outcome:'approximated',provenance:'explicit-author-declaration'}));
 }
 return finish(result);
}
function targetMatches(target:Document,expected:Document):boolean{const actual=copyJson(target) as unknown as Document;actual.id=expected.id;return same(actual,expected);}
export function verifyRelationshipExtra(input:RelationshipExtraProjection|RelationshipExtraClassification,current?:Document){
 const receipt=copyJson(input) as unknown as RelationshipExtraProjection|RelationshipExtraClassification;if(!check(receipt))fail('Malformed relationship extras receipt');
 const expected=receipt.operation==='project-relationship-extra'?projectRelationshipToExtra(receipt.source,receipt.author,receipt.request):classifyRelationshipExtra(receipt.source,receipt.request);
 if(!same(receipt,expected)||current!==undefined&&(!expected.target||!targetMatches(current,expected.target)))fail('Forged or stale relationship extras receipt');return expected;
}
export function recoverRelationshipExtraIdeal(input:RelationshipExtraProjection,current:Document):Document{const result=verifyRelationshipExtra(input,current);if(result.operation!=='project-relationship-extra'||!result.target)fail('Authored projected receipt required');return copyJson(result.source) as unknown as Document;}
export function recoverRelationshipExtraNative(input:RelationshipExtraProjection|RelationshipExtraClassification,current:Document):{document:Document;archive:RelationshipExtraArchive}{const r=verifyRelationshipExtra(input,current);if(!r.target)fail('Blocked receipt cannot recover a native target');return {document:copyJson(r.operation==='classify-relationship-extra'?r.source:r.target) as unknown as Document,archive:copyJson(r.operation==='classify-relationship-extra'?r.request.archive:r.nativeArchive!) as unknown as RelationshipExtraArchive};}
