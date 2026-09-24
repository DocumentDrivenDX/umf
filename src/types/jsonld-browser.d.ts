declare module 'jsonld' {
 interface Processor {toRDF(input:unknown,options:Record<string,unknown>):Promise<unknown>;fromRDF(input:unknown,options:Record<string,unknown>):Promise<unknown>;frame(input:unknown,frame:unknown,options:Record<string,unknown>):Promise<unknown>;():Processor;expand(input:unknown,options:Record<string,unknown>):Promise<unknown>;flatten(input:unknown,context:unknown,options:Record<string,unknown>):Promise<unknown>;compact(input:unknown,context:unknown,options:Record<string,unknown>):Promise<unknown>}
 const jsonld:Processor;
 export default jsonld;
}
declare module 'jsonld/lib/flatten' {export function flatten(input:unknown):unknown}
