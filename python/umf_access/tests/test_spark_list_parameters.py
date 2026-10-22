# SPDX-License-Identifier: MIT OR Apache-2.0
import copy
import json
import unittest
from decimal import Decimal, localcontext

from umf_access.delta_read import _list_descriptor, _parameter_values
from umf_access.targets import TargetMismatch


def artifact():
    parameters = [{'name': name, 'carrier': carrier, 'container': 'list', 'nullable': False,
                   'elementNullable': True, 'maxItems': 1000}
                  for name, carrier in [('strings','string'),('integers','integer'),('decimals','decimal'),('booleans','boolean')]]
    return {'parameters':parameters,'obligations':{'listPredicateParameters':{
        'version':'weft.spark-list-json/0.1','parameters':[{k:p[k] for k in ('name','carrier','nullable','elementNullable','maxItems')} for p in parameters],
        'maximumElementBytes':10000,'maximumEncodedBytes':1000000,'format':'typed-json-array'}}}


class Transport(unittest.TestCase):
    def test_exact_native_json_codec_and_original_values(self):
        original = {'strings':['é','e\u0301','雪','%_\\',None],
                    'integers':[2**80,None,-2**63,10**5000+17],
                    'decimals':[Decimal('-0E-50'),None,Decimal('1.000000000000000000000000000000000001'),Decimal('1E+100')],
                    'booleans':[True,None,False]}
        before = copy.deepcopy(original)
        with localcontext() as context:
            context.prec=2
            actual = _parameter_values(artifact(),original)
        self.assertEqual(original,before)
        for name in ('strings','booleans'):
            self.assertEqual(json.loads(actual[name]),original[name])
        self.assertEqual(json.loads(actual['integers']),['1208925819614629174706176',None,'-9223372036854775808','1'+'0'*4998+'17'])
        self.assertEqual(json.loads(actual['decimals']),['-0.'+'0'*50,None,'1.000000000000000000000000000000000001','1'+'0'*100])

    def test_scalar_and_list_numeric_inventories_are_separate(self):
        source=artifact()
        scalar={'name':'threshold','carrier':'decimal','nullable':False}
        source['parameters'].append(scalar)
        source['obligations']['numericPredicateParameters']={'version':'weft.spark-exact-numeric-text/0.1','parameters':[scalar],
            'maximumTokenBytes':10000,'format':'finite-plain-base-ten'}
        values={name:[] for name in ('strings','integers','decimals','booleans')}
        values['threshold']=Decimal('1E+40')
        actual=_parameter_values(source,values)
        self.assertEqual(actual['threshold'],'1'+'0'*40)
        self.assertTrue(all(actual[name]=='[]' for name in values if name!='threshold'))

    def test_all_original_facets_and_byte_budgets_are_enforced(self):
        base={name:[] for name in ('strings','integers','decimals','booleans')}
        for name,value in [('strings',['é'*5001]),('strings',['x'*10000]*100),('strings',['x']*1001),
                           ('strings',['\x00']),('integers',[True]),('integers',[10**10000]),
                           ('decimals',[Decimal('NaN')]),('decimals',[Decimal('1E+10000')]),
                           ('booleans',[1]),('strings',None)]:
            values=dict(base);values[name]=value
            with self.subTest(name=name,type=type(value).__name__),self.assertRaises(ValueError):
                _parameter_values(artifact(),values)
        values=dict(base);values['strings']=['é'*5000]
        self.assertEqual(json.loads(_parameter_values(artifact(),values)['strings']),values['strings'])

    def test_missing_or_changed_original_descriptor_refuses(self):
        for mode in range(5):
            source=artifact();decoder=source['obligations']['listPredicateParameters']
            if mode==0:source['obligations'].clear()
            elif mode==1:decoder['version']='unknown'
            elif mode==2:decoder['maximumEncodedBytes']=1000001
            elif mode==3:decoder['parameters'].reverse()
            else:decoder['extra']=True
            with self.assertRaises(TargetMismatch):_list_descriptor(source)


if __name__ == '__main__':
    unittest.main()
