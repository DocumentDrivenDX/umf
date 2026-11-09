// SPDX-License-Identifier: MIT OR Apache-2.0
import {readdir,readFile} from 'node:fs/promises';
import {posix,resolve} from 'node:path';
import {createHash} from 'node:crypto';

// Authored external resources required to compile the Rust metamodel CLI.
// Keep this list shared by source fingerprinting and generated provenance.
export const rustCompileResources = [
  'spec/core/cardinality-operation-v6.schema.json',
  'spec/core/kind-operation-v8.schema.json',
  'spec/core/nullability-operation-v7.schema.json',
  'spec/extensions/tables/operation.schema.json',
];
// Rust packages compiled into the source-bound bootstrap executable.
export const rustCompilePackages = [
  'crates/umf-core',
  'crates/umf-metamodel',
  'crates/umf-tagged-wire',
  'crates/umf-metamodel-cli',
];

export const runtimeCodegenData = 'crates/umf-core/src/canonical_codegen_literals.rs';
export const rustFeatureBoundaryFiles = [
  'Cargo.toml', 'Cargo.lock', '.cargo/config.toml',
  'crates/umf-core/Cargo.toml',
  'crates/umf-metamodel/Cargo.toml',
  'crates/umf-metamodel-cli/Cargo.toml',
  'crates/umf-tagged-wire/Cargo.toml',
  'crates/umf-core-wire/Cargo.toml',
] as const;
const runtimeConsumerPins:Record<string,string>={
  'crates/umf-core-wire/src/lib.rs':'8c9696ea55e8553609facc33ddfb863598c1ebdb72154d717364ae0a0741d682',
  'crates/umf-core-wire/src/installed_codegen_factory_independent_tests.rs':'71a821a4bc4898010ca68cc46d4df4b0c5e69fb8923e791a139edd7cdaa091b3',
};

const boundarySha256: Record<string,string> = {
  'Cargo.toml':'2732f746532ffa1767f0c8e4cdc2851a5354fe07f72b1cacf372a8c9d3cf4217',
  'Cargo.lock':'c7777063f16762bea888aacefdf74fe6628ae65fbeae9db9cd907e0fd412145f',
  '.cargo/config.toml':'84fd4fa17fd967cae6006ba1b0dc430904239dec921c1441dd657387ee802d6c',
  'crates/umf-core/Cargo.toml':'b84949f42da22ae01277d1b8fe38391ee1dfb98e372a5a0ad785195b75e9d7c5',
  'crates/umf-metamodel/Cargo.toml':'7e77bc5f1a4af48537e02537936e6721e052200e6a9ed4ca8c76cc7916e056ed',
  'crates/umf-metamodel-cli/Cargo.toml':'51afdafc62d8e5fea67c771a6c41716e5818d59a50c202f01a965f3d7f2702a3',
  'crates/umf-tagged-wire/Cargo.toml':'8574d1b8592dbb38e4c07f030bcf468d0e474a20c1bed9de0f4023cf6323ba2e',
  'crates/umf-core-wire/Cargo.toml':'e1171263903df13fa11c1a7470c6cde5fc94f67a2f18dc06ab88e836943abf0f',
  'crates/umf-core/src/lib.rs':'ae6eef2068889cdba3b34198bd37030567f1dc20909f398c12054d194028ffe0',
  'crates/umf-core/src/canonical_codegen_resources.rs':'bfacfdd785bfbc249a0dbc47167f0cc76d316b298653fb1f332506bc58b596e6',
};
const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');

export type SourcePartition = { compilerInputs: string[]; workspaceInputs: string[] };
export type SourceBoundary = {
  cargoInputs: Array<{path:string;source:string}>;
  featureOverrides: Record<string,string|undefined>;
  coreLib: string;
  canonicalResources: string;
  rustSources: Array<{path:string;source:string}>;
};

async function walk(root:string,path:string,skip:Set<string>,files:string[]):Promise<void> {
  for (const entry of await readdir(resolve(root,path),{withFileTypes:true})) {
    if (skip.has(entry.name)) continue;
    const child=path+'/'+entry.name;
    if (entry.isDirectory()) await walk(root,child,skip,files);
    else if (entry.isFile()) files.push(child);
  }
}

export async function collectSourceRosters(root:string):Promise<{compilerFiles:string[];workspaceFiles:string[]}> {
  const compilerFiles=['Cargo.toml','Cargo.lock','rust-toolchain.toml','.cargo/config.toml',...rustCompileResources];
  for (const dir of rustCompilePackages) await walk(root,dir,new Set(['target','node_modules','.git','__pycache__']),compilerFiles);
  const workspaceFiles=['.cargo/config.toml'];
  for (const path of ['crates','bindings']) {
    const collected:string[]=[];
    await walk(root,path,new Set(['target','node_modules','.git','__pycache__','.venv']),collected);
    workspaceFiles.push(...collected.filter(child=>!(child.startsWith('bindings/') &&
      (/(?:^|\/)wasm\/pkg(?:\/|$)/.test(child)||/\.(?:node|so|dylib|dll|pyd|wasm|pyc)$/i.test(child)))));
  }
  return {compilerFiles:compilerFiles.sort(),workspaceFiles:workspaceFiles.sort()};
}

export async function loadSourceBoundary(root:string,rustSourcePaths:readonly string[],environment:Record<string,string|undefined>):Promise<SourceBoundary> {
  const cargoInputs=await Promise.all(rustFeatureBoundaryFiles.map(async path=>({path,source:await readFile(resolve(root,path),'utf8')})));
  const rustSources=await Promise.all([...new Set(rustSourcePaths)].sort().map(async path=>({path,source:await readFile(resolve(root,path),'utf8')})));
  const featureOverrides=Object.fromEntries(Object.entries(environment).filter(([name])=>
    name==='RUSTFLAGS'||name==='CARGO_ENCODED_RUSTFLAGS'||name==='CARGO_BUILD_RUSTFLAGS'||name==='CARGO_BUILD_TARGET'||/^CARGO_TARGET_.+_RUSTFLAGS$/.test(name)));
  return {
    cargoInputs,featureOverrides,
    coreLib:await readFile(resolve(root,'crates/umf-core/src/lib.rs'),'utf8'),
    canonicalResources:await readFile(resolve(root,'crates/umf-core/src/canonical_codegen_resources.rs'),'utf8'),
    rustSources,
  };
}

function withoutRustComments(source:string):string {
  let out='',i=0;
  while (i<source.length) {
    if (source.startsWith('//',i)) { while(i<source.length&&source[i]!=='\n') i++; out+=' '; continue; }
    if (source.startsWith('/*',i)) {
      i+=2; let depth=1;
      while(i<source.length&&depth){if(source.startsWith('/*',i)){depth++;i+=2;}else if(source.startsWith('*/',i)){depth--;i+=2;}else i++;}
      out+=' '; continue;
    }
    const raw=source.slice(i).match(/^(?:br|cr|r)(#*)"/);
    if(raw){const end='"'+raw[1];const start=i;i+=raw[0].length;const close=source.indexOf(end,i);i=close<0?source.length:close+end.length;out+=source.slice(start,i);continue;}
    if(source[i]==='"') { const start=i++; while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i++]==='"')break;}out+=source.slice(start,i);continue; }
    if(source[i]==="'") { let j=i+1;if(source[j]==='\\')j+=2;else j++;if(source[j]==="'"){out+=source.slice(i,j+1);i=j+1;continue;} }
    out+=source[i++];
  }
  return out;
}

function rustPathLiteral(expression:string):string|undefined {
  const value=expression.trim();
  const ordinary=value.match(/^"([^"\\]*)"$/);
  if(ordinary)return ordinary[1];
  const raw=value.match(/^r(#{0,})"([\s\S]*)"\1$/);
  if(raw)return raw[2];
  return undefined;
}

function rustRelativeTarget(sourcePath:string,literal:string):string|undefined {
  // Reject spellings whose platform-dependent or escaped meaning cannot be
  // reproduced by this source-only guard. Rust path literals are UTF-8.
  if(!literal||literal.includes('\\')||literal.includes('\0')||literal.startsWith('/')||/^[A-Za-z]:/.test(literal))return undefined;
  const target=posix.normalize(posix.join(posix.dirname(sourcePath),literal));
  return target.startsWith('../')||target==='..'?undefined:target;
}

const closingDelimiter:Record<string,string>={'(':')','[':']','{':'}'};

function skipRustLiteral(source:string,index:number):number|undefined {
  const raw=source.slice(index).match(/^(?:br|cr|r)(#*)"/);
  if(raw){const closing='"'+raw[1],end=source.indexOf(closing,index+raw[0].length);return end<0?undefined:end+closing.length;}
  if(source[index]==='"'){
    let i=index+1;
    while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i++]==='"')return i;}
    return undefined;
  }
  if(source[index]==="'"){
    let end=index+1;
    if(source[end]==='\\')end+=2;else end+=String.fromCodePoint(source.codePointAt(end)??0).length;
    if(source[end]==="'")return end+1;
  }
  return index;
}

function delimitedContent(source:string,open:number):{content:string;end:number}|undefined {
  const first=source[open],close=closingDelimiter[first];
  if(!close)return undefined;
  const stack=[close];
  for(let i=open+1;i<source.length;i++){
    const afterLiteral=skipRustLiteral(source,i);
    if(afterLiteral===undefined)return undefined;
    if(afterLiteral!==i){i=afterLiteral-1;continue;}
    const char=source[i];
    if(closingDelimiter[char])stack.push(closingDelimiter[char]);
    else if(char===')'||char===']'||char==='}'){
      if(stack.pop()!==char)return undefined;
      if(stack.length===0)return {content:source.slice(open+1,i),end:i+1};
    }
  }
  return undefined;
}

function splitTopLevel(source:string):string[]|undefined {
  const parts:string[]=[];let start=0;
  for(let i=0;i<source.length;i++){
    const afterLiteral=skipRustLiteral(source,i);
    if(afterLiteral===undefined)return undefined;
    if(afterLiteral!==i){i=afterLiteral-1;continue;}
    if(closingDelimiter[source[i]]){
      const nested=delimitedContent(source,i);
      if(!nested)return undefined;
      i=nested.end-1;continue;
    }
    if(source[i]===',' ){parts.push(source.slice(start,i).trim());start=i+1;}
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function includeExpressions(source:string):Array<{macro:string;path:string}>|undefined {
  const expressions:Array<{macro:string;path:string}>=[];
  const start=/\b(include(?:_str|_bytes)?)\s*!\s*([([{])/g;
  for(let match;(match=start.exec(source));){
    const parsed=delimitedContent(source,start.lastIndex-1);
    if(!parsed)return undefined;
    const path=rustPathLiteral(parsed.content);
    if(path===undefined)return undefined;
    expressions.push({macro:match[1],path});start.lastIndex=parsed.end;
  }
  return expressions;
}

function pathMetaItems(meta:string):string[]|undefined {
  const value=meta.trim();
  const pathMeta=value.match(/^path\s*=\s*([\s\S]+)$/);
  if(pathMeta){const path=rustPathLiteral(pathMeta[1]);return path===undefined?undefined:[path];}
  const cfg=value.match(/^cfg_attr\s*\(/);
  if(!cfg)return [];
  const open=value.indexOf('(',cfg[0].length-1),parsed=delimitedContent(value,open);
  if(!parsed||value.slice(parsed.end).trim())return undefined;
  const items=splitTopLevel(parsed.content);
  if(!items||items.length<2)return undefined;
  const paths:string[]=[];
  for(const item of items.slice(1)){
    const nested=pathMetaItems(item);
    if(!nested)return undefined;
    paths.push(...nested);
  }
  return paths;
}

function pathAttributes(source:string):string[]|undefined {
  const paths:string[]=[];
  const start=/\#\s*!?\s*\[/g;
  for(let match;(match=start.exec(source));){
    const open=start.lastIndex-1,parsed=delimitedContent(source,open);
    if(!parsed)return undefined;
    const found=pathMetaItems(parsed.content);
    if(!found)return undefined;
    paths.push(...found);start.lastIndex=parsed.end;
  }
  return paths;
}

/** Partition the single proven DATA leaf, retaining every path in full custody. */
export function partitionRustSources(compilerFiles:readonly string[],workspaceFiles:readonly string[],boundary:SourceBoundary):SourcePartition {
  const candidate=runtimeCodegenData;
  if(compilerFiles.filter(path=>path===candidate).length!==1||workspaceFiles.filter(path=>path===candidate).length!==1||
    new Set(compilerFiles).size!==compilerFiles.length||new Set(workspaceFiles).size!==workspaceFiles.length)
    throw Error('METAMODEL_SOURCE_PARTITION_ROSTER');
  const expectedRustSources=[...new Set([...compilerFiles,...workspaceFiles])].filter(path=>path.endsWith('.rs')).sort();
  if(JSON.stringify(boundary.rustSources.map(file=>file.path).sort())!==JSON.stringify(expectedRustSources))
    throw Error('METAMODEL_SOURCE_PARTITION_RUST_ROSTER');
  if(boundary.cargoInputs.length!==rustFeatureBoundaryFiles.length||new Set(boundary.cargoInputs.map(file=>file.path)).size!==rustFeatureBoundaryFiles.length)
    throw Error('METAMODEL_SOURCE_PARTITION_CARGO_ROSTER');
  for(const path of rustFeatureBoundaryFiles){
    const file=boundary.cargoInputs.find(entry=>entry.path===path);
    if(!file||sha256(file.source)!==boundarySha256[path])throw Error('METAMODEL_SOURCE_PARTITION_CARGO_BOUNDARY '+path);
  }
  if(Object.entries(boundary.featureOverrides).some(([,value])=>value!==undefined&&value!==''))
    throw Error('METAMODEL_SOURCE_PARTITION_FEATURE_OVERRIDE');
  if(sha256(boundary.coreLib)!==boundarySha256['crates/umf-core/src/lib.rs']||
    sha256(boundary.canonicalResources)!==boundarySha256['crates/umf-core/src/canonical_codegen_resources.rs'])
    throw Error('METAMODEL_SOURCE_PARTITION_MODULE_BOUNDARY');

  const references:Array<{path:string;kind:string}> = [];
  for(const {path,source} of boundary.rustSources){
    const code=withoutRustComments(source);
    const names=code.match(/\bcanonical_codegen_resources\b/g)??[];
    for(const name of names)references.push({path,kind:name});
    const attributes=pathAttributes(code);
    if(!attributes)throw Error('METAMODEL_SOURCE_PARTITION_UNKNOWN_PATH '+path);
    for(const literal of attributes){
      const target=rustRelativeTarget(path,literal);
      if(target===undefined)throw Error('METAMODEL_SOURCE_PARTITION_UNRESOLVED_PATH '+path);
      if(target===candidate)references.push({path,kind:'path:'+target});
    }
    // Only compiler-closure includes can affect the reduced bootstrap graph.
    // Any source that directly names the runtime module is checked too.
    if(compilerFiles.includes(path)||names.length>0||/canonical_codegen/i.test(code)){
      const includes=includeExpressions(code);
      if(!includes)throw Error('METAMODEL_SOURCE_PARTITION_UNKNOWN_INCLUDE '+path);
      for(const include of includes){
        const target=rustRelativeTarget(path,include.path);
        if(target===undefined)throw Error('METAMODEL_SOURCE_PARTITION_UNRESOLVED_INCLUDE '+path);
        if(target===candidate)references.push({path,kind:include.macro+':'+target});
      }
    }
  }
  const expected=[
    {path:'crates/umf-core/src/canonical_codegen_resources.rs',kind:'path:'+candidate},
    {path:'crates/umf-core/src/lib.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/installed_codegen_factory_independent_tests.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/lib.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/lib.rs',kind:'canonical_codegen_resources'},
  ];
  references.sort((a,b)=>a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind));
  expected.sort((a,b)=>a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind));
  if(JSON.stringify(references)!==JSON.stringify(expected))throw Error('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  for(const [path,pin] of Object.entries(runtimeConsumerPins)){
    const source=boundary.rustSources.find(file=>file.path===path)?.source;
    if(!source||sha256(source)!==pin)throw Error('METAMODEL_SOURCE_PARTITION_RUNTIME_CONSUMER '+path);
  }
  const compilerInputs=compilerFiles.filter(path=>path!==candidate);
  const workspaceInputs=workspaceFiles.filter(path=>!compilerFiles.includes(path)||path===candidate);
  return {compilerInputs,workspaceInputs};
}

export function assertStableSourcePartition(before:SourcePartition,after:SourcePartition):void {
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('METAMODEL_SOURCE_PARTITION_CHANGED_DURING_GENERATION');
}
