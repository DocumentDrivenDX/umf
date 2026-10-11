import type {Document,Diagnostic,Validation} from '../../model/types';
import type {CoreLiteral} from '../../model/schema-literals';
export interface ActionReference {module:string;element:string;[key:string]:unknown}
export interface ActionKeyReference extends ActionReference {key:string}
export interface ActionRelationshipReference {module:string;relationship:string;[key:string]:unknown}
export interface ActionProfileIdentity {id:string;version:string;[key:string]:unknown}
export type ActionParameter = ({id:string;kind:'value';field:ActionReference;required:boolean}|{id:string;kind:'entity';target:ActionKeyReference;required:true}) & {[key:string]:unknown};
export type ActionRuleReference = ({parameter:string}|{output:string}|{record:ActionReference}|{relationship:ActionRelationshipReference}) & {[key:string]:unknown};
export interface ActionRule {language:string;version:string;expression:string;references:ActionRuleReference[];[key:string]:unknown}
export interface ActionCondition {id:string;rule:ActionRule;failure:{code:string;message:string;[key:string]:unknown};[key:string]:unknown}
export interface ActionFrame {id:string;record:ActionReference;selector:ActionRule;maxEntities:number;fields:ActionReference[];relationships:ActionRelationshipReference[];create:boolean;delete:boolean;[key:string]:unknown}
export type ActionEntityBinding = ({parameter:string}|{created:string}) & {[key:string]:unknown};
export type ActionValueBinding = ({parameter:string}|{literal:CoreLiteral}) & {[key:string]:unknown};
export interface ActionAssignment {field:ActionReference;value:ActionValueBinding;[key:string]:unknown}
export type ActionEffect = ({id:string;kind:'create';record:ActionReference;key:string;values:ActionAssignment[]}|{id:string;kind:'set';entity:ActionEntityBinding;values:ActionAssignment[]}|{id:string;kind:'delete';entity:ActionEntityBinding}|{id:string;kind:'link'|'unlink';relationship:ActionRelationshipReference;source:ActionEntityBinding;target:ActionEntityBinding;association?:ActionEntityBinding}|{id:string;kind:string}) & {[key:string]:unknown};
export type ActionBinding = ({kind:'recipe';profile:{id:'graph-write';version:'1';[key:string]:unknown};effects:ActionEffect[]}|{kind:'handler';profile:ActionProfileIdentity;handler:ActionProfileIdentity}) & {[key:string]:unknown};
export type ActionAuthorization = ({kind:'roles';profile:ActionProfileIdentity;roles:string[]}|{kind:'policy';profile:ActionProfileIdentity;resources:string[]}) & {[key:string]:unknown};
export interface Action {
 id:string;name:string;description:string;parameters:ActionParameter[];outputs:ActionParameter[];
 preconditions:ActionCondition[];postconditions:ActionCondition[];reads:ActionFrame[];writes:ActionFrame[];
 binding:ActionBinding;failures:{code:string;message:string;retryable:boolean;[key:string]:unknown}[];
 authorization:ActionAuthorization;attribution:{subject:'person-required';[key:string]:unknown}|{subject:'actor-profile';profile:ActionProfileIdentity;[key:string]:unknown};
 atomicity:'single-store';idempotency:'caller-key-optional';result:{identities:'created-and-changed';version:'store-opaque';receipt:'read-at-least';[key:string]:unknown};
 dddOperation?:{module:string;element:string;operation:string;[key:string]:unknown};[key:string]:unknown;
}
export interface ActionIdentity {module:string;action:string}
export type ActionObligationKind='value'|'key'|'condition'|'effect'|'authorization'|'attribution'|'atomicity'|'idempotency'|'result'|'handler'|'frame'|'selector'|'output'|'failure'|'binding'|'unknown'|'model';
export interface ActionObligation {id:string;path:string;kind:ActionObligationKind;status:'checked'|'unchecked'}
export interface InspectedAction {module:string;path:string;action:Action;obligations:ActionObligation[]}
export interface ActionInspection {source:Document;validation:Validation;actions:InspectedAction[]}
export interface ActionExecutorProfile {id:string;version:string;actionVersion:'0.1.0';coreVersion:'0.8.0';claims:{obligation:string;status:'supported'|'unsupported'|'unknown';evidence:string[]}[];source:Document;identity:ActionIdentity}
export interface ActionAssessment {source:Document;profile:ActionExecutorProfile;identity:ActionIdentity;declaredCompatible:boolean;executionVerified:false;outcomes:{obligation:string;path:string;status:'supported'|'unsupported'|'unknown';evidence:string[]}[];diagnostics:Diagnostic[]}
