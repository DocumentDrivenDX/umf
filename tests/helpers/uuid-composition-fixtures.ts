import {uuidModel,CHILD} from './uuid-model-fixtures';
export function mixedModel(system='postgresql'){
 const m=uuidModel(system==='tablespec'?'uuid-text':'words64',system),p=m.binding.extensions!['umf.binding'] as any;p.target.subset='uuid-model2';
 const fields=[{id:'label',scalarType:'string',facets:{length:{min:0,max:120,unit:'unicode-scalar'}}},{id:'count',scalarType:'integer',facets:{integerWidth:{bits:64,signed:true}}},{id:'active',scalarType:'boolean'},{id:'price',scalarType:'decimal',facets:{precision:20,scale:4}},{id:'blob',scalarType:'binary'},{id:'observed',scalarType:'timestamp'},{id:'ratio',scalarType:'float'},{id:'wide',scalarType:'integer',facets:{integerWidth:{bits:128,signed:false}}}];
 for(const f of fields){m.logical.modules[0]!.elements.push({...f,kind:'field',cardinality:'one',nullability:'required',extensions:{}});(m.logical.modules[0]!.elements[1]!.members as any[]).push({module:'m',element:f.id});p.fields.push({module:'m',element:f.id,storage:'column',column:f.id});}
 return m;
}
export const values=[{field:{module:'m',element:'childId'},value:{uuid:'ffffffff-ffff-ffff-ffff-ffffffffffff'}},{field:{module:'m',element:'parentRef'},value:null},{field:{module:'m',element:'label'},value:{string:"雪 O'Brien"}},{field:{module:'m',element:'count'},value:{integerToken:'-9223372036854775808'}},{field:{module:'m',element:'active'},value:{boolean:false}},{field:{module:'m',element:'price'},value:{decimalToken:'1234567890123456.7890'}},{field:{module:'m',element:'blob'},value:{binaryHex:'00ff80'}},{field:{module:'m',element:'observed'},value:{timestamp:'2026-10-16T12:34:56.123456789+05:30'}},{field:{module:'m',element:'ratio'},value:{floatToken:'-0'}},{field:{module:'m',element:'wide'},value:{integerToken:'340282366920938463463374607431768211455'}}];

export function compositeModel(system='postgresql'){
 const m=mixedModel(system),p=m.binding.extensions!['umf.binding'] as any,ref=(element:string)=>({module:'m',element});
 const leaf=(id:string,extra:any={})=>({id,kind:'field',cardinality:'one',nullability:'required',extensions:{},...extra});
 const nodes=[leaf('uuidItem',{scalarType:'uuid',nullability:'absent-allowed'}),leaf('items',{cardinality:'array',itemType:ref('uuidItem'),nullability:'absent-allowed',facets:{collectionSize:{min:0,max:8}}}),leaf('itemMap',{cardinality:'map',itemType:ref('items')}),{id:'details',kind:'group',extensions:{}},leaf('detailValue',{scalarType:'string'}),leaf('detailObject',{references:[{role:'record-type',...ref('details')}],nullability:'absent-allowed'})];
 m.logical.modules[0]!.elements.push(...nodes);(m.logical.modules[0]!.elements[1]!.members as any[]).push(ref('itemMap'),ref('detailObject'));
 p.groups=[{...ref('details'),members:[ref('detailValue'),ref('items')]}];
 p.fields.push({module:'m',element:'uuidItem',storage:'scalar-carrier',carrier:system==='tablespec'?{kind:'uuid-text',column:'value'}:{kind:'words64',highColumn:'hi',lowColumn:'lo',signed:system!=='parquet'}},...['items','itemMap','detailValue','detailObject'].map(element=>({module:'m',element,storage:'column',column:element})));
 return m;
}
export const compositeValues=[...values,{field:{module:'m',element:'itemMap'},value:{map:{empty:{array:[]},missing:null,values:{array:[null,{uuid:'00112233-4455-6677-8899-aabbccddeeff'},{uuid:'00112233-4455-6677-8899-aabbccddeeff'}]}}}},{field:{module:'m',element:'detailObject'},value:{group:[{field:{module:'m',element:'detailValue'},value:{string:'present group'}},{field:{module:'m',element:'items'},value:{array:[]}}]}}];

export function associationModel(system='postgresql'){
 const m=compositeModel(system),p=m.binding.extensions!['umf.binding'] as any,ref=(element:string)=>({module:'m',element});
 const parent=m.logical.modules[0]!.elements[0]!,child=m.logical.modules[0]!.elements[1]!;
 m.logical.modules[0]!.elements.push({id:'association',kind:'record',extensions:{},members:[ref('linkId'),ref('left'),ref('right'),ref('note')],keys:[{id:'pk',name:'link key',primary:true,fields:[ref('linkId')]}]},...['linkId','left','right'].map(id=>({id,kind:'field',extensions:{},cardinality:'one',nullability:'required',scalarType:'uuid'})),{id:'note',kind:'field',extensions:{},cardinality:'one',nullability:'required',scalarType:'string'});
 p.elements.push({...ref('association'),table:'links'});
 p.fields.push(...['linkId','left','right'].map(element=>({module:'m',element,storage:'scalar-carrier',carrier:system==='tablespec'?{kind:'uuid-text',column:element}:{kind:'words64',highColumn:element+'_hi',lowColumn:element+'_lo',signed:true}})),{...ref('note'),storage:'column',column:'note'});
 const d={id:'associationLink',name:'associationLink',source:[ref('parent')],target:[{...ref('child'),key:'pk'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true,associationRecord:ref('association'),inverse:'linkedFrom'};
 (m.logical.modules[0]!.relationships as any[]).push(d);p.relationships.push({module:'m',id:d.id,storage:'junction',record:ref('association'),source:[{record:ref('parent'),key:'pk',fields:[ref('left')]}],target:[{record:ref('child'),key:'pk',fields:[ref('right')]}]});
 return m;
}
export function associationData(){
 const uuid=(element:string,text:string)=>({field:{module:'m',element},value:{uuid:text}}),max='ffffffff-ffff-ffff-ffff-ffffffffffff',nil='00000000-0000-0000-0000-000000000000';
 return [{record:{module:'m',element:'parent'},rows:[[uuid('parentId',nil)]]},{record:CHILD,rows:[compositeValues]},{record:{module:'m',element:'association'},rows:[[uuid('linkId',nil),uuid('left',nil),uuid('right',max),{field:{module:'m',element:'note'},value:{string:'first'}}],[uuid('linkId',max),uuid('left',nil),uuid('right',max),{field:{module:'m',element:'note'},value:{string:'second'}}]]}];
}

export function polymorphicModel(system='postgresql'){
 const m=associationModel(system),p=m.binding.extensions!['umf.binding'] as any,ref=(element:string)=>({module:'m',element}),assoc=m.logical.modules[0]!.elements.find(e=>e.id==='association')!;
 const d=(m.logical.modules[0]!.relationships as any[])[1];d.source.push({module:'m',element:'child'});d.targetMultiplicity.max='*';
 m.logical.modules[0]!.elements.find(e=>e.id==='left')!.nullability='absent-allowed';
 m.logical.modules[0]!.elements.push({id:'leftAlt',kind:'field',scalarType:'uuid',cardinality:'one',nullability:'absent-allowed',extensions:{}});(assoc.members as any[]).push(ref('leftAlt'));
 p.fields.push({...ref('leftAlt'),storage:'scalar-carrier',carrier:system==='tablespec'?{kind:'uuid-text',column:'alt'}:{kind:'words64',highColumn:'alt_hi',lowColumn:'alt_lo',signed:true}});p.relationships[1].source.push({record:{module:'m',element:'child'},key:'pk',fields:[ref('leftAlt')]});return m;
}
export function polymorphicData(){const data=associationData() as any;for(const row of data[2].rows)row.push({field:{module:'m',element:'leftAlt'},value:null});data[2].rows[1][1].value=null;data[2].rows[1].at(-1).value={uuid:'ffffffff-ffff-ffff-ffff-ffffffffffff'};return data;}
