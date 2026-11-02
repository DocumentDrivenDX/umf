# SPDX-License-Identifier: MIT OR Apache-2.0
"""Original Truss metadata/profile controls; native owner decoding is separate."""
import copy
import unittest

from commerce import OrderLineKey
from umf_access.related_keys import (
    _truss_component_type,
    decode_related_keys,
    key_descriptor,
    validate_decoder,
    validate_decoder_rust,
)
from umf_access.rust_related_keys import truss_component_type_matches
from umf_access.types import CodecError, RelatedKeyParserUnavailable


def metadata():
    key=key_descriptor(OrderLineKey)
    source=OrderLineKey.UMF_SOURCE
    identity={'documentId':source.document_id,'revision':'original-owner-revision'}
    relation={'module':'commerce','id':'original-relation','direction':'inverse'}
    return {'profile':'truss-related-keys/0.1','bound':2,'relationship':relation,'key':key,
        'target':{**identity,'module':key['module'],'element':key['record']},
        'modelPins':[{'documentId':source.document_id,'revision':identity['revision'],
                      'sha256':source.document_sha256,'umfVersion':source.core_version}],
        'representation':{'kind':'relatedKeys','bound':2,
            'relationship':{**identity,'module':relation['module'],'relationship':relation['id']},
            'key':{'id':key['key'],
                'fields':[{**identity,**component['field']} for component in key['components']],
                'types':[{'family':component['carrier'],'facets':{},'nullable':False} for component in key['components']]}}}


class TrussRelatedMetadata(unittest.TestCase):
    def test_real_generated_composite_key_metadata_is_preserved(self):
        value=metadata();before=copy.deepcopy(value)
        self.assertIs(validate_decoder(value,OrderLineKey),value)
        self.assertEqual(value,before)
        value['representation']['key']['types'][1]['facets']={'integerWidth':{'bits':64,'signed':True}}
        self.assertIs(validate_decoder(value,OrderLineKey),value)
        with self.assertRaises(CodecError):
            decode_related_keys('{"items":[],"truncated":false}',value,OrderLineKey)

    def test_foreign_source_key_order_and_type_profiles_refuse(self):
        for mode in range(8):
            value=metadata()
            if mode==0:value['modelPins'][0]['sha256']='0'*64
            elif mode==1:value['representation']['key']['id']='same-scalars-foreign-key'
            elif mode==2:value['representation']['key']['fields'].reverse()
            elif mode==3:value['representation']['key']['types'][1]['family']='decimal'
            elif mode==4:value['representation']['key']['types'][1]['nullable']=0
            elif mode==5:value['representation']['key']['types'][1]['facets']={'integerWidth':{'bits':64.0,'signed':True}}
            elif mode==6:value['representation']['key']['types'][1]['facets']={'integerWidth':{'bits':64,'signed':1}}
            else:value['profile']='ashlar-related-keys-string/0.1'
            with self.subTest(mode=mode),self.assertRaises(CodecError):validate_decoder(value,OrderLineKey)

    def test_exact_original_non_temporal_facet_subset(self):
        def declared(carrier,facets):return {'family':carrier,'facets':facets,'nullable':False}
        for carrier,facets in [('string',{}),('boolean',{}),('integer',{}),
                ('integer',{'integerWidth':{'bits':64,'signed':True}}),
                ('decimal',{'precision':18,'scale':4}),('decimal',{'precision':18,'scale':2}),
                ('decimal',{'precision':12,'scale':2})]:
            with self.subTest(carrier=carrier,facets=facets):self.assertTrue(_truss_component_type(declared(carrier,facets),carrier))
        for carrier,facets in [('string',{'maxLength':12}),('integer',{'integerWidth':{'bits':32,'signed':True}}),
                ('integer',{'integerWidth':{'bits':64,'signed':False}}),('decimal',{}),
                ('decimal',{'precision':38,'scale':9}),('decimal',{'precision':18.0,'scale':4}),
                ('decimal',{'precision':18,'scale':True}),('date',{}),('timestamp',{}),('binary',{})]:
            with self.subTest(carrier=carrier,facets=facets):self.assertFalse(_truss_component_type(declared(carrier,facets),carrier))

    def test_opt_in_rust_profile_matches_python_and_decoder_identity(self):
        accepted=[('string',{}),('boolean',{}),('integer',{}),
            ('integer',{'integerWidth':{'bits':64,'signed':True}}),
            ('decimal',{'precision':18,'scale':4}),('decimal',{'precision':18,'scale':2}),
            ('decimal',{'precision':12,'scale':2})]
        refused=[('string',{'maxLength':12}),('integer',{'integerWidth':{'bits':32,'signed':True}}),
            ('integer',{'integerWidth':{'bits':64,'signed':False}}),('decimal',{}),
            ('decimal',{'precision':38,'scale':9}),('decimal',{'precision':18.0,'scale':4}),
            ('decimal',{'precision':18,'scale':True}),('date',{}),('timestamp',{}),('binary',{})]
        for carrier,facets in accepted+refused:
            value={'family':carrier,'facets':facets,'nullable':False}
            with self.subTest(carrier=carrier,facets=facets):
                self.assertEqual(truss_component_type_matches(value,carrier),_truss_component_type(value,carrier))
        value=metadata();before=copy.deepcopy(value)
        self.assertIs(validate_decoder_rust(value,OrderLineKey),value)
        self.assertEqual(value,before)
        value['representation']['key']['types'][1]['facets']={'integerWidth':{'bits':64.0,'signed':True}}
        with self.assertRaises(CodecError):validate_decoder_rust(value,OrderLineKey)

    def test_rust_opt_in_refuses_values_outside_exact_json_subset(self):
        class DictSubclass(dict):pass
        cases=[(DictSubclass({'family':'string','facets':{},'nullable':False}),'string'),
               ({'family':'string','facets':{},'nullable':False},object())]
        cycle={};cycle['self']=cycle
        cases.append((cycle,'string'))
        for value,carrier in cases:
            with self.subTest(value_type=type(value),carrier_type=type(carrier)),self.assertRaises(RelatedKeyParserUnavailable):
                truss_component_type_matches(value,carrier)
