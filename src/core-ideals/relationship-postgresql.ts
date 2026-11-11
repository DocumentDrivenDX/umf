// SPDX-License-Identifier: MIT OR Apache-2.0
/** Static relationship PostgreSQL contract; runtime operations are exposed by V4 roots. */
export {POSTGRESQL_RELATIONSHIPS_EXTENSION,postgresqlRelationshipsPackage,postgresqlRelationshipClassificationSchema} from './relationship-postgresql-package';
export {default as relationshipPostgresqlProjectionSchema} from '../../spec/core/relationship-postgresql-projection.schema.json';
export type {PostgresqlRelationshipObservation,PostgresqlRelationshipRequest,PostgresqlRelationshipClassification,RelationshipPostgresqlRequest,RelationshipPostgresqlProjection} from './relationship-postgresql-types';
