import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/dbt-semantic/native-schema.json';
const escape=(s:string)=>s.replaceAll('~','~0').replaceAll('/','~1');
test('US-022-AC12: every native field boundary agrees with independent serialized-shape evidence',async()=>{
 const evidence=await Bun.file('fixtures/dbt/semantic-fields/results.json').json();
 expect(createHash('sha256').update(await Bun.file('spec/extensions/dbt-semantic/native-schema.json').bytes()).digest('hex')).toBe(evidence.schemaSha256);
 expect(evidence.fields).toBe(143);expect(evidence.results).toHaveLength(1859);
 const ajv=createValidator(false).addSchema(schema),checks=new Map<string,ReturnType<typeof ajv.compile>>();let accepted=0,exceptions=0,coercionBoundary=0;
 for(const r of evidence.results){const key=r.model+'/'+r.field;let check=checks.get(key);if(!check){const prefix=r.model==='PydanticSemanticManifest'?'':'/definitions/'+escape(r.model);check=ajv.compile({$ref:schema.$id+'#'+prefix+'/properties/'+escape(r.alias)});checks.set(key,check);}
  expect(check(r.input)).toBe(r.inputShapeValid);
  if(r.nativeAccepted){accepted++;expect(check(r.serialized)).toBe(true);expect(r.serializedShapeValid).toBe(true);if(!r.inputShapeValid)coercionBoundary++;}
  if(r.nativeException){exceptions++;expect(r.nativeAccepted).toBe(false);expect(['AttributeError','ParsingException']).toContain(r.nativeException.type);}
 }
 expect(checks.size).toBe(143);expect(accepted).toBe(690);expect(exceptions).toBe(128);expect(coercionBoundary).toBe(427);
},30000);
