// SPDX-License-Identifier: MIT OR Apache-2.0
import {generateAccessPackage} from '../src/compilation/index';
import {profile,request,mutateSource} from '../tests/compilation/access-fixtures';
const output=process.argv[2];if(!output)throw Error('output directory required');
const req=request();req.package='refinement_shop';
req.sources[0]!.text=await Bun.file(new URL('../fixtures/access/commerce/postgresql18.json',import.meta.url)).text();
req.bindings=['orders-binding'];req.sources.push({id:'orders-binding',format:'json',text:await Bun.file(new URL('../fixtures/access/commerce/postgresql18-binding.json',import.meta.url)).text()});
mutateSource(req,d=>{
 for(const e of d.modules[0]!.elements){Object.assign(e,{name:e.id});if(e.id==='amount')Object.assign(e,{nullability:'absent-allowed',facets:{precision:40,scale:20}});if(e.id==='revision')Object.assign(e,{nullability:'absent-allowed'});}
 Object.assign(d.modules[0]!,{relationships:['parent','peer','optionalPeer'].map(id=>({id,name:id,source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Order',key:'order-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:id==='peer'?1:0,max:1},targetLifecycle:'independent',directed:true}))});
 const order=d.modules[0]!.elements.find(e=>e.id==='Order')! as any;
 for(const id of ['parentId','peerId','optionalPeerId']){d.modules[0]!.elements.push({id,name:id,kind:'field',scalarType:'string',cardinality:'one',nullability:id==='peerId'?'required':'absent-allowed',extensions:{}} as any);order.members.push({module:'commerce',element:id});}
 const access=(d.modules[0]!.extensions as any)['umf.access'];
 for(const set of access.columns)for(const column of set.columns)if(['amount','revision'].includes(column.field.element)){column.notNull=false;column.generation=null;if(column.field.element==='amount')column.type='numeric(40,20)';}
 for(const id of ['parentId','peerId','optionalPeerId']){access.views.find((v:any)=>v.record.element==='Order').fields.push({field:{module:'commerce',element:id},row:{missing:false,null:id!=='peerId'},create:{missing:false,null:id!=='peerId'},mutable:true,generated:false});access.columns[0].columns.push({field:{module:'commerce',element:id},type:'text',notNull:id==='peerId',generation:null});}
 const views=access.views;
 for(const v of views)if(v.record.element==='Order')for(const f of v.fields)if(['amount','revision'].includes(f.field.element)){f.row.null=true;f.create.null=true;if(f.field.element==='revision')f.generated=false;}
});
const nativeBinding=JSON.parse(req.sources[1]!.text);for(const id of ['parentId','peerId','optionalPeerId'])nativeBinding.extensions['umf.binding'].fields.push({module:'commerce',element:id,storage:'column',column:id});req.sources[1]!.text=JSON.stringify(nativeBinding);
const pinned=profile();pinned.python.version=process.env.UMF_ACCESS_PYTHON_VERSION??'3.11.17';pinned.compilerVersion='local-inner-refinement-0.1';pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:process.env.UMF_ACCESS_RUNTIME_VERSION??'0.1.0.dev0'}:d.distribution==='pydantic'&&process.env.UMF_ACCESS_PYDANTIC_VERSION?{...d,version:process.env.UMF_ACCESS_PYDANTIC_VERSION}:d);
const result=generateAccessPackage(req,pinned);if(result.outcome!=='candidate')throw Error(JSON.stringify(result.diagnostics));
for(const file of result.files)await Bun.write(output+'/'+file.path,file.text);
await Bun.write(output+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
