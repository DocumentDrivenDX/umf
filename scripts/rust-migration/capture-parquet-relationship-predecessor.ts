// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';
import {classifyParquetRelationships} from '../../src/core-ideals/relationship-parquet';

const root=resolve(import.meta.dir,'../..');
const fixturePath='fixtures/parquet/arrow-nested/map-key-counterexample.parquet';
const fixtureSha256='c5e7a3475512bd9eb1b1323b4a367aa76c983b843ebe661686b77fc492583fae';
const implementationPath='src/core-ideals/relationship-parquet.ts';
const implementationSha256='b022bfd73ac55c724583577e6e7e4fd0ff40a2df3c49976617988cb7b5ef5e00';
const resultSchemaPath='spec/core/parquet-relationship-classification.schema.json';
const resultSchemaSha256='c89561ab5f492c1242b7d425bcba063b82c13296931f12566414c535360478ca';
const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

export function captureParquetRelationshipPredecessor():unknown {
 const bytes=readFileSync(resolve(root,fixturePath));
 if(sha256(bytes)!==fixtureSha256)throw new Error(`Parquet fixture SHA-256 mismatch: ${fixturePath}`);
 if(sha256(readFileSync(resolve(root,implementationPath)))!==implementationSha256)throw new Error(`TypeScript predecessor SHA-256 mismatch: ${implementationPath}`);
 if(sha256(readFileSync(resolve(root,resultSchemaPath)))!==resultSchemaSha256)throw new Error(`Result schema SHA-256 mismatch: ${resultSchemaPath}`);
 const source=importParquetSchema(new Uint8Array(bytes),{id:'rust-spike-parquet-relationships'});
 source.vocabularies['umf.parquet.relationships']={version:'1.0.0',future:{opaque:1}};
 source.vocabularies.future={version:'1.0.0'};
 source.extensions={future:{opaque:['9007199254740993',{x:1}]}};
 const request={mode:'report',profile:'file-schema'} as const;
 const report=classifyParquetRelationships(source,request);
 const strict=classifyParquetRelationships(source,{...request,mode:'strict'});
 const unsupported={...structuredClone(source),vocabularies:{...source.vocabularies,'umf.parquet.relationships':{version:'2.0.0',future:{opaque:2}}}};
 const unsupportedVocabularyReport=classifyParquetRelationships(unsupported,request);
 return {
  profile:'direct-typescript-parquet-relationship-predecessor',
  implementation:implementationPath,
  implementationSha256,
  resultSchemaSha256,
  fixture:fixturePath,
  sha256:fixtureSha256,
  cases:{report,strict,unsupportedVocabularyReport},
 };
}

if(import.meta.main)process.stdout.write(JSON.stringify(captureParquetRelationshipPredecessor(),null,2)+'\n');
