import json,struct,copy
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='negative_pages_thrift');base=Path('fixtures/parquet/pages/negative');base.mkdir(parents=True,exist_ok=True);cases=[]
def encode(obj):
 b=TMemoryBuffer();obj.write(TCompactProtocol(b));return b.getvalue()
def make(id,version='1.0',page=lambda h:None,meta=lambda f:None,corrupt=False,expected='blocked'):
 path=base/(id+'.parquet');pq.write_table(pa.table({'value':pa.array([1,2,3,4],type=pa.int32())}),path,compression='NONE',use_dictionary=False,data_page_version=version,write_page_checksum=True);raw=path.read_bytes();length=int.from_bytes(raw[-8:-4],'little');footer=m.FileMetaData();footer.read(TCompactProtocol(TMemoryBuffer(raw[-8-length:-8])));column=footer.row_groups[0].columns[0].meta_data;remaining=raw[4:];buffer=TMemoryBuffer(remaining);header=m.PageHeader();header.read(TCompactProtocol(buffer));used=len(remaining)-len(buffer.read(len(remaining)));body=raw[4+used:4+used+header.compressed_page_size];page(header);newheader=encode(header);column.total_compressed_size=len(newheader)+len(body);column.total_uncompressed_size=len(newheader)+len(body);meta(footer)
 if corrupt:body=bytes([body[0]^255])+body[1:]
 f=encode(footer);path.write_bytes(b'PAR1'+newheader+body+f+struct.pack('<I',len(f))+b'PAR1')
 try:pq.ParquetFile(path,page_checksum_verification=True).read();native='accepted'
 except Exception:native='rejected'
 cases.append({'id':id,'path':str(path),'expected':expected,'native':native})
make('valid-v1',expected='checked');make('valid-v2',version='2.0',expected='checked')
for id,key,value in [('negative-uncompressed','uncompressed_page_size',-1),('huge-uncompressed','uncompressed_page_size',8388609),('negative-compressed','compressed_page_size',-1),('body-beyond-chunk','compressed_page_size',100000),('unknown-page-type','type',99)]:make(id,page=lambda h,k=key,v=value:setattr(h,k,v))
make('huge-value-count',page=lambda h:setattr(h.data_page_header,'num_values',100001))
make('dictionary-without-dictionary',page=lambda h:setattr(h.data_page_header,'encoding',8))
make('mismatched-value-total',meta=lambda f:setattr(f.row_groups[0].columns[0].meta_data,'num_values',5))
make('mismatched-uncompressed-total',meta=lambda f:setattr(f.row_groups[0].columns[0].meta_data,'total_uncompressed_size',1))
make('offset-outside',meta=lambda f:setattr(f.row_groups[0].columns[0].meta_data,'data_page_offset',999999))
make('truncated-header',meta=lambda f:setattr(f.row_groups[0].columns[0].meta_data,'total_compressed_size',1))
make('v2-null-count',version='2.0',page=lambda h:setattr(h.data_page_header_v2,'num_nulls',5))
make('v2-level-length',version='2.0',page=lambda h:setattr(h.data_page_header_v2,'definition_levels_byte_length',10000))
make('v2-row-count',version='2.0',page=lambda h:setattr(h.data_page_header_v2,'num_rows',5))
def overlap(f):
 leaf=copy.deepcopy(f.schema[1]);leaf.name='other';f.schema.append(leaf);f.schema[0].num_children=2;c=copy.deepcopy(f.row_groups[0].columns[0]);c.meta_data.path_in_schema=['other'];f.row_groups[0].columns.append(c)
 if f.column_orders:f.column_orders.append(copy.deepcopy(f.column_orders[0]))
make('overlapping-chunks',meta=overlap)
make('payload-corruption-not-inspected',corrupt=True,expected='checked')
(base/'manifest.json').write_text(json.dumps({'cases':cases},indent=2)+'\n');print({'cases':len(cases),'nativeRejected':sum(c['native']=='rejected' for c in cases)})
