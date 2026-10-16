import {expect,test} from 'bun:test';
import {generateAccessPackage,diffAccessPackages} from '../../src/compilation/index';
import {request,profile,mutateSource} from './access-fixtures';
// @covers US-080-AC6
 test('manifest diff classifies rename/retype as breaking and optional Create additions as source-compatible',()=>{
 const before=generateAccessPackage(request(),profile());
 const added=request();mutateSource(added,d=>{d.modules[0]!.elements.push({id:'extra',kind:'field',cardinality:'one',scalarType:'string',nullability:'absent-allowed',extensions:{}} as never);(d.modules[0]!.elements[5]! as unknown as {members:unknown[]}).members.push({module:'commerce',element:'extra'});d.modules[0]!.extensions['umf.access'].views[0]!.fields.push({field:{module:'commerce',element:'extra'},row:{missing:true,null:true},create:{missing:true,null:true},mutable:true,generated:false} as never);});
 const additions=diffAccessPackages(before,generateAccessPackage(added,profile()));expect(additions.find(s=>s.symbol==='OrderCreate')?.classification).toBe('source-compatible');
 const retyped=request();mutateSource(retyped,d=>{Object.assign(d.modules[0]!.elements[1]!,{scalarType:'integer',facets:{integerWidth:{bits:32,signed:true}}});});expect(diffAccessPackages(before,generateAccessPackage(retyped,profile())).find(s=>s.symbol==='OrderCreate')?.classification).toBe('breaking');
 const renamed=request();mutateSource(renamed,d=>{const walk=(v:unknown)=>{if(v&&typeof v==='object')for(const [key,child] of Object.entries(v)){if((key==='id'||key==='element')&&child==='memo')(v as Record<string,unknown>)[key]='remark';else walk(child);}};walk(d);});expect(diffAccessPackages(before,generateAccessPackage(renamed,profile())).find(s=>s.symbol==='OrderCreate')?.classification).toBe('breaking');
 expect(diffAccessPackages(before,before).every(s=>s.classification==='source-compatible'&&s.change==='unchanged')).toBe(true);
 });

// @covers US-080-AC6 -- alternate DTOs have their own ordered signature.
test('alternate Key compatibility compares its actual fields',()=>{
 const before=request();mutateSource(before,d=>{(d.modules[0]!.elements[5]! as unknown as {keys:unknown[]}).keys.push({id:'revision-key',name:'Revision',fields:[{module:'commerce',element:'revision'}],primary:false});});
 const after=structuredClone(before);mutateSource(after,d=>{Object.assign(d.modules[0]!.elements[4]!,{facets:{integerWidth:{bits:32,signed:true}}});});
 const changes=diffAccessPackages(generateAccessPackage(before,profile()),generateAccessPackage(after,profile()));
 expect(changes.find(c=>c.symbol==='OrderRevisionKeyKey'&&c.role==='key')?.classification).toBe('breaking');
 expect(changes.find(c=>c.symbol==='OrderKey'&&c.role==='key')?.classification).toBe('source-compatible');
});
