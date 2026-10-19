// SPDX-License-Identifier: MIT OR Apache-2.0
import {randomUUID} from 'node:crypto';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,type TableMigrationRequest} from '../../src/table-migration';
import {appendedTableSource} from './table-migration-fixture';
import fixture from '../binding/fixtures/table-lifecycle-note.json';
const prefix='p3_'+randomUUID().replaceAll('-','').slice(0,12)+'_';
const configuration={module:'demo',schema:prefix+'schema',ownerRole:prefix+'owner',personRole:prefix+'person',batchRole:prefix+'batch',groupRoles:{readers:prefix+'readers',aa:prefix+'aa',z:prefix+'z'}};
function deployed(doc:any){
 doc.modules[0].extensions['umf.tables'].tables[0].policy.person.select={kind:'memberOf',field:{module:'demo',element:'owner'}};
 const r=compileTableDeployment({text:JSON.stringify(doc),configuration});if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.bundle;
}
const previous=deployed(structuredClone(fixture)),next=deployed(appendedTableSource());
function planned(request:TableMigrationRequest){const r=compileTableMigration(request);if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.plan;}
const initial=planned({id:'001',predecessor:null,previous:null,next:previous});
const forward=planned({id:'002',predecessor:{id:'001',digest:initial.digest},previous,next});
const divergent=planned({id:'003',predecessor:{id:'001',digest:initial.digest},previous,next});
const edited=planned({id:'001',predecessor:null,previous:null,next});
await Bun.write(process.argv[2]!,JSON.stringify({initial,forward,divergent,edited},null,2)+'\n');
