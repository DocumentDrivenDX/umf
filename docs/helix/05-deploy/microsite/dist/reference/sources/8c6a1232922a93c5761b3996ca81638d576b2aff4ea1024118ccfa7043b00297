// SPDX-License-Identifier: MIT OR Apache-2.0
import type { CURRENT_CORE_VERSION } from '../generated/core-model';
import type { Document, Diagnostic } from '../model/types';
import type { RelationshipEndpoint } from '../validation/relationships';

export interface DddGraphqlEntityName {module:string;element:string;name:string}
export interface DddGraphqlFieldName {module:string;element:string;field:string;name:string;coreField?:{module:string;element:string}}
export interface DddGraphqlEntityPolicy {
  entities:DddGraphqlEntityName[];fields:DddGraphqlFieldName[];
  scalars:{string:string;boolean:string;integer:string;decimal:string;'date-time':string;bytes:string};
  root:{kind:'synthetic-schema-root';typeName:string;fieldName:string};
  sourceProfile?:'ddd-only'|'core-ideals';
}
export interface DddGraphqlEntityResidual {path:string;reason:string;choice:unknown}
export interface DddGraphqlEntityMapping {sourcePath:string;target:string}
export interface DddGraphqlEntityProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;policy:DddGraphqlEntityPolicy;
  profile:'graphql-js-17.0.2-sdl';residuals:DddGraphqlEntityResidual[];mappings:DddGraphqlEntityMapping[];
  candidate?:string;targetArchive?:Document;
}
export interface DddGraphqlEndpoint {record:RelationshipEndpoint;entity:{module:string;element:string}}
export interface DddGraphqlRelationshipName {
  module:string;id:string;forwardName:string;inverseName?:string;
  orientation?:'source-to-target';forwardUnion?:string;inverseUnion?:string;
}
export interface DddGraphqlPolicy extends DddGraphqlEntityPolicy {
  sourceProfile:'core-ideals';endpoints:DddGraphqlEndpoint[];relationships:DddGraphqlRelationshipName[];
}
export interface DddGraphqlProjection extends Omit<DddGraphqlEntityProjection,'policy'> {
  operation:'project-ddd-graphql';version:'1.0.0';policy:DddGraphqlPolicy;lossPolicy:'strict'|'report';diagnostics:Diagnostic[];
  sourceVersions:{core:typeof CURRENT_CORE_VERSION;ddd:'0.1.0'};
  targetVersions:{graphqlJs:'17.0.2';graphqlCore:'3.2.12';subset:'schema SDL with scalar fields, object relationships and explicit output unions; no execution'};
}
