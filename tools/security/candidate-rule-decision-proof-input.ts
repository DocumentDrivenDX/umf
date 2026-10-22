/** Actual emitter/parser bridge; retained AST is interpreted separately by Z3. */
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lowerCandidateSecurityRuleFold} from '/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition';
const basis='docs/helix/04-build/evidence/security/truss-candidate-condition.json',foundation=await Bun.file(basis).json();
const digest=async(p:string)=>createHash('sha256').update(await Bun.file(p).bytes()).digest('hex');
for(const [p,h] of Object.entries(foundation.sourceDigests))if(await digest(p)!==h)throw Error('Stale compiler/emitter basis');
const parserEntry=fileURLToPath(import.meta.resolve('@libpg-query/parser')),paths=[basis,'tools/security/candidate-rule-decision-proof-input.ts',...Object.keys(foundation.sourceDigests)],packages:any[]=[],visited=new Set<string>();
async function capture(entry:string,expectedName:string){
 let root=dirname(entry),metadata:any;
 for(;;){const path=join(root,'package.json');if(await Bun.file(path).exists()){metadata=await Bun.file(path).json();if(metadata.name===expectedName)break;}const parent=dirname(root);if(parent===root)throw Error('Missing resolved package');root=parent;}
 if(visited.has(root))return;visited.add(root);packages.push({name:metadata.name,version:metadata.version,root,entry});
 for await(const p of new Bun.Glob('**/*').scan({cwd:root,onlyFiles:true}))if(!p.split('/').includes('node_modules'))paths.push(join(root,p));
 const resolver=createRequire(entry);
 for(const name of Object.keys(metadata.dependencies??{})){let resolved:string;try{resolved=resolver.resolve(name);}catch{resolved=resolver.resolve(name+'/package.json');}await capture(resolved,name);}
}
await capture(parserEntry,'@libpg-query/parser');
if(packages[0].version!=='17.6.10')throw Error('Resolved parser version differs');
const sources=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const cacheBefore=new Set(Object.keys(createRequire(parserEntry).cache));
const {parse}=await import(parserEntry);
function clean(value:any):any{return Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['location','stmt_location','stmt_len'].includes(key)).map(([key,v])=>[key,clean(v)])):value;}
const artifacts=[];
for(const fixture of foundation.foldArtifacts){
 const emitted=lowerCandidateSecurityRuleFold(fixture.input);if(emitted.sql!==fixture.sql)throw Error('Actual SQL differs');
 const full=clean(await parse(emitted.sql)),body=clean(await parse(emitted.decisionSql));
 if(full.version!==170004||body.version!==170004||full.stmts.length!==1||body.stmts.length!==1)throw Error('Parser profile differs');
 const statement=full.stmts[0].stmt.SelectStmt,{withClause,...selected}=statement;
 if(JSON.stringify(selected)!==JSON.stringify(body.stmts[0].stmt.SelectStmt))throw Error('Detached decision body differs');
 const cte=withClause.ctes[0].CommonTableExpr;
 if(withClause.ctes.length!==1||cte.ctename!=='candidate_rule_truths'||cte.ctematerialized!=='CTEMaterializeAlways'||JSON.stringify(cte.aliascolnames.map((n:any)=>n.String.sval))!==JSON.stringify(['rule_index','effect','truth'])||cte.ctequery.SelectStmt.valuesLists.length!==emitted.ruleIds.length)throw Error('Truth CTE profile differs');
 artifacts.push({id:fixture.id,decisionSql:emitted.decisionSql,decisionAst:body,fullSql:emitted.sql,fullAst:full,ruleIds:emitted.ruleIds});
}
const empty=lowerCandidateSecurityRuleFold({...foundation.foldArtifacts[0].input,rules:[]});
artifacts.push({id:'empty-selection',decisionSql:empty.decisionSql,decisionAst:clean(await parse(empty.decisionSql)),fullSql:empty.sql,fullAst:clean(await parse(empty.sql)),ruleIds:empty.ruleIds});
const loadedParserJs=Object.keys(createRequire(parserEntry).cache).filter(p=>!cacheBefore.has(p)&&p.includes('/node_modules/'));
if(!loadedParserJs.includes(parserEntry)||loadedParserJs.some(p=>!Object.hasOwn(sources,p)))throw Error('Loaded parser dependency is unpinned');
for(const [p,h] of Object.entries(sources))if(await digest(p)!==h)throw Error('Captured source changed');
await Bun.write('docs/helix/04-build/evidence/security/candidate-rule-decision-proof-input.json',JSON.stringify({status:'passed',sourceDigests:sources,parser:'@libpg-query/parser@17.6.10',parserVersion:170004,parserEntry,packages,loadedParserJs,runtime:{bun:Bun.version},artifacts,scope:'Actual six retained nonempty rule-fold SQL programs and empty selection regenerated from the private emitter and parsed by the pinned PostgreSQL WASM parser. Full SELECT body equals separately emitted decisionSql; sole materialized truth CTE name, column order and row count checked. Condition expressions and their truth values are not refined by this bridge; the subsequent proof assumes faithful complete truth CTE rows.'},null,2)+'\n');
console.log(JSON.stringify({status:'passed',artifacts:artifacts.length}));
