export { default as dddGraphqlProjectionSchema } from '../../../spec/projections/ddd-graphql.schema.json';
import { type Document, type Diagnostic } from '../../model/types';
import { type RelationshipEndpoint } from '../../validation/relationships';
import { type DddGraphqlEntityPolicy, type DddGraphqlEntityProjection } from './entities';
export interface DddGraphqlEndpoint {
    record: RelationshipEndpoint;
    entity: {
        module: string;
        element: string;
    };
}
export interface DddGraphqlRelationshipName {
    module: string;
    id: string;
    forwardName: string;
    inverseName?: string;
    orientation?: 'source-to-target';
    forwardUnion?: string;
    inverseUnion?: string;
}
export interface DddGraphqlPolicy extends DddGraphqlEntityPolicy {
    sourceProfile: 'core-ideals';
    endpoints: DddGraphqlEndpoint[];
    relationships: DddGraphqlRelationshipName[];
}
export interface DddGraphqlProjection extends Omit<DddGraphqlEntityProjection, 'policy'> {
    operation: 'project-ddd-graphql';
    version: '1.0.0';
    policy: DddGraphqlPolicy;
    lossPolicy: 'strict' | 'report';
    diagnostics: Diagnostic[];
    sourceVersions: {
        core: '0.7.0';
        ddd: '0.1.0';
    };
    targetVersions: {
        graphqlJs: '17.0.2';
        graphqlCore: '3.2.12';
        subset: 'schema SDL with scalar fields, object relationships and explicit output unions; no execution';
    };
}
/** Complete schema-only projection. Endpoint identity is always explicitly paired. */
export declare function projectDddToGraphql(input: Document, options: DddGraphqlPolicy, lossPolicy: 'strict' | 'report'): DddGraphqlProjection;
/** Verify the complete retained report by recomputation, including unknown content. */
export declare function verifyDddGraphqlProjection(input: DddGraphqlProjection, currentTarget?: Document): DddGraphqlProjection;
export declare function recoverDddFromGraphql(input: DddGraphqlProjection, currentTarget: Document): Document;
export declare function recoverDddGraphqlNative(input: DddGraphqlProjection, currentTarget: Document): string;
