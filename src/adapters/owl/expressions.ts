import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import type {RdfNode,RdfLiteral} from '../rdf';
import {getOwlQuads} from './index';
type Term=RdfNode|RdfLiteral;
const OWL='http://www.w3.org/2002/07/owl#',RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const key=(v:Term)=>JSON.stringify(v.kind==='literal'?[v.kind,v.value,v.datatype,v.language??'']:[v.kind,v.value]);
export type OwlExpressionDescription=
 |{kind:'reference';node:RdfNode}
 |{kind:'intersectionOf'|'unionOf'|'oneOf';node:RdfNode;members:Term[]}
 |{kind:'complementOf'|'datatypeComplementOf'|'inverseOf';node:RdfNode;operand:Term}
 |{kind:'restriction';node:RdfNode;properties:Term[];facets:{predicate:string;values:Term[]}[]}
 |{kind:'datatypeRestriction';node:RdfNode;datatype:Term;facets:{node:RdfNode;statements:{predicate:string;values:Term[]}[]}[]}
 |{kind:'unrecognized';node:RdfNode};
export interface OwlExpressionView {profile:'owl-expression-1';complete:false;source:Document;blankNodeScope:string;expression:OwlExpressionDescription;quadIndexes:number[]}
/** Local RDF constructor view, not a recursive OWL DL parse or a reasoning result. */
export function getOwlExpressionView(document:Document,node:RdfNode):OwlExpressionView{
 if(!node||!['iri','blank'].includes(node.kind)||typeof node.value!=='string')throw new UmfError('OWL_EXPRESSION','Expected a source-scoped RDF resource');
 const source=copyJson(document) as unknown as Document,qs=getOwlQuads(source),index=new Map<string,Map<string,Term[]>>();
 for(const q of qs){const k=key(q.subject),props=index.get(k)??new Map<string,Term[]>(),values=props.get(q.predicate.value)??[];if(!values.some(v=>key(v)===key(q.object)))values.push(q.object);props.set(q.predicate.value,values);index.set(k,props);}
 const values=(n:Term,p:string)=>index.get(key(n))?.get(p)??[];
 const fail=(message:string):never=>{throw new UmfError('OWL_EXPRESSION',message);};
 const one=(n:Term,p:string):Term=>{const vs=values(n,p);if(vs.length!==1)fail('Expected exactly one '+p);return vs[0]!;};
 let work=0;
 function list(head:Term):Term[]{const members:Term[]=[],seen=new Set<string>();let cell=head;
 while(!(cell.kind==='iri'&&cell.value===RDF+'nil')){if(++work>10000)fail('Expression lists exceed 10,000 cells');if(cell.kind==='literal'||seen.has(key(cell)))fail('Literal or cyclic expression list cell');seen.add(key(cell));members.push(one(cell,RDF+'first'));cell=one(cell,RDF+'rest');}
 if(values(cell,RDF+'first').length||values(cell,RDF+'rest').length)fail('rdf:nil has list structure');return members;
 }
 const constructors=['intersectionOf','unionOf','oneOf','complementOf','datatypeComplementOf','inverseOf','onDatatype'].filter(p=>values(node,OWL+p).length);
 const restriction=values(node,RDF+'type').some(t=>t.kind==='iri'&&t.value===OWL+'Restriction')||values(node,OWL+'onProperty').length>0||values(node,OWL+'onProperties').length>0;
 if(constructors.length+Number(restriction)>1)fail('Multiple expression constructors require explicit disambiguation');
 let expression:OwlExpressionDescription;
 const c=constructors[0];
 if(c==='intersectionOf'||c==='unionOf'||c==='oneOf')expression={kind:c,node,members:list(one(node,OWL+c))};
 else if(c==='complementOf'||c==='datatypeComplementOf'||c==='inverseOf')expression={kind:c,node,operand:one(node,OWL+c)};
 else if(c==='onDatatype'){
 const facets=list(one(node,OWL+'withRestrictions')).map(t=>{if(t.kind==='literal')return fail('Datatype facet must be an RDF resource');return {node:t,statements:[...(index.get(key(t))??new Map<string,Term[]>())].map(([predicate,values])=>({predicate,values}))};});
 expression={kind:'datatypeRestriction',node,datatype:one(node,OWL+c),facets};
 }else if(restriction){const p=values(node,OWL+'onProperty'),ps=values(node,OWL+'onProperties');if(p.length+ps.length!==1)fail('Restriction needs exactly one onProperty or onProperties');
 const facets=['someValuesFrom','allValuesFrom','hasValue','hasSelf','minCardinality','maxCardinality','cardinality','minQualifiedCardinality','maxQualifiedCardinality','qualifiedCardinality','onClass','onDataRange'].flatMap(p=>{const vs=values(node,OWL+p);return vs.length?[{predicate:OWL+p,values:vs}]:[];});
 expression={kind:'restriction',node,properties:p.length?p:list(ps[0]!),facets};
 }else expression={kind:node.kind==='iri'?'reference':'unrecognized',node};
 const payload=source.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions['umf.owl'] as any;
 return copyJson({profile:'owl-expression-1',complete:false,source,blankNodeScope:payload.blankNodeScope,expression,quadIndexes:qs.flatMap((q,i)=>key(q.subject)===key(node)?[i]:[])}) as unknown as OwlExpressionView;
}
