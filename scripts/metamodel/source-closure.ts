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
  'crates/umf-core/src/value.rs':'f0eab222652b0f735c05d347325a50227b1c0867971d995c1ba798a2af04e228',
  'crates/umf-core/src/engine.rs':'e3ea4ae4d0705c5d644fe8e0385fe56756b5de9d232d1b426d733870eaaafb6f',
  'crates/umf-core/src/schema_admitted_bank.rs':'009c842d597578cc437a6fc0b2d1f37cea662f505dcae6e5ae33091e20756247',
  'crates/umf-core/src/schema_preflight_reference_independent_tests.rs':'8ad286496d348c0b36b2110446888b28473a528bb765949954d214c57bb081cb',
  'crates/umf-core-wire/src/lib.rs':'cc551dd17707556af445e709e077a9db2a617ef12769ecd5914ebe7055859116',
  'crates/umf-core-wire/src/codegen.rs':'dbd036a2ceb42f421bea8c992365e6285d0cbe8f0ea1b568566d9d0d5cc53887',
  'crates/umf-core-wire/src/installed_codegen_factory_independent_tests.rs':'0987d66aff572e78e1eb0177d13837d48f02577137c8e1921e1a3fc381b3d25d',
  'crates/umf-codegen/src/resources.rs':'6185a6bcaa050436aca04cea56f15836ead043b28aa2b9f140193c0152dec1bd',
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
  'crates/umf-core/src/canonical_codegen_resources.rs':'285337fae52121694b3f77cceb8b39c6e57239b62b0fb7cdbc8ac1ab77dd0fde',
  'crates/umf-core/src/full_modules.rs':'f011690138a0933897c2e681b35a844199c4b57c6711357ef3b45599594434a0',
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

// This exact predicate is already enforced by the pinned core module boundary.
// Do not accept a generic cfg evaluator or unknown feature expression here.
export const fullRuntimeCfg='#[cfg(not(all(feature = "metamodel-compiler", not(feature = "full-core"))))]';
const countedValueConsumer='crates/umf-core/src/value.rs';
const coreLibPath='crates/umf-core/src/lib.rs';
const fullModulesPath='crates/umf-core/src/full_modules.rs';
const fullEnginePath='crates/umf-core/src/engine.rs';
const fullModulesInclude=fullRuntimeCfg+'\ninclude!("full_modules.rs");';
const countedBankConsumer='crates/umf-core/src/schema_admitted_bank.rs';
const countedReferenceTest='crates/umf-core/src/schema_preflight_reference_independent_tests.rs';
const guardedRuntimeItems:Readonly<Record<string,string>>={
  [countedBankConsumer]:
    fullRuntimeCfg+'\n    pub(crate) fn mark_counted_owner(\n'+
    '        admitted: &mut AdmittedCore,\n'+
    '        _route: crate::canonical_codegen_resources::CountedBankRoute,\n'+
    '    ) ',
  [countedReferenceTest]:
    fullRuntimeCfg+'\n#[test]\nfn counted_pointer_path_matches_original_target_and_utf16_with_paid_move() ',
};

function maskGuardedRuntimeItem(code:string,path:string,header:string):string {
  const start=code.indexOf(header);
  if(start<0||code.indexOf(header,start+header.length)>=0)
    throw Error('METAMODEL_SOURCE_PARTITION_COUNTED_ITEM_BOUNDARY '+path);
  const body=delimitedContent(code,start+header.length);
  if(!body||code[start+header.length]!=='{')
    throw Error('METAMODEL_SOURCE_PARTITION_COUNTED_ITEM_BOUNDARY '+path);
  return code.slice(0,start)+' '.repeat(body.end-start)+code.slice(body.end);
}

/** Recognize ONLY the two reviewed items, retaining their bodies in full-core. */
export function projectCountedRuntimeBoundary(source:string):{bootstrap:string;fullRuntime:string} {
  const code=withoutRustComments(source),spans:Array<{start:number;end:number}>=[];
  const positions:number[]=[];
  for(let at=code.indexOf(fullRuntimeCfg);at>=0;at=code.indexOf(fullRuntimeCfg,at+fullRuntimeCfg.length))positions.push(at);
  if(positions.length!==2)throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
  for(const [index,start] of positions.entries()){
    let item=start+fullRuntimeCfg.length;
    while(/\s/.test(code[item]??'')&&item<code.length)item++;
    if(index===0){
      const signature='pub(crate) const fn counted_hint_model_overhead()->usize';
      if(!code.startsWith(signature,item))throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
      let open=item+signature.length;
      while(/\s/.test(code[open]??'')&&open<code.length)open++;
      if(code[open]!=='{')throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
      const body=delimitedContent(code,open);
      if(!body)throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
      spans.push({start,end:body.end});
    }else{
      const signature='const _:()=assert!';
      if(!code.startsWith(signature,item))throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
      let open=item+signature.length;
      while(/\s/.test(code[open]??'')&&open<code.length)open++;
      if(code[open]!=='(')throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
      const body=delimitedContent(code,open);
      if(!body||!body.content.trim().startsWith('3*factory_root_front_work()<23712\n    &&counted_hint_model_overhead()<14474*'))
        throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
      let end=body.end;while(/\s/.test(code[end]??'')&&end<code.length)end++;
      if(code[end]!==';')throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
      spans.push({start,end:end+1});
    }
  }
  let bootstrap=code;
  for(const {start,end} of spans.reverse())bootstrap=bootstrap.slice(0,start)+' '.repeat(end-start)+bootstrap.slice(end);
  if(/\b(?:canonical_codegen_resources|counted_hint_model_overhead)\b/.test(bootstrap))
    throw Error('METAMODEL_SOURCE_PARTITION_BOOTSTRAP_RUNTIME_EDGE');
  return {bootstrap,fullRuntime:source.split(fullRuntimeCfg+'\n').join('')};
}

function assertCompilerRuntimeProjection(compilerFiles:readonly string[],boundary:SourceBoundary):void {
  const value=boundary.rustSources.find(file=>file.path===countedValueConsumer)?.source;
  if(value===undefined)throw Error('METAMODEL_SOURCE_PARTITION_VALUE_CFG_BOUNDARY');
  const projected=projectCountedRuntimeBoundary(value);
  const declaration=fullRuntimeCfg+'\npub mod canonical_codegen_resources;';
  const modules=boundary.rustSources.find(file=>file.path===fullModulesPath)?.source;
  if(!boundary.coreLib.includes(declaration))throw Error('METAMODEL_SOURCE_PARTITION_MODULE_BOUNDARY');
  // lib.rs is already pinned. Only its exact gated include can select the
  // pinned full module list, whose engine declaration resolves to engine.rs.
  if(!boundary.coreLib.includes(fullModulesInclude)||!modules||
    sha256(modules)!==boundarySha256[fullModulesPath]||
    !withoutRustComments(modules).split('\n').includes('pub mod engine;')||
    ![coreLibPath,fullModulesPath,fullEnginePath,countedBankConsumer,countedReferenceTest].every(path=>compilerFiles.includes(path)))
    throw Error('METAMODEL_SOURCE_PARTITION_BOOTSTRAP_ENGINE_BOUNDARY');
  for(const {path,source} of boundary.rustSources){
    if(!compilerFiles.includes(path))continue;
    // These modules are unreachable under the pinned reduced lib graph.
    // They still participate in the full-source edge scan and custody.
    if(path==='crates/umf-core/src/canonical_codegen_resources.rs'||path===fullEnginePath)continue;
    let code=path===countedValueConsumer?projected.bootstrap:
      withoutRustComments(path===coreLibPath?source.replace(declaration,''):source);
    const header=guardedRuntimeItems[path];
    if(header)code=maskGuardedRuntimeItem(code,path,header);
    if(/\bcanonical_codegen_resources\b/.test(code))throw Error('METAMODEL_SOURCE_PARTITION_BOOTSTRAP_RUNTIME_EDGE '+path);
  }
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
  if(sha256(boundary.coreLib)!==boundarySha256[coreLibPath]||
    boundary.rustSources.find(file=>file.path===coreLibPath)?.source!==boundary.coreLib||
    sha256(boundary.canonicalResources)!==boundarySha256['crates/umf-core/src/canonical_codegen_resources.rs']||
    boundary.rustSources.find(file=>file.path==='crates/umf-core/src/canonical_codegen_resources.rs')?.source!==boundary.canonicalResources)
    throw Error('METAMODEL_SOURCE_PARTITION_MODULE_BOUNDARY');

  const references:Array<{path:string;kind:string}> = [];
  for(const {path,source} of boundary.rustSources){
    const code=withoutRustComments(source);
    const inCompiler=compilerFiles.includes(path);
    if(inCompiler&&path!==fullModulesPath&&/\bmod\s+engine\s*;/.test(code))
      throw Error('METAMODEL_SOURCE_PARTITION_BOOTSTRAP_ENGINE_BOUNDARY '+path);
    const names=code.match(/\bcanonical_codegen_resources\b/g)??[];
    for(const name of names)references.push({path,kind:name});
    const attributes=pathAttributes(code);
    if(!attributes)throw Error('METAMODEL_SOURCE_PARTITION_UNKNOWN_PATH '+path);
    for(const literal of attributes){
      const target=rustRelativeTarget(path,literal);
      if(target===undefined)throw Error('METAMODEL_SOURCE_PARTITION_UNRESOLVED_PATH '+path);
      if(inCompiler&&(target===fullEnginePath||target===fullModulesPath))
        throw Error('METAMODEL_SOURCE_PARTITION_BOOTSTRAP_ENGINE_BOUNDARY '+path);
      if(target===candidate)references.push({path,kind:'path:'+target});
    }
    // Only compiler-closure includes can affect the reduced bootstrap graph.
    // Any source that directly names the runtime module is checked too.
    if(inCompiler||names.length>0||/canonical_codegen/i.test(code)){
      const includes=includeExpressions(code);
      if(!includes)throw Error('METAMODEL_SOURCE_PARTITION_UNKNOWN_INCLUDE '+path);
      for(const include of includes){
        const target=rustRelativeTarget(path,include.path);
        if(target===undefined)throw Error('METAMODEL_SOURCE_PARTITION_UNRESOLVED_INCLUDE '+path);
        if(inCompiler&&(target===fullEnginePath||target===fullModulesPath)&&
          !(path===coreLibPath&&target===fullModulesPath&&include.macro==='include'))
          throw Error('METAMODEL_SOURCE_PARTITION_BOOTSTRAP_ENGINE_BOUNDARY '+path);
        if(target===candidate)references.push({path,kind:include.macro+':'+target});
      }
    }
  }
  const expected=[
    {path:'crates/umf-core/src/value.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core/src/lib.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core/src/engine.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core/src/engine.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core/src/schema_admitted_bank.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core/src/schema_preflight_reference_independent_tests.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/lib.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/lib.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/codegen.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/installed_codegen_factory_independent_tests.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core-wire/src/installed_codegen_factory_independent_tests.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-codegen/src/resources.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-codegen/src/resources.rs',kind:'canonical_codegen_resources'},
    {path:'crates/umf-core/src/canonical_codegen_resources.rs',kind:'path:'+candidate},
  ];
  references.sort((a,b)=>a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind));
  expected.sort((a,b)=>a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind));
  if(JSON.stringify(references)!==JSON.stringify(expected))throw Error('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  assertCompilerRuntimeProjection(compilerFiles,boundary);
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
