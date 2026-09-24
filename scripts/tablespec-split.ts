import {importTableSpecBundle,exportTableSpecBundle,editTableSpecColumn,readDocument,writeDocument} from '../src';
const base='native/tablespec/sources/examples/synthea/umfs/providers';
const files:Record<string,string>={};for await(const path of new Bun.Glob('**/*.yaml').scan(base))files[path]=await Bun.file(base+'/'+path).text();
const rich={'table.yaml':'version: "1.0"\ntable_name: t\n','columns/value.yaml':'column: {name: value, data_type: INTEGER, nullable: false}\nderivation: {strategy: base_column}\nvalidations: []\nfuture: retained\n','expectations.yaml':'expectations: []\n','notes.txt':'retain exactly\n'};
const results=[];
for(const [id,input] of [['providers',files],['sidecars',rich]] as const){
 const d=importTableSpecBundle(input,{id});
 const changes={description:{kind:'string' as const,value:'Edited description'}};
 const edited=editTableSpecColumn(d,0,changes);
 const exports=[];for(const format of ['json','yaml'] as const)exports.push({format,files:exportTableSpecBundle(readDocument(writeDocument(d,format),format)),editedFiles:exportTableSpecBundle(readDocument(writeDocument(edited,format),format))});
 results.push({id,input,changes,exports});
}
await Bun.write('fixtures/tablespec/split.json',JSON.stringify({results},null,2)+'\n');
