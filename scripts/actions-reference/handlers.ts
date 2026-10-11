import type {SQL} from 'bun';
import type {ReferenceStoreControl} from './store';
import {copyJson} from '../../src/model/json';
import {UmfError} from '../../src/model/types';
import type {Action} from '../../src/extensions/actions/types';
import {referenceHandlerBuild,type ReferenceHandlerProgram} from './sandbox';
export interface ReferenceHandlerDeployment {id:string;version:string;build:string}
/** Trusted operator allowlist, independent of immutable declaration retention. No request can install code. */
export class ReferenceHandlerRegistry {
 readonly #programs=new Map<string,{program:ReferenceHandlerProgram;active:boolean}>();
 install(programInput:ReferenceHandlerProgram):ReferenceHandlerDeployment{
  const program=copyJson(programInput) as unknown as ReferenceHandlerProgram;
  if(Object.keys(program).some(key=>!['id','version','build','source'].includes(key))||[program.id,program.version,program.build].some(value=>typeof value!=='string'||!value||value.length>256)||typeof program.source!=='string'||program.source.length>65536||program.build!==referenceHandlerBuild(program.source))throw new UmfError('ACTION_HANDLER_PROFILE','Exact reviewed bounded handler program required');
  const identity={id:program.id,version:program.version,build:program.build},key=JSON.stringify(identity),existing=this.#programs.get(key);
  if(existing&&existing.program.source!==program.source)throw new UmfError('ACTION_HANDLER_PROFILE','Deployment identity is immutable');
  if(!existing)this.#programs.set(key,{program,active:true});return identity;
 }
 retire(deployment:ReferenceHandlerDeployment):void{const entry=this.#programs.get(JSON.stringify(this.identity(deployment)));if(!entry)throw new UmfError('ACTION_HANDLER_PROFILE','Deployment unavailable');entry.active=false;}
 protected identity(input:unknown):ReferenceHandlerDeployment{const value=copyJson(input) as unknown as ReferenceHandlerDeployment;if(!value||Array.isArray(value)||Object.keys(value).length!==3||Object.keys(value).some(key=>!['id','version','build'].includes(key))||[value.id,value.version,value.build].some(part=>typeof part!=='string'||!part||part.length>256))throw new UmfError('ACTION_HANDLER_PROFILE','Exact deployment identity required');return {id:value.id,version:value.version,build:value.build};}
 async qualifyInTransaction(_tx:SQL,_control:ReferenceStoreControl,_action:Action,_deployment:unknown):Promise<ReferenceHandlerRegistry>{return this;}
 resolve(action:Action,input:unknown,fresh=true):ReferenceHandlerProgram{
  const deployment=this.identity(input);
  if(action.binding.kind!=='handler'||action.binding.profile.id!=='umf.actions.container'||action.binding.profile.version!=='1'||action.binding.handler.id!==deployment.id||action.binding.handler.version!==deployment.version)throw new UmfError('ACTION_HANDLER_PROFILE','Declaration requires exact installed container/1 handler');
  const entry=this.#programs.get(JSON.stringify(deployment));if(!entry||fresh&&!entry.active)throw new UmfError('ACTION_HANDLER_PROFILE','Handler deployment unavailable for admission');
  return copyJson(entry.program) as unknown as ReferenceHandlerProgram;
 }
}
