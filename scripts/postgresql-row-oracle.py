import json
from pathlib import Path
from jsonschema import Draft202012Validator
reports=json.loads(Path('fixtures/postgresql/row-projection-results.json').read_text())
assert len(reports)==3
assert {r['relation'] for r in reports}=={'orders','order_lines','row_encodings'}
count=0
mutations=0
for report in reports:
    schema=report['schema'];Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema)
    assert len(report['observations'])==3
    assert {o['database'] for o in report['observations']}=={'source','regenerated','restored'}
    for observation in report['observations']:
        assert len(observation['rows'])==(3 if report['relation']=='row_encodings' else 1)
        if report['relation']=='row_encodings':
            assert {json.loads(text)['id'] for text in observation['rows']}=={1,2,3}
        for text in observation['rows']:
            row=json.loads(text);validator.validate(row);count+=1
            if report['relation']=='orders':
                assert row['id']=='9007199254740993'
                assert row['total']=='9007199254740993.123456789'
                assert row['details']['exact']==9007199254740993
                invalid={**row,'id':9007199254740993}
            elif report['relation']=='order_lines':
                assert row=={'line_no':1,'quantity':2}
                invalid={**row,'quantity':2147483648}
            else:
                expected={
                    1:{'id':1,'active':True,'optional_flag':False,'nullable_json':None,'required_json':None,'label':None,'small_value':-32768},
                    2:{'id':2,'active':False,'optional_flag':None,'nullable_json':None,'required_json':{},'label':'café','small_value':32767},
                    3:{'id':3,'active':True,'optional_flag':True,'nullable_json':{'flag':False},'required_json':False,'label':'','small_value':0}}
                assert row==expected[row['id']]
                assert type(row['active']) is bool
                invalid={**row,'active':None}
                assert not validator.is_valid({**row,'small_value':32768})
                assert not validator.is_valid({**row,'active':'true'})
                mutations+=2
            assert not validator.is_valid(invalid)
            mutations+=1
Path('fixtures/postgresql/row-oracle-results.json').write_text(json.dumps({'validator':'Python jsonschema Draft202012Validator','schemas':len(reports),'nativeRows':count,'mutatedRowsRejected':mutations,'exactIntegerAndDecimalTextVerified':True,'scope':'The selected read-row encoding and sample values; no database constraint equivalence or JSON client numeric precision guarantee.'},indent=2)+'\n')
print(f'PostgreSQL rows: {count} native rows validate; {mutations} invalid representation mutations rejected')
