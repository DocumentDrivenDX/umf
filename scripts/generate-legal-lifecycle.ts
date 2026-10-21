// SPDX-License-Identifier: MIT OR Apache-2.0
/** Development fixture materialization; schema libraries remain browser compatible. */
import {legalSource,evolvedLegalSource,indexedLegalSource,originals,moduleId} from '../tests/lifecycle/legal-fixture';
import {compileTableDeployment} from '../src/table-deployment';
import {compileTableMigration} from '../src/table-migration';
import {hashCanonical,sha256Text} from '../src/compilation/bundle/hash';
const root=new URL('../fixtures/table-lifecycle/legal/',import.meta.url);
const configuration={module:moduleId,schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}};
const source=legalSource(),evolved=evolvedLegalSource(source),indexed=indexedLegalSource(evolved.source);
const outputs=new Map<string,string>();
const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
outputs.set('original-domain-sources.json',json(originals));
outputs.set('configuration.json',json(configuration));
outputs.set('initial.json',json(source));outputs.set('evolved.json',json(evolved.source));outputs.set('indexed.json',json(indexed.source));
outputs.set('evolution-options.json',json(evolved.options));outputs.set('index-options.json',json(indexed.options));
let previous:any=null,predecessor:any=null;
for(const [i,document]of [source,evolved.source,indexed.source].entries()){
 const result=compileTableDeployment({text:JSON.stringify(document),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result));
 const compiled=compileTableMigration({id:String(i+1).padStart(3,'0'),previous,predecessor,next:result.bundle,...(i===1?{options:evolved.options}:i===2?{options:indexed.options}:{})});
 if(compiled.status!=='compiled')throw Error(JSON.stringify(compiled));
 if(i===0)outputs.set('initial.sql','-- Generated from fabricated legal domain sources; review configuration before application.\n'+result.bundle.steps.map(s=>s.sql+';').join('\n')+'\n');
 outputs.set('plan-'+String(i+1).padStart(3,'0')+'.json',json(compiled.plan));
 previous=result.bundle;predecessor={id:compiled.plan.id,digest:compiled.plan.digest};
}
outputs.set('projection.json',json({sourcePaths:originals.map(s=>'spec/domain-packs/legal/umf/'+s.table_name+'.json'),originalsDigest:hashCanonical(originals),core:'0.10.0',tablesProfile:'postgresql18/0.1',scope:'Fabricated legal lifecycle fixture; not ethical-wall, clinical, regulatory or managed-service qualification',decisions:['Original domain metadata retained completely in original-domain-sources.json; it is not silently interpreted as executable validation.','TableSpec INTEGER explicitly selects int4; unconstrained VARCHAR explicitly selects native text/C collation. No general TableSpec-native equivalence is claimed.','Native FK semantics choose NO ACTION update, RESTRICT delete, immediate nondeferrable; source FK metadata is preserved.','Matters SELECT/INSERT/UPDATE/DELETE require visible assigned membership; membership writes denied to ordinary and batch roles.','Clients are explicitly public synthetic reference reads; billing data is readable only by a trusted billing_admin group.','Batch may SELECT and INSERT matters but cannot UPDATE/DELETE them. This is a command boundary, not retry idempotency.','The original matters/client FK is deliberately delayed to exercise added constraints; review_state and database_role are explicit fixture additions.','Default review state keeps historical immutable seeds valid for fresh installation. Evolution removes the default during ADD, performs the explicit backfill, then installs DEFAULT and NOT NULL.'],files:Object.fromEntries([...outputs].map(([name,text])=>[name,sha256Text(text)]))}));
for(const [name,text]of outputs){const file=new URL(name,root);if(process.argv.includes('--check')){if(await Bun.file(file).text()!==text)throw Error('Stale legal fixture: '+name);}else await Bun.write(file,text);}
console.log(JSON.stringify({status:process.argv.includes('--check')?'current':'generated',files:outputs.size,tables:originals.length}));
