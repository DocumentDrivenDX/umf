/** Observation-only source reports; no competing query compiler or admission. */
import {compilePg18ProtectionCatalog} from '../../../tools/security/protection-pg18-catalog';
import {inspectProtectionQueryProperties} from '../../../src/extensions/security/protection/queries';
const f=JSON.parse(await Bun.stdin.text());
const policy:any={vocabulary:'umf.security',version:'0.2.0',id:'pg18-query-observation',revision:'1',ontology:{documentId:'unqualified-query-ontology',revision:'1'},protection:{id:f.catalog.id,revision:f.catalog.revision},rules:[{id:'observation',effect:'permit',actions:['read'],target:[f.profile.resource.type],condition:{op:'literal',value:true},disclosure:f.catalog.transforms.map((t:any)=>({field:t.inputDomain,disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:t.id,version:t.version,field:t.outputDomain}}))}]};
const reports=[];
for(const name of ['integer_bucket','hash'])for(const operator of ['predicate','order','group','join','aggregate']){
 const i=f.catalog.transforms.findIndex((t:any)=>t.id===name);
 const required=[operator==='order'?'order':'equality'];
 const use={ruleIndex:0,disclosureIndex:i,operator,required};
 const report=inspectProtectionQueryProperties(policy,f.catalog,f.closure,use);
 const prohibited=structuredClone(f.catalog);prohibited.transforms[i].queryUse[operator]='prohibited';
 reports.push({name,operator,dependencyOrigin:'independently authored probe assumption, not a compiler credential',report,prohibitedVariant:inspectProtectionQueryProperties(policy,prohibited,f.closure,use)});
}
console.log(JSON.stringify({complete:false,authority:false,policy,fixture:f,projection:compilePg18ProtectionCatalog(f.catalog,f.closure,f.profile),reports,prohibitedVariantsInstalled:false,storedTokenSelection:'unsupported: requires exact owner.storage Field to storageTransform resolver; no fabricated transformed disposition'}));
