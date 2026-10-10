"""Offline projection of hash-pinned judicial PDFs and authored fixtures.

Requires pypdf 6.10.0. --check refuses stale outputs. No network, OCR, email,
PACER, automatic legal labeling or rewriting of originals.
"""
import csv
import hashlib
import io
import json
import logging
import sys
from pathlib import Path
from pypdf import PdfReader, __version__

if __version__ != '6.10.0':
    raise ValueError('Qualified extractor is pypdf 6.10.0')
logging.getLogger('pypdf').setLevel(logging.ERROR)
ROOT = Path(__file__).resolve().parents[2] / 'spec/domain-packs/legal-appellate'
CHECK = '--check' in sys.argv
selection = json.loads((ROOT / 'selection.json').read_text())
curation = json.loads((ROOT / 'curation.json').read_text())
replay = json.loads((ROOT / 'replay.json').read_text())

def emit(path, data):
    if CHECK:
        if not path.exists() or path.read_bytes() != data:
            raise ValueError(f'Stale projection: {path}')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()

def digest(data):
    return hashlib.sha256(data).hexdigest()

# Compact declarations are authoring input, not a new schema dialect for consumers.
# Suffix ? means nullable; @ names the exact foreign table/column.
LAYOUT = {
 'courts': 'court_id name court_level jurisdiction listing_url?',
 'cases': 'case_id case_name docket_number court_id@courts.court_id',
 'decisions': 'document_id case_id@cases.case_id document_kind decision_date source_url retrieved_at original_file sha256 page_count:INTEGER historical_status publisher_qualification?',
 'decision_pages': 'page_id document_id@decisions.document_id pdf_page:INTEGER text text_status',
 'issue_groups': 'issue_group_id disputed_issue legal_basis comparison_scope qualification',
 'decision_groups': 'association_id document_id@decisions.document_id issue_group_id@issue_groups.issue_group_id comparison_role distinction',
 'decision_links': 'link_id source_document_id@decisions.document_id target_document_id@decisions.document_id relationship qualification',
 'annotations': 'annotation_id document_id@decisions.document_id issue_group_id@issue_groups.issue_group_id screening_class disputed_issue outcome_effect opinion_voice annotator method review_state historical_qualification',
 'annotation_evidence': 'evidence_id annotation_id@annotations.annotation_id page_id@decision_pages.page_id purpose excerpt',
 'counsel': 'counsel_id document_id@decisions.document_id counsel_name? party_scope? source_page_id?@decision_pages.page_id as_of_date observation_status source_excerpt?',
 'collection_windows': 'window_id court_id@courts.court_id starts_at ends_at expected_source qualification',
 'workflow_events': 'event_id ordinal:INTEGER window_id?@collection_windows.window_id document_id?@decisions.document_id recipient_id? prompt_version? alert_kind? stage outcome retry_of?@workflow_events.event_id review_id?@fictional_reviews.review_id lookup_id?@enrichment_fixtures.lookup_id detail',
 'expected_outputs': 'expectation_id event_id@workflow_events.event_id expected_action notification_key? open_failure_count:INTEGER affected_document_id?@decisions.document_id expected_review_status? expected_actionable?:BOOLEAN expected_enrichment_status? expected_counsel_name? detail',
 'enrichment_fixtures': 'lookup_id fictional_case fictional_party counsel_name? lookup_status source_kind qualification',
 'fictional_reviews': 'review_id fictional_case fictional_party qualification',
}
rows = {name: [] for name in LAYOUT}
rows['courts'] = curation['courts']
rows['issue_groups'] = curation['issue_groups']
rows['decision_links'] = curation['decision_links']
rows['annotations'] = curation['annotations']
rows['counsel'] = curation['counsel']
for name in ['collection_windows', 'workflow_events', 'expected_outputs', 'enrichment_fixtures', 'fictional_reviews']:
    rows[name] = replay[name]

sources, bindings, schemas = {}, [], []
rights_reference = 'https://www.copyright.gov/comp3/docs/compendium.pdf#page=82'

def source(reference, kind, format, upstream=None, timestamp=None, parents=None, notice=None):
    result = {'kind': 'external', 'data_kind': kind, 'reference': reference, 'format': format,
      'checksum': {'algorithm': 'sha256', 'value': digest((ROOT / reference).read_bytes())},
      'license': {'redistribution': 'allowed', 'attribution': 'Issuing court' if format == 'pdf' else 'UMF project / issuing courts',
                  'reference': rights_reference if kind == 'observed' else None,
                  'notices': [notice or 'Project-authored development fixture; no claim of attorney validation.']},
      'provenance': {'publisher': 'Issuing court (mirror qualification in decisions)' if format == 'pdf' else 'UMF project',
                     'retrieved_at': timestamp, 'upstream_url': upstream, 'source_ids': parents or [],
                     'transformations': [] if format == 'pdf' else ['Offline metadata/text projection or authored fixture; see README.']}}
    for key in ['retrieved_at', 'upstream_url']:
        if result['provenance'][key] is None:
            del result['provenance'][key]
    if result['license']['reference'] is None:
        del result['license']['reference']
    return result

case_ids, page_index = set(), {}
for doc in selection['documents']:
    id = doc['document_id']
    reference = f'sources/{id}.pdf'
    original = (ROOT / reference).read_bytes()
    if not original.startswith(b'%PDF') or digest(original) != doc['sha256']:
        raise ValueError(f'Invalid or changed original: {id}')
    reader = PdfReader(io.BytesIO(original))
    case_id = f"{doc['court_id']}:{doc['docket_number']}"
    if case_id not in case_ids:
        rows['cases'].append(dict(case_id=case_id, case_name=doc['case_name'], docket_number=doc['docket_number'], court_id=doc['court_id']))
        case_ids.add(case_id)
    rows['decisions'].append(dict(document_id=id, case_id=case_id, document_kind=doc['document_kind'],
       decision_date=doc['decision_date'], source_url=doc['upstream_url'], retrieved_at=doc['retrieved_at'],
       original_file=reference, sha256=doc['sha256'], page_count=len(reader.pages),
       historical_status=doc['historical_status'], publisher_qualification=doc.get('publisher_qualification')))
    for n, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ''
        page_id = f'{id}:pdf:{n}'
        page_index[page_id] = text
        rows['decision_pages'].append(dict(page_id=page_id, document_id=id, pdf_page=n, text=text,
          text_status='text_layer_extracted' if text.strip() else 'no_text_layer_extracted'))
    group = next(g for g in curation['issue_groups'] if g['issue_group_id'] == doc['issue_group_id'])
    rows['decision_groups'].append(dict(association_id=id + ':group', document_id=id,
       issue_group_id=doc['issue_group_id'], comparison_role=curation['roles'].get(id, 'comparison_candidate'),
       distinction=group['qualification']))
    sources[id] = source(reference, 'observed', 'pdf', doc['upstream_url'], doc['retrieved_at'], notice=doc['rights_basis'])
    bindings.append(dict(schema_id='decisions', source_id=id, role='reference'))

for evidence in curation['annotation_evidence']:
    if evidence['excerpt'] not in page_index[evidence['page_id']]:
        raise ValueError(f"Evidence not on page: {evidence['evidence_id']}")
rows['annotation_evidence'] = curation['annotation_evidence']
for counsel in rows['counsel']:
    if counsel.get('source_excerpt') and counsel['source_excerpt'] not in page_index[counsel['source_page_id']]:
        raise ValueError(f"Counsel evidence not on page: {counsel['counsel_id']}")

authored = ['selection.json', 'retrieval-attempts.json', 'curation.json', 'replay.json', 'screening-prompt.md', 'loader-inventory.json', 'loader-release.json']
for file in authored:
    kind = 'observed' if file == 'retrieval-attempts.json' else 'unknown' if file == 'curation.json' else 'fabricated' if file == 'replay.json' else 'unknown'
    sources[file] = source(file, kind, 'json' if file.endswith('.json') else 'text')
release = json.loads((ROOT / 'loader-release.json').read_text())
loader_artifacts = []
for artifact in release['artifacts']:
    reference = artifact['reference']
    if digest((ROOT / reference).read_bytes()) != artifact['sha256']:
        raise ValueError(f'Changed shared loader artifact: {reference}')
    loader_artifacts.append(dict(reference=reference, sha256=artifact['sha256']))
    sources[reference] = source(reference, 'unknown', 'text' if reference.endswith(('.ts', '.md')) else 'json',
                                notice='Exact shared UMF loader companion 1.0.0; explicitly invoked host runtime only.')

for name, layout in LAYOUT.items():
    columns, foreign_keys = [], []
    for field in layout.split():
        left, _, target = field.partition('@')
        native, _, type = left.partition(':')
        nullable = '?' in native
        column = native.replace('?', '')
        columns.append(dict(name=column, data_type=type or 'VARCHAR', nullable=nullable,
                            description=f'{name}.{column}; preserve source scope and qualification.'))
        if target:
            table, referenced_column = target.split('.')
            foreign_keys.append(dict(column=column, references_table=table, references_column=referenced_column))
    schema = dict(version='1.0', table_name=name, description=f'CONTRACT-058 bounded appellate fixture: {name}.',
                  columns=columns, primary_key=[columns[0]['name']])
    if foreign_keys:
        schema['relationships'] = dict(foreign_keys=foreign_keys)
    emit(ROOT / 'umf' / f'{name}.json', encoded(schema))
    fields = [c['name'] for c in columns]
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    for row in rows[name]:
        if set(row) - set(fields):
            raise ValueError(f'Unmodeled fields in {name}: {set(row) - set(fields)}')
        for column in columns:
            if row.get(column['name']) is None and not column['nullable']:
                raise ValueError(f"Missing required {name}.{column['name']}")
        writer.writerow({k: '\\N' if row.get(k) is None else row[k] for k in fields})
    emit(ROOT / 'data' / f'{name}.csv', stream.getvalue().encode())
    # Interpretation is intentionally unknown, not misclassified as observed truth.
    kind = 'fabricated' if name in replay else 'unknown' if name in ['annotations', 'annotation_evidence', 'issue_groups', 'decision_groups', 'decision_links'] else 'observed'
    parents = ['replay.json'] if kind == 'fabricated' else ['curation.json'] if kind == 'unknown' else [d['document_id'] for d in selection['documents']]
    sources[f'csv_{name}'] = source(f'data/{name}.csv', kind, 'csv', parents=parents,
        notice='Judicial text/metadata projection; original PDF authoritative.' if kind == 'observed' else None)
    schemas.append(dict(id=name, format='tablespec', reference=f'umf/{name}.json'))
    bindings.append(dict(schema_id=name, source_id=f'csv_{name}', role='rows'))

# Refuse duplicate primary keys and dangling foreign keys, including nullable links.
for name, layout in LAYOUT.items():
    schema = json.loads((ROOT / 'umf' / f'{name}.json').read_text())
    pk = schema['primary_key'][0]
    if len({row[pk] for row in rows[name]}) != len(rows[name]):
        raise ValueError(f'Duplicate identity: {name}')
    for fk in schema.get('relationships', {}).get('foreign_keys', []):
        allowed = {r[fk['references_column']] for r in rows[fk['references_table']]}
        for row in rows[name]:
            value = row.get(fk['column'])
            if value is not None and value not in allowed:
                raise ValueError(f'Dangling reference: {name}/{value}')

preservation = json.loads((ROOT.parents[1] / 'loader-preservation/1.0.0/profile.json').read_text())
pack = dict(preservation=preservation, id='legal-appellate', version='1.1.0', artifact_collections=[dict(version='1.0.0',id='court-opinions',title='Original court opinions',view='documents',semantic_kinds=['court_opinion'],source_ids=[k for k,v in sources.items() if v.get('format')=='pdf'],media_types=['application/pdf'],metadata_schema_ids=['cases','decisions','courts','counsel'],derived_schema_ids=['decision_pages','annotations','annotation_evidence'],description='Original judicial PDFs are authoritative; extracted text and provisional annotations remain separate projections.')],
 description='Historical judicial PDFs, provisional split-screening annotations and fixed workflow fixtures; no live monitor.',
 domain_types={'source_scoped_identity': {'description': 'Court/docket, content-version and PDF page identity; never inferred from party names.'}},
 sources=sources, source_bindings=bindings, schemas=schemas,
 loader=dict(version='1.0.0', id='umf.document-loader', implementation_version='1.0.0',
   profile='court-documents', runtime='bun', entrypoint='run.ts', configuration_schema='inventory.schema.json',
   artifacts=loader_artifacts, qualification='Shared 1.0.0 finite-inventory companion; explicit invocation only, no court discovery or legal screening.'),
 execution_profile=dict(version='1.0.0', targets={'tabular': list(LAYOUT)}, mode='fixed', include_sources=list(sources),
   qualification='Fixed local ingestion; temporal replay expectations are consumer test inputs, not CONTRACT-053 scenario scaling.'),
 csv_conventions={'encoding': 'UTF-8', 'null_value': '\\N', 'header': True},
 fixture_counts={k: len(v) for k, v in rows.items()},
 qualification={'extractor': f'pypdf {__version__}; text layer only, no OCR, one-based PDF ordinals.',
   'authority': 'Original PDFs retain layout, stamps, dissent attribution and subsequent-treatment notices.',
   'labels': 'AI-authored provisional annotations, not attorney-reviewed ground truth or current treatment research.',
   'coverage': 'Selected historical cases, not complete court coverage; failed retrieval attempts remain visible.',
   'workflow': 'Fabricated events and fictional enrichment; no credentials, mail delivery, PACER requests or live polling.'})
emit(ROOT / 'pack.json', encoded(pack))
print(json.dumps(pack['fixture_counts']))
