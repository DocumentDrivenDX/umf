// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the public TypeScript JSON/YAML value reader and writer before adding
// or repairing opt-in Rust wrapper routes.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript-api';
import {readJsonValue, writeJsonValue} from '../../../src/model/serialization';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-value-serialization/predecessor.json');
const sha256 = async (path:string) => createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');

async function sourceClosure(entries:string[]) {
  const config=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
  if(config.error)throw new Error('Unable to read repository TypeScript configuration');
  const options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
  const found=new Set<string>(),pending=[...entries];let edges=0;
  while(pending.length) {
    const path=pending.pop()!;if(found.has(path))continue;found.add(path);
    const file=resolve(root,path),text=await readFile(file,'utf8');
    const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),specifiers:string[]=[];
    const visit=(node:ts.Node)=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specifiers.push(node.moduleSpecifier.text);
      else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]!))specifiers.push(node.arguments[0]!.text);
      ts.forEachChild(node,visit);
    };
    visit(ast);
    for(const specifier of specifiers) {
      if(!specifier.startsWith('.'))continue;
      const resolved=ts.resolveModuleName(specifier,file,options,ts.sys).resolvedModule;
      if(!resolved)throw new Error(`Unresolved import ${specifier} from ${path}`);
      const absolute=resolve(resolved.resolvedFileName);
      if(!absolute.startsWith(root+'/')||absolute.includes('/node_modules/'))continue;
      edges++;pending.push(absolute.slice(root.length+1));
    }
  }
  const files=Object.fromEntries(await Promise.all([...found].sort().map(async path=>[path,await sha256(path)])));
  return {files,edgeCount:edges,resolution:'typescript-api AST static import/export traversal with tsconfig module resolution',externalInputs:{'package.json':await sha256('package.json'),'bun.lock':await sha256('bun.lock')}};
}

const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
function outcome(fn:()=>unknown) {
  try{return {status:'returned',value:normalize(fn())};}
  catch(error){const e=error as Error & {code?:string;path?:string};return {status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message};}
}
const cases:unknown[]=[];
function add(id:string,input:unknown,fn:()=>unknown){cases.push({id,input,outcome:outcome(fn)});}

const yamlSource='name: example\nitems:\n  - true\n  - 1.25\n';
const jsonSource='{"name":"example","items":[true,1.25]}';
add('read.default-format-yaml',{source:yamlSource},()=>readJsonValue(yamlSource));
add('read.explicit-yaml',{source:yamlSource,format:'yaml'},()=>readJsonValue(yamlSource,'yaml'));
add('read.explicit-json',{source:jsonSource,format:'json'},()=>readJsonValue(jsonSource,'json'));
add('read.json-rejects-yaml',{source:yamlSource,format:'json'},()=>readJsonValue(yamlSource,'json'));
add('read.yaml-accepts-json',{source:jsonSource,format:'yaml'},()=>readJsonValue(jsonSource,'yaml'));
add('read.json-syntax-precedes-duplicate-detection',{source:'{"x":1,"x":2,}',format:'json'},()=>readJsonValue('{"x":1,"x":2,}','json'));
for(const [id,source,format] of [
  ['syntax.json-trailing-comma','{"x":1,}','json'],
  ['syntax.yaml-duplicate-key','x: 1\nx: 2\n','yaml'],
  ['syntax.yaml-alias','x: &a 1\ny: *a\n','yaml'],
  ['syntax.yaml-tag','x: !!str value\n','yaml'],
  ['syntax.yaml-multiple-documents','---\nx: 1\n---\ny: 2\n','yaml'],
  ['number.unsafe-integer','n: 9007199254740992\n','yaml'],
  ['number.rounding','n: 0.10000000000000000001\n','yaml'],
  ['number.negative-zero','n: -0.0\n','yaml'],
] as const)add(`read.${id}`,{source,format},()=>readJsonValue(source,format));
add('read.limit.source-over-syntax-order',{source:'{'.repeat(4_000_001),format:'json'},()=>readJsonValue('{'.repeat(4_000_001),'json'));
const deep='['.repeat(129)+'0'+']'.repeat(129);
add('read.limit.depth',{depth:129,format:'json'},()=>readJsonValue(deep,'json'));
const tooMany='['+Array(100_000).fill('null').join(',')+']';
add('read.limit.values',{arrayItems:100_000,format:'json'},()=>readJsonValue(tooMany,'json'));

const value={name:'example',items:[true,1.25]};
add('write.default-format-yaml',{value},()=>writeJsonValue(value));
add('write.explicit-yaml',{value,format:'yaml'},()=>writeJsonValue(value,'yaml'));
add('write.explicit-json',{value,format:'json'},()=>writeJsonValue(value,'json'));
add('write.number-negative-zero',{value:-0,format:'json'},()=>writeJsonValue(-0,'json'));
add('write.rejects-nonfinite',{value:Number.POSITIVE_INFINITY,format:'json'},()=>writeJsonValue(Number.POSITIVE_INFINITY,'json'));
add('write.rejects-cycle',{value:'self-cycle',format:'yaml'},()=>{const cycle:any={};cycle.self=cycle;return writeJsonValue(cycle,'yaml');});
add('write.limit.text',{textUnits:4_000_001,format:'json'},()=>writeJsonValue('x'.repeat(4_000_001),'json'));

const output={format:'umf-r8-json-value-serialization-typescript-predecessor/1',runtime:{bun:Bun.version},
  operations:['readJsonValue','writeJsonValue'],sourceClosure:await sourceClosure(['src/model/serialization.ts']),
  captureScriptSha256:await sha256('scripts/rust-migration/r8/serialization-predecessor.ts'),caseCount:cases.length,cases};
const body=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(out,'utf8')!==body)throw new Error('Frozen serialization predecessor changed; review before refresh');}
else{await mkdir(dirname(out),{recursive:true});await writeFile(out,body);}
console.log(JSON.stringify({out:out.slice(root.length+1),caseCount:cases.length,sha256:createHash('sha256').update(body).digest('hex')}));
