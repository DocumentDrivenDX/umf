import {importParquetSchema,getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';
import {exportParquetCapture} from '../../src/adapters/parquet';
import {readDocument,writeDocument} from '../../src/model/document';
import {createHash} from 'node:crypto';
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/nullability-parquet-native.py'],{stdout:'inherit',stderr:'inherit'});if(await child.exited!==0)throw Error('Native discovery failed');
const native=await Bun.file('fixtures/validation/nullability-parquet-native.json').json();let files=0,columns=0,recoveries=0;
const rows=[];
for(const row of native.cases){
 if(row.outcome!=='accepted')continue;
 const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer()),source=importParquetSchema(bytes,{id:row.id});
 const fields=getParquetFieldMetadata(source);if(fields.status!=='checked')throw Error('Unchecked schema');
 const leaves=fields.fields.filter(f=>Object.hasOwn(f.nativeField as object,'type'));
 if(leaves.length!==row.columns.length)throw Error('Native column count changed');
 for(let i=0;i<leaves.length;i++){const f=leaves[i]!,n=row.columns[i];if(f.path.join('.')!==n.path||f.definitionLevel!==n.definitionLevel||f.repetitionLevel!==n.repetitionLevel)throw Error('Native levels differ');columns++;}
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(source,format),format),back=exportParquetCapture(restored);if(createHash('sha256').update(back).digest('hex')!==row.sha256)throw Error('Bytes differ');const path=`.cache/parquet-nullability-recovered/${row.id}-${format}.parquet`;await Bun.write(path,back);rows.push({id:row.id,format,path});recoveries++;}
 files++;
}
const paths=['scripts/core-ideals/nullability-parquet-oracle.ts','fixtures/validation/nullability-parquet-native.json','src/adapters/parquet/field-metadata.ts','src/adapters/parquet/index.ts','src/adapters/parquet/footer.ts','src/adapters/parquet/schema.ts','src/model/document.ts'];
const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/nullability-parquet-recovered.json',JSON.stringify({rows,files,columns,recoveries,fingerprints},null,2)+'\n');
const check=Bun.spawn(['.venv/bin/python','scripts/core-ideals/nullability-parquet-recovery-native.py'],{stdout:'inherit',stderr:'inherit'});if(await check.exited!==0)throw Error('Native recovery failed');
console.log(JSON.stringify({files,columns,recoveries}));
