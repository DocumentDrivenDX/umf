import {runActionCaseCorpus} from './case-corpus';
import type * as Umf from '../../src/index';
import type {Document} from '../../src/model/types';
/** Shared actual public-API corpus, used against Bun source and built browser ESM. */
export function runActionsCorpus(api:typeof Umf,fixtures:Document[]) {
 const inspections=fixtures.map(source=>api.inspectActions(source,api.registerActions(api.dddRegistry())));
 const source=JSON.parse(JSON.stringify(fixtures[0])) as Document,action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];
 action.authorization.profile={id:'umf.actions.roles',version:'1'};const registry=api.registerActions(new api.Registry()),inspection=api.inspectActions(source,registry),identity={module:'sales',action:'approve'};
 const profile:Umf.ActionExecutorProfile={id:'browser-declaration-only',version:'1',actionVersion:'0.1.0',coreVersion:'0.8.0',source,identity,claims:inspection.actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://declaration-only']}))};
 const assessment=api.assessAction(source,identity,profile,registry),edited=api.editAction(source,identity,{...action,description:'Browser checked edit'},registry);
 const future=JSON.parse(JSON.stringify(source)) as Document;(future.modules[0]!.extensions!['umf.actions'] as any).actions[0]['future/~']={keep:[null,'exact']};
 const roundTrips=(['json','yaml'] as const).map(format=>({format,source:api.readDocument(api.writeDocument(future,format),format)}));
 const diagnostics=api.inspectActions(future,registry).validation.diagnostics;
 const empty=JSON.parse(JSON.stringify(source)) as Document;delete empty.modules[0]!.extensions!['umf.actions'];const authored=api.declareAction(empty,'sales',action,registry);
 let getterCalls=0,refused=false;try{api.inspectActions(Object.defineProperty({},'umf',{enumerable:true,get(){getterCalls++;return '0.8.0'}}) as Document,registry);}catch{refused=true;}
 const frame=action.writes[0],inputs={order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}};
 const selected=api.selectActionIdentity(source,action,frame,inputs);
 const rule={language:'umf.actions.rules',version:'1',expression:'{"op":"eq","args":[{"op":"add","args":[{"literal":{"integerToken":"9007199254740992"}},{"literal":{"integerToken":"1"}}]},{"literal":{"integerToken":"9007199254740993"}}]}',references:[]};
 const evaluated=api.evaluateActionRule(source,action,rule,'pre',{inputs,pre:{frames:{},links:[]}});
 const cases=runActionCaseCorpus(api);
 return {cases,inspections,assessment,edited,future,roundTrips,diagnostics,authored,getterCalls,refused,selected,evaluated};
}
