// SPDX-License-Identifier: MIT OR Apache-2.0
/** Enforce current-core authority boundaries independently of generated output. */
import ts from 'typescript-api';
import {posix,resolve} from 'node:path';
import {CURRENT_CORE_VERSION} from '../src/generated/core-model';

export interface AuthoritySource {path:string;source:string}
export const retiredCorePaths=[
 ...['field','nullability','cardinality','facet','key','relationship','schema-properties','bit128','semantic-types'].flatMap(name=>[
  `src/model/${name}-transition.ts`,
  `spec/core/${name}-transition.schema.json`,
  `spec/core/${name}-document.schema.json`,
 ]),
 'src/model/schema-properties-transition-schema.ts',
 'src/validation/facets.ts',
 'scripts/core-schema-properties-schema.py',
 'scripts/core-key-tuple-schema.ts',
 'scripts/core-relationship-metadata-schema.ts',
 'docs/helix/05-deploy/schema-browser/fixed-validator-inputs-1.1.1.json',
 'docs/helix/05-deploy/schema-browser/fixed-validator-inputs-1.1.2.json',
 'docs/helix/05-deploy/microsite/explorer.html',
 'docs/helix/05-deploy/microsite/schema-browser.html',
 'docs/helix/05-deploy/microsite/schema-navigation.js',
 'docs/helix/05-deploy/microsite/catalog-defaults.js',
 'docs/helix/05-deploy/reference/examples/minimal.json',
 'tools/security/record-home-shape-probe.ts',
 'tools/security/truss-graph-native-stage.ts',
 'tools/security/truss-graph-native-stage-probe.py',
 'tools/security/truss-graph-native-stage-typecheck.json',
 ...Object.entries({kind:[1,2,3,4,5,7],'record-type':[1,2,3,4,5],nullability:[1,2,3,4,6],cardinality:[1,2,3,5],facet:[1,2,4],key:[1,3],relationship:[2]}).flatMap(([name,versions])=>versions.map(version=>`spec/core/${name}-operation${version===1?'':`-v${version}`}.schema.json`)),
 ...['record-members','scalar-type','reference-links'].flatMap(name=>[`spec/core/${name}-inspection.schema.json`,`spec/core/${name}-inspection-v0.2.schema.json`]),
 'spec/core/relationship-metadata-selection.schema.json',
 ...[1,2,3].map(version=>`spec/core/key-tuple-operation${version===1?'':`-v${version}`}.schema.json`),
] as const;
const retired=new Set<string>(retiredCorePaths);
const oldCore=/^0\.[1-9]\.0$/;
// Read-only retirement policy, not a runtime compatibility registry. The core
// document URI is deliberately reused by the new canonical generated schema.
const retiredSchemaUrns=new Set<string>();
const retirement=await Bun.file(resolve(import.meta.dir,'../docs/helix/04-build/evidence/metamodel-authority/retirement-ledger.json')).json();
for(const entry of retirement.entries){
 if(!entry.path.endsWith('.json')||!entry.archive||!retired.has(entry.path))continue;
 const bytes=await Bun.file(resolve(import.meta.dir,'..',entry.archive)).bytes();
 if(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')!==entry.originalSha256)throw Error('RETIREMENT_ARCHIVE changed '+entry.archive);
 const id=JSON.parse(new TextDecoder().decode(bytes)).$id;
 if(typeof id==='string'&&id!=='urn:umf:core:'+CURRENT_CORE_VERSION)retiredSchemaUrns.add(id);
}
const retiredUrn=(value:string)=>retiredSchemaUrns.has(value.split('#')[0]!);
const historicalReceiptVerifiers=new Set(['tools/security/weft-admission-check.py','tools/security/weft_protocol_evidence.py']); // Original1598 proof identities only; see host-tools-migration.json.
// Exact negative assertions are evidence controls, never producer exemptions.
const coreRejectionControls=[{
 path:'tools/security/record-type-journal-cases.ts',
 source:"const older={...structuredClone(f.base),umf:'0.6.0'} as unknown as Document;refuses('older envelope unavailable',()=>inspectCoreRecordTypeJournal(older,f.current,f.events),'CORE_TYPE_JOURNAL_SOURCE');",
 reason:'The current journal must reject an older envelope; tests/security-record-type-journal.test.ts executes this refusal.',
},{"path":"scripts/core-field-browser.ts","source":"const retired=umf.copyJson(cases[0]);retired.umf='0.8.0';if(umf.validateDocument(retired).valid)throw Error('Retired core marker accepted');retiredRefusals++;if(retiredRefusals!==1)throw Error('Retired core marker accepted');","reason":"The current validator returns valid=false for a retired marker; fail if accepted."},
{"path":"scripts/core-ideals/cardinality-field-operations-browser.ts","source":"const retired=u.copyJson(rows[0].source);retired.umf='0.2.0';if(u.validateDocument(retired).valid)throw Error('Retired core marker accepted');","reason":"The current validator returns valid=false for a retired marker; fail if accepted."},
{"path":"scripts/core-ideals/nullability-field-operations-browser.ts","source":"const retired=u.copyJson(rows[0].source);retired.umf='0.2.0';if(u.validateDocument(retired).valid)throw Error('Retired core marker accepted');","reason":"The current validator returns valid=false for a retired marker; fail if accepted."},
{"path":"scripts/core-nullability-browser.ts","source":"const retired=u.copyJson(cases[0]);retired.umf='0.2.0';if(u.validateDocument(retired).valid)throw Error('Retired core marker accepted');retiredRefusals++;if(retiredRefusals!==1)throw Error('Retired core marker accepted');","reason":"The current validator returns valid=false for a retired marker; fail if accepted."},
{"path":"scripts/core-key-cases.ts","source":"add('legacy-profile',d=>d.umf='0.5.0',false,'SEMANTIC_TYPE_STRUCTURE');","reason":"Explicit current-core rejection assertion; does not construct an accepted historical document."},
{"path":"scripts/core-relationship-cases.ts","source":"add('old-version',d=>d.umf='0.6.0',false,'SEMANTIC_TYPE_STRUCTURE');","reason":"Explicit current-core rejection assertion; does not construct an accepted historical document."},
{"path":"scripts/core-schema-properties-browser.ts","source":"const retired=structuredClone(fixture);retired.umf='0.7.0';\n  if(u.validateDocument(retired).valid)throw Error('Retired core marker accepted');refusals++;","reason":"Marker-only mutation of an otherwise valid current clone must return valid=false; fail if accepted."},
{"path":"scripts/core-semantic-types-browser.ts","source":"const retired=u.copyJson(fixture);retired.umf='0.9.0';\n  refuses(()=>u.inspectCoreSemanticTypes(retired,identity),'retired-core-refusal');","reason":"Explicit current-core rejection assertion; does not construct an accepted historical document."},
{"path":"scripts/uuid-browser.ts","source":"const retired=structuredClone(doc);retired.umf='0.8.0';\n  if(u.validateDocument(retired).valid)throw Error('Retired core marker accepted');refusals++;","reason":"Marker-only mutation of an otherwise valid current clone must return valid=false; fail if accepted."},
{"path":"scripts/rust-migration/r5/javascript-numeric-parity.ts","source":"['old document', {...fieldContext, document:{...document, umf:'0.7.0'}}],","reason":"Frozen numeric-adapter negative control must refuse a retired core document; it is never an accepted profile."},
{"path":"scripts/rust-migration/r5/kind-nullability/verify-ajv.ts","source":"const badSource=structuredClone(outputs.kind_inspect_known) as any;badSource.source.umf='0.9.0';\nif(inspect(badSource))throw new Error('Ajv accepted an invalid nested source document');","reason":"Independent Ajv negative control must reject the mutated archived core document."},
];
const name=(node:ts.Node|undefined):string|undefined=>node&&(ts.isIdentifier(node)||ts.isStringLiteral(node))?node.text:undefined;
function discriminator(node:ts.Node):boolean {
 return ts.isPropertyAccessExpression(node)&&['umf','coreVersion','umfVersion'].includes(node.name.text)
  ||ts.isElementAccessExpression(node)&&!!node.argumentExpression&&['umf','coreVersion','umfVersion'].includes(name(node.argumentExpression)??'');
}
function history(path:string):boolean {return /(?:^|\/)(?:archive|historical|history)(?:\/|$)/.test(path)||path.startsWith('docs/helix/04-build/evidence/');}
function dependency(path:string,specifier:string):string {
 return specifier.startsWith('.')?posix.normalize(posix.join(posix.dirname(path),specifier)):specifier;
}
function retiredDependency(target:string):boolean {return retired.has(target)||retired.has(target+'.ts')||retired.has(target+'.json');}
function derivedValidation(target:string):boolean {return target.startsWith('src/validation/')&&!['src/validation/json-equality','src/validation/json-equality.ts','src/validation/constraint-language','src/validation/constraint-language.ts','src/validation/literal-policy','src/validation/literal-policy.ts'].includes(target);}
function generated(target:string):boolean {return target.startsWith('src/generated/')||target.startsWith('spec/metamodel/generated/')||['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json'].includes(target);}

/** Input inventory is explicit so negative tests exercise real checks without editing the tree. */
export function inspectCoreAuthority(files:readonly AuthoritySource[]):string[] {
 const issues:string[]=[];
 const graph=new Map<string,string[]>();
 const compilerRoots:string[]=[];
 const rejectionControlsUsed=new Set<(typeof coreRejectionControls)[number]>();
 const names=new Set(files.map(file=>file.path));
 const resolveInput=(target:string)=>[target,target+'.ts',target+'/index.ts'].find(path=>names.has(path))??target;
 for(const {path,source} of files){
  if(retired.has(path)){issues.push(`${path}: retired core path remains active`);continue;}
  const compiler=path.startsWith('scripts/metamodel/');
  const runtime=path.startsWith('src/');
  const producer=runtime||path.startsWith('scripts/')||path.startsWith('tools/')||path.startsWith('docs/helix/05-deploy/')||path.startsWith('python/');
  if(compiler)compilerRoots.push(path);
  if(path.endsWith('.json')&&path.startsWith('spec/')){
   let value:unknown;try{value=JSON.parse(source);}catch{issues.push(path+': invalid JSON authority resource');continue;}
   const visit=(node:unknown,pointer:string):void=>{if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach((child,i)=>visit(child,pointer+'/'+i));return;}
    for(const [key,child] of Object.entries(node)){
     const at=pointer+'/'+key.replaceAll('~','~0').replaceAll('/','~1');
     if(['$id','$ref'].includes(key)&&typeof child==='string'&&retiredUrn(child))issues.push(path+at+': references retired core schema identity');
     if(['oneOf','anyOf','allOf'].includes(key)&&Array.isArray(child)){
      const seen=new Set<string>();
      for(const branch of child)if(branch&&typeof branch==='object'&&Object.keys(branch).length===1&&typeof branch.$ref==='string'&&/^urn:umf:core:0\.[0-9]+\.0(?:#|$)/.test(branch.$ref)){
       if(seen.has(branch.$ref))issues.push(path+at+': duplicate core document reference branch');seen.add(branch.$ref);
      }
     }
     if(key==='$ref'&&typeof child==='string'&&/^urn:umf:core:0\.[1-9]\.0(?:#|$)/.test(child))issues.push(path+at+': references retired core document');
     if(['coreVersion','umfVersion'].includes(key)&&typeof child==='string'&&oldCore.test(child))issues.push(path+at+': declares retired core package envelope');
     if(key==='const'&&pointer.endsWith('/properties/sourceVersions/properties/core')&&typeof child==='string'&&oldCore.test(child))issues.push(path+at+': declares retired source core identity');
     if(key==='coreVersions'&&Array.isArray(child)&&child.some(value=>typeof value==='string'&&oldCore.test(value)))issues.push(path+at+': advertises retired core profile');
     if(key==='properties'&&child&&typeof child==='object'&&!Array.isArray(child))for(const discriminator of ['umf','coreVersion','umfVersion']){const shape=(child as Record<string,unknown>)[discriminator];if(shape&&typeof shape==='object'&&!Array.isArray(shape)){const constant=(shape as Record<string,unknown>).const;if(typeof constant==='string'&&oldCore.test(constant))issues.push(path+at+'/'+discriminator+': defines retired core discriminator');const values=(shape as Record<string,unknown>).enum;if(Array.isArray(values)&&values.some(value=>typeof value==='string'&&oldCore.test(value)))issues.push(path+at+'/'+discriminator+': defines retired core enum');}}
     visit(child,at);
    }
   };visit(value,'');
  }
  if(producer&&path.endsWith('.py')){
   // Host Python has no role in portable enforcement; scan its explicit emitted
   // marker literals and schema resource identities as a separate producer lane.
   for(const match of source.matchAll(/(?:['"](?:umf|coreVersion|umfVersion)['"]\s*:|\b(?:umf|coreVersion|umfVersion)\s*=)\s*['"](0\.[1-9]\.0)['"]/g))issues.push(`${path}:${source.slice(0,match.index).split('\n').length}: Python host constructs or pins a retired core marker`);
   for(const match of source.matchAll(/['"]urn:umf:core:0\.[1-9]\.0(?:#|['"])/g))issues.push(`${path}:${source.slice(0,match.index).split('\n').length}: Python host references a retired core document`);
   for(const match of source.matchAll(/Path\(\s*['"]([^'"]+)['"]/g))if(retiredCorePaths.some(p=>match[1]===p||match[1]!.endsWith('/'+p))&&!historicalReceiptVerifiers.has(path))issues.push(`${path}:${source.slice(0,match.index).split('\n').length}: Python host reads or writes a retired core resource`);
  }
  if(!/\.[cm]?[jt]sx?$/.test(path))continue;
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const issue=(node:ts.Node,reason:string)=>issues.push(`${path}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1}: ${reason}`);
  const producerIssue=(node:ts.Node,reason:string)=>{
   const control=coreRejectionControls.find(control=>{if(control.path!==path)return false;const at=source.indexOf(control.source);return at>=0&&at===source.lastIndexOf(control.source)&&node.getStart(ast)>=at&&node.end<=at+control.source.length;});
   if(control)rejectionControlsUsed.add(control);else issue(node,reason);
  };
  const inspect=(node:ts.Node):void=>{
   let spec:string|undefined;
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))spec=node.moduleSpecifier.text;
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
    const argument=node.arguments[0];
    if(argument&&ts.isStringLiteral(argument))spec=argument.text;
    else if(runtime||compiler)issue(node,'nonliteral dependency bypasses authority boundary');
   }
   if(spec){
    const target=dependency(path,spec);
    const erased=(ts.isImportDeclaration(node)&&!!node.importClause?.isTypeOnly)||(ts.isExportDeclaration(node)&&node.isTypeOnly);
    if(!erased)graph.set(path,[...(graph.get(path)??[]),resolveInput(target)]);
    if(retiredDependency(target))issue(node,'imports retired core resource '+target);
    if((runtime||compiler)&&history(target))issue(node,'imports inert historical evidence '+target);
    if(runtime&&target.startsWith('scripts/metamodel/'))issue(node,'runtime imports host metamodel compiler');
    if(compiler&&(generated(target)||derivedValidation(target)||target==='src/index'||target==='src/index.ts'||target==='src/model/document'||target==='src/model/document.ts'))issue(node,'compiler bootstraps through derived core authority '+target);
   }
   if(producer){
    if(ts.isStringLiteral(node)&&retiredUrn(node.text))producerIssue(node,'references retired core schema identity');
    if(!compiler&&ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken&&ts.isStringLiteral(node.left)&&/^urn:umf:core:(?:0\.)?$/.test(node.left.text)&&!(ts.isIdentifier(node.right)&&node.right.text==='CURRENT_CORE_VERSION'))producerIssue(node,'constructs a noncurrent dynamic core document reference');
    if(!compiler&&ts.isTemplateExpression(node)&&/^urn:umf:core:(?:0\.)?$/.test(node.head.text)&&!(node.head.text==='urn:umf:core:'&&ts.isIdentifier(node.templateSpans[0]!.expression)&&node.templateSpans[0]!.expression.text==='CURRENT_CORE_VERSION'))producerIssue(node,'constructs a noncurrent dynamic core document reference');
    if(ts.isPropertyAssignment(node)&&['umf','coreVersion','umfVersion'].includes(name(node.name)??'')&&ts.isStringLiteral(node.initializer)&&oldCore.test(node.initializer.text))producerIssue(node,'constructs a retired core marker');
    if(ts.isPropertyAssignment(node)&&['umf','coreVersion','umfVersion'].includes(name(node.name)??'')&&ts.isObjectLiteralExpression(node.initializer))for(const property of node.initializer.properties)if(ts.isPropertyAssignment(property)){
     if(name(property.name)==='const'&&ts.isStringLiteral(property.initializer)&&oldCore.test(property.initializer.text))producerIssue(property,'generates a retired core discriminator');
     if(name(property.name)==='enum'&&ts.isArrayLiteralExpression(property.initializer)&&property.initializer.elements.some(value=>ts.isStringLiteral(value)&&oldCore.test(value.text)))producerIssue(property,'generates a retired core enum');
    }
    if(ts.isPropertyAssignment(node)&&name(node.name)==='coreVersions'&&ts.isArrayLiteralExpression(node.initializer)&&node.initializer.elements.some(value=>ts.isStringLiteral(value)&&oldCore.test(value.text)))producerIssue(node,'advertises retired core profiles');
    if(ts.isPropertyAssignment(node)&&['$ref','$id'].includes(name(node.name)??'')&&ts.isStringLiteral(node.initializer)&&/^urn:umf:core:0\.[1-9]\.0(?:#|$)/.test(node.initializer.text))producerIssue(node,'references or generates a retired core document');
    if(ts.isPropertySignature(node)&&['umf','coreVersion','umfVersion'].includes(name(node.name)??'')){
     const visitType=(child:ts.Node):void=>{if(ts.isStringLiteral(child)&&oldCore.test(child.text))producerIssue(child,'exposes retired core marker in public shape');ts.forEachChild(child,visitType);};if(node.type)visitType(node.type);
    }
    if(ts.isBinaryExpression(node)){
     for(const [a,b] of [[node.left,node.right],[node.right,node.left]] as const)if(discriminator(a)&&ts.isStringLiteral(b)&&oldCore.test(b.text))producerIssue(node,'uses retired core assignment or dispatch');
    }
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='includes'&&ts.isArrayLiteralExpression(node.expression.expression)&&node.arguments.some(discriminator)){
     if(node.expression.expression.elements.some(element=>ts.isStringLiteral(element)&&oldCore.test(element.text)))producerIssue(node,'dispatches through retired core marker array');
    }
   }
   if((path.startsWith('src/generated/')||path==='src/validation/constraint-kernel.ts')&&ts.isIdentifier(node)&&['Bun','process','Buffer','require','eval','Function'].includes(node.text))issue(node,'browser enforcement contains host or dynamic-code identifier '+node.text);
   ts.forEachChild(node,inspect);
  };inspect(ast);
 }
 for(const control of coreRejectionControls)if(names.has(control.path)&&!rejectionControlsUsed.has(control))issues.push(control.path+': stale or changed explicit core-rejection control');
 for(const compiler of compilerRoots){
  const seen=new Set<string>();
  const walk=(path:string,chain:string[]):void=>{if(seen.has(path))return;seen.add(path);
   for(const target of graph.get(path)??[]){if(generated(target)||derivedValidation(target)||target==='src/index.ts'||target==='src/model/document.ts')issues.push(compiler+': transitive bootstrap dependency '+[...chain,path,target].join(' → '));else walk(target,[...chain,path]);}
  };walk(compiler,[]);
 }
 return [...new Set(issues)].sort();
}

/** Check built/installed file inventories, rather than assuming deleted source removes stale output. */
export function inspectCoreDistribution(paths:readonly string[]):string[] {
 const issues:string[]=[];
 for(const path of paths){
  if(retiredCorePaths.some(retiredPath=>!retiredPath.startsWith('src/')&&!retiredPath.startsWith('spec/core/')&&(path===retiredPath||path.endsWith('/'+retiredPath))))issues.push(path+': retired host, tool or input remains distributed');
  if(/^(?:explorer\.(?:html|js|css)|schema-browser\.html|catalog-defaults\.js|schema-navigation\.js|browser-style\.css|components\.css|chunk-[a-z0-9]+\.js)$/.test(path))issues.push(path+': retired site host, renderer asset or shim remains published');
  if(retiredCorePaths.some(retiredPath=>retiredPath.startsWith('spec/core/')&&(path===retiredPath||path.endsWith('/'+retiredPath))))issues.push(path+': retired core schema remains distributed');
  if(retiredCorePaths.some(retiredPath=>retiredPath.startsWith('src/')&&['.ts','.js','.d.ts'].some(extension=>{const emitted=retiredPath.replace(/\.ts$/,extension);return path===emitted||path.endsWith('/'+emitted);})))issues.push(path+': retired core authority module remains distributed');
  if(/(?:^|\/)(?:spec\/(?:historical|history|archive)|docs\/helix\/04-build\/evidence)(?:\/|$)/.test(path))issues.push(path+': inert historical archive remains distributed');
 }
 return issues.sort();
}
export async function checkCoreDistribution(directory:string):Promise<{files:number}> {
 const files:string[]=[];for await(const path of new Bun.Glob('**/*').scan({cwd:directory,onlyFiles:true}))files.push(path);
 if(!files.length)throw Error('CORE_DISTRIBUTION empty artifact inventory');const issues=inspectCoreDistribution(files);if(issues.length)throw Error('CORE_DISTRIBUTION\n'+issues.join('\n'));return {files:files.length};
}

export async function checkCoreAuthority(root=resolve(import.meta.dir,'..')):Promise<{files:number;retiredPaths:number}> {
 const paths=new Set<string>();
 const producerPatterns=['src','scripts','tools','docs/helix/05-deploy/microsite','docs/helix/05-deploy/reference','docs/helix/05-deploy/schema-browser'].flatMap(directory=>['ts','tsx','js','jsx','mts','cts','mjs','cjs'].map(extension=>`${directory}/**/*.${extension}`));
 for(const pattern of [...producerPatterns,'scripts/**/*.py','tools/**/*.py','python/**/src/**/*.py','spec/**/*.json','docs/helix/05-deploy/schema-browser/**/*.ts',...retiredCorePaths])for await(const path of new Bun.Glob(pattern).scan({cwd:root,onlyFiles:true}))if(!path.includes('/dist/')&&!path.includes('/node_modules/'))paths.add(path);
 const files=await Promise.all([...paths].sort().map(async path=>({path,source:await Bun.file(resolve(root,path)).text()})));
 if(!files.some(file=>file.path==='src/validation/document.ts')||!files.some(file=>file.path.startsWith('scripts/metamodel/')))throw Error('CORE_AUTHORITY incomplete source census');
 const issues=inspectCoreAuthority(files);if(issues.length)throw Error('CORE_AUTHORITY\n'+issues.join('\n'));
 return {files:files.length,retiredPaths:retiredCorePaths.length};
}
if(import.meta.main){const index=process.argv.indexOf('--distribution');console.log(index>=0?await checkCoreDistribution(resolve(process.argv[index+1]??'')):await checkCoreAuthority());}
