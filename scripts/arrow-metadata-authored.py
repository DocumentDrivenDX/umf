"""Native-compiler metadata fixtures for exact IDs, duplicate keys, tensors and sparse indexes."""
import json,subprocess,os,hashlib
from pathlib import Path
base=Path('fixtures/arrow/metadata');source=base/'authored';source.mkdir(exist_ok=True)
exe=os.environ.get('UMF_FLATC_PATH','.cache/flatc/root/usr/bin/flatc');env=dict(os.environ,LD_LIBRARY_PATH=os.environ.get('UMF_FLATC_LIBRARY_PATH',str(Path('.cache/flatc/root/usr/lib/aarch64-linux-gnu').resolve())))
assert subprocess.check_output([exe,'--version'],env=env,text=True).strip()=='flatc version 23.5.26'
int32={'bitWidth':32,'is_signed':True};buffer={'offset':0,'length':8}
cases=[('schema-exact','Schema',{'endianness':'Big','features':['DICTIONARY_REPLACEMENT','COMPRESSED_BODY'],'fields':[{'name':'value','type_type':'Utf8','type':{},'dictionary':{'id':9223372036854775807,'indexType':int32,'isOrdered':True}}],'custom_metadata':[{'key':'duplicate','value':'first'},{'key':'duplicate','value':'second'}]}),('tensor','Tensor',{'type_type':'Int','type':{'bitWidth':64,'is_signed':True},'shape':[{'size':3,'name':'axis'}],'strides':[8],'data':{'offset':0,'length':24}})]
indexes=[('SparseTensorIndexCOO',{'indicesType':int32,'indicesStrides':[4],'indicesBuffer':buffer,'isCanonical':True}),('SparseMatrixIndexCSX',{'compressedAxis':'Row','indptrType':int32,'indptrBuffer':{'offset':0,'length':12},'indicesType':int32,'indicesBuffer':buffer}),('SparseTensorIndexCSF',{'indptrType':int32,'indptrBuffers':[buffer],'indicesType':int32,'indicesBuffers':[buffer,buffer],'axisOrder':[0,1]})]
for tag,value in indexes:cases.append((tag,'SparseTensor',{'type_type':'Int','type':{'bitWidth':64,'is_signed':True},'shape':[{'size':2},{'size':2}],'non_zero_length':2,'sparseIndex_type':tag,'sparseIndex':value,'data':{'offset':0,'length':16}}))
manifest=json.loads((base/'manifest.json').read_text());manifest['cases']=[c for c in manifest['cases'] if c.get('producer')!='flatc 23.5.26']
for name,root,value in cases:
    file=source/(name+'.json');file.write_text(json.dumps(value,indent=2)+'\n')
    subprocess.run([exe,'--binary','--strict-json','-I','spec/extensions/arrow/flatbuffers','-o',str(base),'spec/extensions/arrow/flatbuffers/'+root+'.fbs',str(file)],env=env,check=True,capture_output=True)
    binary=base/(name+'.bin');manifest['cases'].append({'file':binary.name,'source':'authored/'+file.name,'producer':'flatc 23.5.26','kind':'authored metadata only; no accompanying data body','rootType':root,'sha256':hashlib.sha256(binary.read_bytes()).hexdigest()})
(base/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print({'authoredMetadataRoots':len(cases)})
