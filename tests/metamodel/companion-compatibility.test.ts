// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyCompanionCompatibility} from '../../scripts/metamodel/companion-compatibility';
import {structuralSource} from '../../scripts/metamodel/structural';

const paths=['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','src/generated/core-validators.ts'];
const root=resolve(import.meta.dir,'../../tests/rust-core/fixtures/r8-accounted-companion-inputs');
const archived=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(resolve(root,path),'utf8')])));
function successor(){
 const result={...archived};
 const schemas=paths.slice(0,3).map(path=>{const value=JSON.parse(result[path]!);value.$comment=`Generated from spec/metamodel/umf.yaml; model ${'a'.repeat(64)}; compiler ${'b'.repeat(64)}`;result[path]=JSON.stringify(value,null,2)+'\n';return value;});
 result[paths[3]!]=structuralSource(schemas);
 return result;
}
test('accounted companion accepts only a root provenance successor of its exact archived inputs',()=>{
 const result=verifyCompanionCompatibility(archived,successor());
 expect(result.scope).toBe('root-schema-provenance-only');
 expect(Object.keys(result.inputs)).toEqual(paths);
});
test('accounted companion refuses semantic changes, unrelated comments and executable code changes',()=>{
 for(const mutate of [
  (v:Record<string,string>)=>{const x=JSON.parse(v[paths[0]!]!);x.properties.id={type:'number'};v[paths[0]!]=JSON.stringify(x,null,2)+'\n';},
  (v:Record<string,string>)=>{const x=JSON.parse(v[paths[0]!]!);x.$defs.id.$comment='unrelated';v[paths[0]!]=JSON.stringify(x,null,2)+'\n';},
  (v:Record<string,string>)=>{v[paths[3]!] += '\n// unrelated comment\n';},
  (v:Record<string,string>)=>{v[paths[3]!] += '\nthrow Error("modified");\n';},
  (v:Record<string,string>)=>{const x=JSON.parse(v[paths[0]!]!);x.$comment='anything';v[paths[0]!]=JSON.stringify(x,null,2)+'\n';},
 ]){const changed=successor();mutate(changed);expect(()=>verifyCompanionCompatibility(archived,changed)).toThrow();}
 const changedArchive={...archived,[paths[3]!]:archived[paths[3]!]+'\n'};
 expect(()=>verifyCompanionCompatibility(changedArchive,successor())).toThrow('ARCHIVED_BACKEND_DRIFT');
});
