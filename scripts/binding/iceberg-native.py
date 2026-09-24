import json
import pathlib
import pyiceberg
from pyiceberg.table.metadata import TableMetadataUtil

source = pathlib.Path('fixtures/iceberg/table/TableMetadataV3ValidMinimal.yaml.json').read_bytes()
candidate = pathlib.Path('fixtures/binding/iceberg/candidate.json').read_bytes()
before = TableMetadataUtil.parse_raw(source)
after = TableMetadataUtil.parse_raw(candidate)
assert before.default_sort_order_id == 3
assert after.default_sort_order_id == 4
assert after.current_schema_id == before.current_schema_id
assert after.sort_orders[-1].order_id == 4
assert after.sort_orders[-1].fields[0].source_id == 2
assert len(after.sort_orders) == len(before.sort_orders) + 1
assert json.loads(candidate)['schemas'] == json.loads(source)['schemas']
print(json.dumps({'runtime':f'pyiceberg {pyiceberg.__version__}','sourceDefaultSortOrder':before.default_sort_order_id,'candidateDefaultSortOrder':after.default_sort_order_id,'sourceSchemaRecovered':True}))
