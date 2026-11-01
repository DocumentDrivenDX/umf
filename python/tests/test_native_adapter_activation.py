import json
import unittest
from pathlib import Path
from umf import execute_adapter
ROOT=Path(__file__).resolve().parents[2]
class NewPublicRoutes(unittest.TestCase):
 def test_jsonl_sidecar_recovery_and_missing_supply(self):
  sample=json.loads((ROOT/'fixtures/delta/sidecars/results.json').read_text())['results'][0]
  kwargs={'checkpoint':sample['checkpoint'],'commits':sample['sources']}
  good=execute_adapter('delta-log','reconcileCheckpointSidecars',**kwargs,sidecars=sample['sidecars'])
  self.assertEqual(good['status'],'reconciled')
  self.assertEqual(good['state']['version'],sample['checkpoint']['version'])
  bad=execute_adapter('delta-log','reconcileCheckpointSidecars',**kwargs,sidecars=[])
  self.assertEqual(bad['status'],'blocked')
  self.assertNotIn('state',bad)
 def test_avro_json_schema_projection_and_strict_loss(self):
  doc=execute_adapter('avro','import',source=json.dumps({'type':'record','name':'Thing','fields':[{'name':'id','type':'long'}]}),id='python-avro-projection')
  bindings={'id':'projected','schemaId':'https://example.test/projected','long':'decimal-string','bytes':'hex-string','union':'untagged','lossPolicy':'allow-reported-loss'}
  good=execute_adapter('avro-json-schema-projection','projectAvroToJsonSchema',document=doc,bindings=bindings)
  self.assertEqual(good['status'],'projected')
  self.assertEqual(good['source'],doc)
  self.assertIn('target',good)
  bad=execute_adapter('avro-json-schema-projection','projectAvroToJsonSchema',document=doc,bindings={**bindings,'lossPolicy':'strict'})
  self.assertEqual(bad['status'],'blocked')
  self.assertNotIn('target',bad)
if __name__=='__main__':unittest.main()
