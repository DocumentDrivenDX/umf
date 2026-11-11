// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import type {TableDeploymentBundle} from '../table-deployment/types';
import type {TableInventoryDiscoverySelector,TableInventoryMigrationPlan,TableInventoryMigrationRequest,TableInventoryMigrationResult,TableInventoryReviewedChangeCandidate,TableInventorySourceHistory} from './inventory-types';

interface Api {
 compileTableInventoryMigration(request:TableInventoryMigrationRequest):TableInventoryMigrationResult;
 discoverTableInventoryMigrationChanges(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory):TableInventoryReviewedChangeCandidate[];
 verifyTableInventoryMigration(plan:unknown,originalHistory:TableInventorySourceHistory):TableInventoryMigrationPlan;
 serializeTableInventoryMigration(plan:unknown,originalHistory:TableInventorySourceHistory):string;
 irreversiblePurgeDisclosure(candidate:TableInventoryReviewedChangeCandidate):{code:'IRREVERSIBLE_TABLE_PURGE';path:string;markerId:string;message:string};
}
type Native={ [K in keyof Api]:(...args:Parameters<Api[K]>)=>unknown };
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED','HOST_CONTROL']);
/** Preserve public signatures while the shared Rust codegen engine owns inventory meaning. */
export function createTableInventoryRustDefault(createEngine:()=>Native,isNative:(error:unknown)=>boolean):Api{
 let engine:Native|undefined;
 const call=<T>(run:(native:Native)=>unknown):T=>{try{return run(engine??=createEngine()) as T}catch(error){if(!isNative(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL.has(native.code))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}};
 return Object.freeze({
  compileTableInventoryMigration:(...args:Parameters<Api['compileTableInventoryMigration']>):ReturnType<Api['compileTableInventoryMigration']>=>call(native=>native.compileTableInventoryMigration(...args)),
  discoverTableInventoryMigrationChanges:(...args:Parameters<Api['discoverTableInventoryMigrationChanges']>):ReturnType<Api['discoverTableInventoryMigrationChanges']>=>call(native=>native.discoverTableInventoryMigrationChanges(...args)),
  verifyTableInventoryMigration:(...args:Parameters<Api['verifyTableInventoryMigration']>):ReturnType<Api['verifyTableInventoryMigration']>=>call(native=>native.verifyTableInventoryMigration(...args)),
  serializeTableInventoryMigration:(...args:Parameters<Api['serializeTableInventoryMigration']>):ReturnType<Api['serializeTableInventoryMigration']>=>call(native=>native.serializeTableInventoryMigration(...args)),
  irreversiblePurgeDisclosure:(...args:Parameters<Api['irreversiblePurgeDisclosure']>):ReturnType<Api['irreversiblePurgeDisclosure']>=>call(native=>native.irreversiblePurgeDisclosure(...args)),
 });
}
