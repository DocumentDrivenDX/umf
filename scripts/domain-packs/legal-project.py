"""Rebuild the bounded legal corpus from local PDFs; no retrieval or OCR.
Requires pypdf 6.10.0. Original bytes are never rewritten.
"""
import csv
import io
import sys
import hashlib
import json
from pathlib import Path
import re
from pypdf import PdfReader, __version__

root = Path(__file__).resolve().parents[2] / 'spec/domain-packs/legal'
corpus = json.loads((root / 'corpus.json').read_text())
pack = json.loads((root / 'pack.json').read_text())
previous_sources = pack.get('sources', {})
check = '--check' in sys.argv

def emit(path, data):
    if check:
        if path.read_bytes() != data:
            raise ValueError(f'Stale legal projection: {path}')
    else:
        path.write_bytes(data)

pack['version'] = '1.2.0'
pack['description'] = 'Mixed legal pack: fabricated firm operations plus observed public court filings, deposition designations and corporate trial exhibits. No invented association between the two.'
pack['sources'] = {'fabricated': pack['sources']['fabricated']}
# Preserve other governed targets, including the existing ontology schema.
pack['source_bindings'] = [b for b in pack['source_bindings'] if b['source_id'] == 'fabricated']
pack['csv_conventions'] = {'encoding': 'UTF-8', 'null_value': '\\N', 'header': True, 'quote': '"'}
case_rows = [corpus['case']]
doc_rows, page_rows = [], []

def source(reference, format, rights, publisher, upstream=None, source_ids=None):
    data = (root / reference).read_bytes()
    return {'kind': 'external', 'data_kind': 'observed', 'reference': reference,
            'format': format, 'checksum': {'algorithm': 'sha256', 'value': hashlib.sha256(data).hexdigest()},
            'license': {'redistribution': rights, 'reference': 'https://www.justice.gov/legalpolicies',
                        'attribution': publisher,
                        'notices': ['Public access does not establish third-party reuse rights. Original confidentiality markings and redactions remain untouched.']},
            'provenance': {'publisher': publisher, 'retrieved_at': '2026-10-08',
                           'upstream_url': upstream, 'source_ids': source_ids or [],
                           'transformations': [] if format == 'pdf' else ['Selected metadata or per-PDF-page text projection; originals remain authoritative.']}}

for doc in corpus['documents']:
    id = doc['evidence_key']
    reference = f'sources/{id}.pdf'
    data = (root / reference).read_bytes()
    expected = previous_sources.get(id, {}).get('checksum', {}).get('value')
    if expected and hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Original PDF checksum differs: {id}')
    reader = PdfReader(root / reference)
    pack['sources'][id] = source(reference, 'pdf', doc['redistribution'], 'U.S. Department of Justice / source authors identified in document', doc['upstream_url'])
    pack['source_bindings'].append({'schema_id': 'evidence_documents', 'source_id': id, 'role': 'reference'})
    doc_rows.append({**doc, 'original_file': reference, 'sha256': hashlib.sha256(data).hexdigest(),
                     'page_count': len(reader.pages), 'extraction_status': 'pypdf text layer only; no OCR or completeness claim'})
    for number, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ''
        candidates = sorted(set(re.findall(r'\b(?:GOOG|GOOGLE)[A-Z0-9-]*-\d{5,}\b', text)))
        page_rows.append({'page_key': f'{id}:pdf:{number}', 'evidence_key': id,
                          'pdf_page': number, 'text': text,
                          'text_status': 'text_layer_extracted' if text.strip() else 'no_text_layer_extracted',
                          'bates_candidates_json': json.dumps(candidates)})

(root / 'data').mkdir(exist_ok=True)
for id, rows in [('cases', case_rows), ('evidence_documents', doc_rows), ('evidence_pages', page_rows)]:
    schema = json.loads((root / 'umf' / f'{id}.json').read_text())
    fields = [c['name'] for c in schema['columns']]
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore', lineterminator='\n')
    writer.writeheader()
    writer.writerows({k: '\\N' if row.get(k) is None else row[k] for k in fields} for row in rows)
    emit(root / 'data' / f'{id}.csv', stream.getvalue().encode('utf-8'))
    upstream_ids = [d['evidence_key'] for d in corpus['documents']]
    # Metadata has no copied document body; page text inherits uncleared third-party rights.
    pack['sources'][f'csv_{id}'] = source(f'data/{id}.csv', 'csv', 'unknown' if id == 'evidence_pages' else 'allowed', 'UMF project', source_ids=upstream_ids)
    if not any(s['id'] == id for s in pack['schemas']):
        pack['schemas'].append({'id': id, 'format': 'tablespec', 'reference': f'umf/{id}.json'})
    pack['source_bindings'].append({'schema_id': id, 'source_id': f'csv_{id}', 'role': 'rows'})
pack['artifact_collections'] = [dict(version='1.0.0',id='litigation-originals',title='Original litigation documents',view='documents',semantic_kinds=['court_filing','trial_exhibit'],source_ids=[k for k,v in pack['sources'].items() if v.get('format')=='pdf'],media_types=['application/pdf'],metadata_schema_ids=['evidence_documents','cases'],derived_schema_ids=['evidence_pages'],ontology_schema_ids=['ontology'],description='Selected original PDFs; firm operations remain fabricated and unrelated.') ]
pack['fixture_counts'] = {'cases': len(case_rows), 'evidence_documents': len(doc_rows), 'evidence_pages': len(page_rows)}
pack['qualification'] = {'subset': 'One digital-advertising antitrust case; seven selected PDFs, not a complete docket or discovery production.',
                         'extraction': f'pypdf {__version__}; PDF page ordinals, not transcript page/line citations; text layer only, no OCR.',
                         'original_authority': 'sources/*.pdf; images, redactions, annotations, signatures and layout are not represented completely in CSV text.',
                         'joins': 'Real evidence links only to sourced cases; no fabricated client/matter association.',
                         'execution': 'Synthetic generation for the full mixed pack refuses external row bindings; consumers must select and explicitly ingest external CSV sources.',
                         'redistribution': 'Full source export refuses while any bundled source has unknown redistribution rights.'}
emit(root / 'pack.json', (json.dumps(pack, indent=2) + '\n').encode('utf-8'))
print(json.dumps(pack['fixture_counts']))
