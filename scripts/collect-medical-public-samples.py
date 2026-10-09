"""Explicit developer collection from downloaded, fingerprinted public archives.

Requires pydicom 3.0.2. This never runs in pack ingestion or in the browser.
Download URLs and archive checksums are recorded in the emitted selection files.
"""
import argparse,csv,hashlib,io,json
from pathlib import Path
from zipfile import ZipFile
import pydicom

ROOT=Path(__file__).resolve().parents[1]/'spec/domain-packs'
def digest(data):return hashlib.sha256(data).hexdigest()
def write_json(path,data):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
parser=argparse.ArgumentParser();parser.add_argument('--cache',required=True);args=parser.parse_args();cache=Path(args.cache)
urls={
 'beneficiaries':'https://www.cms.gov/research-statistics-data-and-systems/downloadable-public-use-files/synpufs/downloads/de1_0_2008_beneficiary_summary_file_sample_1.zip',
 'inpatient':'https://www.cms.gov/research-statistics-data-and-systems/downloadable-public-use-files/synpufs/downloads/de1_0_2008_to_2010_inpatient_claims_sample_1.zip',
 'carrier':'https://downloads.cms.gov/files/DE1_0_2008_to_2010_Carrier_Claims_Sample_1A.zip'}
expected={'beneficiaries':'2b0c9cbfb07a6eb46d5f96472c0891275a390b686c3fa34daae8d3e53d70b18b','inpatient':'ac25124184d22863aff538607097d2d0c880d19f7d58f882f9d31129c492d893','carrier':'4b4038b5f6cd9c524fa3a655a3f467aef01af56c3cae0f08902a35a9945bed97'}
files={};pins={}
for name,url in urls.items():
 data=(cache/('umf-cms-'+name+'.zip')).read_bytes();assert digest(data)==expected[name]
 z=ZipFile(io.BytesIO(data));member=z.namelist()[0];raw=z.read(member);lines=raw.splitlines(keepends=True)
 # Published CSV records are one physical line each; retain exact selected bytes.
 header=next(csv.reader([lines[0].decode()]));files[name]=(header,lines)
 pins[name]={'url':url,'archive_sha256':digest(data),'member':member,'member_sha256':digest(raw),'selected_record_numbers':[]}
selected={};beneficiaries=set()
for name in ['inpatient','carrier']:
 header,lines=files[name];chosen=[]
 for number,line in enumerate(lines[1:],1):
  row=dict(zip(header,next(csv.reader([line.decode()]))))
  # Avoid distributing CPT/Level I codes: select complete carrier records only
  # where every nonempty HCPCS token is alphanumeric Level II-shaped.
  if name=='carrier' and any(v and not (v[0].isalpha() and len(v)==5) for k,v in row.items() if k.startswith('HCPCS_CD_')):continue
  chosen.append(line);beneficiaries.add(row['DESYNPUF_ID']);pins[name]['selected_record_numbers'].append(number)
  if len(chosen)==5:break
 assert len(chosen)==5
 selected[name]=chosen
header,lines=files['beneficiaries'];selected['beneficiaries']=[]
for number,line in enumerate(lines[1:],1):
 row=dict(zip(header,next(csv.reader([line.decode()]))))
 if row['DESYNPUF_ID'] in beneficiaries:
  selected['beneficiaries'].append(line);pins['beneficiaries']['selected_record_numbers'].append(number)
assert len(selected['beneficiaries'])==len(beneficiaries)
carrier=ROOT/'medical-carrier'/'sources'
for name,records in selected.items():
 data=files[name][1][0]+b''.join(records);path=carrier/('cms-'+name+'.csv');path.write_bytes(data)
 pins[name]['subset_sha256']=digest(data);pins[name]['rows']=len(records)
write_json(carrier/'cms-selection.json',{'release':'DE-SynPUF 1.0 Sample 1; 2008 beneficiary and 2008–2010 claims','retrieved_at':'2026-10-08','data_kind':'fabricated','files':pins,'selection':'First five inpatient rows and first five complete carrier rows without numeric CPT/Level I HCPCS tokens; all matching 2008 beneficiaries. The second carrier file (1B) is outside this tiny subset. Native columns and bytes unchanged. No ICD-9 conversion, clinical validity or longitudinal completeness claimed.','rights':{'basis':'CMS public-domain website declaration and unrestricted DE-SynPUF software-development public release; no CPT code/descriptor vocabulary bundled.','references':['https://www.cms.gov/about-cms/web-policies-important-links/about-website/link-to-us','https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-synthetic-public-use-files','https://www.cms.gov/files/document/de-10-frequently-asked-questions.pdf'],'limit':'Applies to this selected subset, not other CMS files or licensed codebooks.'}})
series='1.3.6.1.4.1.14519.5.2.1.6279.6001.179049373636438705059720603192'
raw=(cache/'umf-tcia-ct.zip').read_bytes();assert digest(raw)=='368b2d7ca84edc2f1462194282d6cdd52b6624b5c90964eb8a306ebe56328833'
z=ZipFile(io.BytesIO(raw));member=sorted(n for n in z.namelist() if n.endswith('.dcm'))[0];binary=z.read(member);d=pydicom.dcmread(io.BytesIO(binary));assert str(d.SeriesInstanceUID)==series
imaging=ROOT/'medical-imaging'/'sources';binary_ref='sources/tcia-lidc-0001-ct.dcm';(imaging/'tcia-lidc-0001-ct.dcm').write_bytes(binary)
metadata=d.to_json_dict(bulk_data_threshold=1024,bulk_data_element_handler=lambda e:binary_ref+'#tag-'+f'{int(e.tag):08X}')
write_json(imaging/'tcia-lidc-0001-ct.json',metadata)
private=[{'tag':f'{e.tag:08X}','vr':e.VR,'value':str(e.value)} for e in d.iterall() if e.tag.is_private]
write_json(imaging/'tcia-selection.json',{'collection':'LIDC-IDRI','doi':'10.7937/K9/TCIA.2015.LO9QL9SX','collection_revision':'2015 DOI; exact API snapshot retrieved 2026-10-08','license':'CC-BY-3.0','license_url':'https://creativecommons.org/licenses/by/3.0/','collection_url':'https://www.cancerimagingarchive.net/collection/lidc-idri/','policy_url':'https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/','archive_url':'https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID='+series,'archive_sha256':digest(raw),'member':member,'member_sha256':digest(binary),'selection':'Lexicographically first DICOM member from one 133-instance CT series; one slice only, not a complete study. Original binary unchanged.','data_kind':'deidentified','patient_id':str(d.PatientID),'study_uid':str(d.StudyInstanceUID),'series_uid':series,'sop_instance_uid':str(d.SOPInstanceUID),'transfer_syntax':str(d.file_meta.TransferSyntaxUID),'native_dicom_edition':'Not declared by source; inspection profile DICOM JSON PS3.18 Annex F, pydicom 3.0.2.','private_elements':private,'burned_in_annotation':str(d.get('BurnedInAnnotation','not supplied')),'deidentification':'Publisher-deidentified source; no independent patient reidentification or deidentification certification. Retained private creator and CT private values are inspectable.','projection_losses':['DS/IS values may normalize lexical spelling in pydicom JSON; exact spelling stays in original binary.','PixelData becomes an opaque local BulkDataURI; pixel and file-meta bytes stay in the unchanged binary.'],'pydicom_version':pydicom.__version__})
print(json.dumps({'cms_rows':{k:len(v) for k,v in selected.items()},'dicom_bytes':len(binary),'private_elements':private},indent=2))
