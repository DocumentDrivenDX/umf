// SPDX-License-Identifier: MIT OR Apache-2.0
import {compileTableDeployment,type TableDeploymentBundle} from '../src/table-deployment';
import {discoverTableMigrationChanges} from '../src/table-migration';
import {legalSource} from '../tests/lifecycle/legal-fixture';

const configuration={module:'legal_lifecycle',schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}};
function deployment(source:unknown):TableDeploymentBundle{
 const result=compileTableDeployment({text:JSON.stringify(source),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 return result.bundle;
}
function dropField(source:any,element:string):any{
 const document=structuredClone(source),module=document.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables.find((item:any)=>item.id==='matters')!;
 table.columns=table.columns.filter((column:any)=>column.field.element!==element);
 module.elements.find((item:any)=>item.id==='matters')!.members=module.elements.find((item:any)=>item.id==='matters')!.members.filter((field:any)=>field.element!==element);
 payload.commands.find((command:any)=>command.id==='read_matters')!.body.fields=payload.commands.find((command:any)=>command.id==='read_matters')!.body.fields.filter((field:any)=>field.element!==element);
 for(const set of payload.seedSets)for(const row of set.rows)if(row.table==='matters')row.values=row.values.filter((value:any)=>value.field.element!==element);
 return document;
}
const original=legalSource();
const cases:{name:string;previous:TableDeploymentBundle;next:TableDeploymentBundle;expected:ReturnType<typeof discoverTableMigrationChanges>}[]=[];
function add(name:string,previous:TableDeploymentBundle,next:TableDeploymentBundle):void{
 cases.push({name,previous,next,expected:discoverTableMigrationChanges(previous,next)});
}
add('drop-column',deployment(original),deployment(dropField(original,'matters__court')));
const widened=structuredClone(original),widenedModule=widened.modules[0]!,rate=widenedModule.elements.find((element:any)=>element.id==='timekeepers__billing_rate')!;
rate.facets={precision:12,scale:2};
widenedModule.extensions['umf.tables'].tables.find((table:any)=>table.id==='timekeepers')!.columns.find((column:any)=>column.field.element==='timekeepers__billing_rate')!.nativeType={kind:'numeric',precision:12,scale:2};
add('numeric-widening',deployment(original),deployment(widened));
const policyChanged=structuredClone(original);
policyChanged.modules[0]!.extensions['umf.tables'].tables.find((table:any)=>table.id==='clients')!.policy.person.select={kind:'deny'};
add('policy-change',deployment(original),deployment(policyChanged));
await Bun.write(process.argv[2]!,JSON.stringify(cases,null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,candidates:cases.map(item=>({name:item.name,count:item.expected.length}))}));
