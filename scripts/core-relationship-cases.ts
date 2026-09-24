export function relationshipCandidate():any {
 const elements:any[]=[];
 for(const name of ['Order','Customer','Product','Person','Company','Student','Course','Enrollment']){
  const field={module:'m',element:name+'.id'};
  elements.push({id:name,kind:'record',members:[field],keys:[{id:'identity',name:'Identity',fields:[field],primary:true}],extensions:{}});
  elements.push({id:field.element,kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',extensions:{}});
 }
 const customer=elements.find(e=>e.id==='Customer'),code={module:'m',element:'Customer.code'};
 elements.push({id:code.element,kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}});
 customer.members.push(code);customer.keys.push({id:'account-number',name:'Account number',fields:[code]});
 const grade={module:'m',element:'Enrollment.grade'};elements.find(e=>e.id==='Enrollment').members.push(grade);
 elements.push({id:grade.element,kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 return {umf:'0.7.0',id:'relationships',vocabularies:{future:{version:'1.0.0'}},extensions:{future:{unknown:['9007199254740993',null]}},modules:[{id:'m',namespace:'domain',elements,relationships:[{
  id:'order-customer',name:'customer',source:[{module:'m',element:'Order'}],target:[{module:'m',element:'Customer',key:'identity'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:1,max:1},targetLifecycle:'independent',directed:true,inverse:'orders',
 }]}]};
}
export function relationshipCases(){
 const rows:{id:string;document:any;valid:boolean;code?:string}[]=[];
 const add=(id:string,change:(d:any,r:any)=>void,valid=true,code?:string)=>{const document=relationshipCandidate();change(document,document.modules[0].relationships[0]);rows.push({id,document,valid,...(code?{code}:{})});};
 add('many-to-one',()=>{});
 add('one-to-one',(_,r)=>r.sourceMultiplicity={min:0,max:1});
 add('many-to-many',(_,r)=>{r.target=[{module:'m',element:'Product',key:'identity'}];r.targetMultiplicity={min:0,max:'*'};});
 add('heterogeneous',(_,r)=>{r.source.push({module:'m',element:'Company'});r.target.push({module:'m',element:'Person',key:'identity'});});
 add('self',(_,r)=>{r.source=[{module:'m',element:'Person'}];r.target=[{module:'m',element:'Person',key:'identity'}];r.name='manager';r.inverse='reports';});
 add('undirected',(_,r)=>{r.directed=false;r.targetLifecycle='unspecified';});
 add('alternate-key',(_,r)=>r.target[0].key='account-number');
 add('bounded',(_,r)=>{r.sourceMultiplicity={min:2,max:3};r.targetMultiplicity={min:1,max:'*'};});
 add('reified-enrollment',(_,r)=>{r.source=[{module:'m',element:'Student'}];r.target=[{module:'m',element:'Course',key:'identity'}];r.targetMultiplicity={min:0,max:'*'};r.associationRecord={module:'m',element:'Enrollment'};});
 add('owned',(_,r)=>r.targetLifecycle='owned');
 add('no-relationships',d=>delete d.modules[0].relationships);
 add('empty-relationships',d=>d.modules[0].relationships=[]);
 add('renamed-key',(d,r)=>d.modules[0].elements.find((e:any)=>e.id==='Customer').keys[0].name='Renamed presentation');
 add('future-qualifiers',(_,r)=>{r['a/b~c']={opaque:true};r.target[0].future=1;r.sourceMultiplicity.future='retain';});
 add('future-lifecycle',(_,r)=>r.targetLifecycle='future');
 add('duplicate-id',(d,r)=>d.modules[0].relationships.push({...r,name:'other',inverse:'otherInverse'}),false,'RELATIONSHIP_DUPLICATE_ID');
 add('duplicate-name',(d,r)=>d.modules[0].relationships.push({...r,id:'other'}),false,'RELATIONSHIP_DUPLICATE_NAME');
 add('duplicate-source',(_,r)=>r.source.push({...r.source[0],future:true}),false,'RELATIONSHIP_DUPLICATE_ENDPOINT');
 add('duplicate-target',(_,r)=>r.target.push({...r.target[0],key:'account-number'}),false,'RELATIONSHIP_DUPLICATE_ENDPOINT');
 add('missing-endpoint',(_,r)=>r.target[0].element='missing',false,'RELATIONSHIP_ENDPOINT_MISSING');
 add('field-endpoint',(_,r)=>r.source[0].element='Order.id',false,'RELATIONSHIP_ENDPOINT_KIND');
 add('unkeyed-endpoint',d=>delete d.modules[0].elements.find((e:any)=>e.id==='Order').keys,false,'RELATIONSHIP_ENDPOINT_KEY');
 add('key-name-not-id',(_,r)=>r.target[0].key='Account number',false,'RELATIONSHIP_TARGET_KEY');
 add('missing-target-key',(_,r)=>delete r.target[0].key,false,'RELATIONSHIP_STRUCTURE');
 add('unkeyed-association',(d,r)=>{r.associationRecord={module:'m',element:'Enrollment'};delete d.modules[0].elements.find((e:any)=>e.id==='Enrollment').keys;},false,'RELATIONSHIP_ENDPOINT_KEY');
 add('inverted-bounds',(_,r)=>r.sourceMultiplicity={min:3,max:2},false,'RELATIONSHIP_MULTIPLICITY');
 for(const value of [-1,0,1.5,'many'])add('invalid-max-'+value,(_,r)=>r.targetMultiplicity.max=value,false,'RELATIONSHIP_STRUCTURE');
 add('owned-undirected',(_,r)=>{r.targetLifecycle='owned';r.directed=false;},false,'RELATIONSHIP_LIFECYCLE');
 add('inverse-collision',(d,r)=>d.modules[0].relationships.push({...r,id:'other',name:'other',source:[{module:'m',element:'Product'}]}),false,'RELATIONSHIP_PRESENTATION_COLLISION');
 add('inverse-forward-collision',(d,r)=>{const other=structuredClone(r);other.id='other';other.name='orders';other.source=[{module:'m',element:'Customer'}];other.target=[{module:'m',element:'Product',key:'identity'}];other.inverse='products';d.modules[0].relationships.push(other);},false,'RELATIONSHIP_PRESENTATION_COLLISION');
 add('same-forward-name-other-module',(d,r)=>{const other=structuredClone(r);delete r.inverse;delete other.inverse;d.modules.push({id:'other',namespace:'other',elements:[],relationships:[other]});});
 add('inverse-collision-other-module',(d,r)=>{const other=structuredClone(r);other.id='other';other.name='other';other.source=[{module:'m',element:'Product'}];d.modules.push({id:'other',namespace:'other',elements:[],relationships:[other]});},false,'RELATIONSHIP_PRESENTATION_COLLISION');
 add('empty-source',(_,r)=>r.source=[],false,'RELATIONSHIP_STRUCTURE');
 add('old-version',d=>d.umf='0.6.0',false,'RELATIONSHIP_STRUCTURE');
 return rows;
}
if(import.meta.main)await Bun.write('fixtures/relationship/core-candidate.json',JSON.stringify({scope:'Authored relationship candidate fixtures; not native admission evidence',cases:relationshipCases()},null,2)+'\n');
