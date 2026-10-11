import {inspectCoreReferenceLinks} from '../../src/model/reference-links';
import type {Document} from '../../src/model/types';
import sourceSchema from '../../spec/core/relationship-document.schema.json';
import resultSchema from '../../spec/core/reference-links-inspection.schema.json';
import {createValidator} from '../../src/validation/schema';
export function runReferenceLinksOwnerCases(){
 const rows:{id:string;passed:boolean}[]=[];
 const identity={module:'m',element:'v'},ref={role:'record-type',module:'m',element:'R'};
 const source=(properties:Record<string,unknown>={}):Document=>({umf:'0.7.0',id:'d',vocabularies:{},modules:[{id:'m',namespace:'m',elements:[{id:'v',kind:'field',extensions:{},...properties},{id:'R',kind:'record',members:[],extensions:{}}]}]});
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 function check(id:string,passed:boolean){rows.push({id,passed});if(!passed)throw Error(id)}
 function refuse(id:string,run:()=>unknown,code:string){let actual='';try{run()}catch(error){actual=(error as {code:string}).code}check(id,actual===code)}
 check('absent-links-is-missing',same(inspectCoreReferenceLinks(source(),identity).meaning,{state:'missing'}));
 check('empty-list-is-present',same(inspectCoreReferenceLinks(source({references:[]}),identity).meaning,{state:'present',links:[]}));
 const d=source({references:[ref]}),r=inspectCoreReferenceLinks(d,identity),expected={index:0,path:'/modules/0/elements/0/references/0',reference:ref,target:{identity:{module:'m',element:'R'},path:'/modules/0/elements/1',kind:'record'},uninterpretedPaths:[],typeAssertion:'unverified'};
 check('exact-qualified-link',same(r.meaning,{state:'present',links:[expected]}));
 check('exact-source-owner',same(r.source,d)&&same(r.identity,identity)&&r.path==='/modules/0/elements/0/references'&&r.provenance==='unverified');
 const links=[ref,{role:'future-role',module:'m',element:'R','future/qualifier':{tuple:['b','a']}},ref],opaque=source({references:links}),o=inspectCoreReferenceLinks(opaque,identity);
 check('roles-order-and-repeated-links',(o.meaning as any).links.length===3&&same((o.meaning as any).links.map((x:any)=>x.reference),links));
 check('occurrences-remain-distinct',same((o.meaning as any).links.map((x:any)=>[x.index,x.path]),[[0,'/modules/0/elements/0/references/0'],[1,'/modules/0/elements/0/references/1'],[2,'/modules/0/elements/0/references/2']]));
 check('opaque-qualifier-paths',same((o.meaning as any).links[1].uninterpretedPaths,['/modules/0/elements/0/references/1/future~1qualifier']));
 check('role-never-proves-type',(o.meaning as any).links.every((x:any)=>x.typeAssertion==='unverified'));
 (opaque.modules[0]!.elements[0]!.references![1]!['future/qualifier'] as any).tuple.reverse();check('input-copy-isolation',(o.meaning as any).links[1].reference['future/qualifier'].tuple[0]==='b');
 (o.meaning as any).links[0].reference.module='changed';check('output-copy-isolation',opaque.modules[0]!.elements[0]!.references![0]!.module==='m');
 const scalar=inspectCoreReferenceLinks(source({scalarType:'string',references:[ref]}),identity);check('raw-scalar-record-role-not-authored-type',(scalar.meaning as any).links[0].typeAssertion==='unverified');
 const fieldTarget=inspectCoreReferenceLinks(source({references:[{...ref,element:'v'}]}),identity);check('record-role-to-Field-stays-link',(fieldTarget.meaning as any).links[0].target.kind==='field'&&(fieldTarget.meaning as any).links[0].typeAssertion==='unverified');
 const cyclic=source();cyclic.modules[0]!.elements[1]!.references=[ref];check('direct-self-cycle-terminates',(inspectCoreReferenceLinks(cyclic,{module:'m',element:'R'}).meaning as any).links[0].target.path==='/modules/0/elements/1');
 const mutual=source({references:[ref]});mutual.modules[0]!.elements[1]!.references=[{role:'future-role',module:'m',element:'v'}];check('mutual-cycle-remains-direct-only',(inspectCoreReferenceLinks(mutual,identity).meaning as any).links.length===1);
 const qualified=source({references:[{...ref,module:'other'}]});qualified.modules.push({id:'other',namespace:'other',elements:[{id:'R',kind:'group',extensions:{}}]});check('same-name-cross-module-target',same((inspectCoreReferenceLinks(qualified,identity).meaning as any).links[0].target,{identity:{module:'other',element:'R'},path:'/modules/1/elements/0',kind:'group'}));
 for(const kind of ['future-kind',undefined]){const doc=source({references:[ref]});delete doc.modules[0]!.elements[1]!.members;if(kind===undefined)delete doc.modules[0]!.elements[1]!.kind;else doc.modules[0]!.elements[1]!.kind=kind;check('target-kind-presence-'+String(kind),same((inspectCoreReferenceLinks(doc,identity).meaning as any).links[0].target,{identity:{module:'m',element:'R'},path:'/modules/0/elements/1',...(kind===undefined?{}:{kind})}))}
 for(const [id,properties] of [['missing-target',{references:[{...ref,element:'absent'}]}],['missing-module',{references:[{...ref,module:'absent'}]}],['missing-role',{references:[{module:'m',element:'R'}]}],['nonarray-links',{references:{}}]] as const)refuse(id,()=>inspectCoreReferenceLinks(source(properties),identity),'CORE_REFERENCE_LINKS_SOURCE');
 const duplicate=source({references:[ref]});duplicate.modules[0]!.elements.push({...duplicate.modules[0]!.elements[1]!});refuse('duplicate-target-identities',()=>inspectCoreReferenceLinks(duplicate,identity),'CORE_REFERENCE_LINKS_SOURCE');
 for(const umf of ['0.1.0','0.6.0','0.8.0','future'])refuse('unsupported-'+umf,()=>inspectCoreReferenceLinks({...d,umf} as Document,identity),'CORE_REFERENCE_LINKS_VERSION');
 for(const value of [null,[],{}, {module:'m',element:''},{...identity,extra:true}])refuse('bad-identity-'+JSON.stringify(value),()=>inspectCoreReferenceLinks(d,value as any),'CORE_REFERENCE_LINKS_IDENTITY');
 refuse('missing-owner',()=>inspectCoreReferenceLinks(d,{module:'m',element:'absent'}),'CORE_REFERENCE_LINKS_MISSING');
 let calls=0;const hostile={...d};Object.defineProperty(hostile,'modules',{enumerable:true,get(){calls++;return d.modules}});refuse('getter-refusal',()=>inspectCoreReferenceLinks(hostile,identity),'NON_JSON');check('getter-not-invoked',calls===0);
 const validator=createValidator();validator.addSchema(sourceSchema);const valid=validator.compile(resultSchema);check('closed-result-positive',valid(r));
 for(const [id,mutation] of [['missing-with-links',{meaning:{state:'missing',links:[]}}],['invented-type-assertion',{meaning:{state:'present',links:[{...expected,typeAssertion:'verified'}]}}],['extra-link-authority',{meaning:{state:'present',links:[{...expected,enforcement:'database'}]}}],['invented-provenance',{provenance:'verified'}],['future-operation-version',{version:'future'}],['extra-result-member',{enforcement:'database'}]] as const)check('closed-result-'+id,!valid({...r,...mutation}));
 return rows;
}
