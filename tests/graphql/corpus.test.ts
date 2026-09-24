import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {parse,buildASTSchema,validateSchema,print} from 'graphql';
import {importGraphqlSchema,exportGraphqlSchema,inspectGraphql,getGraphqlAst,readDocument,writeDocument} from '../../src';
import manifest from '../../fixtures/graphql/upstream/manifest.json';
import corpus from '../../fixtures/graphql/parser-cases.json';

test('US-009-AC7: pinned upstream full schema survives JSON/YAML and all declarations',async()=>{
 for(const entry of manifest.files){const bytes=await Bun.file('fixtures/graphql/upstream/'+entry.path).arrayBuffer();expect(createHash('sha256').update(new Uint8Array(bytes)).digest('hex')).toBe(entry.sha256);}
 const source=await Bun.file('fixtures/graphql/upstream/benchmark/github-schema.graphql').text();
 const doc=importGraphqlSchema(source,{id:'github'});
 expect(inspectGraphql(doc).valid).toBe(true);
 for(const format of ['json','yaml'] as const){
  const back=readDocument(writeDocument(doc,format),format);
  expect(exportGraphqlSchema(back)).toBe(source);
  expect(print(getGraphqlAst(back))).toBe(print(parse(source)));
 }
 await Bun.write('fixtures/graphql/github-round-trip.graphql',exportGraphqlSchema(doc));
 const report={commit:manifest.commit,definitions:getGraphqlAst(doc).definitions.length,diagnostics:inspectGraphql(doc).diagnostics,sourceBytes:Buffer.byteLength(source),exactSource:true};
 await Bun.write('fixtures/graphql/schema-corpus-results.json',JSON.stringify(report,null,2)+'\n');
},20000);
// The 48-case corpus performs full and fragment round trips; use the full-schema corpus budget.
test('US-009-AC8: upstream grammar positives, negatives and incomplete schemas stay distinguished',async()=>{
 const rows=[];
 for(const input of corpus.cases){
  let syntaxValid=false;let schemaValid=false;let nativeError:string|undefined;
  try{const parsed=parse(input.text);syntaxValid=true;const schema=buildASTSchema(parsed);const errors=validateSchema(schema);schemaValid=errors.length===0;if(errors.length)nativeError=errors.map(e=>e.message).join('\n');}catch(e){nativeError=String(e);}
  expect(syntaxValid,'line '+input.line).toBe(input.syntaxValid);
  let doc;let umfError:string|undefined;
  try{doc=importGraphqlSchema(input.text,{id:'line-'+input.line});}catch(e){umfError=String(e);}
  expect(!!doc,'line '+input.line).toBe(schemaValid);
  if(doc)expect(exportGraphqlSchema(doc)).toBe(input.text);
  if(syntaxValid){const fragment=importGraphqlSchema(input.text,{id:'fragment-'+input.line,mode:'fragment'});expect(inspectGraphql(fragment).complete).toBe(false);expect(exportGraphqlSchema(fragment)).toBe(input.text);expect(exportGraphqlSchema(readDocument(writeDocument(fragment,'yaml'),'yaml'))).toBe(input.text);}
  rows.push({line:input.line,syntaxValid,schemaValid,imported:!!doc,fragmentRetained:syntaxValid,nativeError,umfError});
 }
 for(const path of ['fixtures/graphql/upstream/benchmark/kitchen-sink.graphql','fixtures/graphql/kitchen-sink-sdl.graphql']){const text=await Bun.file(path).text();expect(()=>importGraphqlSchema(text,{id:'non-standalone'})).toThrow();}
 expect(rows.length).toBe(48);
 await Bun.write('fixtures/graphql/parser-corpus-results.json',JSON.stringify({commit:manifest.commit,cases:rows,skippedLines:corpus.skippedLines},null,2)+'\n');
},20000);
