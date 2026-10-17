import {expect,test} from 'bun:test';
import {generateAccessPackage} from '../../src/compilation/index';
import authored from './fixtures/many-navigation.json';
import {profile,request} from './access-fixtures';

function input(){const req=request();req.sources=[{id:'logical',format:'json',text:JSON.stringify(authored)}];req.records=[{module:'sales',element:'order'},{module:'sales',element:'customer'}];req.package='many_keys';return req;}

test('authored to-many retains selected and original Keys as six separate phantoms',()=>{
 const result=generateAccessPackage(input(),profile());expect(result.outcome).toBe('candidate');
 const fields=result.files.find(f=>f.path==='many_keys/fields.py')!.text;
 expect(fields).toContain('customers: ManyNavigation[Order, Customer, OrderKey, CustomerKey, CustomerPkKey, OrderPkKey]');
 expect(fields).toContain('key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="pk"');
 expect(fields).toContain('source_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="chosen"');
 expect(fields).toContain('target_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="chosen"');
 expect(fields).toContain('inverse_key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="pk"');
 expect(fields).toContain('self.customers: Related[AliasOwner[Order, _AliasTag], CustomerPkKey]');
});

test('a dependency-only target retains bounded Related without target-set navigation',()=>{
 const req=input();req.records=[req.records[0]!];const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('candidate');
 const fields=result.files.find(f=>f.path==='many_keys/fields.py')!.text;
 expect(fields).toContain('customers: Related[Order, CustomerKey]');expect(fields).not.toContain('customers: ManyNavigation[');
});

test('new navigation import names refuse authored collisions before emitting Python',()=>{
 for(const name of ['ManyNavigation','InverseManyNavigation'])for(const id of ['order','id']){
  const req=input();const index=authored.modules[0]!.elements.findIndex(e=>e.id===id);req.names=[{sourceId:'logical',pointer:`/modules/0/elements/${index}`,python:name}];
  const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);expect(result.diagnostics.some(d=>d.code==='NAME'&&d.pointer===`/modules/0/elements/${index}`)).toBe(true);
 }
});
