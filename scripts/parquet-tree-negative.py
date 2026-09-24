import copy,json,struct
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
base=Path('fixtures/parquet/schema/negative');base.mkdir(parents=True,exist_ok=True);m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='tree_parquet_thrift');source=Path('fixtures/delta/checkpoint-upstream/decimal-boundaries/int32.parquet').read_bytes();length=struct.unpack('<I',source[-8:-4])[0];start=len(source)-8-length;original=m.FileMetaData();original.read(TCompactProtocol(TMemoryBuffer(source[start:-8])))
def change(name,obj):
 if name=='extra-node':obj.schema.append(copy.deepcopy(obj.schema[-1]))
 if name=='child-overrun':obj.schema[0].num_children=2
 if name=='negative-children':obj.schema[1].num_children=-1
 if name=='primitive-children':obj.schema[-1].num_children=0
 if name=='missing-repetition':obj.schema[-1].repetition_type=None
 if name=='root-repeated':obj.schema[0].repetition_type=2
 if name=='unknown-physical':obj.schema[-1].type=1234
 if name=='wrong-column-path':obj.row_groups[0].columns[0].meta_data.path_in_schema=['other']
 if name=='wrong-column-type':obj.row_groups[0].columns[0].meta_data.type=2
 if name=='row-count':obj.num_rows+=1
 if name=='missing-column':obj.row_groups[0].columns=[]
 if name=='fixed-no-length':obj.schema[-1].type=7;obj.schema[-1].type_length=None;obj.row_groups[0].columns[0].meta_data.type=7
 if name=='literal-dot':obj.schema[-1].name='value.with.dot';obj.row_groups[0].columns[0].meta_data.path_in_schema=['stats','value.with.dot']
results=[]
for name in ['extra-node','child-overrun','negative-children','primitive-children','missing-repetition','root-repeated','unknown-physical','wrong-column-path','wrong-column-type','row-count','missing-column','fixed-no-length','literal-dot']:
 obj=copy.deepcopy(original);change(name,obj);buf=TMemoryBuffer();obj.write(TCompactProtocol(buf));footer=buf.getvalue();path=base/(name+'.parquet');path.write_bytes(source[:start]+footer+struct.pack('<I',len(footer))+b'PAR1')
 try:
  p=pq.ParquetFile(path);native={'status':'accepted','paths':[p.schema.column(i).path for i in range(len(p.schema))]}
 except Exception as e:native={'status':'rejected','errorType':type(e).__name__}
 results.append({'id':name,'path':str(path),'expected':'checked' if name=='literal-dot' else 'blocked','native':native})
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 metadata loading','cases':results},indent=2)+'\n');print({r['id']:r['native']['status'] for r in results})
