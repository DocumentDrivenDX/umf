import { type Document } from '../../model/types';
export interface DddGraphqlEntityName {
    module: string;
    element: string;
    name: string;
}
export interface DddGraphqlFieldName {
    module: string;
    element: string;
    field: string;
    name: string;
    coreField?: {
        module: string;
        element: string;
    };
}
export interface DddGraphqlEntityPolicy {
    entities: DddGraphqlEntityName[];
    fields: DddGraphqlFieldName[];
    scalars: {
        string: string;
        boolean: string;
        integer: string;
        decimal: string;
        'date-time': string;
        bytes: string;
    };
    root: {
        kind: 'synthetic-schema-root';
        typeName: string;
        fieldName: string;
    };
    sourceProfile?: 'ddd-only' | 'core-ideals';
}
export interface DddGraphqlEntityResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface DddGraphqlEntityMapping {
    sourcePath: string;
    target: string;
}
export interface DddGraphqlEntityProjection {
    status: 'blocked' | 'reported' | 'proposed';
    logical: Document;
    policy: DddGraphqlEntityPolicy;
    profile: 'graphql-js-17.0.2-sdl';
    residuals: DddGraphqlEntityResidual[];
    mappings: DddGraphqlEntityMapping[];
    candidate?: string;
    targetArchive?: Document;
}
/** Relationship-independent DDD entity SDL with an explicit schema-only root. */
export declare function projectDddEntitiesToGraphql(logical: Document, policy: DddGraphqlEntityPolicy, lossPolicy: 'strict' | 'report'): DddGraphqlEntityProjection;
/** Shared entity lowering; the full projection adds relationships before publishing SDL. */
export declare function buildDddEntityGraphql(logical: Document, policy: DddGraphqlEntityPolicy, lossPolicy: 'strict' | 'report', full: boolean): DddGraphqlEntityProjection;
