// SPDX-License-Identifier: MIT OR Apache-2.0
import ts from 'typescript-api';
import {resolve,relative} from 'node:path';
const root=resolve(import.meta.dir,'../..');
const roots=['scripts/reference/','docs/helix/05-deploy/reference/model/','docs/helix/05-deploy/reference/runtime/','docs/helix/05-deploy/microsite/reference/'];
const runtimeImports:Record<string,ReadonlySet<string>>={
 'worker.ts':new Set([
  'bindings/core/wasm/pkg/umf_core_wasm.js',
 ]),
 'wasm-sdk.ts':new Set([
  'bindings/core/wasm/index.js',
  'bindings/core/wasm/pkg/umf_core_wasm.js',
  'src/access/codegen-resources.ts',
  'src/access/core-model-resources.ts',
  'src/access/rust-schema-properties-default.ts',
  'src/adapters/json-schema/rust-default.ts',
  'src/adapters/protobuf/rust-default.ts',
  'src/adapters/protobuf/source-rust-default.ts',
  'src/extensions/actions/rust-registry.ts',
  'src/extensions/dashboard/rust-default.ts',
  'src/model/edit-extension-rust-default.ts',
  'src/model/errors.ts',
  'src/model/native-utility-default.ts',
  'src/model/rust-public-default.ts',
  'src/projections/ddd-json-schema-rust-default.ts',
  'src/projections/json-schema-protobuf-rust-default.ts',
  'src/registry/rust-default.ts',
 ]),
};
export function owner(path:string):string|undefined{return roots.find(r=>path.startsWith(r));}
export function allowed(from:string,to:string):boolean {const a=owner(from),b=owner(to);if(!a)return false;if(a===b)return true;if(from==='scripts/reference/renderer-package.ts'&&['scripts/schema-browser-integrity.ts','docs/helix/05-deploy/schema-browser/site-assets.ts'].includes(to))return true;if(from==='scripts/reference/self-model.ts'&&to==='scripts/metamodel/rust.ts')return true;if(a===roots[0])return b===roots[1]||to==='docs/helix/05-deploy/schema-browser/notices.ts'||to==='src/index-node-v4.ts'||to.startsWith('node:')||!to.startsWith('.')&&!/^(?:src|docs|scripts)\//.test(to);if(a===roots[1])return false;if(a===roots[2])return b===roots[1]||(runtimeImports[from.slice(a.length)]?.has(to)??false);return b===roots[1]||to===roots[2]+'protocol.ts'||to==='@documentdrivendx/umf-schema-browser'||to==='@dagrejs/dagre'||to==='yaml';}
export async function checkBoundaries(){
 const graph=new Map<string,string[]>();let count=0;
 for(const base of roots)for await(const file of new Bun.Glob(base+'**/*.ts').scan({cwd:root,onlyFiles:true})){
  count++;const code=await Bun.file(resolve(root,file)).text(),ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);const deps:string[]=[];
  const inspect=(n:ts.Node)=>{let spec:string|undefined;if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))spec=n.moduleSpecifier.text;if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword)throw Error('REFERENCE_INPUT dynamic import '+file);
   if(spec){let target=spec.startsWith('.')?relative(root,resolve(root,file,'..',spec)).replaceAll('\\','/'):spec;if(spec.startsWith('.')){if(awaitExists(target+'.ts'))target+='.ts';else if(awaitExists(target+'/index.ts'))target+='/index.ts';}if(!allowed(file,target))throw Error('REFERENCE_INPUT forbidden import '+file+' → '+target);if(owner(target)&&owner(target)!==owner(file)&&!target.endsWith('/index.ts')&&!target.endsWith('/protocol.ts'))throw Error('REFERENCE_INPUT private cross import '+target);if(owner(target))deps.push(target);}
   if(owner(file)!==roots[0]&&ts.isIdentifier(n)&&['Bun','process','Buffer','require','eval','Function'].includes(n.text))throw Error('REFERENCE_INPUT host/code-generation identifier '+file+':'+n.text);ts.forEachChild(n,inspect);};inspect(ast);graph.set(file,deps);
 }
 function awaitExists(path:string){return Bun.file(resolve(root,path)).size>0;}
 const walk=(f:string,stack:string[])=>{if(stack.includes(f))throw Error('REFERENCE_INPUT import cycle '+stack.join(' → '));for(const d of graph.get(f)??[])walk(d,[...stack,f]);};for(const f of graph.keys())walk(f,[]);
 if(!count)throw Error('REFERENCE_STRUCTURE empty boundary scan');return {files:count};
}
if(import.meta.main)console.log(await checkBoundaries());
