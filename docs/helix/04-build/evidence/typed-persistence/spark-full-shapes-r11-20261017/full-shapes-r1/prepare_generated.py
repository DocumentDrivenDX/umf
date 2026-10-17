"""Owned source-pinned public catalog fixture; never used by shipped runtime."""
from pathlib import Path
import hashlib,json,subprocess,sys

def prepare(root:Path,request:dict,physical:Path,schema:str,versions:dict):
 root.mkdir(parents=True,exist_ok=True)
 (root/'logical.json').write_text(request['binding']['modelJson'])
 (root/'physical.json').write_bytes(physical.read_bytes())
 binding=json.loads(json.dumps(request['binding']));binding['schema']=schema
 (root/'raw-binding.json').write_text(json.dumps(binding))
 (root/'declarations.py').write_text('''from umf_access import query, Param
from spark_page_fixture.models import Order, Customer
from spark_page_fixture.keys import OrderKey
@query
def snapshot_page(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer, how="left").select(Order.c.id, Customer.c.name, Order.c.tiny, Order.c.small, Order.c.count, Order.c.big, Order.c.amount, Order.c.payload, Order.c.embedding).order_by(Customer.c.name.asc().nulls_last(), Order.c.id.desc().nulls_first()).page(size=50, after=after, snapshot=True)
@query
def live_page(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer, how="left").select(Order.c.id, Customer.c.name, Order.c.tiny, Order.c.small, Order.c.count, Order.c.big, Order.c.amount, Order.c.payload, Order.c.embedding).order_by(Customer.c.name.asc().nulls_last(), Order.c.id.desc().nulls_first()).page(size=50, after=after)
''')
 def pin(name):return {'path':name,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest()}
 config={'package':'spark_page_fixture','modules':['declarations'],'targets':[{'id':'owned','kind':'spark-delta','backendId':'weft-databricks','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','bindingSource':pin('raw-binding.json'),'snapshots':versions,'platform':[{'name':'spark','versions':['4.0.1']},{'name':'delta','versions':['4.0.0']}]}],'weft':{'distribution':'weft-sql','version':'0.4.42.dev0'},'umf':{'documents':[pin('logical.json'),pin('physical.json')]}}
 (root/'config.json').write_text(json.dumps(config))
 for extra in [[],['--check']]:
  command=[sys.executable,'-B','-m','umf_access.build.catalog','catalog','--root',str(root),'--config',str(root/'config.json'),*extra]
  done=subprocess.run(command,capture_output=True,text=True,check=False)
  log=root/('catalog-check.log' if extra else 'catalog-build.log');log.write_text(done.stdout+done.stderr)
  assert done.returncode==0,done.stdout+done.stderr
 return binding
