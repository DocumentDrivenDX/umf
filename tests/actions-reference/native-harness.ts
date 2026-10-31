// SPDX-License-Identifier: MIT OR Apache-2.0
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {withOwnedPostgres} from '../native/postgres-fixture';
/** Each qualification test owns an isolated real server and destroys only its own container. */
export async function withReferenceStore<T>(operation:(store:ReferenceActionStore,version:string,ownedContainer:string)=>Promise<T>):Promise<T>{
 return withOwnedPostgres({prefix:'umf-actions-reference-',database:'qualification'},async fixture=>{const store=new ReferenceActionStore(fixture.databaseUrl('qualification'));try{await store.initialize();return await operation(store,fixture.version,fixture.container);}finally{await store.close();}});
}
