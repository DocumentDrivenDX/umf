import {test,expect} from 'bun:test';
import {importDeltaTable,exportDeltaTable,renameDeltaMappedField,deltaMappedRenameSchema,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const validator=createValidator();validator.addSchema(coreSchema);const check=validator.compile(deltaMappedRenameSchema);
const opts={fieldPointer:'/fields/1',name:'area',uninterpretedReferences:'preserve-and-report' as const};
test('US-018-AC7: mapped rename preserves physical meaning and updates top-level partition references',async()=>{
 for(const mode of ['name','id']){const text=await Bun.file('fixtures/delta/mapped-data/'+mode+'/context.json').text(),doc=importDeltaTable(text,{id:mode}),result=renameDeltaMappedField(doc,opts);expect(check(result)).toBe(true);expect(result.partitionUpdates).toEqual([{index:0,from:'region',to:'area'}]);expect(exportDeltaTable(doc)).toBe(text);expect(exportDeltaTable(result.source)).toBe(text);const before=JSON.parse(text),after=JSON.parse(exportDeltaTable(result.document));expect(after.protocol).toEqual(before.protocol);expect(after.metaData.configuration).toEqual(before.metaData.configuration);expect(JSON.parse(after.metaData.schemaString).fields[1].metadata).toEqual(JSON.parse(before.metaData.schemaString).fields[1].metadata);expect(result.complete).toBe(false);}
});
test('US-018-AC7: collisions, expressions, unknown features and non-field pointers block',async()=>{
 const c=await Bun.file('fixtures/delta/mapped-data/name/context.json').json();const doc=()=>importDeltaTable(JSON.stringify(c),{id:'guard'});
 expect(()=>renameDeltaMappedField(doc(),{...opts,name:'ID'})).toThrow('collides');expect(()=>renameDeltaMappedField(doc(),{...opts,fieldPointer:'/fields/1/metadata'})).toThrow('actual mapped StructField');c.metaData.configuration['delta.constraints.positive']='id > 0';expect(()=>renameDeltaMappedField(doc(),opts)).toThrow('references');delete c.metaData.configuration['delta.constraints.positive'];c.protocol={minReaderVersion:3,minWriterVersion:7,readerFeatures:['columnMapping','futureFeature'],writerFeatures:['columnMapping','futureFeature']};expect(()=>renameDeltaMappedField(doc(),opts)).toThrow('explicit rename contract');
});

test('US-018-AC7: expressions elsewhere in the schema and unknown storage providers block',async()=>{
 const c=await Bun.file('fixtures/delta/mapped-data/name/context.json').json();const s=JSON.parse(c.metaData.schemaString);s.fields[2].type.fields[0].metadata['delta.generationExpression']='id + 1';c.metaData.schemaString=JSON.stringify(s);expect(()=>renameDeltaMappedField(importDeltaTable(JSON.stringify(c),{id:'expr'}),opts)).toThrow('dependencies');
 delete s.fields[2].type.fields[0].metadata['delta.generationExpression'];c.metaData.schemaString=JSON.stringify(s);c.metaData.format.provider='future';expect(()=>renameDeltaMappedField(importDeltaTable(JSON.stringify(c),{id:'format'}),opts)).toThrow('Storage provider');
});
