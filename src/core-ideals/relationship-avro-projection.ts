// SPDX-License-Identifier: MIT OR Apache-2.0
import {lookupCoreRelationship,verifyCoreRelationshipOperation} from '../model/relationships';
import {createAvroRelationshipProjection} from './relationship-avro-projection-factory';
export {relationshipAvroProjectionSchema} from './relationship-avro-projection-factory';
export type {RelationshipAvroRequest,RelationshipAvroProjection} from './relationship-avro-projection-factory';
const typescriptRelationshipProjection=createAvroRelationshipProjection({lookupCoreRelationship,verifyCoreRelationshipOperation});
export const projectRelationshipToAvro=typescriptRelationshipProjection.projectRelationshipToAvro;
export const verifyRelationshipAvroProjection=typescriptRelationshipProjection.verifyRelationshipAvroProjection;
export const recoverRelationshipAvroIdeal=typescriptRelationshipProjection.recoverRelationshipAvroIdeal;
export const recoverRelationshipAvroNative=typescriptRelationshipProjection.recoverRelationshipAvroNative;
