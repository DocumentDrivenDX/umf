import {describe,expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generatePythonClient} from '../src/access';

const root=resolve(import.meta.dir,'..');

describe('latest UMF unified Python access',()=>{
 test('generates an isolated stdlib client usable by the independent ontology host',async()=>{
  const source=await Bun.file(join(root,'tests/unified/commerce.json')).text();
  const generated=generatePythonClient({text:source,package:'shop'});
  expect(JSON.parse(source).modules[0].extensions).not.toHaveProperty('umf.access');
  expect(generatePythonClient({text:source,package:'shop'}).files.map(file=>[file.path,file.sha256])).toEqual(generated.files.map(file=>[file.path,file.sha256]));
  expect(generated.description.umf).toBe('0.10.0');
  expect(generated.sourceDigest).toBe(createHash('sha256').update(source).digest('hex'));
  expect(generated.files.map(file=>file.path)).toEqual([
   'shop/__init__.py','shop/models.py','shop/_runtime.py','shop/source.json','shop/description.json','shop/py.typed','shop/_umf/manifest.json',
  ]);
  expect(generated.files.find(file=>file.path==='shop/models.py')?.text).toContain('class OrderKey:');
  expect(generated.files.find(file=>file.path==='shop/models.py')?.text).toContain('async def ship_order(');
  expect(generated.files.find(file=>file.path==='shop/models.py')?.text).not.toMatch(/type:\s*ignore|pyright:\s*ignore|#\s*noqa/);

  const work=await mkdtemp(join(tmpdir(),'umf-unified-'));
  for(const file of generated.files){
   const path=join(work,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);
  }
  const run=`import asyncio, json, sys
sys.path.insert(0, ${JSON.stringify(work)})
sys.path.insert(0, ${JSON.stringify(join(root,'tests/unified'))})
from shop import Client, Order, OrderKey, Customer, CustomerKey, Actions, AccessError, MISSING
from application import application, assert_shared_edge_cases
from ontology_transport import OntologyTransport
from decimal import Decimal
from uuid import UUID

def refuses(label, call):
    try: call()
    except (TypeError, ValueError): return label
    raise AssertionError(label + ' accepted')

async def main():
    host = OntologyTransport()
    client = Client(host)
    semantic_values = await Customer.objects.using(client).by_key(CustomerKey(customer_id='c-1')).first()
    assert semantic_values is not None
    assert semantic_values.customer_uuid == UUID('6f9619ff-8b86-d011-b42d-00cf4fc964ff')
    assert semantic_values.external_id == bytes.fromhex('00112233445566778899aabbccddeeff')
    result = await application(client)
    assert result == ('Ada', 'shipped', 'ontology-revision-2'), result
    assert [call['kind'] for call in host.calls] == ['read', 'read', 'apply', 'read']
    assert host.calls[1]['query']['relationship']['direction'] == 'forward'
    assert host.nodes['Order']['o-100']['status'] == 'shipped'
    edge_cases = await assert_shared_edge_cases(client, host)

    assert refuses('wrong-key-owner', lambda: Order.objects.using(client).by_key(CustomerKey(customer_id='c-1'))) == 'wrong-key-owner'
    assert refuses('missing-key-component', lambda: OrderKey(order_id=MISSING)) == 'missing-key-component'
    assert refuses('null-required-filter', lambda: Order.c.amount.eq(None)) == 'null-required-filter'
    assert refuses('wrong-filter-type', lambda: Order.c.amount.eq('24.50')) == 'wrong-filter-type'
    assert refuses('wrong-bits128-width', lambda: Customer.c.external_id.eq(bytes(15))) == 'wrong-bits128-width'
    uuid = UUID('6f9619ff-8b86-d011-b42d-00cf4fc964ff')
    uuid_predicate = Customer.c.customer_uuid.eq(uuid)
    assert uuid_predicate.expression['value'] == {'uuid': str(uuid)}
    injected = "' OR 1=1 --"
    injection_predicate = Order.c.status.eq(injected)
    assert injection_predicate.expression['value'] == injected

    cursor_host = OntologyTransport()
    cursor_client = Client(cursor_host)
    first_page = await Order.objects.using(cursor_client).page(size=1)
    assert first_page.next_cursor is not None
    try:
        await Order.objects.using(cursor_client).by_key(OrderKey(order_id='o-100')).page(size=1, after=first_page.next_cursor)
    except AccessError as error:
        assert error.code == 'INVALID_CURSOR'
    else:
        raise AssertionError('foreign-scope cursor accepted')

    class WrongSchemaHost:
        async def execute(self, request): return {'schema': 'foreign-schema', 'rows': []}
    try:
        await Order.objects.using(Client(WrongSchemaHost())).first()
    except AccessError as error:
        assert error.code == 'SCHEMA_MISMATCH'
    else:
        raise AssertionError('schema-mismatched response accepted')

    print(json.dumps({'result': result, 'calls': len(host.calls), 'edgeCases': edge_cases}))

asyncio.run(main())
`;
  const proc=Bun.spawn([process.env.UMF_UNIFIED_PYTHON??'python3.11','-S','-c',run],{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdout:'pipe',stderr:'pipe'});
  const [exit,stdout,stderr]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
  if(exit!==0)throw new Error(stderr);
  const output=JSON.parse(stdout);
  expect(output.result).toEqual(['Ada','shipped','ontology-revision-2']);
  expect(output.edgeCases).toEqual({getMany:['o-200','o-100','o-200',null],inverseOrderIds:['o-200','o-100'],pageOrderIds:['o-200','o-100'],injectionMatches:0,actionOutcomes:['malformed-key','denied','lost-response','malformed-receipt'],malformedResponses:['decimal-float','invalid-uuid-tag','empty-cursor']});
 });

 test.skipIf(!process.env.UMF_UNIFIED_POSTGRES_DSN||!process.env.UMF_UNIFIED_WEFT_DIR||!process.env.UMF_UNIFIED_PSYCOPG_DIR)('runs the same application through compiled Weft SQL on PostgreSQL 18 when configured',async()=>{
  const dsn=process.env.UMF_UNIFIED_POSTGRES_DSN!;
  const weft=process.env.UMF_UNIFIED_WEFT_DIR!;
  const psycopg=process.env.UMF_UNIFIED_PSYCOPG_DIR!;
  const source=await Bun.file(join(root,'tests/unified/commerce.json')).text();
  const generated=generatePythonClient({text:source,package:'shop'});
  const work=await mkdtemp(join(tmpdir(),'umf-unified-postgres-'));
  for(const file of generated.files){
   const path=join(work,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);
  }
  const proc=Bun.spawn([
   process.env.UMF_UNIFIED_HOST_PYTHON??'python3.14',
   join(root,'tests/unified/table_binding_e2e.py'),
   '--generated',work,'--dsn',dsn,'--weft',weft,'--psycopg',psycopg,
  ],{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdout:'pipe',stderr:'pipe'});
  const [exit,stdout,stderr]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
  if(exit!==0)throw new Error(stderr);
  const result=JSON.parse(stdout);
  expect(result.status).toBe('pass');
  expect(result.weft).toBe('0.4.44');
  expect(result.hostRuntime).toBe('0.1.0.dev2');
  expect(result.postgresql).toBe('18');
  expect(result.compiledReads).toBe(8);
  expect(result.result).toEqual(['Ada','shipped','postgresql18-unified-commit-1']);
  expect(result.relatedSql).toContain('__umf_related_source');
  expect(result.injectionParameterBound).toBe(true);
  expect(result.edgeCases).toEqual({getMany:['o-200','o-100','o-200',null],inverseOrderIds:['o-200','o-100'],pageOrderIds:['o-200','o-100'],injectionMatches:0,actionOutcomes:['malformed-key','denied','lost-response','malformed-receipt'],malformedResponses:['decimal-float','invalid-uuid-tag','empty-cursor']});
 });
});
