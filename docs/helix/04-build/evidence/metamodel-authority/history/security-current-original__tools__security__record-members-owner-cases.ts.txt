import {inspectCoreRecordMembers} from '../../src/model/record-members';
import type {Document} from '../../src/model/types';
import sourceSchema from '../../spec/core/relationship-document.schema.json';
import resultSchema from '../../spec/core/record-members-inspection.schema.json';
import {createValidator} from '../../src/validation/schema';
export function runRecordMembersOwnerCases(){
 const rows:{id:string;passed:boolean}[]=[];
 const identity={module:'m',element:'r'};
 const source=(properties:Record<string,unknown>={}):Document=>({umf:'0.7.0',id:'d',vocabularies:{},modules:[{id:'m',namespace:'m',elements:[{id:'r',kind:'record',extensions:{},...properties},{id:'v',kind:'field',extensions:{}}]}]});
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 function check(id:string,passed:boolean){rows.push({id,passed});if(!passed)throw Error(id)}
 function refuse(id:string,run:()=>unknown,code:string){let actual='';try{run()}catch(error){actual=(error as {code:string}).code}check(id,actual===code)}
 check('absent-is-missing',same(inspectCoreRecordMembers(source(),identity).meaning,{state:'missing'}));
 check('empty-is-explicit-known',same(inspectCoreRecordMembers(source({members:[]}),identity).meaning,{state:'known',members:[],uninterpretedPaths:[]}));
 const member={module:'m',element:'v'},d=source({members:[member]}),r=inspectCoreRecordMembers(d,identity);
 check('known-qualified-members',same(r.meaning,{state:'known',members:[member],uninterpretedPaths:[]}));
 check('exact-source-context',same(r.source,d)&&same(r.identity,identity)&&r.path==='/modules/0/elements/0/members'&&r.provenance==='unverified');
 const opaque=source({members:[{...member,'future/qualifier':{values:['x','y']}}]}),o=inspectCoreRecordMembers(opaque,identity);
 check('unknown-qualifier-is-partial',same(o.meaning,{state:'partial',members:opaque.modules[0]!.elements[0]!.members,uninterpretedPaths:['/modules/0/elements/0/members/0/future~1qualifier']}));
 (opaque.modules[0]!.elements[0]!.members as any[])[0]['future/qualifier'].values.reverse();
 check('input-copy-isolation',(o.meaning as any).members[0]['future/qualifier'].values[0]==='x');
 (o.meaning as any).members[0].element='changed';check('output-copy-isolation',(opaque.modules[0]!.elements[0]!.members as any[])[0].element==='v');
 for(const kind of ['field','group','future-role',undefined]){const doc=source({kind});if(kind===undefined)delete doc.modules[0]!.elements[0]!.kind;check('nonrecord-'+String(kind),same(inspectCoreRecordMembers(doc,identity).meaning,{state:'inapplicable'}))}
 const qualified=source({members:[{module:'other',element:'v'}]});qualified.modules.push({id:'other',namespace:'other',elements:[{id:'v',kind:'field',extensions:{}}]});
 check('cross-module-member-retained',same((inspectCoreRecordMembers(qualified,identity).meaning as any).members,[{module:'other',element:'v'}]));
 const ordered=source({members:[{module:'m',element:'w'},member]});ordered.modules[0]!.elements.push({id:'w',kind:'field',extensions:{}});check('member-order-retained',same((inspectCoreRecordMembers(ordered,identity).meaning as any).members,ordered.modules[0]!.elements[0]!.members));
 for(const [id,properties] of [['missing-field',{members:[{module:'m',element:'absent'}]}],['nonfield-member',{members:[identity]}],['duplicate-member',{members:[member,member]}],['semantic-duplicate-with-distinct-qualifiers',{members:[{...member,future:'a'},{...member,future:'b'}]}],['nonrecord-members',{kind:'field',members:[]}]] as const)refuse(id,()=>inspectCoreRecordMembers(source(properties),identity),'CORE_RECORD_MEMBERS_SOURCE');
 const shared=source({members:[member]});shared.modules[0]!.elements.push({id:'r2',kind:'record',members:[member],extensions:{}});refuse('multiple-record-owners',()=>inspectCoreRecordMembers(shared,identity),'CORE_RECORD_MEMBERS_SOURCE');
 for(const umf of ['0.8.0','0.9.0']){const doc={...d,umf} as Document,result=inspectCoreRecordMembers(doc,identity);check('supported-envelope-'+umf,same(result.meaning,r.meaning)&&same(result.source,doc)&&result.version===(umf==='0.8.0'?'0.2.0':'0.3.0')&&result.provenance==='unverified')}
 for(const umf of ['0.6.0','0.10.0','future'])refuse('unsupported-'+umf,()=>inspectCoreRecordMembers({...d,umf} as Document,identity),'CORE_RECORD_MEMBERS_VERSION');
 for(const value of [null,[],{}, {module:'m',element:''},{...identity,extra:true}])refuse('bad-identity-'+JSON.stringify(value),()=>inspectCoreRecordMembers(d,value as any),'CORE_RECORD_MEMBERS_IDENTITY');
 refuse('missing-qualified-owner',()=>inspectCoreRecordMembers(d,{module:'other',element:'r'}),'CORE_RECORD_MEMBERS_MISSING');
 let calls=0;const hostile={...d};Object.defineProperty(hostile,'modules',{enumerable:true,get(){calls++;return d.modules}});refuse('getter-refused',()=>inspectCoreRecordMembers(hostile,identity),'NON_JSON');check('getter-not-invoked',calls===0);
 const validator=createValidator();validator.addSchema(sourceSchema);const valid=validator.compile(resultSchema);check('closed-result-positive',valid(r));
 for(const [id,mutation] of [['known-with-unknown-paths',{meaning:{state:'known',members:[member],uninterpretedPaths:['/opaque']}}],['partial-without-unknown-paths',{meaning:{state:'partial',members:[member],uninterpretedPaths:[]}}],['missing-with-members',{meaning:{state:'missing',members:[]}}],['extra-authority',{enforcement:'database'}],['invented-provenance',{provenance:'verified'}],['future-version',{version:'future'}]] as const)check('closed-result-'+id,!valid({...r,...mutation}));
 return rows;
}
