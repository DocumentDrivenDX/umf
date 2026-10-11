import {UmfError} from '../../model/types';
import type {RdfQuad,RdfNode,RdfLiteral} from '../rdf';
const RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#',SH='http://www.w3.org/ns/shacl#';
type Term=RdfNode|RdfLiteral;
const key=(t:Term)=>JSON.stringify(t.kind==='literal'?[t.kind,t.value,t.datatype,t.language??'']:[t.kind,t.value]);
/** Check list structure before a native reader can silently treat malformed input as empty. */
export function checkShaclConstraintLists(quads:RdfQuad[]):void{
 const uses=new Set(['in','languageIn','ignoredProperties','and','or','xone'].map(n=>SH+n));
 const cells=new Map<string,{first:Map<string,Term>;rest:Map<string,Term>}>();
 for(const q of quads){if(q.predicate.value!==RDF+'first'&&q.predicate.value!==RDF+'rest')continue;
 const id=key(q.subject),cell=cells.get(id)??{first:new Map(),rest:new Map()};
 cell[q.predicate.value===RDF+'first'?'first':'rest'].set(key(q.object),q.object);cells.set(id,cell);
 }
 const checked=new Set<string>();let work=0;
 const fail=(message:string):never=>{throw new UmfError('SHACL_LIST',message);};
 for(const q of quads){if(!uses.has(q.predicate.value))continue;let node:Term=q.object;const seen=new Set<string>();
 while(true){if(++work>100000)fail('Constraint list traversal exceeds 100,000 steps');
 if(node.kind==='literal')fail('Constraint list cells must be IRIs or blank nodes');
 const id=key(node),cell=cells.get(id);
 if(node.kind==='iri'&&node.value===RDF+'nil'){if(cell)fail('rdf:nil must not have rdf:first or rdf:rest');break;}
 if(checked.has(id))break;if(seen.has(id))fail('Constraint list has a cycle');seen.add(id);
 if(!cell||cell.first.size!==1||cell.rest.size!==1)fail('Each constraint list cell needs exactly one rdf:first and rdf:rest');
 node=cell!.rest.values().next().value!;
 }
 for(const id of seen)checked.add(id);
 }
}
