import {test,expect} from 'bun:test';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,getPostgresqlCatalogNode,proposePostgresqlCatalogEdit,readDocument,writeDocument} from '../../src';
import {nativePointer,treeChild,parseNativeJson,renderTree} from '../../src/model/native-json';
test('CONTRACT-015 exact catalog integers prevent false scalar classification through rounding',async()=>{
 const source=await Bun.file('fixtures/postgresql/catalog-capture.json').text(),original=importPostgresqlCatalogCapture(source,{id:'exact-integers'}),column=getPostgresqlColumnMetadata(original).find(c=>c.element.scalarType==='integer')!,before=writeDocument(original,'json'),cases=[];
 const paths=['/serverVersion',column.path+'/position',column.path+'/nativeType/dimensions',column.path+'/nativeType/modifier'];
 for(const path of paths){
  const node=getPostgresqlCatalogNode(original,path);if(node.kind!=='number')throw Error('Expected numeric fixture');
  for(const replacement of [node.value+'.0000000000000000001','1e-400','9007199254740993','-0']){
   expect(()=>proposePostgresqlCatalogEdit(original,path,replacement)).toThrow('POSTGRESQL_CATALOG_INTEGER');
   const root=getPostgresqlCatalogNode(original,''),parts=nativePointer(path);let parent=root;for(const key of parts.slice(0,-1))parent=treeChild(parent,key);if(parent.kind!=='object')throw Error('Expected object');parent.members[parts.at(-1)!]=parseNativeJson(replacement);const input=renderTree(root);
   expect(()=>importPostgresqlCatalogCapture(input,{id:'invalid'})).toThrow('POSTGRESQL_CATALOG_INTEGER');cases.push({path,replacement,input});
  }
 }
 expect(writeDocument(original,'json')).toBe(before);
 const exact=proposePostgresqlCatalogEdit(original,column.path+'/nativeType/dimensions','0.00e5').document;
 expect(getPostgresqlColumnMetadata(exact).find(c=>c.path===column.path)!.element.scalarType).toBe('integer');
 const root=getPostgresqlCatalogNode(original,'');if(root.kind!=='object')throw Error('Expected object');root.members.future=parseNativeJson('{"exact":9007199254740993.0000000000000000001}');
 const extended=importPostgresqlCatalogCapture(renderTree(root),{id:'unknown'});
 for(const format of ['json','yaml'] as const)expect(exportPostgresqlCatalogCapture(readDocument(writeDocument(extended,format),format)).json).toContain('9007199254740993.0000000000000000001');
 await Bun.write('fixtures/postgresql/integer-tokens.json',JSON.stringify({original,cases,exact,extended},null,2)+'\n');
});
