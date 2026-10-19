// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {hashCanonical} from '../../src/compilation/bundle/hash';
import fixture from './fixtures/table-lifecycle-note.json';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tableSchema from '../../spec/extensions/tables/schema.json';
import {createValidator} from '../../src/validation/schema';
import {deploymentFixtureSource} from '../unified/table-deployment-fixture';
const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const source=()=>structuredClone(fixture) as any;
const compile=(doc=source(),config:unknown=configuration)=>compileTableDeployment({text:JSON.stringify(doc),configuration:config});
function compiled(doc=source(),config:unknown=configuration){const result=compile(doc,config);if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));return result.bundle;}
const payload=(d:any)=>d.modules[0].extensions['umf.tables'];

test('deployment is deterministic inert copied output with exact bytes and configuration authority',()=>{
 const input=source(),bundle=compiled(input);
 expect(bundle).toEqual(compiled(input));expect(verifyTableDeployment(bundle)).toEqual(bundle);expect(bundle.nativeQualified).toBe(false);
 const sql=bundle.steps.map(s=>s.sql).join('\n');
 expect(sql).toContain('FORCE ROW LEVEL SECURITY');expect(sql).toContain('TO "plugin_batch" USING (TRUE)');expect(sql).toContain('GRANT UPDATE ("owner")');expect(sql).toContain('GRANT USAGE ON SCHEMA "plugin_demo"');
 expect(bundle.steps.filter(s=>s.kind==='policy')).toHaveLength(8);
 const changed=compileTableDeployment({text:JSON.stringify(input,null,2),configuration});
 expect(changed.status).toBe('compiled');if(changed.status==='compiled'){expect(changed.bundle.sourceDigest).not.toBe(bundle.sourceDigest);expect(changed.bundle.bundleDigest).not.toBe(bundle.bundleDigest);expect(changed.bundle.steps).toEqual(bundle.steps);}
 const other=compiled(input,{...configuration,schema:'plugin_other'});expect(other.configurationDigest).not.toBe(bundle.configurationDigest);expect(other.bundleDigest).not.toBe(bundle.bundleDigest);
 bundle.expectedCatalog.tables[0]!.name='edited';expect(payload(input).tables[0].name).toBe('notes');expect(()=>verifyTableDeployment(bundle)).toThrow();
});

test('deployment verification rejects tampering even with recomputed untrusted digests',()=>{
 for(const mutate of [(b:any)=>b.steps[0].sql='DROP SCHEMA public CASCADE',(b:any)=>b.steps.reverse(),(b:any)=>b.extra='unknown',(b:any)=>b.source.utf8+=' ',(b:any)=>b.expectedCatalog.columns[0].definitionSql='id text DEFAULT malicious()',(b:any)=>b.expectedCatalog.columns[0].typeMod=777,(b:any)=>b.expectedCatalog.keys[0].definitionSql='CONSTRAINT injected CHECK (true)']){
  const b=compiled();mutate(b);const {bundleDigest,...body}=b;b.bundleDigest=hashCanonical(body);expect(()=>verifyTableDeployment(b)).toThrow();
 }
});

test('emitted bundle satisfies its exact machine schema and unknown envelope fields refuse',()=>{
 const validator=createValidator();validator.addSchema(tableSchema);const validate=validator.compile(deploymentSchema),bundle=compiled();
 expect(validate(bundle)).toBe(true);expect(validate({...bundle,unknown:true})).toBe(false);
 for(const key of ['version','canonicalization','source','sourceDigest','configuration','configurationDigest','steps','expectedCatalog','bundleDigest','nativeQualified']){const changed:any=structuredClone(bundle);delete changed[key];expect(validate(changed)).toBe(false);}
});

test('configuration refuses shared/system schemas, principal collisions, unknowns and NUL',()=>{
 for(const config of [{...configuration,schema:'public'},{...configuration,schema:'pg_temp'},{...configuration,batchRole:configuration.personRole},{...configuration,groupRoles:{group:configuration.ownerRole}},{...configuration,unknown:true},{...configuration,ownerRole:'bad\0role'},{...configuration,schema:'é'.repeat(32)}])expect(compile(source(),config).status).toBe('blocked');
});

test('native quoting has no string or identifier injection and no implicit seed execution',()=>{
 const d=source();payload(d).tables[0].name='notes"; DROP SCHEMA public;--';payload(d).tables[0].columns[1].default={kind:'literal',value:{string:"O'Reilly\\n%"}};
 payload(d).seedSets=[{id:'fixture',conflict:'error',rows:[{table:'notes',values:[{field:{module:'demo',element:'id'},value:{string:'seed'}},{field:{module:'demo',element:'owner'},value:{string:'owner'}}]}]}];
 const b=compiled(d),sql=b.steps[0]!.sql;expect(sql).toContain('"notes""; DROP SCHEMA public;--"');expect(sql).toContain("E'O''Reilly\\\\n%'");expect(b.seedSets).toHaveLength(1);expect(b.steps.some(s=>s.sql.startsWith('INSERT'))).toBe(false);
});

test('unqualified native codecs, logical facets and semantic policy combinations refuse',()=>{
 for(const mutate of [
  (d:any)=>{d.modules[0].elements[0].facets={maxLength:5};},
  (d:any)=>{d.modules[0].elements[0].allowedValues=[{string:'only'}];},
  (d:any)=>{payload(d).tables[0].columns[0].nativeType={kind:'char',length:4};},
  (d:any)=>{payload(d).tables[0].policy.person.select={kind:'memberOfRole',role:'unbound'};},
  (d:any)=>{d.modules[0].extensions['umf.security']={unknown:'retained'};d.vocabularies['umf.security']={version:'0.2.0'};},
 ]){const d=source();mutate(d);expect(compile(d).status).toBe('blocked');}
});

test('per-row group lookup is bounded to host declared groups',()=>{
 const d=source();payload(d).tables[0].policy.person.select={kind:'memberOf',field:{module:'demo',element:'owner'}};
 const b=compiled(d),sql=b.steps.find(s=>s.sourcePath.endsWith('/person/select'))!.sql;
 expect(sql).toContain("IN (E'plugin_readers')");expect(sql).toContain("pg_catalog.pg_has_role(CURRENT_USER");
 expect(compile(d,{...configuration,groupRoles:{}}).status).toBe('blocked');
});

test('via correlation cannot be shadowed by an authored table name and requires audience SELECT closure',()=>{
 const d=structuredClone(deploymentFixtureSource),p=payload(d);p.tables[0].name='umf_v_1_0';
 const bundle=compiled(d),sql=bundle.steps.find(s=>s.sourcePath.endsWith('/tables/0/policy/person/select'))!.sql;
 expect(sql).toContain('"plugin_demo"."umf_v_1_0"."parent_id" = "umf_v_1_0"."id"');
 p.tables[0].policy.batch.select={kind:'via',path:[{module:'demo',id:'parent',direction:'forward'}],rule:{kind:'allow'}};
 p.tables[1].policy.batch.select={kind:'deny'};
 const refused=compile(d);expect(refused.status).toBe('blocked');
 if(refused.status==='blocked'){expect(refused.diagnostics[0]!.message).toContain('related-table SELECT');expect(refused.diagnostics[0]!.path).toEndWith('/batch/select/path/0');}
});
