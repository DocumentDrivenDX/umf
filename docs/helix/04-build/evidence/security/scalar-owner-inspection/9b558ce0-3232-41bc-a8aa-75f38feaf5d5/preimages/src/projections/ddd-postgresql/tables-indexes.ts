import {copyJson} from '../../model/json';
import {type Document} from '../../model/types';
import {exportPostgresqlSql,importPostgresqlSql,type PostgresqlBackend} from '../../adapters/postgresql';
import {projectBindingIndexesToPostgresql} from '../binding-postgresql/indexes';
import {projectDddTablesToPostgresql,type DddPostgresqlTablePolicy,type DddPostgresqlTableProjection} from './tables';

/** Relationship-independent stage of CONTRACT-043: DDD tables followed by physical indexes. */
export async function projectDddTablesAndIndexesToPostgresql(logical:Document,binding:Document,backend:PostgresqlBackend,policy:DddPostgresqlTablePolicy,lossPolicy:'strict'|'report'):Promise<DddPostgresqlTableProjection>{
  const tables=await projectDddTablesToPostgresql(logical,binding,backend,policy,'report');
  const {candidate:_tablesCandidate,targetArchive:_tablesArchive,...base}=tables;
  if(!tables.targetArchive||!tables.candidate)return {...base,status:'blocked'};
  const indexes=await projectBindingIndexesToPostgresql(logical,binding,tables.targetArchive,backend,'report');
  const residuals=[...tables.residuals.filter(row=>!row.path.startsWith('/extensions/umf.binding/indexes/')),...indexes.residuals];
  const candidate=tables.candidate+(indexes.candidate??'');
  let targetArchive:Document|undefined;
  try{
    targetArchive=await importPostgresqlSql(candidate,backend,{id:'ddd-postgresql-tables-indexes-target'});
    await exportPostgresqlSql(targetArchive,backend);
  }catch{
    residuals.push({path:'/extensions/umf.binding/indexes',reason:'Combined DDL did not pass PostgreSQL parser/deparser/codec',choice:copyJson(indexes.target)});
  }
  const status=!targetArchive?'blocked':residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  return {...base,status,residuals,...(status!=='blocked'&&targetArchive?{candidate,targetArchive}:{})};
}
