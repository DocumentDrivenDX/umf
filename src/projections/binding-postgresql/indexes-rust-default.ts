// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../model/types';
import type {PostgresqlBackend} from '../../adapters/postgresql';
import type {PostgresqlIndexProjection} from './indexes-types';
type Engine={['binding-index-projection']:Record<'prepareBindingIndexesToPostgresql'|'completeBindingIndexesToPostgresql',(fields?:Record<string,unknown>)=>unknown>};
type PostgresqlRust={importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<Document>;exportPostgresqlSql(document:Document,backend:PostgresqlBackend):Promise<string>};
const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function control(error:unknown){return !!error&&typeof error==='object'&&'code'in error&&typeof (error as {code?:unknown}).code==='string'&&CONTROL.has((error as {code:string}).code);}
export function createBindingPostgresqlIndexesRustDefault(engine:Engine,postgresql:PostgresqlRust){
 return Object.freeze({async projectBindingIndexesToPostgresql(logical:Document,binding:Document,nativeArchive:Document,backend:PostgresqlBackend,lossPolicy:'strict'|'report'){
  const prepared=engine['binding-index-projection'].prepareBindingIndexesToPostgresql({logical,binding,nativeArchive}) as {candidates:{statement:string}[]};
  const parserArchives:(Document|null)[]=[];
  for(const [index,candidate] of prepared.candidates.entries()){
   try{
    const doc=await postgresql.importPostgresqlSql(candidate.statement,backend,{id:`binding-index-${index}`});
    await postgresql.exportPostgresqlSql(doc,backend);parserArchives.push(doc);
   }catch(error){if(control(error))throw error;parserArchives.push(null);}
  }
  return engine['binding-index-projection'].completeBindingIndexesToPostgresql({prepared,parserArchives,lossPolicy}) as PostgresqlIndexProjection;
 }});
}
