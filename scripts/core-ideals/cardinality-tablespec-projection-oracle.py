"""Independently validate emitted native schemas and their vector value boundaries."""
import os,sys,json,hashlib,runpy
from pathlib import Path
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');os.environ['PYSPARK_PYTHON']=sys.executable
import pydantic,jsonschema,tablespec.type_mappings
from pyspark.sql import SparkSession
root=Path('native/tablespec/sources/src/tablespec')
manifests=[Path('native/tablespec/sources.json'),Path('native/tablespec/cardinality-runtime/sources.json')]
for p in manifests:
    for f in json.loads(p.read_text())['files']:assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
assert Path(tablespec.type_mappings.__file__).read_bytes()==(root/'type_mappings.py').read_bytes()
UMF=runpy.run_path(str(root/'models/umf.py'))['UMF'];checked=jsonschema.Draft202012Validator(json.loads((root/'schemas/umf.schema.json').read_text()))
gen=runpy.run_path('native/tablespec/cardinality-runtime/generators.py')
path=Path('fixtures/validation/cardinality-tablespec-projection.json');rows=json.loads(path.read_text())['rows']
spark=SparkSession.builder.master('local[1]').appName('umf-cardinality-projections').config('spark.ui.enabled','false').config('spark.driver.bindAddress','127.0.0.1').config('spark.ui.showConsoleProgress','false').getOrCreate();spark.sparkContext.setLogLevel('ERROR')
observations=[];recoveries=0;checks=0;narrowings=0
try:
    for row in rows:
        result=row['result'];request=row['request']
        if result['status']=='blocked':
            assert row['nativeText'] is None and 'target' not in result and result['residuals'];continue
        source=json.loads(row['nativeText']);assert checked.is_valid(source);model=UMF.model_validate(source)
        assert model.columns[0].data_type==request['nativeType']
        js=gen['generate_json_schema'](source);jsonschema.Draft7Validator.check_schema(js);validator=jsonschema.Draft7Validator(js)
        namespace={};exec(compile(gen['generate_pyspark_schema'](source),'<trusted-generated-fixture>','exec'),namespace);schema=namespace['shapes_schema']
        observations.append({'name':row['name'],'request':request,'jsonSchema':js,'sparkSchema':schema.jsonValue(),'outcome':result['mapping']['outcome']})
        for recovery in row['recovered']:assert recovery['source']==row['author']['target'];recoveries+=1
        if request['nativeType']=='EMBEDDING':
            assert model.columns[0].dimension==request['dimension']==3
            assert result['residuals'] and result['mapping']['outcome']!='exact'
            # Independent expected cases, not expectations read from the adapter report.
            for name,value,json_ok in [('ordered',[3.0,1.0,2.0],True),('duplicates',[1.0,1.0,1.0],True),('empty',[],False),('short',[1.0],False),('long',[1.0,2.0,3.0,4.0],False),('null-item',[None,1.0,2.0],False),('narrowing',[1.0000000000000002,1.0,2.0],True)]:
                data={'value':value};assert validator.is_valid(data)==json_ok
                actual=spark.createDataFrame([data],schema).collect()[0].asDict()['value']
                if name=='narrowing':assert actual[0]==1.0 and actual[0]!=value[0];narrowings+=1
                else:assert actual==value
                checks+=1
        if request['requireExactValues']:assert result['residuals'] and result['mapping']['outcome']!='exact'
        if row['author']['provenance']['cardinality']=='map':assert result['mapping']['encoding']=='carrier-only' and result['mapping']['outcome']=='not-expressible'
    assert len(rows)==78 and len(observations)==44 and recoveries==88 and checks==105 and narrowings==15,(len(rows),len(observations),recoveries,checks,narrowings)
    evidence={'scope':'Emitted TableSpec declaration validation, generated JSON/Spark schemas and vector values; no full pipeline, SQL or map encoding equivalence','nativeVersion':json.loads(manifests[0].read_text())['commit'],'pydantic':pydantic.__version__,'spark':spark.version,'cases':len(rows),'emitted':len(observations),'idealRecoveries':recoveries,'vectorValueChecks':checks,'floatNarrowings':narrowings,'observations':observations,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [path,Path(__file__),*manifests]}}
    Path('fixtures/validation/cardinality-tablespec-projection-native.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps({k:evidence[k] for k in ['cases','emitted','idealRecoveries','vectorValueChecks','floatNarrowings']}))
finally:spark.stop()
