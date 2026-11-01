import {expect,test} from 'bun:test';
import {compileTableDeployment,compileTableMigration,verifyTableMigration,UmfError} from '../../src/index-node-v4';
import {legalSource} from '../lifecycle/legal-fixture';

const configuration={module:'legal_lifecycle',schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}};
function appendOptionalReviewState(){
 const source=legalSource(),module=source.modules[0]!,table=module.extensions['umf.tables'].tables.find((item:any)=>item.id==='matters')!,field={module:module.id,element:'matters__optional_review_state'};
 module.elements.push({id:field.element,name:field.element,kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}} as never);
 module.elements.find((item:any)=>item.id==='matters')!.members.push(field);
 table.columns.push({field,name:'optional_review_state',nativeType:{kind:'text'}});
 return source;
}
function deploy(source:unknown){
 const result=compileTableDeployment({text:JSON.stringify(source),configuration});
 expect(result.status).toBe('compiled');
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 return result.bundle;
}

test('Node V4 table-migration compile and verify use the native codegen engine',()=>{
 const previous=deploy(legalSource()),next=deploy(appendOptionalReviewState());
 const plan=compileTableMigration({id:'native-append-migration',predecessor:{id:'previous',digest:previous.bundleDigest},previous,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
 if(plan.status!=='compiled')throw new Error('Native migration fixture blocked: '+JSON.stringify(plan.diagnostics));
 expect(plan.status).toBe('compiled');
 if(plan.status!=='compiled')return;
 expect(plan.plan.version).toBe('umf.table-migration/0.2');
 expect(verifyTableMigration(plan.plan)).toEqual(plan.plan);
},60_000);

test('Node V4 table-migration compiler returns refusal diagnostics and preserves UMF errors',()=>{
 const bundle=deploy(legalSource());
 const refused=compileTableMigration({id:'malformed-options',predecessor:{id:'previous',digest:'a'.repeat(64)},previous:bundle,next:bundle,options:{version:'umf.table-migration-options/9.9'} as never});
 expect(refused.status).toBe('blocked');
 if(refused.status==='blocked')expect(refused.diagnostics.length).toBeGreaterThan(0);
 expect(()=>verifyTableMigration({version:'umf.table-migration/9.9'})).toThrow(UmfError);
},60_000);
