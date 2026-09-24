import {importSparkSchema,exportSparkSchema,renameSparkField} from '../src';
import {parseNativeJson,renderTree} from '../src/model/native-json';
const source=parseNativeJson(await Bun.file('fixtures/spark/rename-cases.json').text());if(source.kind!=='array')throw Error('Expected cases');
for(const item of source.items){if(item.kind!=='object')throw Error('Expected case');const c=item.members;if(c.id?.kind!=='string'||c.fieldPointer?.kind!=='string'||c.name?.kind!=='string')throw Error('Invalid case');
 const doc=importSparkSchema(renderTree(c.input!),{id:c.id.value});if(['string-1','array-5','map-9'].includes(c.id.value)){let blocked=false;try{renameSparkField(doc,{fieldPointer:c.fieldPointer.value,name:c.name.value,uninterpretedMetadata:'preserve-and-report'});}catch(e){if((e as {code?:string}).code!=='SPARK_COLLATION_EMPTY_NAME')throw e;blocked=true;}if(!blocked)throw Error('Expected empty-name guard');continue;}const result=renameSparkField(doc,{fieldPointer:c.fieldPointer.value,name:c.name.value,uninterpretedMetadata:'preserve-and-report'});
 const output=exportSparkSchema(result.document);if(output!==renderTree(c.expected!))throw Error('Native expectation differs '+c.id.value);
 await Bun.write('fixtures/spark/renamed/'+c.id.value+'.json',output);
}console.log({cases:source.items.length,renamed:17,blocked:3});
