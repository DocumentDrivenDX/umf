import {test,expect} from 'bun:test';
import {importSparkSchema,exportSparkSchema,renameSparkField,coreSchema,sparkRenameSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const validator=createValidator();validator.addSchema(coreSchema);const check=validator.compile(sparkRenameSchema);
const field=(name:string,type:any,collations:Record<string,string>={})=>({name,type,nullable:true,metadata:{__COLLATIONS:collations,other:{nameReference:name}}});
const doc=(f:any)=>importSparkSchema(JSON.stringify({type:'struct',fields:[f]}),{id:'rename'});
const options={fieldPointer:'/fields/0',name:'new.name',uninterpretedMetadata:'preserve-and-report' as const};
test('US-017-AC5: renames exact field-local collation paths through array/map types',()=>{
 for(const [type,collations] of [['string',{'old.name':'spark.UTF8_LCASE'}],[{type:'array',elementType:'string',containsNull:false},{'old.name.element':'spark.UTF8_LCASE'}],[{type:'map',keyType:'string',valueType:{type:'array',elementType:'string',containsNull:true},valueContainsNull:false},{'old.name.key':'spark.UTF8_LCASE','old.name.value.element':'spark.UTF8_LCASE'}]] as const){
  const original=doc(field('old.name',type,collations));const before=exportSparkSchema(original),result=renameSparkField(original,options),output=JSON.parse(exportSparkSchema(result.document)).fields[0];expect(check(result)).toBe(true);expect(output.name).toBe('new.name');expect(Object.keys(output.metadata.__COLLATIONS)).toEqual(Object.keys(collations).map(k=>'new.name'+k.slice('old.name'.length)));expect(output.metadata.other.nameReference).toBe('old.name');expect(exportSparkSchema(original)).toBe(before);expect(result.complete).toBe(false);expect(result.diagnostics[0]!.code).toBe('SPARK_NAME_REFERENCES_UNVERIFIED');
 }
});
test('US-017-AC5: nested structs own independent metadata and pointers select actual fields',()=>{
 const original=doc(field('parent',{type:'struct',fields:[field('child','string',{child:'spark.UTF8_LCASE'})]}));
 const parent=renameSparkField(original,{...options,name:'renamed_parent'});expect(JSON.parse(exportSparkSchema(parent.document)).fields[0].type.fields[0].metadata.__COLLATIONS).toEqual({child:'spark.UTF8_LCASE'});
 const child=renameSparkField(original,{...options,fieldPointer:'/fields/0/type/fields/0',name:'renamed_child'});expect(JSON.parse(exportSparkSchema(child.document)).fields[0].type.fields[0].metadata.__COLLATIONS).toEqual({renamed_child:'spark.UTF8_LCASE'});
 expect(()=>renameSparkField(original,{...options,fieldPointer:'/fields/0/metadata/other'})).toThrow('actual StructField');
});
test('US-017-AC5: unresolved collation paths block instead of dropping or guessing their meaning',()=>{
 for(const f of [field('old','integer',{old:'spark.UTF8_LCASE'}),field('old','string',{other:'spark.UTF8_LCASE'})])expect(()=>renameSparkField(doc(f),options)).toThrow('does not resolve');
 const original=importSparkSchema('{"type":"struct","fields":[{"name":"old","type":"string","metadata":{"n":9223372036854775807,"__COLLATIONS":{"old":"spark.UTF8_LCASE"}}}]}',{id:'exact'});expect(exportSparkSchema(renameSparkField(original,{...options,name:'__proto__'}).document)).toContain('9223372036854775807');expect(exportSparkSchema(renameSparkField(original,{...options,name:'__proto__'}).document)).toContain('"__proto__":"spark.UTF8_LCASE"');
});

test('US-017-AC5: empty collated names block observed native loss',()=>{
 const original=doc(field('old',{type:'array',elementType:'string',containsNull:true},{'old.element':'spark.UTF8_LCASE'}));const before=exportSparkSchema(original);
 expect(()=>renameSparkField(original,{...options,name:''})).toThrow('Empty collated field names');expect(exportSparkSchema(original)).toBe(before);
});
