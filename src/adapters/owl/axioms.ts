import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import type {RdfNode,RdfLiteral,RdfQuad} from '../rdf';
import {getOwlQuads} from './index';

const OWL='http://www.w3.org/2002/07/owl#';
const RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#';
type Term=RdfNode|RdfLiteral;
const key=(t:Term)=>JSON.stringify(t.kind==='literal'?[t.kind,t.value,t.datatype,t.language??'']:[t.kind,t.value]);

export type OwlSpecialAxiom =
 | {kind:'negativePropertyAssertion';node:RdfNode;sourceIndividual:RdfNode;assertionProperty:RdfNode;target:Term;targetKind:'individual'|'value';quadIndexes:number[]}
 | {kind:'allDifferent'|'allDisjointClasses'|'allDisjointProperties';node:RdfNode;members:Term[];memberPredicate:'members'|'distinctMembers';quadIndexes:number[]};

export interface OwlSpecialAxiomView {
 profile:'owl-special-axioms-1'; complete:false; source:Document; blankNodeScope:string;
 axioms:OwlSpecialAxiom[]; malformed:RdfNode[];
}

/** Exposes OWL RDF encodings that must not be lowered into positive storage edges. */
export function getOwlSpecialAxioms(document:Document):OwlSpecialAxiomView {
 const source=copyJson(document) as unknown as Document, qs=getOwlQuads(source);
 const bySubject=new Map<string,{node:RdfNode; rows:{q:RdfQuad;i:number}[]}>();
 for(const [i,q] of qs.entries()) { const k=key(q.subject); const s=bySubject.get(k)??{node:q.subject,rows:[]}; s.rows.push({q,i}); bySubject.set(k,s); }
 const malformed:RdfNode[]=[], axioms:OwlSpecialAxiom[]=[];
 const values=(rows:{q:RdfQuad;i:number}[],predicate:string)=>rows.filter(r=>r.q.predicate.value===predicate).map(r=>r.q.object);
 const distinct=(terms:Term[])=>[...new Map(terms.map(t=>[key(t),t])).values()];
 function list(head:Term):Term[] {
  const out:Term[]=[], seen=new Set<string>(); let cell=head;
  while(!(cell.kind==='iri'&&cell.value===RDF+'nil')) {
   if(cell.kind==='literal'||seen.has(key(cell))||seen.size>=10000) throw new UmfError('OWL_AXIOM_LIST','Malformed or overlong OWL axiom list');
   seen.add(key(cell)); const rows=bySubject.get(key(cell))?.rows??[];
   const first=distinct(values(rows,RDF+'first')), rest=distinct(values(rows,RDF+'rest'));
   if(first.length!==1||rest.length!==1) throw new UmfError('OWL_AXIOM_LIST','OWL axiom list cells require exactly one rdf:first and rdf:rest');
   out.push(first[0]!); cell=rest[0]!;
  }
  const tail=bySubject.get(key(cell))?.rows??[];
  if(values(tail,RDF+'first').length||values(tail,RDF+'rest').length) throw new UmfError('OWL_AXIOM_LIST','rdf:nil must not have list properties');
  return out;
 }
 for(const s of bySubject.values()) {
  const types=distinct(values(s.rows,RDF+'type')).filter(t=>t.kind==='iri').map(t=>(t as RdfNode).value);
  const special=types.filter(t=>[OWL+'NegativePropertyAssertion',OWL+'AllDifferent',OWL+'AllDisjointClasses',OWL+'AllDisjointProperties'].includes(t));
  if(!special.length) continue;
  try {
   if(special.length!==1) throw new UmfError('OWL_AXIOM_SHAPE','A special OWL axiom has multiple special types');
   const type=special[0]!;
   if(type===OWL+'NegativePropertyAssertion') {
    const sourceI=distinct(values(s.rows,OWL+'sourceIndividual')), prop=distinct(values(s.rows,OWL+'assertionProperty'));
    const targetI=distinct(values(s.rows,OWL+'targetIndividual')), targetV=distinct(values(s.rows,OWL+'targetValue'));
    if(sourceI.length!==1||sourceI[0]!.kind==='literal'||prop.length!==1||prop[0]!.kind==='literal'||targetI.length+targetV.length!==1) throw new UmfError('OWL_AXIOM_SHAPE','Negative property assertion requires one resource source, resource property expression and one target');
    const target=targetI[0]??targetV[0]!;
    if(targetI.length&&target.kind==='literal') throw new UmfError('OWL_AXIOM_SHAPE','targetIndividual must be an RDF resource');
    if(targetV.length&&(target.kind!=='literal'||prop[0]!.kind!=='iri')) throw new UmfError('OWL_AXIOM_SHAPE','Data assertion requires a literal targetValue and IRI property');
    axioms.push({kind:'negativePropertyAssertion',node:s.node,sourceIndividual:sourceI[0] as RdfNode,assertionProperty:prop[0] as RdfNode,target,targetKind:targetI.length?'individual':'value',quadIndexes:s.rows.map(r=>r.i)});
   } else {
    const memberPred=type===OWL+'AllDifferent'?[OWL+'members',OWL+'distinctMembers']:[OWL+'members'];
    const candidates=memberPred.flatMap(p=>distinct(values(s.rows,p)).map(value=>({p,value})));
    if(candidates.length!==1) throw new UmfError('OWL_AXIOM_SHAPE','N-ary OWL axiom requires exactly one member list');
    const members=list(candidates[0]!.value);
    if(members.length<2) throw new UmfError('OWL_AXIOM_SHAPE','N-ary OWL axiom requires at least two members');
    if(members.some(t=>t.kind==='literal')) throw new UmfError('OWL_AXIOM_SHAPE','N-ary axiom members must be resources');
    axioms.push({kind:type===OWL+'AllDifferent'?'allDifferent':type===OWL+'AllDisjointClasses'?'allDisjointClasses':'allDisjointProperties',node:s.node,members,memberPredicate:candidates[0]!.p.endsWith('distinctMembers')?'distinctMembers':'members',quadIndexes:s.rows.map(r=>r.i)});
   }
  } catch(error) { if(!(error instanceof UmfError)) throw error; malformed.push(s.node); }
 }
 const payload=source.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions['umf.owl'] as any;
 return copyJson({profile:'owl-special-axioms-1',complete:false,source,blankNodeScope:payload.blankNodeScope,axioms,malformed}) as unknown as OwlSpecialAxiomView;
}
