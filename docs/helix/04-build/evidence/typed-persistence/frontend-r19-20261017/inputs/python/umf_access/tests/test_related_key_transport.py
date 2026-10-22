"""Exact generated-Key identity at original PG related output boundary."""
import copy
import json
import unittest

from commerce import CustomerKey, Order, OrderKey, OrderLineKey
from umf_access.codec_support import validate_graph
from umf_access.dsl import RelatedKeys
from umf_access.related_keys import (
    decode_related_keys,
    key_descriptor,
    make_related_result_model,
    validate_decoder,
)
from umf_access.types import CodecError


class RelatedKeyTransportTests(unittest.TestCase):
    def metadata(self, key=OrderKey, bound=2):
        return {'profile':'pg-related-keys-json/0.1','bound':bound,'relationship':{'module':'commerce','id':'parent','direction':'forward'},'key':key_descriptor(key)}

    def test_actual_generated_keys_and_bounded_complete_order(self):
        result=decode_related_keys('{"items":[["a"],["b"]],"truncated":true}',self.metadata(),OrderKey)
        self.assertEqual(result,RelatedKeys((OrderKey(order_id='a'),OrderKey(order_id='b')),True))
        self.assertEqual(decode_related_keys('{"items":[],"truncated":false}',self.metadata(),OrderKey),RelatedKeys((),False))
        for text in ('{"items":[["b"],["a"]],"truncated":false}','{"items":[["a"],["a"]],"truncated":false}','{"items":[["a"]],"truncated":true}','{"items":[["a"],["b"],["c"]],"truncated":false}'):
            with self.subTest(text=text),self.assertRaises(CodecError):
                decode_related_keys(text,self.metadata(),OrderKey)

    def test_closed_exact_metadata_cannot_substitute_same_scalar_key(self):
        wrong=self.metadata(CustomerKey)
        with self.assertRaises(CodecError):validate_decoder(wrong,OrderKey)
        for patch in ({'profile':'host-guessed/0.1'},{'bound':True},{'extra':True}):
            metadata=self.metadata();metadata.update(patch)
            with self.subTest(patch=patch),self.assertRaises(CodecError):validate_decoder(metadata,OrderKey)
        wrong_boolean=self.metadata();wrong_boolean['key']['components'][0]['nullable']=0
        with self.assertRaises(CodecError):validate_decoder(wrong_boolean,OrderKey)
        for direction in ('sideways',None):
            metadata=self.metadata();metadata['relationship']['direction']=direction
            with self.assertRaises(CodecError):validate_decoder(metadata,OrderKey)

    def test_numeric_token_and_component_inventory_are_not_coerced(self):
        metadata=self.metadata(OrderLineKey)
        for token in (1,True,None,'01','+1','1.0','1e0'):
            text=json.dumps({'items':[['a',token]],'truncated':False})
            with self.subTest(token=token),self.assertRaises(CodecError):decode_related_keys(text,metadata,OrderLineKey)
        result=decode_related_keys('{"items":[["a","1"]],"truncated":false}',metadata,OrderLineKey)
        self.assertEqual(result.items,(OrderLineKey(line_order_id='a',line_number=1),))
        for text in ('{"items":[["a"]],"truncated":false}','{"items":[],"items":[],"truncated":false}','{"items":[],"truncated":false,"extra":1}'):
            with self.subTest(text=text),self.assertRaises(CodecError):decode_related_keys(text,metadata,OrderLineKey)

    def test_transport_copies_real_generated_validator_and_key_identity(self):
        model=make_related_result_model('Transport',OrderKey,OrderKey,'parent_keys',self.metadata(),Order)
        valid=RelatedKeys((OrderKey(order_id='a'),),False)
        row=validate_graph(model,{'order_id':'x','parent_keys':valid})
        self.assertEqual(row.order_id,'x')
        self.assertIs(type(row.parent_keys.items[0]),OrderKey)
        for value in (1,None):
            with self.assertRaises(CodecError):validate_graph(model,{'order_id':value,'parent_keys':valid})
        with self.assertRaises(CodecError):validate_graph(model,{'order_id':'x','parent_keys':RelatedKeys((CustomerKey(customer_id='a'),),False)})
        forged=OrderKey(order_id='a')
        object.__setattr__(forged,'order_id',1)
        with self.assertRaises(CodecError):validate_graph(model,{'order_id':'x','parent_keys':RelatedKeys((forged,),False)})
        before=copy.deepcopy(OrderKey.model_fields['order_id'])
        self.assertEqual(repr(before),repr(model.model_fields['order_id']))
