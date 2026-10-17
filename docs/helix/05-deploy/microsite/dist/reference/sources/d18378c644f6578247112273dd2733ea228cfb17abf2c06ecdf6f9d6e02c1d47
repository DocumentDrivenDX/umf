import type {ActionEntityInput,ActionInputs} from './selector';
import type {ActionProfileIdentity} from './types';
import type {ActionPlanArtifact,ActionPlanInspection,ActionPlanDiagnostic} from './plan-types';
export interface ActionManifest {
 protocol:'umf.actions.manifest/1';plan:ActionPlanArtifact;
 action:{target:{module:string;action:string;revision:string};documentSha256:string;invocation:ActionProfileIdentity};
 basis:{profile:ActionProfileIdentity;store:string;epoch:string;cut:string;selectionSha256:string};
 items:{ordinal:number;entity:ActionEntityInput;guard:{profile:ActionProfileIdentity;store:string;epoch:string;identity:string;version:string};inputs:ActionInputs;expectedVersions:{frame:string;version:string}[]}[];
 batches:{ordinal:number;start:number;count:number}[];annotations?:Record<string,unknown>;[key:string]:unknown;
}
export interface ActionManifestInspection {manifest:ActionManifest|null;source:ActionPlanArtifact;plan:ActionPlanInspection|null;eligible:boolean;diagnostics:ActionPlanDiagnostic[]}
