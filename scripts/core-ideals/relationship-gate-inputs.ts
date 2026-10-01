import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
export const relationshipTests=['tests/core/relationship-ideal.test.ts','tests/core/relationship-transition.test.ts','tests/core/relationship-operations.test.ts','tests/core-ideals/relationship-tablespec-projection.test.ts','tests/core-ideals/relationship-avro-projection.test.ts','tests/core-ideals/relationship-parquet.test.ts','tests/core-ideals/relationship-sqlserver.test.ts','tests/core-ideals/relationship-postgresql.test.ts','tests/core-ideals/relationship-extras.test.ts'];
export const relationshipProofs=[
 'fixtures/validation/relationship-tablespec-projection-native.json','fixtures/validation/relationship-tablespec-projection-browser.json',
 'fixtures/validation/relationship-avro-projection-native.json','fixtures/validation/relationship-avro-projection-browser.json',
 'fixtures/validation/relationship-parquet-native.json','fixtures/validation/relationship-parquet-browser.json',
 'fixtures/validation/relationship-sqlserver-native.json','fixtures/validation/relationship-sqlserver-browser.json',
 'fixtures/validation/relationship-postgresql-native.json','fixtures/validation/relationship-postgresql-browser.json',
 'fixtures/validation/relationship-conformance-browser.json',
 'fixtures/validation/relationship-extras/native.json','fixtures/validation/relationship-extras/oracle.json','fixtures/validation/relationship-extras/browser.json',
] as const;
export const relationshipRefreshCommands=[
 ['bun','run','build'],['bun','run','build:postgresql'],
 ['bun','scripts/core-ideals/relationship-tablespec-oracle.ts'],
 ['bun','scripts/core-ideals/relationship-avro-projection-cases.ts'],['.venv/bin/python','scripts/core-ideals/relationship-avro-projection-native.py'],
 ['bun','scripts/core-ideals/relationship-parquet-oracle.ts'],
 ['bun','scripts/core-ideals/relationship-sqlserver-oracle.ts'],['bun','scripts/core-ideals/relationship-postgresql-oracle.ts'],
 ['bun','scripts/core-ideals/relationship-extras-oracle.ts'],
 ...['tablespec-projection','avro-projection','parquet','sqlserver','postgresql','extras'].map(s=>['bun',`scripts/core-ideals/relationship-${s}-browser.ts`]),
 ['bun','scripts/core-ideals/relationship-conformance-browser.ts'],
 ['bun','test',...relationshipTests],['bun','run','typecheck'],
];
export const digest=(text:string|Uint8Array)=>createHash('sha256').update(text).digest('hex');
export function safePath(path:string){const rel=relative(process.cwd(),resolve(path));if(!path||path.includes('\\')||path.startsWith('/')||rel.startsWith('..')||rel!==path)throw Error('Unsafe proof path '+path);return path;}
export const readEvidence=(path:string)=>readFile(safePath(path));
export async function relationshipSourceHashes(){
 const paths:string[]=[];
 for(const root of ['src','scripts','spec','tests','native']){
  async function visit(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory()){if(!['node_modules','.cache','target','build'].includes(entry.name))await visit(p);}else if(/\.(ts|py|json|sql)$/.test(p))paths.push(p);}}
  await visit(root);
 }
 paths.push('package.json','bun.lock','fixtures/relationship/authored/corpus.json','fixtures/projections/ddd-authored-relationships/base.json');
 return Object.fromEntries(await Promise.all(paths.sort().map(async p=>[p,digest(await readEvidence(p))])));
}
