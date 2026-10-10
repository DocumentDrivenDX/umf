import type {Document,Json} from '../../model/types';
import type {CoreLiteral} from '../../model/schema-literals';

export interface SecurityRef {documentId:string;moduleId:string;elementId:string}
export type SecurityTerm = {kind:'subject'|'resource';identity:true} |
  {kind:'subject'|'resource'|'context';field:SecurityRef} |
  {kind:'variable';name:string;identity:true} | {kind:'variable';name:string;field:SecurityRef} |
  {kind:'variable';name:string;endpoint:string} | {kind:'constant';field:SecurityRef;value:CoreLiteral};
export type SecurityExpr = {op:'literal';value:boolean} | {op:'eq';left:SecurityTerm;right:SecurityTerm} |
  {op:'and'|'or';args:SecurityExpr[]} | {op:'not';arg:SecurityExpr} |
  {op:'exists';association:SecurityRef;as:string;where:SecurityExpr};
export type SecurityFieldDisposition = {kind:'original'} | {kind:'withheld'} |
  {kind:'transformed';transform:'constant';version:'0.1.0';field:SecurityRef;value:CoreLiteral};
export interface SecurityRule {
  id:string;effect:'permit'|'require'|'forbid';actions:string[];target:SecurityRef[];condition:SecurityExpr;
  disclosure?:{field:SecurityRef;disposition:SecurityFieldDisposition}[];
}
export interface SecurityPolicy {
  vocabulary:'umf.security';version:'0.1.0';id:string;revision:string;
  ontology:{documentId:string;revision:string};rules:SecurityRule[];native?:Json;
}
export type SecurityQueryOperator = 'predicate'|'order'|'group'|'join'|'aggregate';
export type SecurityQueryUse = 'disclosed'|'original-authorized'|'prohibited';
export interface SecurityField {
  ref:SecurityRef;protection:'protected'|'unprotected';queryUse?:Partial<Record<SecurityQueryOperator,SecurityQueryUse>>;
}
export interface SecurityEntity {type:SecurityRef;keyId:string;fields:SecurityField[]}
export interface SecurityAssociation extends SecurityEntity {
  endpoints:{role:string;target:SecurityRef;fields:SecurityRef[]}[];
}
export interface SecurityOntology {
  version:'0.1.0';documentId:string;revision:string;documents:{documentId:string;revision:string}[];
  subject:SecurityRef;entities:SecurityEntity[];associations:SecurityAssociation[];
  context:SecurityRef[];actions:string[];
}
export interface SecurityDocumentRevision {revision:string;document:Document}
export interface SecurityResolution {ontology:SecurityOntology;documents:SecurityDocumentRevision[]}
export const securityRefIdentity = (ref:SecurityRef):string => JSON.stringify([ref.documentId,ref.moduleId,ref.elementId]);
