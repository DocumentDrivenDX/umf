import {test,expect} from 'bun:test';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,proposePostgresqlCatalogEdit,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/postgresql-catalog/column-metadata.schema.json';
const source=await Bun.file('fixtures/postgresql/catalog-capture.json').text();
test('CONTRACT-015 catalog identities drive core families without flattening native meaning',async()=>{
 const doc=importPostgresqlCatalogCapture(source,{id:'columns'}),all=getPostgresqlColumnMetadata(doc),columns=all.filter(c=>c.relation.schema==='sales'&&c.relation.name==='scalar_types');
 expect(columns.length).toBe(20);expect(createValidator().compile(schema)(all)).toBe(true);
 expect(columns.map(c=>c.element.scalarType??null)).toEqual(['boolean','integer','integer','integer','decimal','float','float','string','string','string','binary','date','time','time','timestamp','timestamp',null,null,null,null]);
 expect(columns[4]!.nativeColumn).toMatchObject({members:{type:{value:'numeric(20,4)'}}});
 expect(columns[17]!.nativeColumn).toMatchObject({members:{nativeType:{members:{schema:{value:'sales'},name:{value:'text'},kind:{value:'d'}}}}});
 expect(doc.modules[1]!.elements).toEqual(all.map(c=>c.element));
 for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(doc,format),format);expect(getPostgresqlColumnMetadata(back)).toEqual(all);expect(JSON.parse(exportPostgresqlCatalogCapture(back).json)).toEqual(JSON.parse(source));}
 const edited=proposePostgresqlCatalogEdit(doc,columns[4]!.path+'/comment','"Revised amount"').document;
 expect(getPostgresqlColumnMetadata(edited).find(c=>c.path===columns[4]!.path)!.element.description).toBe('Revised amount');expect(getPostgresqlColumnMetadata(doc).find(c=>c.path===columns[4]!.path)!.element.description).not.toBe('Revised amount');
 all[0]!.element.scalarType='future';expect(getPostgresqlColumnMetadata(doc)[0]!.element.scalarType).not.toBe('future');
 const stale=structuredClone(doc);stale.modules[1]!.elements[0]!.name='changed';expect(()=>exportPostgresqlCatalogCapture(stale)).toThrow('disagree');
 await Bun.write('fixtures/postgresql/column-metadata.json',JSON.stringify({source,view:getPostgresqlColumnMetadata(doc),editedPath:columns[4]!.path+'/comment'},null,2)+'\n');
});
test('CONTRACT-015 legacy captures do not guess types and field metadata cannot be lost',async()=>{
 const legacy=importPostgresqlCatalogCapture(await Bun.file('fixtures/postgresql/catalog-capture-v1.json').text(),{id:'old'});expect(getPostgresqlColumnMetadata(legacy).every(c=>c.element.scalarType===undefined)).toBe(true);
 const doc=importPostgresqlCatalogCapture(source,{id:'attached'}),first=getPostgresqlColumnMetadata(doc)[0]!;
 doc.modules[1]!.elements[0]!.references=[{role:'source',module:'catalog',element:'capture'}];
 expect(()=>proposePostgresqlCatalogEdit(doc,first.path+'/name','"different"')).toThrow('reassociation');
 expect(()=>proposePostgresqlCatalogEdit(doc,'/snapshot/relations','[]')).toThrow('reassociation');
 const modified=proposePostgresqlCatalogEdit(doc,first.path+'/comment','"documented"').document;
 expect(modified.modules[1]!.elements[0]!.references).toEqual(doc.modules[1]!.elements[0]!.references);
});
