// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the public TypeScript parser/edit outcomes before adding Rust routes.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript-api';
import {editJsonSchemaNode, exportJsonSchema, importJsonSchema, parseNativeJson} from '../../../src';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/predecessor.json');
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
const baseUri='https://schemas.example.test/tree.json';
const schema='{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"amount":{"type":"number","minimum":0},"text":{"type":"string","minLength":1}},"$defs":{"nested":{"type":"string"}}}';
const document=()=>importJsonSchema(schema,{id:'urn:umf:r5:tree',baseUri});

for(const [id,text] of [
  ['valid.exact-number-tokens','{"integer":9007199254740993,"fraction":0.10000000000000000001,"exponent":1e-5000,"negativeZero":-0.000}'],
  ['valid.utf16-prototype-and-lone-surrogate','{"__proto__":{"toString":"kept"},"lone":"\\ud800","astral":"😀"}'],
  ['valid.scalar-and-empty-containers','[null,true,false,"",{},[]]'],
] as const)add(`parse.${id}`,{text},()=>parseNativeJson(text));

for(const [id,text] of [
  ['syntax.empty',''],['syntax.trailing-comma','{"x":1,}'],['syntax.trailing-token','null false'],
  ['duplicate-key','{"x":1,"x":2}'],['duplicate-key-malformed-tail','{"x":1,"x":2,}'],
] as const)add(`parse.${id}`,{text},()=>parseNativeJson(text));
const deep='['.repeat(129)+'0'+']'.repeat(129);
add('parse.refusal.depth-limit',{depth:129},()=>parseNativeJson(deep));
const tooLong=' '.repeat(4_000_001);
add('parse.refusal.text-limit',{utf16Units:tooLong.length},()=>parseNativeJson(tooLong));
const tooMany='['+Array(100_000).fill('null').join(',')+']';
add('parse.refusal.value-limit',{arrayItems:100_000},()=>parseNativeJson(tooMany));

const original=document();
const originalText=JSON.stringify(original);
add('edit.success.changed-number-and-source-unchanged',{schema,pointer:'/properties/amount/minimum',replacement:'10'},()=>{
  const edited=editJsonSchemaNode(original,'/properties/amount/minimum','10');
  return {edited,editedSource:exportJsonSchema(edited),sourceUnchanged:JSON.stringify(original)===originalText};
});
add('edit.pointer-escape-before-invalid-replacement',{pointer:'/bad~2key',replacement:'{'},()=>editJsonSchemaNode(original,'/bad~2key','{'));
add('edit.replacement-parse-before-target-lookup',{pointer:'/missing',replacement:'{'},()=>editJsonSchemaNode(original,'/missing','{'));
add('edit.invalid-source-before-target-lookup',{pointer:'/missing',replacement:'true'},()=>{
  const invalid=structuredClone(original);invalid.id='';
  return editJsonSchemaNode(invalid,'/missing','true');
});
add('edit.invalid-existing-node-target',{pointer:'/properties/amount/minimum',replacement:'"not a number"'},()=>{
  const source=document(),before=JSON.stringify(source);
  try{return {result:editJsonSchemaNode(source,'/properties/amount/minimum','"not a number"'),sourceUnchanged:JSON.stringify(source)===before};}
  catch(error){throw error;}
});
add('edit.root-boolean-accepted',{pointer:'',replacement:'true'},()=>editJsonSchemaNode(original,'','true'));
add('edit.root-scalar-refused',{pointer:'',replacement:'1'},()=>editJsonSchemaNode(original,'','1'));
const incomplete=importJsonSchema('{"$schema":"https://example.test/custom","type":"object"}',{id:'urn:umf:r5:tree-unknown',baseUri});
add('edit.incomplete-schema-refused',{pointer:'/type',replacement:'"string"'},()=>editJsonSchemaNode(incomplete,'/type','"string"'));
const surrogateSchema='{"properties":{"\\ud800":{"type":"string","minLength":1}}}';
const surrogateDoc=importJsonSchema(surrogateSchema,{id:'urn:umf:r5:tree-surrogate',baseUri});
const surrogateBefore=JSON.stringify(surrogateDoc);
add('edit.lone-surrogate-schema-refused-atomically',{schema:surrogateSchema,pointer:'/properties/\ud800/minLength',replacement:'2'},()=>{
  try {const edited=editJsonSchemaNode(surrogateDoc,'/properties/\ud800/minLength','2');return {edited,sourceUnchanged:JSON.stringify(surrogateDoc)===surrogateBefore};}
  catch(error){const e=error as Error & {code?:string;path?:string};return {refusal:{name:e.name,code:e.code??null,path:e.path??null,message:e.message},sourceUnchanged:JSON.stringify(surrogateDoc)===surrogateBefore};}
});
const escapedSchema='{"properties":{"a/b~c":{"type":"string","minLength":1},"😀":{"type":"number"}}}';
const escapedDoc=importJsonSchema(escapedSchema,{id:'urn:umf:r5:tree-escaped',baseUri});
const escapedBefore=JSON.stringify(escapedDoc);
add('edit.escaped-pointer-and-astral-key-success',{schema:escapedSchema,pointers:['/properties/a~1b~0c/minLength','/properties/😀/type'],replacement:'2'},()=>{
  const slashEdited=editJsonSchemaNode(escapedDoc,'/properties/a~1b~0c/minLength','2');
  const astralEdited=editJsonSchemaNode(escapedDoc,'/properties/😀/type','"integer"');
  return {slashEditedSource:exportJsonSchema(slashEdited),astralEditedSource:exportJsonSchema(astralEdited),sourceUnchanged:JSON.stringify(escapedDoc)===escapedBefore};
});
const arraySchema='{"prefixItems":[{"type":"string"},{"type":"number"}]}';
const arrayDoc=importJsonSchema(arraySchema,{id:'urn:umf:r5:tree-array',baseUri});
add('edit.array-pointer-existing-index',{schema:arraySchema,pointer:'/prefixItems/1/type',replacement:'"integer"'},()=>editJsonSchemaNode(arrayDoc,'/prefixItems/1/type','"integer"'));

const priorPath='docs/helix/04-build/evidence/rust-migration/r5-json-schema-bindings/predecessor.json';
const priorText=await readFile(resolve(root,priorPath),'utf8');
const prior=JSON.parse(priorText);
const closure=await sourceClosure(['src/model/native-json.ts','src/adapters/json-schema/index.ts']);
const output={format:'umf-r5-json-schema-tree-operations-typescript-predecessor/1',runtime:{bun:Bun.version},
  existingGetWalkPredecessor:{path:priorPath,sha256:createHash('sha256').update(priorText).digest('hex'),caseCount:prior.caseCount,operations:['getJsonSchemaNode','walkJsonSchema']},
  newOperations:['parseNativeJson','editJsonSchemaNode'],sourceClosure:closure,captureScriptSha256:await sha256('scripts/rust-migration/r5/json-schema-tree-operations-predecessor.ts'),caseCount:cases.length,cases};
const body=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(out,'utf8')!==body)throw new Error('Frozen tree-operation predecessor changed; review before refresh');}
else{await mkdir(dirname(out),{recursive:true});await writeFile(out,body);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',out,caseCount:cases.length,sourceFileCount:Object.keys(closure.files).length,sourceClosureSha256:createHash('sha256').update(JSON.stringify(closure)).digest('hex')}));
