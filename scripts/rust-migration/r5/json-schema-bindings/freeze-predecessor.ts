// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript-api';
import {
  exportJsonSchema, exportJsonSchemaBundle, exportJsonSchemaResources,
  getJsonSchemaNode, importJsonSchema, inspectJsonSchema, walkJsonSchema,
} from '../../../../src/adapters/json-schema/index';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const out = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-bindings/predecessor.json');
const runtimeManifests=['package.json','bun.lock'];
const sha256 = async (path:string) => createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
async function captureSourceClosure(entry:string):Promise<{sources:Record<string,string>;importEdges:number;method:string;exclusions:string[]}> {
  const config=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
  if(config.error)throw new Error(`Cannot read tsconfig.json: ${ts.flattenDiagnosticMessageText(config.error.messageText,' ')}`);
  const options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
  const found=new Set<string>(),pending=[entry]; let importEdges=0;
  while(pending.length) {
    const path=pending.pop()!; if(found.has(path))continue; found.add(path);
    const file=resolve(root,path), text=await readFile(file,'utf8');
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const specifiers:string[]=[];
    const visit=(node:ts.Node) => {
      if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) {
        if(node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specifiers.push(node.moduleSpecifier.text);
      } else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments.length===1) {
        const argument=node.arguments[0];
        if(argument&&ts.isStringLiteral(argument))specifiers.push(argument.text);
      } else if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='require'&&node.arguments.length===1) {
        const argument=node.arguments[0];
        if(argument&&ts.isStringLiteral(argument))specifiers.push(argument.text);
      } else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal)) {
        specifiers.push(node.argument.literal.text);
      }
      ts.forEachChild(node,visit);
    };
    visit(source);
    for(const reference of source.referencedFiles)specifiers.push(reference.fileName);
    for(const specifier of specifiers) {
      if(!specifier.startsWith('.'))continue;
      const resolved=ts.resolveModuleName(specifier,file,options,ts.sys).resolvedModule;
      if(!resolved)throw new Error(`TypeScript could not resolve relative import ${specifier} from ${path}`);
      const absolute=resolve(resolved.resolvedFileName);
      if(!absolute.startsWith(root+'/')||absolute.includes('/node_modules/'))continue;
      importEdges++; pending.push(absolute.slice(root.length+1));
    }
  }
  const sources=Object.fromEntries(await Promise.all([...found].sort().map(async p=>[p,await sha256(p)])));
  return {sources,importEdges,method:`typescript-api ${ts.version} AST static-import traversal with tsconfig.json module resolution`,
    exclusions:['Non-literal dynamic imports and runtime-computed require() targets','Bare package imports are represented by package.json and bun.lock, not node_modules source hashes','Bundler/plugin/runtime-injected dependencies are outside the static TypeScript import graph']};
}
const normalize = (value:unknown):unknown => JSON.parse(JSON.stringify(value));
function outcome(fn:()=>unknown):unknown {
  try { return {status:'returned', value:normalize(fn())}; }
  catch (error) {
    const e=error as Error & {code?:string};
    return {status:'threw', name:e.name, code:e.code ?? null, message:e.message};
  }
}
function add(cases:unknown[], id:string, input:unknown, fn:()=>unknown) { cases.push({id,input,outcome:outcome(fn)}); }

const cases:unknown[]=[];
const base='https://schemas.example.test/root.json';
const source='{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"x":{"type":"number"}},"$defs":{"nested":{"type":"string"}}}';
const imported=importJsonSchema(source,{id:'urn:umf:r5:fixture',baseUri:base,resources:{
  'https://schemas.example.test/z.json':'{"$id":"z","type":"boolean"}',
  'https://schemas.example.test/a.json':'false',
}});

// Import admission and refusal precedence: URI checks precede resource/root parsing;
// options.id is admitted only by the constructed UMF document validation.
add(cases,'import.success.ordered-resources',{text:source,id:'urn:umf:r5:fixture',baseUri:base,resources:[
  ['https://schemas.example.test/z.json','{"$id":"z","type":"boolean"}'],
  ['https://schemas.example.test/a.json','false'],
]},()=>importJsonSchema(source,{id:'urn:umf:r5:fixture',baseUri:base,resources:{
  'https://schemas.example.test/z.json':'{"$id":"z","type":"boolean"}',
  'https://schemas.example.test/a.json':'false',
}}));
add(cases,'import.invalid-base-before-invalid-root',{text:'{',options:{id:'urn:umf:r5:bad',baseUri:'relative'}},()=>importJsonSchema('{',{id:'urn:umf:r5:bad',baseUri:'relative'}));
add(cases,'import.invalid-resource-uri-before-invalid-root',{text:'{',options:{id:'urn:umf:r5:bad',baseUri:base,resources:[['relative','{']]}},()=>importJsonSchema('{',{id:'urn:umf:r5:bad',baseUri:base,resources:{relative:'{'}}));
add(cases,'import.invalid-resource-json-before-root-json',{text:'{',options:{id:'urn:umf:r5:bad',baseUri:base,resources:[['https://schemas.example.test/x.json','{']]}},()=>importJsonSchema('{',{id:'urn:umf:r5:bad',baseUri:base,resources:{'https://schemas.example.test/x.json':'{'}}));
add(cases,'import.invalid-root-json',{text:'{',options:{id:'urn:umf:r5:bad',baseUri:base}},()=>importJsonSchema('{',{id:'urn:umf:r5:bad',baseUri:base}));
add(cases,'import.root-resource-retrieval-collision',{text:'true',options:{id:'urn:umf:r5:collision',baseUri:base,resources:[[base,'true']]}},()=>importJsonSchema('true',{id:'urn:umf:r5:collision',baseUri:base,resources:{[base]:'true'}}));
add(cases,'import.invalid-native-schema',{text:'{"type":12}',options:{id:'urn:umf:r5:invalid-schema',baseUri:base}},()=>importJsonSchema('{"type":12}',{id:'urn:umf:r5:invalid-schema',baseUri:base}));
add(cases,'import.unknown-dialect-preserved',{text:'{"$schema":"https://example.test/unknown","type":"object"}',options:{id:'urn:umf:r5:unknown-dialect',baseUri:base}},()=>importJsonSchema('{"$schema":"https://example.test/unknown","type":"object"}',{id:'urn:umf:r5:unknown-dialect',baseUri:base}));

add(cases,'inspect.success',{document:imported},()=>inspectJsonSchema(imported));
const invalidVersion=structuredClone(imported);
const jsonSchemaVocabulary=invalidVersion.vocabularies['umf.json-schema'];
if(!jsonSchemaVocabulary)throw new Error('Frozen JSON Schema fixture lacks its vocabulary');
jsonSchemaVocabulary.version='9.9.9';
add(cases,'inspect.invalid-version',{document:invalidVersion},()=>inspectJsonSchema(invalidVersion));
const invalidDocument=structuredClone(imported); invalidDocument.id='';
add(cases,'inspect.invalid-document',{document:invalidDocument},()=>inspectJsonSchema(invalidDocument));
const missingPayload=structuredClone(imported);
const rootElement=missingPayload.modules[0]?.elements[0];
if(!rootElement)throw new Error('Frozen JSON Schema fixture lacks its root element');
delete rootElement.extensions['umf.json-schema'];
add(cases,'inspect.missing-payload',{document:missingPayload},()=>inspectJsonSchema(missingPayload));

add(cases,'export.root',{document:imported},()=>exportJsonSchema(imported));
add(cases,'export.resources',{document:imported},()=>exportJsonSchemaResources(imported));
add(cases,'export.bundle',{document:imported},()=>exportJsonSchemaBundle(imported));
add(cases,'get.root.empty-pointer',{document:imported,pointer:''},()=>getJsonSchemaNode(imported,''));
const exactSchema='{"1":"one","01":"leading","n":-0.000,"s":"\\ud800"}';
const exactDocument=importJsonSchema(exactSchema,{id:'urn:umf:r5:exact',baseUri:base});
add(cases,'get.exact-surrogate-string',{schema:exactSchema,options:{id:'urn:umf:r5:exact',baseUri:base},pointer:'/s'},()=>getJsonSchemaNode(exactDocument,'/s'));
add(cases,'get.exact-negative-zero',{schema:exactSchema,options:{id:'urn:umf:r5:exact',baseUri:base},pointer:'/n'},()=>getJsonSchemaNode(exactDocument,'/n'));
add(cases,'export.exact-negative-zero',{schema:exactSchema,options:{id:'urn:umf:r5:exact',baseUri:base}},()=>exportJsonSchema(exactDocument));
const loneKeySchema='{"\\ud800":1,"\\ud83d\\ude00":2}';
add(cases,'get-literal-surrogate-utf16-pointer',{schema:loneKeySchema,pointer:'/'+String.fromCharCode(0xd800)},()=>getJsonSchemaNode(importJsonSchema(loneKeySchema,{id:'urn:umf:r5:utf16-key',baseUri:base}),'/'+String.fromCharCode(0xd800)));
add(cases,'get.missing-pointer',{document:imported,pointer:'/missing'},()=>getJsonSchemaNode(imported,'/missing'));
add(cases,'get.invalid-pointer-escape',{document:imported,pointer:'/bad~2key'},()=>getJsonSchemaNode(imported,'/bad~2key'));
add(cases,'walk.root-schema-positions',{document:imported},()=>walkJsonSchema(imported));
const dataLookalikes=importJsonSchema('{"default":{"properties":{"hidden":{"type":"string"}}},"enum":[{"type":"number"}],"const":{"type":"boolean"},"examples":[{"properties":{"alsoHidden":{"type":"integer"}}}],"properties":{"visible":{"type":"string"}}}',{id:'urn:umf:r5:data-lookalikes',baseUri:base});
add(cases,'walk-excludes-default-enum-const-examples-data',{schema:'{"default":{"properties":{"hidden":{"type":"string"}}},"enum":[{"type":"number"}],"const":{"type":"boolean"},"examples":[{"properties":{"alsoHidden":{"type":"integer"}}}],"properties":{"visible":{"type":"string"}}}',options:{id:'urn:umf:r5:data-lookalikes',baseUri:base}},()=>walkJsonSchema(dataLookalikes));
const resourceOnly=importJsonSchema('true',{id:'urn:umf:r5:resource-only',baseUri:base,resources:{'https://schemas.example.test/only.json':'{"properties":{"hidden":{"type":"string"}}}'}});
add(cases,'get-and-walk-exclude-resource-tree',{document:resourceOnly,pointer:'/properties/hidden'},()=>({get:outcome(()=>getJsonSchemaNode(resourceOnly,'/properties/hidden')),walk:walkJsonSchema(resourceOnly)}));

// Representation and interpretation unknowns are distinct: preserve the tree,
// diagnose the keyword, but refuse native export when tagged representation extras exist.
const unknownKeyword=importJsonSchema('{"x-extension":{"n":9007199254740993}}',{id:'urn:umf:r5:unknown',baseUri:base});
add(cases,'inspect-unknown-keyword-and-exact-unsafe-number',{document:unknownKeyword},()=>inspectJsonSchema(unknownKeyword));
add(cases,'export-unknown-keyword-retained',{document:unknownKeyword},()=>exportJsonSchema(unknownKeyword));
const surrogateKeyword=importJsonSchema('{"\\ud800":true}',{id:'urn:umf:r5:surrogate-diagnostic',baseUri:base});
add(cases,'inspect-escaped-surrogate-key-diagnostic',{source:'{"\\ud800":true}'},()=>inspectJsonSchema(surrogateKeyword));
const extra=structuredClone(imported) as any; extra.modules[0].elements[0].extensions['umf.json-schema'].root.extra='opaque';
add(cases,'export-unknown-representation-refusal',{document:extra},()=>exportJsonSchema(extra));

// Snapshot each public copy, mutate the returned copies, then reread every source.
const isolationBefore={getNode:getJsonSchemaNode(imported,'/properties/x'),bundle:exportJsonSchemaBundle(imported),walk:walkJsonSchema(imported)};
const preMutationSnapshot=normalize(isolationBefore);
const mutationRecipe=['getNode.kind = "null"','bundle.source.id = "mutated"','bundle.resources["https://schemas.example.test/z.json"] = "mutated"','walk[1].node.kind = "null"'];
(isolationBefore.getNode as any).kind='null'; (isolationBefore.bundle.source as any).id='mutated';
(isolationBefore.bundle.resources as any)['https://schemas.example.test/z.json']='mutated';
if(isolationBefore.walk[1])(isolationBefore.walk[1].node as any).kind='null';
const isolationAfter={getNode:getJsonSchemaNode(imported,'/properties/x'),bundle:exportJsonSchemaBundle(imported),walk:walkJsonSchema(imported)};
cases.push({id:'copy-isolation-get-bundle-walk',input:{document:imported,mutationRecipe,reread:['getJsonSchemaNode(/properties/x)','exportJsonSchemaBundle','walkJsonSchema']},outcome:outcome(()=>({preMutationSnapshot,mutatedReturnedCopies:isolationBefore,postMutationRereads:isolationAfter}))});

const closure=await captureSourceClosure('src/adapters/json-schema/index.ts');
const runtimeHashes=Object.fromEntries(await Promise.all(runtimeManifests.map(async p=>[p,await sha256(p)])));
const harnessSha256=await sha256('scripts/rust-migration/r5/json-schema-bindings/freeze-predecessor.ts');
const result={format:'umf-r5-json-schema-typescript-predecessor-v1',runtime:{bun:Bun.version},operationCount:7,
  operations:['importJsonSchema','inspectJsonSchema','exportJsonSchema','exportJsonSchemaResources','exportJsonSchemaBundle','getJsonSchemaNode','walkJsonSchema'],
  sourceClosure:{repositoryFiles:closure.sources,relativeImportEdges:closure.importEdges,method:closure.method,exclusions:closure.exclusions,runtimeManifests:runtimeHashes,captureHarnessSha256:harnessSha256},
  caseCount:cases.length,cases};
const serialized=JSON.stringify(result,null,2)+'\n';
if (process.argv.includes('--check')) {
  const existing=await readFile(out,'utf8');
  if(existing!==serialized) throw new Error('Frozen predecessor differs; inspect source hashes and captured outcomes before refreshing.');
} else {
  await mkdir(dirname(out),{recursive:true}); await writeFile(out,serialized);
}
console.log(JSON.stringify({out,mode:process.argv.includes('--check')?'check':'write',caseCount:cases.length,sourceCount:Object.keys(closure.sources).length,relativeImportEdges:closure.importEdges,sourceClosureSha256:createHash('sha256').update(JSON.stringify(result.sourceClosure)).digest('hex')}));
