import {createValidator,installJsonEquality} from '../src/validation/schema';
import Ajv2019 from 'ajv/dist/2019';
import AjvDraft4 from 'ajv-draft-04';

// Compile the distributed schemas together to catch unresolved references and ID collisions.
// Strict authoring checks are separate: these files include deliberate conditional schemas.
const older=new Ajv2019({strict:false,allErrors:true,validateFormats:false}),legacy=new AjvDraft4({strict:false,allErrors:true,validateFormats:false});
installJsonEquality(older);installJsonEquality(legacy as any);
const validators=new Map([
 ['https://json-schema.org/draft/2020-12/schema',createValidator(false)],
 ['https://json-schema.org/draft/2019-09/schema',older],
 ['http://json-schema.org/draft-04/schema#',legacy as any],
]);
const rows:{path:string;id:string|null;dialect:string;passed:boolean;failures:string[]}[]=[];
const paths=(await Array.fromAsync(new Bun.Glob('spec/**/*.json').scan())).sort();
for(const path of paths){
 const schema=await Bun.file(path).json();if(!schema||typeof schema!=='object'||Array.isArray(schema)||!schema.$schema)continue;
 const row={path,id:typeof schema.$id==='string'?schema.$id:typeof schema.id==='string'?schema.id:null,dialect:schema.$schema,passed:false,failures:[] as string[]};rows.push(row);
 try{const validator=validators.get(row.dialect);if(!validator)throw Error('No audit compiler for declared dialect: '+row.dialect);validator.addSchema(schema,path);}catch(error){row.failures.push(String(error));}
}
for(const row of rows){if(row.failures.length)continue;try{if(!validators.get(row.dialect)!.getSchema(row.path))throw Error('Schema was not registered');row.passed=true;}catch(error){row.failures.push(String(error));}}
if(!rows.length)throw Error('No JSON schemas found');
await Bun.write('fixtures/json-schema-audit.json',JSON.stringify({scope:'Published JSON Schema metaschema/compilation and reference closure, not native semantics',schemas:rows.length,passed:rows.filter(r=>r.passed).length,results:rows},null,2)+'\n');
console.log(JSON.stringify({schemas:rows.length,passed:rows.filter(r=>r.passed).length,failures:rows.filter(r=>!r.passed)},null,2));
if(rows.some(r=>!r.passed))process.exitCode=1;
