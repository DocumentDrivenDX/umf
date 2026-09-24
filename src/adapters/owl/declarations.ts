import {copyJson} from '../../model/json';
import type {Document} from '../../model/types';
import type {RdfNode} from '../rdf';
import {getOwlQuads,OWL_EXTENSION} from './index';

export type OwlEntityKind='class'|'datatype'|'objectProperty'|'dataProperty'|'annotationProperty'|'namedIndividual';
export interface OwlDeclaration {node:RdfNode;kind:OwlEntityKind;quadIndexes:number[]}
export interface OwlDeclarationView {
 profile:'owl-declarations-1';complete:false;source:Document;blankNodeScope:string;
 declarations:OwlDeclaration[];anonymousTypeAssertions:OwlDeclaration[];
}
const OWL='http://www.w3.org/2002/07/owl#';
const kinds=new Map<string,OwlEntityKind>([
 [OWL+'Class','class'],['http://www.w3.org/2000/01/rdf-schema#Datatype','datatype'],
 [OWL+'ObjectProperty','objectProperty'],[OWL+'DatatypeProperty','dataProperty'],
 [OWL+'AnnotationProperty','annotationProperty'],[OWL+'NamedIndividual','namedIndividual'],
]);
/** Explicit graph declarations only; multiple roles remain separate and unvalidated. */
export function getOwlDeclarations(document:Document):OwlDeclarationView {
 const source=copyJson(document) as unknown as Document,quads=getOwlQuads(source);
 const records=new Map<string,OwlDeclaration>();
 for(const [i,q] of quads.entries()) {
  if(q.predicate.value!=='http://www.w3.org/1999/02/22-rdf-syntax-ns#type'||q.object.kind!=='iri')continue;
  const kind=kinds.get(q.object.value);if(!kind)continue;
  const key=JSON.stringify([q.subject.kind,q.subject.value,kind]);
  const record=records.get(key)??{node:q.subject,kind,quadIndexes:[]};
  record.quadIndexes.push(i);records.set(key,record);
 }
 const payload=source.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions[OWL_EXTENSION] as any;
 return copyJson({profile:'owl-declarations-1',complete:false,source,blankNodeScope:payload.blankNodeScope,
  declarations:[...records.values()].filter(r=>r.node.kind==='iri'),
  anonymousTypeAssertions:[...records.values()].filter(r=>r.node.kind==='blank')}) as unknown as OwlDeclarationView;
}
