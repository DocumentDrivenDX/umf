import SHACLValidator from 'rdf-validate-shacl';
import {installExactShaclNumbers} from './numeric';
import {installShaclStrings} from './strings';
import {checkShaclConstraintLists} from './lists';
import {DataFactory,Store,Writer} from 'n3/browser/n3.esm.min.js';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import {getShaclQuads} from './index';
import {exportRdfTurtle,getRdfQuads,importRdfNQuads,type RdfNode,type RdfLiteral,type RdfQuad} from '../rdf';
export interface ShaclEngineReport {
 stringProfile:'umf-string-1';numericProfile:'umf-numeric-2';engine:'rdf-validate-shacl@0.6.5';blankNodePolicy:'disjoint-inputs'|'shared-scope';status:'evaluated'|'blocked';complete:false;
 shapes:Document;data:Document;engineConforms?:boolean;report?:Document;diagnostics:Diagnostic[];
}
/** Experimental engine evidence, NOT a UMF conformance verdict. All input meaning remains recoverable. */
export async function proposeShaclEngineValidation(shapes:Document,data:Document,options:{id:string;blankNodePolicy:'disjoint-inputs'|'shared-scope'}):Promise<ShaclEngineReport>{
 if(!options||typeof options.id!=='string'||!options.id.length||!['disjoint-inputs','shared-scope'].includes(options.blankNodePolicy))throw new UmfError('SHACL_OPTIONS','Expected nonempty report id and explicit blank-node policy');
 const r:ShaclEngineReport={stringProfile:'umf-string-1',numericProfile:'umf-numeric-2',engine:'rdf-validate-shacl@0.6.5',blankNodePolicy:options.blankNodePolicy,status:'blocked',complete:false,shapes:copyJson(shapes) as unknown as Document,data:copyJson(data) as unknown as Document,diagnostics:[{code:'SHACL_ENGINE_EXPERIMENTAL',path:'',severity:'warning',message:'Pinned engine with UMF numeric and string validators. Complete SHACL conformance, shape syntax checking, numeric fidelity and recursion semantics are not established. Do not treat engineConforms as a verified UMF conformance verdict.'}]};
 try{
  const sq=getShaclQuads(r.shapes);exportRdfTurtle(r.data);const dq=getRdfQuads(r.data);
  const unsupported=new Set(['http://www.w3.org/2002/07/owl#imports',...['entailment','sparql','js','target','rule'].map(n=>'http://www.w3.org/ns/shacl#'+n)]);
  if(sq.some(q=>unsupported.has(q.predicate.value)))throw new UmfError('SHACL_ENGINE_UNSUPPORTED','Imports, entailment, SPARQL, JS, custom targets and rules need a separate execution capability');
  function node(t:RdfNode|RdfLiteral,prefix:string):any {
   if(t.kind==='iri')return DataFactory.namedNode(t.value);if(t.kind==='blank')return DataFactory.blankNode(prefix+t.value);
   const literal=t as RdfLiteral;return DataFactory.literal(literal.value,literal.language??DataFactory.namedNode(literal.datatype));
  }
  const store=(qs:RdfQuad[],prefix:string)=>new Store(qs.map(q=>DataFactory.quad(node(q.subject,prefix),node(q.predicate,prefix),node(q.object,prefix))));
  const shapesScope=(r.shapes.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions['umf.shacl'] as any).blankNodeScope;
  const dataScope=(r.data.modules.find(m=>m.id==='dataset')!.elements.find(e=>e.id==='dataset')!.extensions['umf.rdf'] as any).blankNodeScope;
  if(options.blankNodePolicy==='shared-scope'&&shapesScope!==dataScope)throw new UmfError('SHACL_ENGINE_SCOPE','Shared policy requires the same explicit blankNodeScope in both graphs');
  // Reject cyclic shape/list dependencies rather than trusting the native recursion cutoff.
  const refs=new Set(['node','property','not','qualifiedValueShape','and','or','xone'].map(n=>'http://www.w3.org/ns/shacl#'+n));
  refs.add('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');refs.add('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
  const adjacency=new Map<string,string[]>(),termKey=(n:RdfNode)=>JSON.stringify([n.kind,n.value]);
  for(const q of sq)if(refs.has(q.predicate.value)&&q.object.kind!=='literal'){const k=termKey(q.subject),v=adjacency.get(k)??[];v.push(termKey(q.object));adjacency.set(k,v);}
  const active=new Set<string>(),done=new Set<string>();
  const visit=(k:string,depth:number)=>{if(active.has(k)||depth>128)throw new UmfError('SHACL_ENGINE_RECURSION','Cyclic or excessively deep shape/list dependencies require separate semantics');if(done.has(k))return;active.add(k);for(const n of adjacency.get(k)??[])visit(n,depth+1);active.delete(k);done.add(k);};
  for(const k of adjacency.keys())visit(k,0);
  checkShaclConstraintLists(sq);
  const validator=new SHACLValidator(store(sq,'s_'),{allowNamedNodeInList:true});
  installExactShaclNumbers(validator);
  installShaclStrings(validator);
  validator.validationEngine.maxNodeChecks=0;
  const native=await validator.validate(store(dq,options.blankNodePolicy==='shared-scope'?'s_':'d_'));
  const text=new Writer({format:'N-Quads'}).quadsToString([...native.dataset] as any);
  r.report=importRdfNQuads(text,{id:options.id,blankNodeScope:options.id});r.engineConforms=native.conforms;r.status='evaluated';
 }catch(error){r.diagnostics.push({code:'SHACL_ENGINE_BLOCKED',path:'',severity:'error',message:String(error)});}
 return r;
}
