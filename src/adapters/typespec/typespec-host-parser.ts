// Explicit synchronous parser capability for TypeSpec's pinned AST parser.
// Rust decides validation semantics; this host returns only parser diagnostics
// or the parser's syntax-node coordinates/kinds.
import {parse,visitChildren,SyntaxKind,type Node} from '@typespec/compiler/ast';

type Request =
  | {profile:'umf.typespec-parser-host/1';operation:'inspect';files:Record<string,string>}
  | {profile:'umf.typespec-parser-host/1';operation:'syntax';source:string};

export function executeTypeSpecParserRequest(request:Request,hostWork?:(units:number)=>void):unknown {
  if(!request||request.profile!=='umf.typespec-parser-host/1')throw new TypeError('Invalid Rust-prepared TypeSpec parser request');
  if(request.operation==='inspect'){
    const diagnostics=[] as {code:string;path:string;severity:'error'|'warning';message:string}[];
    for(const [path,source] of Object.entries(request.files)){
      hostWork?.(path.length+source.length);
      const parsed=parse(source,{comments:true,docs:true});
      for(const diagnostic of parsed.parseDiagnostics){
        hostWork?.(diagnostic.message.length+String(diagnostic.code).length+1);
        diagnostics.push({code:String(diagnostic.code),path,severity:diagnostic.severity==='error'?'error':'warning',message:diagnostic.message});
      }
    }
    return diagnostics;
  }
  if(request.operation==='syntax'){
    hostWork?.(request.source.length);
    const parsed=parse(request.source,{comments:true,docs:true});
    const nodes:{kind:string;start:number;end:number}[]=[];
    const walk=(node:Node,depth:number):void=>{
      if(depth>512||nodes.length>=1_000_000)throw new RangeError('TypeSpec syntax traversal exceeds host limit');
      const kind=SyntaxKind[node.kind];hostWork?.(kind.length+1);
      nodes.push({kind,start:node.pos,end:node.end});
      visitChildren(node,child=>{walk(child,depth+1);return undefined;});
    };
    walk(parsed,0);
    return {nodes};
  }
  throw new TypeError('Unknown TypeSpec parser operation');
}
