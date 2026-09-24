export const keyCandidate = ():any => ({umf:'0.6.0',id:'keys',vocabularies:{future:{version:'1.0.0'}},extensions:{future:{untouched:['9007199254740993',null]}},modules:[{id:'m',namespace:'sales',elements:[
 {id:'Order',kind:'record',members:[{module:'m',element:'id'},{module:'m',element:'number'}],keys:[{id:'pk',name:'Order ID',primary:true,fields:[{module:'m',element:'id'}]},{id:'alternate',name:'Order number',fields:[{module:'m',element:'number'}]}],extensions:{}},
 {id:'id',kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',extensions:{}},
 {id:'number',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}},
]}]});
export function keyCases(){
 const rows:{id:string;document:any;valid:boolean;code?:string|undefined}[]=[];
 const add=(id:string,edit:(d:any,r:any,f:any)=>void,valid:boolean,code?:string)=>{const d=keyCandidate();edit(d,d.modules[0].elements[0],d.modules[0].elements[1]);rows.push({id,document:d,valid,code});};
 add('primary-and-alternate',()=>{},true);
 add('no-primary',(_,r)=>delete r.keys[0].primary,true);
 add('explicit-false-primary',(_,r)=>r.keys[0].primary=false,true);
 add('key-list-order-not-identity',(_,r)=>r.keys.reverse(),true);
 add('rename-keeps-id',(_,r)=>r.keys[0].name='Renamed',true);
 add('record-without-keys',(_,r)=>delete r.keys,true);
 add('empty-record',(_,r)=>{delete r.keys;r.members=[];},true);
 add('opaque-singular-key',(_,r)=>r.key={old:true},true);
 add('unknown-qualifier',(_,r)=>r.keys[0]['a/b~c']={future:true},true,'UNKNOWN_KEY_QUALIFIER');
 add('unknown-member-qualifier',(_,r)=>r.members[0].future=false,true,'UNKNOWN_KEY_QUALIFIER');
 add('same-key-id-in-other-record',(d,r)=>d.modules.push({id:'support',namespace:'support',elements:JSON.parse(JSON.stringify(d.modules[0].elements)).map((e:any)=>{for(const ref of e.members??[])ref.module='support';for(const k of e.keys??[])for(const ref of k.fields)ref.module='support';return e;})}),true);
 for(const family of ['boolean','binary','decimal'])add('allowed-'+family,(_,r,f)=>{f.scalarType=family;if(family==='decimal')f.facets={precision:5,scale:2};},true);
 add('composite-key',(_,r)=>{r.keys=[{id:'composite',name:'Composite',fields:[...r.members]}];},true);
 add('empty-keys',(_,r)=>r.keys=[],false,'KEY_STRUCTURE');
 add('empty-components',(_,r)=>r.keys[0].fields=[],false,'KEY_STRUCTURE');
 add('missing-id',(_,r)=>delete r.keys[0].id,false,'KEY_STRUCTURE');
 add('missing-name',(_,r)=>delete r.keys[0].name,false,'KEY_STRUCTURE');
 add('empty-name',(_,r)=>r.keys[0].name='',false,'KEY_STRUCTURE');
 add('string-primary',(_,r)=>r.keys[0].primary='true',false,'KEY_STRUCTURE');
 add('non-record-keys',(_,r)=>r.kind='group',false,'KEY_STRUCTURE');
 add('non-record-members',(_,r)=>{delete r.keys;r.kind='field';},false,'KEY_STRUCTURE');
 add('missing-members',(_,r)=>delete r.members,false,'KEY_STRUCTURE');
 add('duplicate-id',(_,r)=>r.keys[1].id=r.keys[0].id,false,'KEY_DUPLICATE_ID');
 add('duplicate-name',(_,r)=>r.keys[1].name=r.keys[0].name,false,'KEY_DUPLICATE_NAME');
 add('multiple-primary',(_,r)=>r.keys[1].primary=true,false,'KEY_PRIMARY_COUNT');
 add('duplicate-set-order-independent',(_,r)=>r.keys=[{id:'a',name:'a',fields:[...r.members]},{id:'b',name:'b',fields:[...r.members].reverse()}],false,'KEY_DUPLICATE_SET');
 add('duplicate-ref-with-unknown',(_,r)=>r.keys[0].fields.push({...r.keys[0].fields[0],future:true}),false,'KEY_DUPLICATE_FIELD');
 add('duplicate-member-with-unknown',(_,r)=>r.members.push({...r.members[0],future:true}),false,'KEY_DUPLICATE_MEMBER');
 add('missing-member',(_,r)=>r.members.push({module:'m',element:'missing'}),false,'KEY_MEMBER_MISSING');
 add('record-as-member',(_,r)=>r.members.push({module:'m',element:'Order'}),false,'KEY_MEMBER_KIND');
 add('multiple-owners',(d,r)=>d.modules[0].elements.push({id:'Other',kind:'record',members:[r.members[0]],extensions:{}}),false,'KEY_MEMBER_OWNER');
 add('cross-record-field',(_,r)=>r.members.splice(0,1),false,'KEY_FIELD_OWNER');
 add('missing-component',(_,r)=>r.keys[0].fields[0].element='missing',false,'KEY_FIELD_MISSING');
 for(const state of ['absent-allowed','unspecified','future',undefined])add('availability-'+state,(_,r,f)=>{if(state)f.nullability=state;else delete f.nullability;},false,'KEY_FIELD_REQUIRED');
 for(const shape of ['array','map','unspecified','future',undefined])add('shape-'+shape,(_,r,f)=>{if(shape)f.cardinality=shape;else delete f.cardinality;if(shape==='array'||shape==='map')delete f.scalarType;},false,'KEY_FIELD_SINGULAR');
 for(const family of ['float','date','time','timestamp','future',undefined])add('undefined-equality-'+family,(_,r,f)=>{if(family)f.scalarType=family;else delete f.scalarType;},false,'KEY_EQUALITY');
 add('record-valued-field',(_,r,f)=>{delete f.scalarType;f.references=[{role:'record-type',module:'m',element:'Order'}];},false,'KEY_EQUALITY');
 add('unqualified-decimal',(_,r,f)=>f.scalarType='decimal',false,'KEY_DECIMAL_DOMAIN');
 add('invalid-decimal-scale',(_,r,f)=>{f.scalarType='decimal';f.facets={precision:2,scale:3};},false,'FACET_SCALE');
 add('legacy-profile',d=>d.umf='0.5.0',false,'KEY_STRUCTURE');
 return rows;
}
