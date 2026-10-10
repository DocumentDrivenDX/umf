/** Exact native-cohort draft compiler request; no authorization authority. */
export function createNativeGraphConditionRequest(modules:any[]){
const doc=JSON.parse(modules[0].documentJson),ref=(elementId:string)=>({documentId:doc.id,moduleId:'m',elementId});
const relationship={documentId:doc.id,moduleId:'m',relationshipId:'BareWorksOn'};
const ontology={version:'0.2.0',documentId:doc.id,revision:'graph-condition-1',documents:[{documentId:doc.id,revision:modules[0].pin.revision}],subject:ref('Employee'),entities:['Employee','Project'].map(elementId=>({type:ref(elementId),keyId:'code-key',fields:[{ref:ref(elementId+'-code'),protection:'unprotected'}]})),associations:[{kind:'core-relationship',relationship,witness:{kind:'opaque-existential'},endpoints:[{role:'staff',side:'source',target:ref('Employee'),keyId:'code-key'},{role:'project',side:'target',target:ref('Project'),keyId:'code-key'}]}],context:[],actions:['read']};
const policy={vocabulary:'umf.security',version:'0.2.0',id:'native-opaque-membership',revision:'1',ontology:{documentId:doc.id,revision:ontology.revision},rules:[{id:'membership',effect:'permit',actions:['read'],target:[ref('Project')],condition:{op:'exists',association:relationship,as:'assignment',where:{op:'and',args:[{op:'eq',left:{kind:'variable',name:'assignment',endpoint:'staff'},right:{kind:'subject',identity:true}},{op:'eq',left:{kind:'variable',name:'assignment',endpoint:'project'},right:{kind:'resource',identity:true}}]}},disclosure:[]}]};
return {modules,ontologyJson:JSON.stringify(ontology),policyJson:JSON.stringify(policy)};
}
