import {referencePreparedHandlers} from './preparation';
import {UmfError} from '../../src/model/types';
import {admitActionInputs,type ActionInputs} from '../../src/extensions/actions/selector';
import {ReferenceMutationGateway} from './gateway';
import {ReferenceHandlerRegistry} from './handlers';
import {runReferenceHandler,type ReferenceHandlerOperation} from './sandbox';
import {checkReferencePreconditions} from './preconditions';
import type {PreparedReferenceAction} from './preparation';
import type {FrozenReferenceState} from './state';
import type {CandidateRecipeEffectsResult} from './recipe';
export type CandidateHandlerResult=Exclude<CandidateRecipeEffectsResult,{kind:'candidate'}>|(Omit<Extract<CandidateRecipeEffectsResult,{kind:'candidate'}>,'effects'>&{outputs:ActionInputs});
/** Caller owns the transaction. No SQL, authority context or host handles cross into the handler. */
export async function executeReferenceHandler(prepared:PreparedReferenceAction,state:FrozenReferenceState,handlers:ReferenceHandlerRegistry):Promise<CandidateHandlerResult>{
 const program=referencePreparedHandlers(prepared,handlers)!.resolve(prepared.action,prepared.deployment,false),checked=checkReferencePreconditions(prepared,state);if(checked.kind!=='ready')return {kind:checked.kind,code:checked.code,subject:checked.subject};
 const gateway=new ReferenceMutationGateway(prepared.source,state),arity:Record<ReferenceHandlerOperation,number>={read:2,exists:1,linked:3,create:2,set:2,delete:1,link:3,unlink:3};
 const methods:Record<ReferenceHandlerOperation,(...args:any[])=>unknown>={read:gateway.read.bind(gateway),exists:gateway.exists.bind(gateway),linked:gateway.linked.bind(gateway),create:gateway.create.bind(gateway),set:gateway.set.bind(gateway),delete:gateway.delete.bind(gateway),link:gateway.link.bind(gateway),unlink:gateway.unlink.bind(gateway)};
 const raw=await runReferenceHandler(program,prepared.inputs,(operation,args)=>{
  if(args.length!==arity[operation])throw new UmfError('FRAME_ACCESS','Exact gateway argument count required');
  const frames=operation==='linked'||operation==='link'||operation==='unlink'?[args[1],args[2]]:[args[0]];
  if(frames.some(frame=>typeof frame!=='string'||!frame||frame.length>256))throw new UmfError('FRAME_ACCESS','Exact bounded frame identity required');
  return methods[operation](...args);
 });
 let outputs:ActionInputs;try{outputs=admitActionInputs(prepared.source,prepared.action,raw as ActionInputs,true);}catch(error){if(error instanceof UmfError)throw new UmfError(error.code==='LIMIT'?'LIMIT':'PARAMETER','Handler outputs do not satisfy declared types');throw error;}
 return {kind:'candidate',updates:gateway.updates(),changes:gateway.changes(),links:gateway.linkChanges(),orderedChanges:gateway.candidateChanges(),outputs,pre:checked.pre,post:gateway.ruleState('post')};
}
