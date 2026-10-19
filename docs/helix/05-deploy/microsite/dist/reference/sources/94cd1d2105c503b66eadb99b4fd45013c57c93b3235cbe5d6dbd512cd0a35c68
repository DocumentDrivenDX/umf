import {CURRENT_CORE_VERSION} from '../../generated/core-model';
import type {Registry} from '../../registry/registry';
import type {Document} from '../../model/types';
import type {CoreLiteral} from '../../model/schema-literals';
import type {ActionReference,ActionKeyReference,ActionIdentity,ActionExecutorProfile,ActionProfileIdentity} from './types';
export interface ActionPlanArtifact {mediaType:string;utf8:string;sha256:string;[key:string]:unknown}
export interface ActionPlanModelPin {documentId:string;revision:string;umfVersion:typeof CURRENT_CORE_VERSION;sha256:string;[key:string]:unknown}
export interface PortableActionPin {identity:ActionIdentity;documentSha256:string;invocation:ActionProfileIdentity;[key:string]:unknown}
export interface ActionPlanDiagnostic {code:string;path:string;message:string}
export interface PortableActionPlan {
 protocol:'umf.actions.plan/1';model:ActionPlanModelPin;source:ActionPlanArtifact;
 selection:{profile:ActionProfileIdentity;artifact:ActionPlanArtifact;dependencies:ActionReference[];[key:string]:unknown};
 action:PortableActionPin;target:ActionKeyReference;
 inputs:{entityParameter:string;assignments:{input:string;field:ActionReference;value:CoreLiteral;[key:string]:unknown}[];[key:string]:unknown};
 execution:{selection:'frozen';atomicity:'batch';conflict:'stop';partition:'manifest-order';batchSize:number;[key:string]:unknown};
 limits:{maxItems:number;maxManifestBytes:number;[key:string]:unknown};annotations?:Record<string,unknown>;[key:string]:unknown;
}
export interface ActionPlanSelectionInspector {
 profile:ActionProfileIdentity;
 inspect:(artifact:ActionPlanArtifact,model:Document,target:ActionKeyReference)=>{eligible:boolean;dependencies:ActionReference[];diagnostics:ActionPlanDiagnostic[]};
}
export interface ActionPlanInspectionContext {
 registry:Registry;models:{pin:ActionPlanModelPin;artifact:ActionPlanArtifact}[];
 actions:{pin:PortableActionPin;artifact:ActionPlanArtifact}[];selections:ActionPlanSelectionInspector[];
}
export interface ActionPlanInspection {plan:PortableActionPlan|null;source:ActionPlanArtifact;eligible:boolean;diagnostics:ActionPlanDiagnostic[]}
export interface ActionPlanCapability {profile:ActionProfileIdentity;claims:{id:string;status:'supported'|'unsupported'|'unknown';evidence:string[]}[]}
export interface ActionPlanCapabilities {plan:ActionPlanCapability;selection:ActionPlanCapability;manifest:ActionPlanCapability;bulk:ActionPlanCapability;guard:ActionPlanCapability;snapshot:ActionPlanCapability;action:ActionExecutorProfile}
export interface ActionPlanAssessment {compatible:boolean;executionVerified:false;obligations:{id:string;status:'supported'|'unsupported'|'unknown';evidence:string[]}[];diagnostics:ActionPlanDiagnostic[]}
export interface PreparedActionPlanModel {
 protocol:'umf.actions.plan-model/1';model:ActionPlanModelPin;action:PortableActionPin;entityParameter:string;target:ActionKeyReference;
 assignments:{input:string;field:ActionReference}[];frames:string[];
 producer:{id:'umf.actions.plan-model';version:'1';build:string};schema:{id:'urn:umf:actions:plan-model:1';sha256:string};
 obligations:{id:string;status:'checked'}[];
}
