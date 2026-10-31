// Adapter for the explicit Rust-prepared `umf.typespec-host/1` request.
// This is the only layer that imports/executes the pinned TypeSpec compiler.
import {compileTypeSpecProgram} from './compiler';
import {extractTypeSpecGraph} from './typespec-host-graph';
import {executeTypeSpecParserRequest} from './typespec-host-parser';
import {getSourceLocation} from '@typespec/compiler';

type CompilerRequest = {profile:'umf.typespec-host/1';operation:'compile'|'semanticGraph'|'emitJsonSchema';entrypoint:string;files:Record<string,string>;libraries:Record<string,string>;roots?:string[];emitter?:'@typespec/json-schema@1.16.0';options?:Record<string,unknown>};
type ParserRequest = {profile:'umf.typespec-parser-host/1';operation:'inspect';files:Record<string,string>}|{profile:'umf.typespec-parser-host/1';operation:'syntax';source:string};
type Request=CompilerRequest|ParserRequest;

/** Execute only a Rust-admitted, closed request against the pinned virtual compiler host. */
export async function executeTypeSpecHostRequest(input:Request,hostWork?:(units:number)=>void):Promise<unknown>{
  if(input?.profile==='umf.typespec-parser-host/1')return executeTypeSpecParserRequest(input,hostWork);
  if(!input||input.profile!=='umf.typespec-host/1'||!['compile','semanticGraph','emitJsonSchema'].includes(input.operation))throw new TypeError('Invalid Rust-prepared TypeSpec request');
  for(const [path,source] of Object.entries(input.files))hostWork?.(path.length+source.length+1);
  for(const [name,version] of Object.entries(input.libraries))hostWork?.(name.length+version.length+1);
  hostWork?.(input.entrypoint.length+1);
  const report=(program:Awaited<ReturnType<typeof compileTypeSpecProgram>>)=>({valid:!program.hasError(),diagnostics:program.diagnostics.map(d=>{const at=getSourceLocation(d.target);const item={code:d.code,severity:d.severity==='error'?'error' as const:'warning' as const,message:d.message,...(at?{file:at.file.path,start:at.pos,end:at.end}:{})};hostWork?.(item.code.length+item.message.length+(item.file?.length??0)+1);return item;})});
  if(input.operation==='compile')return report(await compileTypeSpecProgram(input.files,input.entrypoint,input.libraries));
  if(input.operation==='semanticGraph'){
    const program=await compileTypeSpecProgram(input.files,input.entrypoint,input.libraries);
    const compilation=report(program);
    const graph=compilation.valid?extractTypeSpecGraph(program,input.roots!,hostWork):{roots:[],nodes:[]};
    return {valid:compilation.valid,diagnostics:compilation.diagnostics,roots:graph.roots,nodes:graph.nodes};
  }
  if(input.emitter!=='@typespec/json-schema@1.16.0')throw new TypeError('Unexpected TypeSpec emitter capability');
  const files:Record<string,string>=Object.create(null);
  const program=await compileTypeSpecProgram(input.files,input.entrypoint,input.libraries,{options:input.options as never,outputs:files});
  const compilation=report(program);
  return {valid:compilation.valid,diagnostics:compilation.diagnostics,files:compilation.valid?files:{}};
}
