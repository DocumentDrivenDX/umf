#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independently authored S20 transport expectations; no UMF imports/execution.

The JSON fixture describes source/context and mechanical mutations.  Accepted
packets must round-trip byte-for-byte at the JSON value level (including typed
literal strings); rejected packets must produce no validated batch.  This is a
finite data/source/domain oracle, not a policy or native-authority oracle.
"""
import copy
import json
from pathlib import Path

OUT = Path(__file__).with_name('fixtures.json')
PROFILE = 'umf-gregorian-date/1.0.0'
def ref(i, document='s20-core', module='m'):
    return {'documentId': document, 'moduleId': module, 'elementId': i}
def field(i, kind, nullable='required', **kw):
    return dict(id=i, kind='field', scalarType=kind, cardinality='one', nullability=nullable, extensions={}, **kw)
def custody(kind):
    x = {'owner':'declared-owner', 'formatPreserving':False,
         'storageEffect':'stored-transformed',
         'propagation':{k:'unverified-'+k for k in ['history','snapshots','exports','feeds','caches']}}
    x['vaultRef' if kind == 'vault' else 'keyRef'] = 'opaque-not-executable'
    return x
def transform(i, kind, src, dst, **kw):
    return dict(id=i, version='v1', kind=kind, inputDomain=ref(src), outputDomain=ref(dst),
                determinism='deterministic', reversibility='none', parameters=[], disclosureProfile=[], queryUse={}, **kw)
def selected(i, output, rule):
    return {'disposition':'transformed', 'selection':{'ruleIndex':rule,'disclosureIndex':0},
            'outputDomain':ref(output), 'transform':{'id':i,'version':'v1'}}
fields = [field('amount','integer','absent-allowed'), field('text','string','absent-allowed'),
          field('other-amount','integer','absent-allowed'), field('other-text','string','absent-allowed'),
          field('bool','boolean'), field('decimal','decimal',facets={'precision':30,'scale':3}),
          field('binary','binary'), field('date','date','absent-allowed'),
          field('date-output','date','absent-allowed'), field('token','string','absent-allowed'),
          field('cipher','binary','absent-allowed'), field('parameter-text','string'),
          {'id':'record','kind':'record','extensions':{}}]
transforms = [transform('nullify','mask','amount','text',function='null-out'),
              transform('mask','mask','amount','text',function='constant'),
              transform('tokenize','tokenize','amount','token'),
              transform('encrypt','encrypt','amount','cipher'),
              transform('token-mask','mask','token','text',function='constant'),
              transform('date-truncate','generalize','date','date-output',function='truncate-date')]
transforms[1]['parameters']=[{'name':'value','field':ref('parameter-text'),'value':{'string':'masked'}}]
transforms[2].update(reversibility='vault',custody=custody('vault'),reverseAction='reverse-token',determinism='random')
transforms[3].update(reversibility='keyed',custody=custody('keyed'),reverseAction='reverse-cipher',determinism='keyed-deterministic')
transforms[4]['parameters']=copy.deepcopy(transforms[1]['parameters'])
transforms[5]['parameters']=[{'name':'calendar','field':ref('parameter-text'),'value':{'string':PROFILE}},
                           {'name':'unit','field':ref('parameter-text'),'value':{'string':'month'}}]
catalog={'vocabulary':'umf.security.protection','version':'0.1.0','id':'s20-protection','revision':'c1',
         'transforms':transforms,'native':{'opaque':'never execute: () => { throw "native"; }\r\n😀'}}
rules=[]
for t in transforms:
    rules.append({'id':'rule-'+t['id'],'effect':'permit','actions':['read'],'target':[ref('record')],
                  'condition':{'op':'literal','value':True},'disclosure':[{'field':t['inputDomain'],
                  'disposition':{'kind':'transformed','vocabulary':'umf.security.protection','transform':t['id'],
                                 'version':t['version'],'field':t['outputDomain']}}]})
policy={'vocabulary':'umf.security','version':'0.2.0','id':'s20-policy','revision':'p1',
        'ontology':{'documentId':'uninterpreted-ontology','revision':'o1'},'protection':{'id':'s20-protection','revision':'c1'},
        'rules':rules,'native':{'opaque':'preserved, never authenticated'}}
document={'umf':'0.8.0','id':'s20-core','vocabularies':{},'modules':[{'id':'m','namespace':'','elements':fields}]}
closure={'pins':[{'documentId':'s20-core','revision':'d1'}], 'documents':[{'revision':'d1','document':document}]}
batch={'version':'umf.security.disclosure/0.2.0','policy':{'id':'s20-policy','revision':'p1'},
       'protection':{'id':'s20-protection','revision':'c1'},'domains':copy.deepcopy(closure['pins']),
       'columns':[{'field':ref('amount'),'storageEffect':'canonical'}],
       'rows':[[{'disposition':'original','value':None}], [{'disposition':'absent'}], [{'disposition':'withheld'}],
               [{**selected('nullify','text',0),'value':None}],
               [{**selected('mask','text',1),'value':{'string':'masked'}}]]}
base={'policy':policy,'catalog':catalog,'closure':closure,'batch':batch}
cases=[]
def add(i, accepted, changes=(), expand=None, wire=None, reason=''):
    row={'id':i,'expected':'validated-disclosure' if accepted else 'refused','changes':list(changes)}
    if expand is not None: row['expand']=expand
    if wire is not None: row['wire']=wire
    if reason: row['reason']=reason
    cases.append(row)
def setv(path, value): return {'op':'set','path':path,'value':value}
def remove(path): return {'op':'remove','path':path}
def single(field_id, cell, **column):
    return [setv('/batch/columns',[dict(field=ref(field_id),storageEffect='canonical',**column)]),setv('/batch/rows',[[cell]])]
def orig(value): return {'disposition':'original','value':value}
def stored(i='token', transform_id='tokenize', value=None):
    return [setv('/batch/columns',[{'field':ref(i),'storageEffect':'stored-transformed','storageTransform':{'id':transform_id,'version':'v1'}}]),
            setv('/batch/rows',[[orig({'string':'tk_00_A😀'} if value is None else value)]])]

add('six-state-canonical-roundtrip',True,reason='original null, absent, withheld, transformed null and changed output remain distinct')
add('stored-original-random-token',True,stored(),reason='canonical Field is exact storage output; no token execution or reversal')
add('stored-original-keyed-cipher',True,stored('cipher','encrypt',{'binaryHex':'0001aB'}))
add('stored-original-null',True,stored(value=None)[:-1]+[setv('/batch/rows',[[orig(None)]])])
add('stored-absent',True,stored()[:-1]+[setv('/batch/rows',[[{'disposition':'absent'}]])])
add('stored-withheld',True,stored()[:-1]+[setv('/batch/rows',[[{'disposition':'withheld'}]])])
add('stored-token-presentation-transform',True,stored()[:-1]+[setv('/batch/rows',[[{**selected('token-mask','text',4),'value':{'string':'masked'}}]])])
add('supplied-transform-value-is-not-execution-proof',True,single('amount',{**selected('mask','text',1),'value':{'string':'not the constant result'}}),reason='data-only validation cannot establish hidden-input evaluation')
add('presentation-token-from-canonical-input',True,single('amount',{**selected('tokenize','token',2),'value':{'string':'opaque-token'}}))
for i, f, value in [('large-integer','amount',{'integerToken':'9007199254740993'}),('integer-exponent','amount',{'integerToken':'1e3'}),
                    ('signed-integer-zero','amount',{'integerToken':'-0'}),('decimal-lexeme','decimal',{'decimalToken':'12.340'}),
                    ('decimal-negative-zero','decimal',{'decimalToken':'-0.000'}),('binary-leading-zero','binary',{'binaryHex':'0001aB'}),
                    ('boolean-false','bool',{'boolean':False}),('unicode-no-normalization','text',{'string':'é/é/😀/\ufeff'}),
                    ('escaped-text','text',{'string':'\x00\t\r\n"\\'})]:
    add('original-'+i,True,single(f,orig(value)))
add('zero-rows-valid',True,[setv('/batch/rows',[])])
add('zero-columns-zero-rows',True,[setv('/batch/columns',[]),setv('/batch/rows',[])])
add('duplicate-rows-are-a-bag',True,[setv('/batch/rows',[[orig(None)],[orig(None)]])])
add('columns-order-preserved',True,[setv('/batch/columns',[{'field':ref('bool'),'storageEffect':'canonical'},{'field':ref('amount'),'storageEffect':'canonical'}]),setv('/batch/rows',[[orig({'boolean':False}),orig({'integerToken':'42'})]])])
for s in ['0001-01-01','2000-02-29','9999-12-31']:
    add('date-original-'+s,True,single('date',orig({'date':s}),valueProfile=PROFILE))
add('date-original-null',True,single('date',orig(None),valueProfile=PROFILE))
add('date-transformed-explicit-profile',True,single('date',{**selected('date-truncate','date-output',5),'value':{'date':'2000-02-01'},'valueProfile':PROFILE},valueProfile=PROFILE))

# Exact closed members and source pins. These are independent requirements,
# not a recreation of production schema validation.
for where in ['/batch','/batch/policy','/batch/protection','/batch/domains/0','/batch/columns/0','/batch/columns/0/field',
              '/batch/rows/0/0','/batch/rows/1/0','/batch/rows/2/0','/batch/rows/3/0','/batch/rows/3/0/selection',
              '/batch/rows/3/0/transform','/batch/rows/3/0/outputDomain']:
    add('extra-'+where.replace('/','-'),False,[setv(where+'/unknown',{'preserve':'opaque'})])
for path in ['/batch/version','/batch/policy/id','/batch/policy/revision','/batch/protection/id','/batch/protection/revision',
             '/batch/domains/0/documentId','/batch/domains/0/revision']:
    add('stale-'+path.replace('/','-'),False,[setv(path,'different')])
for path in ['/batch/policy','/batch/protection','/batch/domains','/batch/columns','/batch/rows','/batch/columns/0/storageEffect']:
    add('missing-'+path.replace('/','-'),False,[remove(path)])
for name, change in [('missing-pin',setv('/batch/domains',[])),('duplicate-pin',setv('/batch/domains',closure['pins']*2)),
                     ('extra-pin',setv('/batch/domains',closure['pins']+[{'documentId':'foreign','revision':'d1'}])),
                     ('closure-revision',setv('/closure/documents/0/revision','d2')),('core-version',setv('/closure/documents/0/document/umf','0.7.0')),
                     ('policy-version',setv('/policy/version','0.3.0')),('catalog-version',setv('/catalog/version','unknown')),
                     ('catalog-kind',setv('/catalog/transforms/5/kind','future')),('catalog-member',setv('/catalog/transforms/5/future',True)),
                     ('policy-member',setv('/policy/future',True)),('core-member',setv('/closure/documents/0/document/modules/0/elements/0/future',True))]:
    add(name,False,[change])
for name, change in [('duplicate-column',setv('/batch/columns',batch['columns']*2)),('foreign-field',setv('/batch/columns/0/field',ref('missing'))),
                     ('non-field',setv('/batch/columns/0/field',ref('record'))),('empty-reference',setv('/batch/columns/0/field/moduleId','')),
                     ('short-row',setv('/batch/rows/4',[])),('long-row',setv('/batch/rows/4',batch['rows'][4]*2)),
                     ('row-not-array',setv('/batch/rows/4',{})),('cell-not-object',setv('/batch/rows/4',None)),
                     ('missing-original-value',remove('/batch/rows/0/0/value')),('withheld-value',setv('/batch/rows/2/0/value',{'string':'SECRET'})),
                     ('absent-value',setv('/batch/rows/1/0/value',None)),('unknown-disposition',setv('/batch/rows/0/0/disposition','reversed')),
                     ('positional-cell-field-forbidden',setv('/batch/rows/0/0/field',ref('amount'))),('wrong-original-domain',setv('/batch/rows/0/0/value',{'string':'100'})),
                     ('raw-number',setv('/batch/rows/0/0/value',100)),('raw-bool',setv('/batch/rows/0/0/value',True)),
                     ('literal-extra',setv('/batch/rows/0/0/value',{'integerToken':'1','string':'secret'}))]:
    add(name,False,[change])
add('required-null-refusal',False,[setv('/closure/documents/0/document/modules/0/elements/0/nullability','required')])
add('required-absence-refusal',False,[setv('/closure/documents/0/document/modules/0/elements/0/nullability','required'),setv('/batch/rows',[[{'disposition':'absent'}]])])
for name, path, value in [('wrong-rule','/selection/ruleIndex',4),('wrong-disclosure','/selection/disclosureIndex',1),
                         ('negative-rule','/selection/ruleIndex',-1),('fraction-rule','/selection/ruleIndex',0.5),('boolean-rule','/selection/ruleIndex',True),
                         ('wrong-transform','/transform/id','tokenize'),('wrong-version','/transform/version','v2'),
                         ('same-family-output-substitution','/outputDomain',ref('other-text')),('wrong-value-wrapper','/value',{'integerToken':'1'})]:
    add('transformed-'+name,False,[setv('/batch/rows/4/0'+path,value)])
add('transformed-same-family-input-substitution',False,[setv('/batch/columns/0/field',ref('other-amount'))])
add('transformed-missing-value',False,[remove('/batch/rows/4/0/value')])
add('transformed-policy-output-substitution',False,[setv('/policy/rules/1/disclosure/0/disposition/field',ref('other-text'))])
add('transformed-policy-input-substitution',False,[setv('/policy/rules/1/disclosure/0/field',ref('other-amount'))])
add('canonical-tag-on-known-token',False,stored()+[setv('/batch/columns/0/storageEffect','canonical'),remove('/batch/columns/0/storageTransform')])
for name, change in [('missing-transform',remove('/batch/columns/0/storageTransform')),('wrong-storage-id',setv('/batch/columns/0/storageTransform/id','encrypt')),
                     ('wrong-storage-version',setv('/batch/columns/0/storageTransform/version','v2')),('extra-storage-member',setv('/batch/columns/0/storageTransform/future',True)),
                     ('input-field-is-not-stored-field',setv('/batch/columns/0/field',ref('amount'))),('same-family-stored-substitution',setv('/batch/columns/0/field',ref('other-text'))),
                     ('plaintext-in-token-field',setv('/batch/rows/0/0/value',{'integerToken':'100'})),('unsupported-storage-effect',setv('/batch/columns/0/storageEffect','plaintext'))]:
    add('stored-'+name,False,stored()+[change])
add('canonical-with-storage-transform',False,[setv('/batch/columns/0/storageTransform',{'id':'tokenize','version':'v1'})])
add('zero-row-stored-metadata-refusal',False,stored()+[setv('/batch/rows',[]),setv('/batch/columns/0/storageTransform/id','missing')])
add('zero-row-stored-output-mismatch',False,stored()+[setv('/batch/rows',[]),setv('/batch/columns/0/field',ref('amount'))])
add('zero-row-source-pin-refusal',False,[setv('/batch/rows',[]),setv('/batch/protection/revision','different')])
for state in ['withheld','absent']:
    add(state+'-cannot-hide-unknown-value-profile',False,single('amount',{'disposition':state},valueProfile='unknown'))
for s in ['0000-01-01','10000-01-01','1900-02-29','2000-02-30','2001-13-01','2001-01-00','2001-1-01','2001-01-01\n','２００１-01-01','2001-01-01T00:00:00Z']:
    add('date-invalid-'+s,False,single('date',orig({'date':s}),valueProfile=PROFILE))
add('date-no-profile',False,single('date',orig({'date':'2000-02-29'})))
add('date-unknown-profile',False,single('date',orig(None),valueProfile='other'))
add('nondate-profile',False,single('text',orig({'string':'2000-02-29'}),valueProfile=PROFILE))
add('date-transformed-no-profile',False,single('date',{**selected('date-truncate','date-output',5),'value':{'date':'2000-02-01'}},valueProfile=PROFILE))
add('date-transformed-wrong-profile',False,single('date',{**selected('date-truncate','date-output',5),'value':None,'valueProfile':'other'},valueProfile=PROFILE))
for prop, val in [('allowedValues',[{'date':'2000-02-29'}]),('default',{'date':'2000-02-29'}),('facets',{'calendar':'gregorian'})]:
    add('date-refinement-'+prop,False,single('date',orig({'date':'2000-02-29'}),valueProfile=PROFILE)+[setv('/closure/documents/0/document/modules/0/elements/7/'+prop,val)])
add('late-cell-invalid-whole-batch',False,[setv('/batch/rows/4/0/value',{'integerToken':'1'})],reason='No earlier canonical or withheld row may survive as validated output')
for n in [4096,4097]: add('row-count-'+str(n),n<=4096,expand={'kind':'rows','rows':n})
for n in [256,257]: add('column-count-'+str(n),n<=256,expand={'kind':'columns','columns':n,'rows':0})
for c,r in [(4,4096),(5,3277)]: add('cell-count-'+str(c*r),c*r<=16384,expand={'kind':'columns','columns':c,'rows':r})
for n in [4083,4084]: add('canonical-string-literal-units-'+str(n+13),n<=4083,expand={'kind':'string','length':n})
for n in [90,101]: add('shared-string-budget-'+str(n),n==90,expand={'kind':'repeated-string','rows':n,'length':999})
add('opaque-source-text-budget',False,expand={'kind':'opaque','length':4_000_001})
add('batch-text-budget',False,expand={'kind':'batch-text','length':4_000_001})
for name, text in [('duplicate-top-member','{"version":"umf.security.disclosure/0.2.0","version":"umf.security.disclosure/0.2.0"}'),
                   ('malformed-json','{"rows":['),('wrong-top-type','[]')]:
    add('wire-'+name,False,wire={'format':'json','text':text})
add('wire-yaml-duplicate',False,wire={'format':'yaml','text':'version: umf.security.disclosure/0.2.0\nversion: umf.security.disclosure/0.2.0\n'})
add('policy-false-condition-is-not-executed',True,[setv('/policy/rules/0/condition/value',False),setv('/policy/rules/1/condition/value',False)])
other_doc={'umf':'0.8.0','id':'other-core','vocabularies':{},'modules':[{'id':'m','namespace':'','elements':[field('text','string')]}]}
pins=closure['pins']+[{'documentId':'other-core','revision':'other-r1'}]
add('core-pin-set-order-independent',True,[setv('/closure/pins',pins),setv('/closure/documents',closure['documents']+[{'revision':'other-r1','document':other_doc}]),setv('/batch/domains',list(reversed(pins)))])
for kind, good, bad in [('array',{'array':[{'integerToken':'9007199254740993'},None]},{'array':[{'string':'not integer'}]}),
                      ('map',{'map':{'a':{'integerToken':'1'},'😀':None}},{'map':{'a':{'boolean':True}}})]:
    container={'id':'container','kind':'field','cardinality':kind,'nullability':'required','itemType':{'module':'m','element':'amount'},'extensions':{}}
    changes=[setv('/closure/documents/0/document/modules/0/elements',fields+[container])]
    add('original-supported-'+kind,True,changes+single('container',orig(good)))
    add('original-'+kind+'-nested-wrong-domain',False,changes+single('container',orig(bad)))
for name, literal, allowed, accepted in [('equivalent-numeric',{'integerToken':'1e2'},[{'integerToken':'100'}],True),
                                       ('outside-allowed',{'integerToken':'101'},[{'integerToken':'100'}],False)]:
    add('original-refinement-'+name,accepted,single('amount',orig(literal))+[setv('/closure/documents/0/document/modules/0/elements/0/allowedValues',allowed)])
for name, value in [('unpaired-surrogate',{'string':'\ud800'}),('binary-odd-hex',{'binaryHex':'abc'}),('binary-nonhex',{'binaryHex':'GG'}),('integer-rounding',{'integerToken':'1.5'}),('decimal-rounding',{'decimalToken':'0.0001'})]:
    f='text' if name=='unpaired-surrogate' else 'binary' if name.startswith('binary') else 'amount' if name.startswith('integer') else 'decimal'
    add('literal-'+name,False,single(f,orig(value)))
add('null-core-date-without-calendar-does-not-interpret-date',True,single('date',orig(None)),reason='Original core nullability owns null, no nonnull temporal value semantics are inferred')

packet={'oracleVersion':'s20-independent-fixtures/0.1','scope':'Finite source/domain/disposition transport, never authorization, execution, native storage or custody proof',
        'base':base,'cases':cases,'requiredStates':['canonical-null','absent','withheld','transformed-null','changed-output-domain','stored-original-token'],
        'expectedBaseStates':[{'disposition':'original','value':None},{'disposition':'absent'},{'disposition':'withheld'},
                              {'disposition':'transformed','value':None,'outputDomain':ref('text')},
                              {'disposition':'transformed','value':{'string':'masked'},'outputDomain':ref('text')} ]}
OUT.write_text(json.dumps(packet,ensure_ascii=True,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'cases':len(cases),'positive':sum(c['expected']=='validated-disclosure' for c in cases),'refused':sum(c['expected']=='refused' for c in cases),'path':str(OUT)}))
