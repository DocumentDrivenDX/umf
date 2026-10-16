import manifest from '../../../spec/extensions/shacl/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic,type Json,type ExtensionPackage} from '../../model/types';
import {RDF_EXTENSION,importRdfTurtle,exportRdfTurtle,getRdfQuads,getRdfNamedGraphs,inspectRdfDocument,proposeRdfQuadEdit,type RdfNode,type RdfLiteral,type RdfQuad} from '../rdf';
export const SHACL_EXTENSION='umf.shacl';
export const shaclPackage=manifest as unknown as ExtensionPackage;
type Value=RdfNode|RdfLiteral;
export type ShaclPath={kind:'predicate';iri:string}|{kind:'sequence'|'alternative';paths:ShaclPath[]}|{kind:'inverse'|'zeroOrMore'|'oneOrMore'|'zeroOrOne';path:ShaclPath};
const SH='http://www.w3.org/ns/shacl#',RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const key=(v:Value)=>JSON.stringify(v.kind==='literal'?[v.kind,v.value,v.datatype,v.language??'']:[v.kind,v.value]);
const unique=(values:Value[])=>[...new Map(values.map(v=>[key(v),v])).values()];
function rdfEnvelope(p:Json):Document {
 const payload=copyJson(p) as Record<string,Json>;delete payload.shaclVersion;
 return {umf:'0.1.0',id:'shacl:graph',vocabularies:{[RDF_EXTENSION]:{version:'0.1.0'}},modules:[{id:'dataset',namespace:'',elements:[{id:'dataset',extensions:{[RDF_EXTENSION]:payload}}]}]};
}
function inspect(p:Json):Diagnostic[]{return [...inspectRdfDocument(rdfEnvelope(p)).diagnostics,{code:'SHACL_SCOPE',path:'',severity:'warning',message:'SHACL 1.0 graph preservation, property paths and Core target selection only. Constraint validation, imports, general entailment and SHACL 1.2 are not implemented.'}];}
export function shaclRegistry(){return new Registry().register(shaclPackage,inspect);}
export function inspectShaclDocument(document:Document){return validateDocument(document,shaclRegistry());}
function graph(document:Document):Document {
 const checked=inspectShaclDocument(document);if(!checked.valid)throw new UmfError('SHACL_DOCUMENT',JSON.stringify(checked.diagnostics));
 const p=document.modules.find(m=>m.id==='dataset')?.elements.find(e=>e.id==='dataset')?.extensions[SHACL_EXTENSION];
 if(!p||document.vocabularies[SHACL_EXTENSION]?.version!=='0.1.0')throw new UmfError('SHACL_PAYLOAD','Expected pinned shapes graph');
 const rdf=rdfEnvelope(p);exportRdfTurtle(rdf);return rdf;
}
export function importShaclTurtle(text:string,options:{id:string;baseIRI:string;blankNodeScope?:string}):Document {
 const d=importRdfTurtle(text,options),element=d.modules[0]!.elements[0]!;
 element.extensions[SHACL_EXTENSION]={...(element.extensions[RDF_EXTENSION] as Record<string,Json>),shaclVersion:'1.0'};delete element.extensions[RDF_EXTENSION];
 d.vocabularies={[SHACL_EXTENSION]:{version:'0.1.0'}};graph(d);return d;
}
export function exportShaclTurtle(document:Document):string{return exportRdfTurtle(graph(document));}
export function getShaclQuads(document:Document):RdfQuad[]{return getRdfQuads(graph(document));}
export function proposeShaclQuadEdit(document:Document,index:number,replacement:RdfQuad){
 const edited=proposeRdfQuadEdit(graph(document),index,replacement).document;exportRdfTurtle(edited);
 const next=copyJson(document) as unknown as Document;
 next.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[SHACL_EXTENSION]={...(edited.modules[0]!.elements[0]!.extensions[RDF_EXTENSION] as Record<string,Json>),shaclVersion:'1.0'};
 graph(next);return {document:next,validation:inspectShaclDocument(next)};
}
/** Compile one property shape's path. The returned tree is metadata, not a conformance report. */
export function getShaclPropertyPath(document:Document,shape:RdfNode):ShaclPath {
 const qs=getShaclQuads(document),out=(n:Value)=>qs.filter(q=>key(q.subject)===key(n));
 const objects=(n:Value,p:string)=>unique(out(n).filter(q=>q.predicate.value===p).map(q=>q.object));
 const fail=(message:string):never=>{throw new UmfError('SHACL_PATH',message);};
 const active=new Set<string>();let work=0;
 function list(start:Value):Value[]{const members:Value[]=[],seen=new Set<string>();let n=start;
  while(!(n.kind==='iri'&&n.value===RDF+'nil')){if(++work>10000)fail('Path structure exceeds 10,000 steps');if(n.kind==='literal'||seen.has(key(n)))fail('Expected acyclic SHACL list');seen.add(key(n));const first=objects(n,RDF+'first'),rest=objects(n,RDF+'rest');if(first.length!==1||rest.length!==1)fail('List needs exactly one rdf:first and rdf:rest');members.push(first[0]!);n=rest[0]!;}if(objects(n,RDF+'first').length||objects(n,RDF+'rest').length)fail('rdf:nil cannot have list values');return members;
 }
 function compile(n:Value,depth=0):ShaclPath {
  if(++work>10000||depth>128)fail('Path structure limit exceeded');if(n.kind==='iri')return {kind:'predicate',iri:n.value};if(n.kind!=='blank')return fail('Literal cannot be a property path');
  if(active.has(key(n)))fail('Recursive property path');active.add(key(n));
  try{const triples=[...new Map(out(n).map(q=>[JSON.stringify([key(q.subject),q.predicate.value,key(q.object)]),q])).values()];
   if(objects(n,RDF+'first').length){const members=list(n);if(members.length<2)fail('Sequence needs at least two members');return {kind:'sequence',paths:members.map(v=>compile(v,depth+1))};}
   if(triples.length!==1)fail('Unary/alternative path needs exactly one triple');const q=triples[0]!;
   if(q.predicate.value===SH+'alternativePath'){const members=list(q.object);if(members.length<2)fail('Alternative needs at least two members');return {kind:'alternative',paths:members.map(v=>compile(v,depth+1))};}
   const operators=new Map<string,'inverse'|'zeroOrMore'|'oneOrMore'|'zeroOrOne'>([['inversePath','inverse'],['zeroOrMorePath','zeroOrMore'],['oneOrMorePath','oneOrMore'],['zeroOrOnePath','zeroOrOne']]);const kind=operators.get(q.predicate.value.slice(SH.length));
   if(!q.predicate.value.startsWith(SH)||!kind)return fail('Unknown path operator');return {kind,path:compile(q.object,depth+1)};
  }finally{active.delete(key(n));}
 }
 const paths=objects(shape,SH+'path');if(paths.length!==1)fail('Property shape needs exactly one sh:path');return compile(paths[0]!);
}
/** Focus blank labels are local to data. Named datasets require explicit graph selection before this call. */
export function evaluateShaclPropertyPath(shapes:Document,shape:RdfNode,data:Document,focus:Value):Value[]{
 const path=getShaclPropertyPath(shapes,shape);exportRdfTurtle(data);if(getRdfNamedGraphs(data).length)throw new UmfError('SHACL_GRAPH','Expected one data graph');
 // Validate caller terms using the RDF codec, including lexical and Unicode constraints.
 const probe=importRdfTurtle('',{id:'probe',baseIRI:'urn:umf:probe:'});
 const raw=probe.modules[0]!.elements[0]!.extensions[RDF_EXTENSION] as Record<string,Json>;
 raw.quads=[{subject:{kind:'iri',value:'urn:umf:probe'},predicate:{kind:'iri',value:'urn:umf:probe'},object:copyJson(focus),graph:{kind:'default'}}] as unknown as Json;exportRdfTurtle(probe);
 const qs=getRdfQuads(data);let work=0;
 function step(p:ShaclPath,starts:Value[],inverse=false):Value[]{
  if(++work>1000000)throw new UmfError('SHACL_LIMIT','Path evaluation exceeds 1,000,000 work steps');
  if(p.kind==='predicate'){const wanted=new Set(starts.map(key));return unique(qs.flatMap(q=>{if(++work>1000000)throw new UmfError('SHACL_LIMIT','Path evaluation limit');return q.predicate.value===p.iri&&wanted.has(key(inverse?q.object:q.subject))?[inverse?q.subject:q.object]:[];}));}
  if(p.kind==='inverse')return step(p.path,starts,!inverse);
  if(p.kind==='alternative')return unique(p.paths.flatMap(child=>step(child,starts,inverse)));
  if(p.kind==='sequence'){let found=starts;for(const child of inverse?[...p.paths].reverse():p.paths)found=step(child,found,inverse);return found;}
  if(p.kind==='zeroOrOne')return unique([...starts,...step(p.path,starts,inverse)]);
  const unary=p as Extract<ShaclPath,{path:ShaclPath}>,found=new Map<string,Value>();if(p.kind==='zeroOrMore')for(const n of starts)found.set(key(n),n);
  let frontier=starts;while(frontier.length){const next=step(unary.path,frontier,inverse);frontier=[];for(const n of next)if(!found.has(key(n))){found.set(key(n),n);frontier.push(n);}}
  return [...found.values()];
 }
 return copyJson(step(path,[focus])) as unknown as Value[];
}

/** SHACL Core target union, before deactivation or constraint evaluation. */
export function getShaclTargetNodes(shapes:Document,shape:RdfNode,data:Document):Value[]{
 const sg=getShaclQuads(shapes);exportRdfTurtle(data);const dg=getRdfQuads(data);
 if(!shape||!['iri','blank'].includes(shape.kind)||Object.keys(shape).some(k=>!['kind','value'].includes(k)))throw new UmfError('SHACL_TARGET','Expected an RDF node identifying the shape');
 const probe=importRdfTurtle('',{id:'probe',baseIRI:'urn:umf:probe:'});
 (probe.modules[0]!.elements[0]!.extensions[RDF_EXTENSION] as Record<string,Json>).quads=[{subject:copyJson(shape),predicate:{kind:'iri',value:'urn:umf:probe'},object:copyJson(shape),graph:{kind:'default'}}] as unknown as Json;exportRdfTurtle(probe);
 if(sg.some(q=>q.predicate.value==='http://www.w3.org/2002/07/owl#imports'||q.predicate.value===SH+'entailment'))throw new UmfError('SHACL_TARGET_UNSUPPORTED','Imports and entailment declarations require explicit processing before target selection');
 const properties=sg.filter(q=>key(q.subject)===key(shape));
 if(properties.some(q=>q.predicate.value===SH+'target'))throw new UmfError('SHACL_TARGET_UNSUPPORTED','Custom targets are not implemented');
 const selected:Value[]=[],classes:Value[]=[];let work=0;
 const tick=()=>{if(++work>1000000)throw new UmfError('SHACL_LIMIT','Target selection exceeds 1,000,000 work steps');};
 const RDFS='http://www.w3.org/2000/01/rdf-schema#';
 function instances(qs:RdfQuad[],target:Value):Value[]{
  const children=new Map<string,Value[]>();for(const q of qs){tick();if(q.predicate.value===RDFS+'subClassOf'){const k=key(q.object);const list=children.get(k)??[];list.push(q.subject);children.set(k,list);}}
  const closure=new Set<string>(),todo=[target];while(todo.length){tick();const n=todo.pop()!,k=key(n);if(closure.has(k))continue;closure.add(k);todo.push(...(children.get(k)??[]));}
  return qs.flatMap(q=>{tick();return q.predicate.value===RDF+'type'&&closure.has(key(q.object))?[q.subject]:[];});
 }
 for(const q of properties){const p=q.predicate.value;if(![SH+'targetNode',SH+'targetClass',SH+'targetSubjectsOf',SH+'targetObjectsOf'].includes(p))continue;
  if(p===SH+'targetNode'){if(q.object.kind==='blank')throw new UmfError('SHACL_TARGET','sh:targetNode must be an IRI or literal');selected.push(q.object);continue;}
  if(q.object.kind!=='iri')throw new UmfError('SHACL_TARGET','Class and predicate targets require IRIs');
  if(p===SH+'targetClass'){classes.push(q.object);continue;}
  for(const triple of dg){tick();if(triple.predicate.value===q.object.value)selected.push(p===SH+'targetSubjectsOf'?triple.subject:triple.object);}
 }
 const isInstance=(type:string)=>instances(sg,{kind:'iri',value:type}).some(n=>key(n)===key(shape));
 if((isInstance(SH+'NodeShape')||isInstance(SH+'PropertyShape'))&&isInstance(RDFS+'Class')){
  if(shape.kind!=='iri')throw new UmfError('SHACL_TARGET','Implicit class target shape must be an IRI');classes.push(shape);
 }
 for(const target of unique(classes))selected.push(...instances(dg,target));
 return copyJson(unique(selected)) as unknown as Value[];
}
