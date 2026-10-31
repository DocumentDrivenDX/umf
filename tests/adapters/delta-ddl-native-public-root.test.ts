import {describe,expect,it} from 'bun:test';
import {UmfError,defineDeltaTable,generateDeltaDDL,generateDeltaDDLBundle,realizeSparkDelta4DDL,type DeltaDefinition} from '../../src/index-node-v4';

const definition:DeltaDefinition={
  profile:'databricks-managed-delta/0.1',
  name:['catalog','schema','items'],
  clusterBy:['id'],
  partitionBy:[],
  properties:{'delta.targetFileSize':'67108864'},
};

describe('Delta managed DDL native default operations',()=>{
  it('defines from exact schema source and generates a qualified CREATE proposal',()=>{
    const source=' { "type":"struct", "fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}] } ';
    const document=defineDeltaTable(source,definition,{id:'table/orders'});
    const proposal=generateDeltaDDL(document);
    expect(JSON.parse(proposal.schemaJson)).toEqual(JSON.parse(source));
    expect(proposal.definition).toEqual(definition);
    expect(proposal.sql).toContain('CREATE TABLE `catalog`.`schema`.`items`');
    expect(proposal.sql).toContain("'delta.targetFileSize'='67108864'");
    expect(proposal.qualification).toContain('no application');
  },60_000);


  it('bundles authored definitions and realizes a local Spark Delta 4 target',()=>{
    const source='{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}';
    const document=defineDeltaTable(source,{...definition,properties:{'delta.parquet.compression.codec':'zstd'}},{id:'table/orders'});
    const second=defineDeltaTable(source,{...definition,name:['catalog','schema','customers']},{id:'table/customers'});
    const bundle=generateDeltaDDLBundle([document,second]);
    expect(bundle.tables.map(table=>table.documentId)).toEqual(['table/orders','table/customers']);
    expect(bundle.sql.match(/CREATE TABLE/g)).toHaveLength(2);
    const realized=realizeSparkDelta4DDL(document,{kind:'relation',relation:['local_catalog','local_schema','orders'],location:'/tmp/orders'});
    expect(realized.sql).toContain("LOCATION '/tmp/orders'");
    expect(realized.writerSettings).toEqual([{key:'spark.sql.parquet.compression.codec',value:'zstd'}]);
    expect(realized.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  },60_000);

  it('refuses an unqualified Spark writer codec with the public UMF error',()=>{
    const source='{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}';
    const document=defineDeltaTable(source,{...definition,properties:{'delta.parquet.compression.codec':'gzip'}},{id:'table/orders'});
    try {
      realizeSparkDelta4DDL(document,{kind:'delta-path',path:'/tmp/orders'});
      throw new Error('expected refusal');
    } catch(error) {
      expect(error).toBeInstanceOf(UmfError);
      expect((error as UmfError).code).toBe('DELTA_DDL_UNSUPPORTED');
    }
  },30_000);

  it('refuses unknown definition meaning with the public UMF error',()=>{
    try {
      defineDeltaTable('{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}',
        {...definition,futureMeaning:'retain'} as DeltaDefinition,{id:'table/orders'});
      throw new Error('expected refusal');
    } catch(error) {
      expect(error).toBeInstanceOf(UmfError);
      expect((error as UmfError).code).toBe('DELTA_DDL_UNSUPPORTED');
    }
  },30_000);
});
