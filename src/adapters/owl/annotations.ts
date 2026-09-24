import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import type {RdfNode,RdfLiteral,RdfQuad} from '../rdf';
import {getOwlQuads} from './index';
const O='http://www.w3.org/2002/07/owl#',TYPE='http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
type Term=RdfNode|RdfLiteral;
const key=(t:Term)=>JSON.stringify(t.kind==='literal'?[t.kind,t.value,t.datatype,t.language??'']:[t.kind,t.value]);
const triple=(s:Term,p:Term,o:Term)=>JSON.stringify([key(s),key(p),key(o)]);
export interface OwlAnnotationRecord {node:RdfNode;kind:'Axiom'|'Annotation';target:{subject:RdfNode;predicate:RdfNode;object:Term};assertedQuadIndexes:number[];annotationQuadIndexes:number[];nested:RdfNode[]}
export interface OwlAxiomAnnotations {profile:'owl-annotations-1';complete:false;source:Document;blankNodeScope:string;quadIndex:number;roots:RdfNode[];records:OwlAnnotationRecord[];malformed:RdfNode[]}
/** Match RDF reification terms exactly, retaining nested annotation links as a finite graph. */
export function getOwlAxiomAnnotations(document:Document,quadIndex:number):OwlAxiomAnnotations{
 const source=copyJson(document) as unknown as Document,qs=getOwlQuads(source);
 if(!Number.isSafeInteger(quadIndex)||quadIndex<0||quadIndex>=qs.length)throw new UmfError('OWL_ANNOTATION_INDEX','Expected an existing source quad index');
 const subjects=new Map<string,{node:RdfNode;rows:{q:RdfQuad;i:number}[]}>(),triples=new Map<string,number[]>();
 qs.forEach((q,i)=>{const k=key(q.subject),s=subjects.get(k)??{node:q.subject,rows:[]};s.rows.push({q,i});subjects.set(k,s);const t=triple(q.subject,q.predicate,q.object),indexes=triples.get(t)??[];indexes.push(i);triples.set(t,indexes);});
 const all:OwlAnnotationRecord[]=[],malformed:RdfNode[]=[];
 const structural=new Set(['annotatedSource','annotatedProperty','annotatedTarget'].map(p=>O+p));
 for(const s of subjects.values()){
 const kinds=[...new Set(s.rows.filter(({q})=>q.predicate.value===TYPE&&q.object.kind==='iri'&&[O+'Axiom',O+'Annotation'].includes(q.object.value)).map(({q})=>q.object.value.slice(O.length) as 'Axiom'|'Annotation'))];if(!kinds.length)continue;
 const vals=(p:string)=>[...new Map(s.rows.filter(({q})=>q.predicate.value===O+p).map(({q})=>[key(q.object),q.object])).values()];
 const ss=vals('annotatedSource'),ps=vals('annotatedProperty'),os=vals('annotatedTarget');
 if(kinds.length!==1||ss.length!==1||ps.length!==1||os.length!==1||ss[0]!.kind==='literal'||ps[0]!.kind!=='iri'){malformed.push(s.node);continue;}
 const target={subject:ss[0] as RdfNode,predicate:ps[0] as RdfNode,object:os[0]!};
 all.push({node:s.node,kind:kinds[0]!,target,assertedQuadIndexes:triples.get(triple(target.subject,target.predicate,target.object))??[],annotationQuadIndexes:s.rows.filter(({q})=>!structural.has(q.predicate.value)&&!(q.predicate.value===TYPE&&q.object.kind==='iri'&&[O+'Axiom',O+'Annotation'].includes(q.object.value))).map(({i})=>i),nested:[]});
 }
 const byTarget=new Map<string,OwlAnnotationRecord[]>();for(const record of all){const k=triple(record.target.subject,record.target.predicate,record.target.object),records=byTarget.get(k)??[];records.push(record);byTarget.set(k,records);}
 const q=qs[quadIndex]!,roots=(byTarget.get(triple(q.subject,q.predicate,q.object))??[]).filter(r=>r.kind==='Axiom'),todo=[...roots],seen=new Set<string>(),records:OwlAnnotationRecord[]=[];
 while(todo.length){const r=todo.shift()!;if(seen.has(key(r.node)))continue;seen.add(key(r.node));records.push(r);const children=new Map<string,OwlAnnotationRecord>();for(const i of r.annotationQuadIndexes){const a=qs[i]!;for(const child of byTarget.get(triple(a.subject,a.predicate,a.object))??[])if(child.kind==='Annotation')children.set(key(child.node),child);}
 r.nested=[...children.values()].map(c=>c.node);todo.push(...children.values());}
 const payload=source.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions['umf.owl'] as any;
 return copyJson({profile:'owl-annotations-1',complete:false,source,blankNodeScope:payload.blankNodeScope,quadIndex,roots:roots.map(r=>r.node),records,malformed}) as unknown as OwlAxiomAnnotations;
}
