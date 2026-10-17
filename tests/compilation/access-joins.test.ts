import {expect,test} from 'bun:test';
import {generateAccessPackage} from '../../src/compilation/index';
import {profile,request,mutateSource} from './access-fixtures';
export function joinedRequest(){
 const req=request();req.records.push({module:'commerce',element:'Customer'});
 req.projections=[{name:'orderCustomer',record:req.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'name'}]}];
 mutateSource(req,d=>{for(const e of d.modules[0]!.elements)Object.assign(e,{name:e.id});Object.assign(d.modules[0]!,{relationships:[{id:'customer',name:'customer',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Customer',key:'Customer-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}]});});
 return req;
}
test('declared selected to-one target emits original-key navigation and nullable joined projection',()=>{
 const out=generateAccessPackage(joinedRequest(),profile());expect(out.diagnostics).toEqual([]);expect(out.outcome).toBe('candidate');
 const fields=out.files.find(f=>f.path==='shop/fields.py')!.text,models=out.files.find(f=>f.path==='shop/models.py')!.text;
 expect(fields).toContain('OptionalNavigation[Order, Customer, OrderKey, CustomerKey, CustomerKey, OrderKey]');expect(fields).toContain('inverse_key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key"');expect(fields).toContain('optional=True');expect(fields).toContain('OrderCustomerProjection: JoinProjection[Order, OrderCustomer]');
 expect(models).toContain('name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)] | None');expect(models).toContain('element="Customer", field="name"');
});
test('projection outside declared reachability refuses at generation',()=>{
 const req=joinedRequest();mutateSource(req,d=>{Object.assign(d.modules[0]!,{relationships:[]});});
 expect(generateAccessPackage(req,profile()).outcome).toBe('refused');
});
