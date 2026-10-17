import {generateAccessPackage} from '../src/compilation/index';
import {profile,request,mutateSource} from '../tests/compilation/access-fixtures';
const output=process.argv[2];if(!output)throw Error('output directory required');
const req=request();req.package='aggregate_shop';
req.sources[0]!.text=await Bun.file(new URL('../fixtures/access/commerce/postgresql18.json',import.meta.url)).text();
req.bindings=['orders-binding'];req.sources.push({id:'orders-binding',format:'json',text:await Bun.file(new URL('../fixtures/access/commerce/postgresql18-binding.json',import.meta.url)).text()});
mutateSource(req,d=>{
 for(const e of d.modules[0]!.elements){Object.assign(e,{name:e.id});if(e.id==='amount')Object.assign(e,{nullability:'absent-allowed',facets:{precision:40,scale:20}});if(e.id==='revision')Object.assign(e,{nullability:'absent-allowed'});}
 const access=(d.modules[0]!.extensions as any)['umf.access'];
 for(const set of access.columns)for(const column of set.columns)if(['amount','revision'].includes(column.field.element)){column.notNull=false;column.generation=null;if(column.field.element==='amount')column.type='numeric(40,20)';}
 const views=access.views;
 for(const v of views)if(v.record.element==='Order')for(const f of v.fields)if(['amount','revision'].includes(f.field.element)){f.row.null=true;f.create.null=true;if(f.field.element==='revision')f.generated=false;}
});
const pinned=profile();pinned.python.version='3.11.17';pinned.compilerVersion='local-aggregate-0.1';pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:'0.1.0.dev0'}:d);
const result=generateAccessPackage(req,pinned);if(result.outcome!=='candidate')throw Error(JSON.stringify(result.diagnostics));
for(const file of result.files)await Bun.write(output+'/'+file.path,file.text);
await Bun.write(output+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
