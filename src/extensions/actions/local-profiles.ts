// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Action,ActionProfileIdentity} from './types';
/** Exact declaration meanings only. These constants never issue a store capability. */
export const localActionProfiles=Object.freeze({actor:'umf.actions.local-owner',policy:'umf.actions.local-store-owner',invocation:'umf.actions.local-tx',bulk:'umf.actions.local-bulk'});
export const exactLocalProfile=(profile:ActionProfileIdentity,id:string):boolean=>profile.id===id&&profile.version==='1';
export function hasLocalActor(action:Action):boolean{return action.attribution.subject==='actor-profile'&&exactLocalProfile(action.attribution.profile,localActionProfiles.actor);}
export function hasLocalPolicy(action:Action):boolean{return action.authorization.kind==='policy'&&exactLocalProfile(action.authorization.profile,localActionProfiles.policy);}
export function hasLocalActionBundle(action:Action):boolean{
 if(!hasLocalActor(action)||!hasLocalPolicy(action)||action.authorization.kind!=='policy')return false;
 const frames=[...action.reads,...action.writes].map(frame=>frame.id);
 return frames.length===action.authorization.resources.length&&frames.every((frame,i)=>action.authorization.kind==='policy'&&action.authorization.resources[i]===frame);
}
