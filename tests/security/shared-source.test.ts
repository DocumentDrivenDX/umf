// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC3
import {test,expect} from 'bun:test';
import {securityFixture,ref} from './fixture';
import {captureCandidateCoreSource,readCandidateCoreSource,isIssuedCandidateCoreSource} from '../../src/extensions/security/core-source-candidate';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {resolveCandidateSecurityOntology,requireIssuedCandidateSecurityOntology} from '../../src/extensions/security/ontology-checks-candidate';
import {createCandidateEntityTermScopeFromChecks,readCandidateEntityTermScopeRoot,readCandidateEntityTermScope} from '../../src/extensions/security/entity-terms-candidate';
import {readCandidateAssociationSource,readCandidateAssociationSourceReference} from '../../src/extensions/security/association-checks';
test('shared core source captures immutable detached complete JSON without transferable issuance',()=>{
 const f=securityFixture(),input:any=f.resolution.documents[0]!.document,handle=captureCandidateCoreSource(input),source=readCandidateCoreSource(handle);
 expect(source).toEqual(input);expect(source).not.toBe(input);expect(Object.isFrozen(source.modules[0].elements)).toBe(true);expect(readCandidateCoreSource(handle)).toBe(source);
 input.id='changed';expect(source.id).not.toBe('changed');expect(isIssuedCandidateCoreSource(structuredClone(handle))).toBe(false);expect(()=>captureCandidateCoreSource({})).toThrow();
 let calls=0;const hostile={get id(){calls++;return 'x';}};expect(()=>captureCandidateCoreSource(hostile)).toThrow();expect(calls).toBe(0);
});
test('ontology associations and target scopes share one issued source closure while public reads detach',()=>{
 const f=securityFixture(),ontology=migrateCandidateSecurityOntology(f.resolution.ontology,'shared-source-v2').target,root:any=resolveCandidateSecurityOntology(ontology,f.resolution.documents),a:any=createCandidateEntityTermScopeFromChecks(root,ref('Resource')),b:any=createCandidateEntityTermScopeFromChecks(root,ref('Staff'));
 expect(a.documents).toBe(root.documents);expect(b.documents).toBe(root.documents);expect(a.ontology).toBe(root.ontology);expect(readCandidateEntityTermScopeRoot(a)).toBe(root);expect(readCandidateEntityTermScopeRoot(b)).toBe(root);
 for(const association of root.associations){expect(readCandidateAssociationSourceReference(association)).toBe(root.documents[0]!.document);expect(readCandidateAssociationSource(association)).toEqual(root.documents[0]!.document);expect(readCandidateAssociationSource(association)).not.toBe(root.documents[0]!.document);}
 expect(readCandidateEntityTermScope(a)).not.toBe(a);expect(()=>requireIssuedCandidateSecurityOntology(structuredClone(root))).toThrow();expect(()=>createCandidateEntityTermScopeFromChecks(structuredClone(root),ref('Staff'))).toThrow();expect(()=>readCandidateEntityTermScopeRoot({...a})).toThrow();
});
