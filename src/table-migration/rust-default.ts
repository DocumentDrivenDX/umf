// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import type {TableDeploymentBundle} from '../table-deployment';
import type {compileTableMigration,verifyTableMigration} from './index';
import type {G04DiscoverySelector, G04ReviewedCandidate, ReviewedChangeCandidate} from './index';

type Selector = {version:'umf.table-migration-discovery/0.2'|'umf.table-migration-discovery/0.3'} | G04DiscoverySelector;
type Result = ReviewedChangeCandidate[]|G04ReviewedCandidate[];
type Guard = (error:unknown)=>boolean;
interface NativeMigrationEngine {
  compileTableMigration(request:unknown):unknown;
  verifyTableMigration(plan:unknown):unknown;
  discoverTableMigrationChanges(previous:unknown,next:unknown,selector?:unknown):unknown[];
}
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

/** Keeps the exact public selector argument while routing discovery through the closed Rust codegen operation. */
export function createTableMigrationDiscoveryRustDefault(createEngine:()=>NativeMigrationEngine,isNativeError:Guard=()=>false){
  let engine:NativeMigrationEngine|undefined;
  const call=<T>(run:(native:NativeMigrationEngine)=>unknown):T=>{
    try{return run(engine??=createEngine()) as T;}
    catch(error){
      if(!isNativeError(error))throw error;
      const native=error as {code?:unknown;message?:unknown;path?:unknown};
      if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;
      const code=native.code;
      if(code==='REQUEST'||code==='TABLE_MIGRATION_OPTIONS'||code==='MIGRATION_CHANGES_FAILED')throw new UmfError(code,String(native.message??''),typeof native.path==='string'?native.path:'');
      throw error;
    }
  };
  return function discover(previous:TableDeploymentBundle,next:TableDeploymentBundle,selector?:Selector):Result{
    return call<Result>(native=>native.discoverTableMigrationChanges(previous,next,selector));
  };
}


interface NativeReviewedDigestEngine {
  reviewedValueDigest(value:unknown):string;
}

/** Routes the public reviewed-value JCS digest through the native codegen kernel. */
export function createReviewedValueDigestRustDefault(createEngine:()=>NativeReviewedDigestEngine){
  let engine:NativeReviewedDigestEngine|undefined;
  return function reviewedValueDigest(value:unknown):string{
    return (engine??=createEngine()).reviewedValueDigest(value===undefined?null:value);
  };
}

/** Preserves the public compiler API while Rust owns compilation and verification. */
export function createTableMigrationRustDefault(createEngine:()=>NativeMigrationEngine,isNativeError:Guard=()=>false){
  let engine:NativeMigrationEngine|undefined;
  const call=<T>(run:(native:NativeMigrationEngine)=>unknown):T=>{
    try{return run(engine??=createEngine()) as T;}
    catch(error){
      if(!isNativeError(error))throw error;
      const native=error as {code?:unknown;message?:unknown;path?:unknown;pointer?:unknown};
      if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;
      throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:typeof native.pointer==='string'?native.pointer:'');
    }
  };
  return Object.freeze({
    compileTableMigration(request:Parameters<typeof compileTableMigration>[0]):ReturnType<typeof compileTableMigration>{return call(native=>native.compileTableMigration(request));},
    verifyTableMigration(plan:Parameters<typeof verifyTableMigration>[0]):ReturnType<typeof verifyTableMigration>{return call(native=>native.verifyTableMigration(plan));},
  });
}
