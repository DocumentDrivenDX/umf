// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {relationshipParquetCases} from '../../scripts/core-ideals/relationship-parquet-cases';
import {relationshipExtraCases} from '../../scripts/core-ideals/relationship-extras-cases';
import {postgresqlRelationshipCases} from '../../scripts/core-ideals/relationship-postgresql-cases';
import {createRelationshipParquetProjection} from '../../src/core-ideals/relationship-parquet-projection-factory';
import {createRelationshipExtras,classifyRelationshipExtra,importRelationshipExtraArchive} from '../../src/core-ideals/relationship-extras-factory';
import {createRelationshipPostgresql} from '../../src/core-ideals/relationship-postgresql-factory';
import {createAvroRelationshipProjection} from '../../src/core-ideals/relationship-avro-projection-factory';
import {createTableSpecRelationshipProjection} from '../../src/core-ideals/relationship-tablespec-projection-factory';
import {createSqlServerRelationshipProjection} from '../../src/core-ideals/relationship-sqlserver-projection-factory';
import {projectRelationshipToParquet as referenceParquet} from '../../src/core-ideals/relationship-parquet-projection';
import {projectRelationshipToExtra as referenceExtras} from '../../src/core-ideals/relationship-extras';
import {projectRelationshipsToPostgresql as referencePostgresql} from '../../src/core-ideals/relationship-postgresql';
import {lookupCoreRelationship,verifyCoreRelationshipOperation} from '../../src/model/relationships';
import {backend} from '../../native/postgresql/runtime';

function counted(){
 const calls:string[]=[];
 return {calls,operations:{lookupCoreRelationship:(...args:Parameters<typeof lookupCoreRelationship>)=>{calls.push('lookup');return lookupCoreRelationship(...args);},verifyCoreRelationshipOperation:(...args:Parameters<typeof verifyCoreRelationshipOperation>)=>{calls.push('verify');return verifyCoreRelationshipOperation(...args);}}};
}

test('Avro, TableSpec and SQL Server factory functions retain their public function names',()=>{
 const operations=counted().operations;
 const avro=createAvroRelationshipProjection(operations),tablespec=createTableSpecRelationshipProjection(operations),sqlserver=createSqlServerRelationshipProjection(operations);
 expect(avro.projectRelationshipToAvro.name).toBe('projectRelationshipToAvro');
 expect(avro.verifyRelationshipAvroProjection.name).toBe('verifyRelationshipAvroProjection');
 expect(tablespec.projectRelationshipToTableSpec.name).toBe('projectRelationshipToTableSpec');
 expect(tablespec.verifyRelationshipTableSpecProjection.name).toBe('verifyRelationshipTableSpecProjection');
 expect(sqlserver.projectRelationshipToSqlServer.name).toBe('projectRelationshipToSqlServer');
 expect(sqlserver.verifyRelationshipSqlServerProjection.name).toBe('verifyRelationshipSqlServerProjection');
});

test('Parquet inspector factory closes over supplied operations through projection, verification and recovery',()=>{
 const c=relationshipParquetCases().find(x=>x.expected==='projected')!,bound=counted(),api=createRelationshipParquetProjection(bound.operations);
 const expected=api.projectRelationshipToParquet(c.source,c.author,c.request);if(expected.status!=='projected'||!expected.nativeArchive)throw new Error('Expected projected Parquet fixture');expect(expected).toEqual(referenceParquet(c.source,c.author,c.request));
 expect(bound.calls).toEqual(['verify','lookup','lookup']);
 bound.calls.length=0;expect(api.verifyRelationshipParquetProjection(expected,expected.target!)).toEqual(expected);expect(bound.calls).toEqual(['verify','lookup','lookup']);
 bound.calls.length=0;expect(api.recoverRelationshipParquetIdeal(expected,expected.target!)).toEqual(c.source);expect(bound.calls).toEqual(['verify','lookup','lookup']);
 bound.calls.length=0;expect(api.recoverRelationshipParquetNative(expected,expected.target!)).toEqual(expected.nativeArchive);expect(bound.calls).toEqual(['verify','lookup','lookup']);
});

test('Extras projection factory injects callbacks while classification verification remains native-only',()=>{
 const c=relationshipExtraCases().find(x=>x.expected==='projected')!,bound=counted(),api=createRelationshipExtras(bound.operations);
 const projected=api.projectRelationshipToExtra(c.source,c.author,c.request);if(projected.status!=='projected'||!projected.nativeArchive)throw new Error('Expected projected Extras fixture');expect(projected).toEqual(referenceExtras(c.source,c.author,c.request));expect(bound.calls).toEqual(['verify','lookup','lookup']);
 bound.calls.length=0;expect(api.verifyRelationshipExtra(projected,projected.target!)).toEqual(projected);expect(bound.calls).toEqual(['verify','lookup','lookup']);
 bound.calls.length=0;expect(api.recoverRelationshipExtraIdeal(projected,projected.target!)).toEqual(c.source);expect(bound.calls).toEqual(['verify','lookup','lookup']);
 bound.calls.length=0;expect(api.recoverRelationshipExtraNative(projected,projected.target!).archive).toEqual(projected.nativeArchive);expect(bound.calls).toEqual(['verify','lookup','lookup']);
 const source=importRelationshipExtraArchive(projected.nativeArchive!,'classified'),classification=classifyRelationshipExtra(source,{system:c.request.system,mode:'report',archive:projected.nativeArchive!});
 bound.calls.length=0;expect(api.verifyRelationshipExtra(classification,classification.target!)).toEqual(classification);expect(api.recoverRelationshipExtraNative(classification,classification.target!).archive).toEqual(classification.request.archive);expect(bound.calls).toEqual([]);
});

test('PostgreSQL projection factory injects callbacks through projection, verification and recovery',async()=>{
 const c=postgresqlRelationshipCases().find(x=>x.expected==='projected')!,bound=counted(),api=createRelationshipPostgresql(bound.operations);
 const projected=await api.projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend);if(projected.status!=='projected'||!projected.nativeSql)throw new Error('Expected projected PostgreSQL fixture');expect(projected).toEqual(await referencePostgresql(c.source,c.binding,c.authors,c.request,backend));expect(bound.calls.length).toBeGreaterThan(0);
 const initial=bound.calls.slice();bound.calls.length=0;expect(await api.verifyRelationshipPostgresqlProjection(projected,projected.target!,backend)).toEqual(projected);expect(bound.calls).toEqual(initial);
 bound.calls.length=0;expect(await api.recoverRelationshipPostgresqlIdeal(projected,projected.target!,backend)).toEqual(c.source);expect(bound.calls).toEqual(initial);
 bound.calls.length=0;expect(await api.recoverRelationshipPostgresqlNative(projected,projected.target!,backend)).toBe(projected.nativeSql);expect(bound.calls).toEqual(initial);
});
