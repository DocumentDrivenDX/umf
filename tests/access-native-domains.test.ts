// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generatePythonClient} from '../src/access';
import {domainSource} from './unified/table-domain-fixture';
import {legalDomainAuthoringSource} from './unified/legal-domain-authoring-fixture';
test('generated domain constructors validate exact enums, ranges, widths and Unicode lengths',async()=>{
 const source=domainSource();source.modules[0].elements.find((e:any)=>e.id==='amount').allowedValues[0]={decimalToken:'0e999999999999'};
 const generated=generatePythonClient({text:JSON.stringify(source),package:'domain_demo'}),work=await mkdtemp(join(tmpdir(),'umf-domains-'));
 for(const file of generated.files){const path=join(work,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);}
 const script=`import sys
sys.path.insert(0, ${JSON.stringify(work)})
from datetime import date
from decimal import Decimal
from domain_demo import DemoCreateInput, ExactTimestamp, AccessError
from domain_demo._runtime import check
values=dict(id='row',owner='alice',day=date(2000,2,29),at=ExactTimestamp('2026-01-01T00:00:00Z'),amount=Decimal('0'),status='draft',rank=2,tag='é😀',active=True)
assert DemoCreateInput(**values).amount==0
for field,value in [('status','other'),('rank',10),('rank',True),('tag','four'),('tag',''),('tag',chr(0xd800)),('amount',Decimal('100')),('amount',Decimal('sNaN')),('active',False)]:
    try:DemoCreateInput(**{**values,field:value})
    except AccessError:pass
    else:raise AssertionError(field)
check(9223372036854775807,dict(id='wide',scalar='integer',cardinality='one',nullable=False,facets={},allowedLiterals=[{'integerToken':'9223372036854775807'}]))
try:check(9223372036854775806,dict(id='wide',scalar='integer',cardinality='one',nullable=False,facets={},allowedLiterals=[{'integerToken':'9223372036854775807'}]))
except AccessError:pass
else:raise AssertionError('wide enumeration rounded')
print('exact domain constructors passed')
`;
 const child=Bun.spawn(['python3','-I','-c',script],{stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect({out,err,code}).toEqual({out:'exact domain constructors passed\n',err:'',code:0});
});

test('generated legal-row model agrees on nullable enum and exact decimal range domains',async()=>{
 const source=legalDomainAuthoringSource();
 const generated=generatePythonClient({text:JSON.stringify(source),package:'legal_domain_demo'}),work=await mkdtemp(join(tmpdir(),'umf-legal-domains-'));
 for(const file of generated.files){const path=join(work,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);}
 const script=`import sys
sys.path.insert(0, ${JSON.stringify(work)})
from decimal import Decimal
from legal_domain_demo.models import LegalLifecycleReadMattersRow
from legal_domain_demo import AccessError
base=dict(matters_matter_id=1,matters_client_id=1,matters_matter_number='D-1',matters_matter_title='Synthetic',matters_practice_area='test',matters_open_date=__import__('datetime').date(2026,1,1),matters_close_date=None,matters_jurisdiction='test',matters_court='test')
assert LegalLifecycleReadMattersRow(**base,review_state=None,risk_score=None).risk_score is None
assert LegalLifecycleReadMattersRow(**base,review_state='ready',risk_score=Decimal('99.99')).review_state=='ready'
for values in [dict(review_state='unknown',risk_score=None),dict(review_state=None,risk_score=Decimal('-0.01')),dict(review_state=None,risk_score=Decimal('100.00'))]:
    try:LegalLifecycleReadMattersRow(**base,**values)
    except AccessError:pass
    else:raise AssertionError(values)
print('legal enum/range model passed')
`;
 const child=Bun.spawn(['python3','-I','-c',script],{stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect({out,err,code}).toEqual({out:'legal enum/range model passed\n',err:'',code:0});
});
