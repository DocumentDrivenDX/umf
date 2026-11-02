// SPDX-License-Identifier: MIT OR Apache-2.0
import {lookupCoreRelationship,verifyCoreRelationshipOperation} from '../model/relationships';
import {createRelationshipParquetProjection} from './relationship-parquet-projection-factory';
export {relationshipParquetProjectionSchema} from './relationship-parquet-projection-factory';
export type {RelationshipParquetRequest,RelationshipParquetProjection} from './relationship-parquet-projection-factory';
const reference=createRelationshipParquetProjection({lookupCoreRelationship,verifyCoreRelationshipOperation});
export const {projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative}=reference;
