// SPDX-License-Identifier: MIT OR Apache-2.0
import {randomUUID} from 'node:crypto';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,type TableMigrationRequest} from '../../src/table-migration';
import {appendedTableSource,indexedTableSource} from './table-migration-fixture';
import {tableOperationSource,tableOperationDeclarations} from './table-operation-fixture';
import fixture from '../binding/fixtures/table-lifecycle-note.json';
const prefix='p3_'+randomUUID().replaceAll('-','').slice(0,12)+'_';
const configuration={module:'demo',schema:prefix+'schema',ownerRole:prefix+'owner',personRole:prefix+'person',batchRole:prefix+'batch',groupRoles:{readers:prefix+'readers',aa:prefix+'aa',z:prefix+'z'}};
if(process.argv.includes('--quoted-schema'))configuration.schema+='%';
function deployed(doc:any){
 doc.modules[0].extensions['umf.tables'].tables[0].policy.person.select={kind:'memberOf',field:{module:'demo',element:'owner'}};
 const r=compileTableDeployment({text:JSON.stringify(doc),configuration});if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.bundle;
}
const initialSource=structuredClone(fixture),forwardSource=appendedTableSource();
if(process.argv.includes('--typed-operations')){
 const commands=tableOperationSource().modules[0]!.extensions['umf.tables'].commands;
 for(const source of [initialSource,forwardSource])(source.modules[0]!.extensions['umf.tables'] as {commands:unknown[]}).commands=structuredClone(commands);
}
const previous=deployed(initialSource),next=deployed(forwardSource);
function planned(request:TableMigrationRequest){const r=compileTableMigration(request);if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.plan;}
const initial=planned({id:'001',predecessor:null,previous:null,next:previous});
const forward=planned({id:'002',predecessor:{id:'001',digest:initial.digest},previous,next});
const divergent=planned({id:'003',predecessor:{id:'001',digest:initial.digest},previous,next});
const edited=planned({id:'001',predecessor:null,previous:null,next});
const index=planned({id:'003',predecessor:{id:forward.id,digest:forward.digest},previous:next,next:deployed(indexedTableSource(forwardSource))});
const uniqueSource=indexedTableSource(forwardSource);uniqueSource.modules[0].extensions['umf.tables'].tables[0].indexes[0].unique=true;
const unique=planned({id:'unique-003',predecessor:{id:forward.id,digest:forward.digest},previous:next,next:deployed(uniqueSource)});
const commandSource=indexedTableSource(forwardSource);
const command=structuredClone(tableOperationDeclarations[0]!);command.id='evolved_read';
commandSource.modules[0].extensions['umf.tables'].commands=[command];
const commands=planned({id:'004',predecessor:{id:index.id,digest:index.digest},previous:index.next,next:deployed(commandSource)});
commandSource.modules[0].extensions['umf.tables'].commands=[];
const retired=planned({id:'005',predecessor:{id:commands.id,digest:commands.digest},previous:commands.next,next:deployed(commandSource)});
await Bun.write(process.argv[2]!,JSON.stringify({initial,forward,divergent,edited,index,commands,retired,unique},null,2)+'\n');
