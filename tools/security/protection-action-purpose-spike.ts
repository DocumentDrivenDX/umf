/** Information-gap diagnostic, not an interpreter or native admission test. */
import {createHash} from 'node:crypto';
import {domainFixture} from '../../tests/security/protection/domain-fixture';
import {inspectProtectionCatalog,requireProtectionInterpretation,resolveSecurityProtectionDomains} from '../../src/index';
const rows:any[]=[];
for(const action of ['read','field-access','query-original','reverse-opaque']){
 const f=domainFixture(),t=f.catalog.transforms[0];t.kind='tokenize';delete t.function;t.parameters=[];t.disclosureProfile=[];t.reversibility='vault';t.reverseAction=action;
 t.custody={owner:'excluded-declared-owner',vaultRef:'opaque-ref',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'unverified',snapshots:'unverified',exports:'unverified',feeds:'unverified',caches:'unverified'}};
 // A distinct action must remain grantable by a rule; treating every policy
 // action as ordinary would wrongly reject this legitimate declaration shape.
 f.policy.rules.push({id:'reverse-grant',effect:'permit',actions:['reverse-opaque'],target:f.policy.rules[0].target,condition:{op:'literal',value:true}});
 const wire=inspectProtectionCatalog(f.catalog),domains=resolveSecurityProtectionDomains(f.policy,f.catalog,f.closure);let interpreterRefuses=false;
 try{requireProtectionInterpretation(f.catalog);}catch{interpreterRefuses=true;}
 if(!wire.valid||domains.status!=='resolved-domains'||!interpreterRefuses)throw Error('Diagnostic baseline changed');
 rows.push({declaredReverseAction:action,wireValid:wire.valid,domainsResolved:true,interpreterRefuses,authority:false,meaning:'Wire/domain checks have no action-purpose designation and do not establish distinctness or a permission.'});
}
const paths=['tools/security/protection-action-purpose-spike.ts','tests/security/protection/domain-fixture.ts','src/extensions/security/protection/catalog.ts','src/extensions/security/protection/domains.ts','src/extensions/security/protection/references.ts','src/extensions/security/policy-representation-v2.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/03-test/security/cases.json'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('docs/helix/04-build/evidence/security/protection-action-purpose-20261015/baseline-spike.json',JSON.stringify({status:'information-gap-reproduced',baseline:'64a6b519',rows,sourceDigests,scope:'S21/S22 design prerequisite: no action purposes are encoded by current ontology.actions strings. Current interpreter remains closed. Neither a production authorization bypass nor a new acceptance promotion.',acceptanceCasesPromoted:[]},null,2)+'\n');console.log(JSON.stringify({status:'information-gap-reproduced',cases:rows.length,allInterpretersRefuse:true}));
