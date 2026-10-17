/** Authored non-temporal R12 source; native schema is independently created by the E2E. */
import {generateAccessPackage} from '../src/compilation/index';
import {profile,request} from '../tests/compilation/access-fixtures';
const output=process.argv[2];if(!output)throw Error('output directory required');
const req=request();req.package='relationship_shop';req.actions=[];
req.projections=[{name:'orderIdentity',record:{module:'commerce',element:'Order'},fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'code'}]}];
const doc=JSON.parse(await Bun.file(new URL('../fixtures/access/commerce/postgresql18.json',import.meta.url)).text());
const module=doc.modules[0];
const order=module.elements.find((e:any)=>e.id==='Order');
// The authored primary Key and selected paging Key deliberately differ.
const names=['orderId','keyNum','keyAmount','keyFlag','code','parentId','peerId','amount','units','memo','active'];
module.elements=[
 {id:'orderId',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},
 {id:'keyNum',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',facets:{integerWidth:{bits:64,signed:true}},extensions:{}},
 {id:'keyAmount',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'required',facets:{precision:18,scale:4},extensions:{}},
 {id:'keyFlag',kind:'field',scalarType:'boolean',cardinality:'one',nullability:'required',extensions:{}},
 {id:'active',kind:'field',scalarType:'boolean',cardinality:'one',nullability:'absent-allowed',extensions:{}},
 {id:'code',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},
 {id:'parentId',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}},
 {id:'peerId',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},
 {id:'amount',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'absent-allowed',facets:{precision:40,scale:20},extensions:{}},
 {id:'units',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',facets:{integerWidth:{bits:64,signed:true}},extensions:{}},
 {id:'memo',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}},
 {...order,members:names.map(element=>({module:'commerce',element})),keys:[
  {id:'order-key',name:'Order primary',primary:true,fields:['orderId','keyNum','keyAmount','keyFlag'].map(element=>({module:'commerce',element}))},
  {id:'code-key',name:'Selected paging code',fields:[{module:'commerce',element:'code'}]},
 ]},
];
for(const element of module.elements)element.name=element.id;
module.relationships=['parent','peer'].map(id=>({id,name:id,source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Order',key:'code-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:id==='parent'?0:1,max:1},targetLifecycle:'independent',directed:true}));
module.extensions={'umf.access':{search:[],searchBindings:[],views:[{record:{module:'commerce',element:'Order'},selectedKey:{module:'commerce',element:'Order',key:'code-key'},fields:names.map(element=>({field:{module:'commerce',element},row:{missing:false,null:['parentId','amount','units','memo','active'].includes(element)},create:{missing:false,null:['parentId','amount','units','memo','active'].includes(element)},mutable:!['orderId','keyNum','keyAmount','keyFlag','code'].includes(element),generated:false}))}],columns:[{binding:{sourceId:'orders-binding',module:'commerce'},target:{platform:'postgresql',majorVersion:'18'},columns:names.map(element=>({field:{module:'commerce',element},type:element==='amount'?'numeric(40,20)':element==='keyAmount'?'numeric(18,4)':['units','keyNum'].includes(element)?'bigint':['active','keyFlag'].includes(element)?'boolean':'text',notNull:!['parentId','amount','units','memo','active'].includes(element),generation:null}))}]}};
req.sources[0]!.text=JSON.stringify(doc);req.bindings=['orders-binding'];
const binding=JSON.parse(await Bun.file(new URL('../fixtures/access/commerce/postgresql18-binding.json',import.meta.url)).text());
binding.extensions['umf.binding'].fields=names.map(element=>({module:'commerce',element,storage:'column',column:element}));
req.sources.push({id:'orders-binding',format:'json',text:JSON.stringify(binding)});
const pinned=profile();pinned.python.version='3.11.17';pinned.compilerVersion='local-relationship-0.1';pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:'0.1.0.dev0'}:d);
await Bun.write(output+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
const result=generateAccessPackage(req,pinned);if(result.outcome!=='candidate')throw Error(JSON.stringify(result.diagnostics));
for(const file of result.files)await Bun.write(output+'/'+file.path,file.text);
await Bun.write(output+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
