import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import type {RdfNode,RdfLiteral,RdfQuad} from '../rdf';
import {getShaclQuads,getShaclPropertyPath,type ShaclPath} from './index';
type Term=RdfNode|RdfLiteral;
const SH='http://www.w3.org/ns/shacl#';
const annotations=['name','description','order','group','defaultValue'];
const constraints=['class','datatype','nodeKind','minCount','maxCount','minExclusive','minInclusive','maxExclusive','maxInclusive','minLength','maxLength','pattern','flags','languageIn','uniqueLang','equals','disjoint','lessThan','lessThanOrEquals','not','and','or','xone','node','property','qualifiedValueShape','qualifiedMinCount','qualifiedMaxCount','qualifiedValueShapesDisjoint','closed','ignoredProperties','hasValue','in'];
const controls=['targetNode','targetClass','targetSubjectsOf','targetObjectsOf','severity','message','deactivated'];
const key=(t:Term)=>JSON.stringify(t.kind==='literal'?[t.kind,t.value,t.datatype,t.language??'']:[t.kind,t.value]);
export interface ShaclMetadataField {predicate:string;values:Term[];quadIndexes:number[]}
export interface ShaclShapeMetadataNode {
 node:RdfNode;annotations:ShaclMetadataField[];constraints:ShaclMetadataField[];controls:ShaclMetadataField[];uninterpreted:ShaclMetadataField[];
 path:{status:'absent'}|{status:'compiled';value:ShaclPath}|{status:'invalid';message:string};
}
export interface ShaclShapeMetadata {
 profile:'shacl-metadata-1';complete:false;source:Document;blankNodeScope:string;shape:ShaclShapeMetadataNode;properties:ShaclShapeMetadataNode[];diagnostics:Diagnostic[];
}
/** Declared metadata only. Constraint grouping does not assert validity, inference or enforcement. */
export function getShaclShapeMetadata(document:Document,shape:RdfNode):ShaclShapeMetadata{
 if(!shape||!['iri','blank'].includes(shape.kind)||typeof shape.value!=='string')throw new UmfError('SHACL_METADATA_NODE','Expected an IRI or source-scoped blank node');
 const source=copyJson(document) as unknown as Document,qs=getShaclQuads(source);
 const diagnostics:Diagnostic[]=[{code:'SHACL_METADATA_DECLARED',path:'',severity:'warning',message:'Declared metadata only; constraints are not validated or enforced. Referenced graphs and unknown predicates remain in source. Property expansion is one level; blank identifiers use the source scope.'}];
 const index=new Map<string,{q:RdfQuad;i:number}[]>();qs.forEach((q,i)=>{const k=key(q.subject),list=index.get(k)??[];list.push({q,i});index.set(k,list);});
 function describe(node:RdfNode):ShaclShapeMetadataNode{
 const fields=new Map<string,ShaclMetadataField>();
 for(const {q,i} of index.get(key(node))??[]){const p=q.predicate.value,f=fields.get(p)??{predicate:p,values:[],quadIndexes:[]};if(!f.values.some(v=>key(v)===key(q.object)))f.values.push(q.object);f.quadIndexes.push(i);fields.set(p,f);}
 const result:ShaclShapeMetadataNode={node,annotations:[],constraints:[],controls:[],uninterpreted:[],path:{status:'absent'}};
 for(const f of fields.values()){
 if(f.predicate===SH+'path'){try{result.path={status:'compiled',value:getShaclPropertyPath(source,node)};}catch(e){result.path={status:'invalid',message:String(e)};diagnostics.push({code:'SHACL_METADATA_PATH',path:f.quadIndexes.join(','),severity:'warning',message:String(e)});}continue;}
 const local=f.predicate.startsWith(SH)?f.predicate.slice(SH.length):'';
 (annotations.includes(local)?result.annotations:constraints.includes(local)?result.constraints:controls.includes(local)?result.controls:result.uninterpreted).push(f);
 }
 if(!fields.size)diagnostics.push({code:'SHACL_METADATA_UNDESCRIBED',path:'',severity:'warning',message:'Selected node has no outgoing statements: '+node.value});
 return result;
 }
 const root=describe(shape),properties:ShaclShapeMetadataNode[]=[];
 for(const field of root.constraints.filter(f=>f.predicate===SH+'property'))for(const term of field.values){if(term.kind==='literal'){diagnostics.push({code:'SHACL_METADATA_PROPERTY',path:field.quadIndexes.join(','),severity:'warning',message:'Literal sh:property value retained without inventing a property shape'});continue;}properties.push(describe(term));}
 const payload=source.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions['umf.shacl'] as any;
 return copyJson({profile:'shacl-metadata-1',complete:false,source,blankNodeScope:payload.blankNodeScope,shape:root,properties,diagnostics}) as unknown as ShaclShapeMetadata;
}
