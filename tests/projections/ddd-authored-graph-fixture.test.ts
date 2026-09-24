import {test,expect} from 'bun:test';

test('FEAT-006: staged DDL and SDL fixtures share the same authored DDD graph',async()=>{
 const pg=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
 const graphql=await Bun.file('fixtures/projections/ddd-graphql-core-fields/case.json').json();
 expect(pg.logical.id).toBe(graphql.logical.id);
 const ddd=(document:any)=>Object.fromEntries(document.modules.flatMap((module:any)=>module.elements
  .filter((element:any)=>element.extensions?.['umf.ddd'])
  .map((element:any)=>[JSON.stringify([module.id,element.id]),element.extensions['umf.ddd']])));
 expect(ddd(pg.logical)).toEqual(ddd(graphql.logical));
 expect(Object.keys(ddd(pg.logical))).toHaveLength(4);
 const fields=pg.binding.extensions['umf.binding'].fields;
 expect(fields.find((row:any)=>row.element==='Product'&&row.field==='tags')).toEqual({module:'sales',element:'Product',field:'tags',storage:'embedded',documentColumn:'payload',path:['tags']});
});
