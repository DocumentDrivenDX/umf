"""Focused real binding guards, HOSTED ONLY after source/binding admission."""
import unittest
from umf._rust import UmfCoreError, _rust_core

class ConstructorObservationNativeTests(unittest.TestCase):
    def factories(self):
        return (_rust_core.create_codegen_resources,_rust_core.create_codegen_resources_attributed)
    def test_terminal_first_denial_identity_no_extra_callback_or_handle(self):
        sequences=[]
        for factory in self.factories():
            seen=[];denial=UmfCoreError('CANCELLED','constructor-observation-first','/private/first')
            def control(amount,*labels):
                seen.append(amount)
                if amount>0:return denial.code,str(denial),denial.path
            control.failure=denial
            sentinel=object();published=sentinel
            with self.assertRaises(UmfCoreError) as error:published=factory({},control)
            self.assertIs(error.exception,denial);self.assertIs(published,sentinel)
            self.assertGreater(seen[-1],0);sequences.append(seen)
        self.assertEqual(*sequences)
    def test_missing_resources_same_result_and_charge_sequence(self):
        sequences=[];messages=[]
        for index,factory in enumerate(self.factories()):
            seen=[]
            def control(amount,*labels):
                self.assertEqual(len(labels),2 if index else 1);seen.append(amount)
            with self.assertRaises(ValueError) as error:factory({},control)
            sequences.append(seen);messages.append(error.exception.args)
        self.assertEqual(*sequences);self.assertEqual(*messages)
    def test_callback_exception_preserves_terminal_failure(self):
        for factory in self.factories():
            seen=[]
            def control(amount,*labels):
                seen.append(amount);raise RuntimeError('fixed-observation-meter-error')
            with self.assertRaises(UmfCoreError) as error:factory({},control)
            self.assertEqual(error.exception.code,'METER_FAILURE')
            self.assertEqual(str(error.exception),'fixed-observation-meter-error');self.assertEqual(len(seen),1)
    def test_malformed_callback_refuses_without_result(self):
        for factory in self.factories():
            seen=[]
            def control(amount,*labels):seen.append(amount);return ('invalid',)
            with self.assertRaises(UmfCoreError) as error:factory({},control)
            self.assertEqual(error.exception.code,'METER_FAILURE');self.assertEqual(len(seen),1)

if __name__=='__main__':unittest.main()
