/** Verify current proof integrity without rerunning unchanged native recovery matrices. */
import {verifyFieldEvidence} from './core-ideals/field-conformance';
import {verifyNullabilityEvidence} from './core-ideals/nullability-conformance';
import {verifyCardinalityEvidence} from './core-ideals/cardinality-conformance';
import {verifyFacetEvidence} from './core-ideals/facets-evidence';
import {verifyKeyEvidence} from './core-ideals/key-evidence';
import {verifyRelationshipEvidence} from './core-ideals/relationship-evidence';

for(const [name,verify] of [
 ['field',verifyFieldEvidence],['nullability',verifyNullabilityEvidence],
 ['cardinality',verifyCardinalityEvidence],['facets',verifyFacetEvidence],
 ['key',verifyKeyEvidence],['relationship',verifyRelationshipEvidence],
] as const){
 await verify();
 console.log(JSON.stringify({concept:name,currentEvidenceVerified:true}));
}
