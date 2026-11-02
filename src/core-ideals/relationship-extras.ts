// SPDX-License-Identifier: MIT OR Apache-2.0
import {lookupCoreRelationship,verifyCoreRelationshipOperation} from '../model/relationships';
import {createRelationshipExtras} from './relationship-extras-factory';
export {relationshipExtrasSchema,importRelationshipExtraArchive,classifyRelationshipExtra} from './relationship-extras-factory';
export type {RelationshipExtraSystem,RelationshipExtraArchive,RelationshipExtraRecord,RelationshipExtraRequest,RelationshipExtraClassificationRequest,RelationshipExtraObservation,RelationshipExtraClassification,RelationshipExtraProjection} from './relationship-extras-factory';
const reference=createRelationshipExtras({lookupCoreRelationship,verifyCoreRelationshipOperation});
export const {projectRelationshipToExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative}=reference;
