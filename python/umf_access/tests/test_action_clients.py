import unittest
from dataclasses import FrozenInstanceError, replace
from datetime import timedelta
from decimal import Decimal

from commerce.actions import (
    Actions,
    ReplayingActions,
    ShipOrder,
    ShipOrderInput,
    ShipOrderOutput,
    ShipOrderRejected,
)
from commerce.keys import OrderKey
from umf_access.protocols import *


class Executor:
    def __init__(self): self.calls=[]; self.answer=None
    def invoke(self, action, input, *, timeout=None):
        self.calls.append((action,input,timeout)); return self.answer
    def invoke_keyed(self, action, input, *, idempotency_key, timeout=None):
        self.key=idempotency_key; return Replayed(self.invoke(action,input,timeout=timeout))
    def validate(self, action,input,*,timeout=None):
        self.calls.append((action,input,timeout)); return ValidationResult(True,(),True)

class ActionsTest(unittest.TestCase):
    def setUp(self):
        self.executor=Executor();self.input=ShipOrderInput(order=OrderKey(order_id='one'))
        self.context=object()
        self.original=OriginalOutcome(ShipOrder,'{ "status":"committed", "unknown":{"future":17}, "noOp":true }','{"original":"request"}',self.context,b'original transport')
        self.committed=Committed(ShipOrderOutput(amount=Decimal('1.200')),Receipt('store','epoch','version'),(),(),self.original)
        self.executor.answer=self.committed;self.endpoint=Actions(self.executor).ship_order
    def test_source_bound(self):
        self.assertEqual(ShipOrder.source.module,'commerce'); self.assertEqual(len(ShipOrder.source.document_sha256),64)
        with self.assertRaises(FrozenInstanceError): ShipOrder.source.action='different'
    def test_invoke_input_and_original(self):
        result=self.endpoint(self.input,timeout=timedelta(seconds=3))
        self.assertEqual(result.output.amount.as_tuple(),Decimal('1.200').as_tuple());self.assertIs(result.original,self.original)
        self.assertNotIn('memo',self.executor.calls[0][1]);self.assertIsInstance(self.executor.calls[0][1]['order'],OrderKey)
        view=self.original.result();view['unknown']['future']=0
        self.assertEqual(self.original.result()['unknown']['future'],17);self.assertIs(result.original.recovery,self.context)
        self.assertEqual(result.original.transport,b'original transport')
    def test_validate_no_invoke(self):
        self.assertTrue(self.endpoint.validate(self.input).valid);self.assertEqual(len(self.executor.calls),1)
    def test_model_construct_refuses_before_dispatch(self):
        with self.assertRaises(ValueError): self.endpoint(ShipOrderInput.model_construct(order='wrong'))
        self.assertFalse(self.executor.calls)
    def test_timeouts_before_dispatch(self):
        for timeout in [timedelta(seconds=-1),timedelta(0),1]:
            with self.assertRaises(ActionRefused): self.endpoint(self.input,timeout=timeout)
        self.assertFalse(self.executor.calls)
    def test_complete_failure_context(self):
        for outcome,kind in [(Rejected('ENTITY_MISSING',True,self.original),ShipOrderRejected),(Denied('PRIVATE_CODE',self.original),ActionDenied),(Conflict(False,'TOKEN_REUSE',self.original),ActionConflict),(TimedOut(self.original),ActionTimedOut),(Indeterminate(self.original),ActionIndeterminate)]:
            self.executor.answer=outcome
            with self.assertRaises(kind) as result:self.endpoint(self.input)
            self.assertIs(result.exception.original,self.original)
        self.executor.answer=Rejected('NOT_READY',True,self.original)
        with self.assertRaises(ShipOrderRejected) as result:self.endpoint(self.input)
        self.assertTrue(result.exception.retryable)
    def test_bad_output_is_indeterminate(self):
        self.executor.answer=replace(self.committed,output=ShipOrderOutput.model_construct(amount='wrong'))
        with self.assertRaises(ActionIndeterminate) as result:self.endpoint(self.input)
        self.assertIs(result.exception.original,self.original)
    def test_same_name_other_source(self):
        foreign=replace(ShipOrder,source=replace(ShipOrder.source,document_sha256='0'*64))
        self.executor.answer=replace(self.committed,original=replace(self.original,action=foreign))
        with self.assertRaises(ActionIndeterminate):self.endpoint(self.input)
    def test_replay_exact_key_no_retry(self):
        self.assertIs(ReplayingActions(self.executor).ship_order(self.input,idempotency_key='original').original,self.original)
        self.assertEqual(self.executor.key,'original');self.assertEqual(len(self.executor.calls),1)
        self.executor.answer=Rejected('NOT_READY',False,self.original)
        with self.assertRaises(ShipOrderRejected):ReplayingActions(self.executor).ship_order(self.input,idempotency_key='original')
    def test_wrong_executor(self):
        with self.assertRaises(TypeError):Actions(object())
        class NonReplaying:
            invoke=Executor.invoke;validate=Executor.validate
        with self.assertRaises(TypeError):ReplayingActions(NonReplaying())

if __name__=='__main__':unittest.main()
