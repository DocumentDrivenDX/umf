import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import type {RdfNode,RdfLiteral,RdfQuad} from '../rdf';
import {getOwlQuads,OWL_EXTENSION} from './index';
type Term=RdfNode|RdfLiteral;
export type OwlListAxiomKind='propertyChain'|'key'|'disjointUnion';
export interface OwlListAxiom {kind:OwlListAxiomKind;node:RdfNode;head:RdfNode;members:RdfNode[];quadIndexes:number[];listQuadIndexes:number[]}
export interface OwlMalformedListAxiom {kind:OwlListAxiomKind;node:RdfNode;head:Term;quadIndexes:number[];reason:string}
export interface OwlListAxiomView {profile:'owl-list-axioms-1';complete:false;source:Document;blankNodeScope:string;axioms:OwlListAxiom[];malformed:OwlMalformedListAxiom[]}
const RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#',OWL='http://www.w3.org/2002/07/owl#';
const kinds=new Map<string,OwlListAxiomKind>([[OWL+'propertyChainAxiom','propertyChain'],[OWL+'hasKey','key'],[OWL+'disjointUnionOf','disjointUnion']]);
const key=(t:Term)=>JSON.stringify(t.kind==='literal'?[t.kind,t.value,t.datatype,(t.language??'').toLowerCase()]:[t.kind,t.value]);
/** Source-preserving local RDF list views; never an OWL consistency or inference result. */
export function getOwlListAxioms(document:Document):OwlListAxiomView {
 const source=copyJson(document) as unknown as Document,qs=getOwlQuads(source);
 const subjects=new Map<string,{q:RdfQuad;i:number}[]>(),main=new Map<string,{kind:OwlListAxiomKind;node:RdfNode;head:Term;quadIndexes:number[]}>();
 for(const [i,q] of qs.entries()){
  const s=key(q.subject),rows=subjects.get(s)??[];rows.push({q,i});subjects.set(s,rows);
  const kind=kinds.get(q.predicate.value);if(!kind)continue;
  const k=JSON.stringify([s,kind,key(q.object)]),record=main.get(k)??{kind,node:q.subject,head:q.object,quadIndexes:[]};record.quadIndexes.push(i);main.set(k,record);
 }
 const axioms:OwlListAxiom[]=[],malformed:OwlMalformedListAxiom[]=[];
 const fail=(reason:string):never=>{throw new UmfError('OWL_LIST_AXIOM',reason);};
 for(const record of main.values())try{
  if(record.kind==='disjointUnion'&&record.node.kind!=='iri')fail('Disjoint union subject must be an IRI');
  let cell=record.head;const seen=new Set<string>(),members:RdfNode[]=[],listQuadIndexes:number[]=[];
  while(!(cell.kind==='iri'&&cell.value===RDF+'nil')){
   if(cell.kind==='literal')fail('List cell must be a resource');
   const k=key(cell);if(seen.has(k))fail('Cyclic list');if(seen.size>=10000)fail('List exceeds 10,000 cells');seen.add(k);
   const rows=subjects.get(k)??[];
   const one=(predicate:string):Term=>{const matches=rows.filter(r=>r.q.predicate.value===predicate),values=[...new Map(matches.map(r=>[key(r.q.object),r.q.object])).values()];if(values.length!==1)fail('List cell requires exactly one '+predicate);listQuadIndexes.push(...matches.map(r=>r.i));return values[0]!;};
   const member=one(RDF+'first');if(member.kind==='literal')fail('List axiom member must be a resource');members.push(member as RdfNode);cell=one(RDF+'rest');
  }
  if((subjects.get(key(cell))??[]).some(r=>[RDF+'first',RDF+'rest'].includes(r.q.predicate.value)))fail('rdf:nil has list structure');
  if(members.length<(record.kind==='key'?1:2))fail('Too few list axiom members');
  axioms.push({...record,head:record.head as RdfNode,members,listQuadIndexes});
 }catch(error){if(!(error instanceof UmfError))throw error;malformed.push({...record,reason:error.message});}
 const payload=source.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[OWL_EXTENSION] as any;
 return copyJson({profile:'owl-list-axioms-1',complete:false,source,blankNodeScope:payload.blankNodeScope,axioms,malformed}) as unknown as OwlListAxiomView;
}
