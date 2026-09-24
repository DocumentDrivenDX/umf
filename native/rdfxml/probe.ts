// Development-only parser experiment. Not exported by the UMF browser library.
import {RdfXmlParser} from 'rdfxml-streaming-parser';
import {Writer,Parser} from 'n3';
import {LiteralParser} from './literal-parser';
export type Profile='baseline'|'finalized'|'literal-namespaces'|'literal-repair';
class FinalizedParser extends RdfXmlParser {
 _flush(callback:(error?:Error|null)=>void){
  // Pinned 3.3.0 does not finalize its internal SAX parser on stream end.
  // This experiment uses a private member; no public adapter relies on it.
  try{(this as any).saxParser.close();callback();}catch(error){callback(error as Error);}
 }
}
export function probeGraphSignature(text:string):string {
 const blanks=new Map<string,number>();
 const term=(t:any):unknown=>{if(t.termType==='BlankNode'){if(!blanks.has(t.value))blanks.set(t.value,blanks.size);return ['blank',blanks.get(t.value)];}return t.termType==='Literal'?['literal',t.value,t.datatype.value,t.language]:[t.termType,t.value];};
 return JSON.stringify(new Parser({format:'N-Quads',blankNodePrefix:''}).parse(text).map(q=>[q.subject,q.predicate,q.object,q.graph].map(term)));
}
export async function probeRdfXml(input:string,baseIRI:string,profile:Profile){
 return new Promise<{accepted:boolean;emitted:number;nquads?:string;error?:string}>(resolve=>{
  const Parser=profile==='baseline'?RdfXmlParser:profile==='literal-repair'?LiteralParser:FinalizedParser;
  const p=new Parser({baseIRI,trackPosition:true,includeXmlNamespacesInLiterals:profile==='literal-namespaces'}),quads:any[]=[];let finished=false;
  const fail=(error:unknown)=>{if(finished)return;finished=true;resolve({accepted:false,emitted:quads.length,error:String(error)});p.destroy();};
  p.on('data',q=>quads.push(q));p.on('error',fail);p.on('end',()=>{if(finished)return;try{const nquads=new Writer({format:'N-Quads'}).quadsToString(quads);finished=true;resolve({accepted:true,emitted:quads.length,nquads});}catch(error){fail(error);}});
  try{p.end(input);}catch(error){fail(error);}
 });
}
