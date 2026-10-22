import importlib.util
import json
import copy
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('mirror', ROOT / 'scripts/domain-packs/supreme-court-mirror.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
assert m.case_ids_from_text('23-477 CFX CASE\n24A884)1 STAY CASE\n24A885)2 STAY CASE\n22O156 ORIGINAL\n2026 TERM CASES') == ['22O156', '23-477', '24A884', '24A885']
raw = (ROOT / 'tests/domain-packs/fixtures/supreme-court/23-477.html').read_bytes()
url = m.BASE + '/docket/docketfiles/html/public/23-477.html'
docket = m.parse_docket(raw, '23-477', url)
assert docket['metadata']['Petitioner'] == 'Example Petitioner'
assert any('Example Counsel' in c['source_text'] and 'Party name: Example Petitioner' in c['source_text'] for c in docket['counsel'])
rejected = [p for p in docket['proceedings'] if p['filing_status'] == 'not_accepted']
assert any('Example Association' in p['text'] for p in rejected)
petition = next(p for p in docket['proceedings'] if 'Petition for a writ of certiorari filed' in p['text'])
assert petition['date_text'] == 'Nov 06 2023'
assert len(petition['pdf_links']) == 3
assert any(p['filing_status'] == 'unknown' and 'Judgment Issued' in p['text'] for p in docket['proceedings'])
assert any('/docket/docketfiles/html/qp/23-00477qp.pdf' in p['url'] for p in docket['pdf_links'])
assert len({p['url'] for p in docket['pdf_links']}) == len(docket['pdf_links'])
for data, number in [(raw, '23-478'), (b'<title>Docket for 23-477</title>', '23-477')]:
    try:
        m.parse_docket(data, number, url)
        raise AssertionError('Expected drift/identity refusal')
    except ValueError:
        pass
for bad in ['http://www.supremecourt.gov/a', 'https://evil.example/a', 'https://www.supremecourt.gov@evil.example/a', 'https://www.supremecourt.gov:444/a']:
    try:
        m.safe_url(bad)
        raise AssertionError('Expected URL refusal')
    except ValueError:
        pass
with tempfile.TemporaryDirectory() as directory:
    archive = m.Archive(directory)
    sha = m.digest(raw)
    (archive.root / 'objects' / sha).write_bytes(raw)
    archive.latest[url] = {'url': url, 'sha256': sha, 'status': 'complete'}
    assert archive.get(url) == raw  # Cached collection performs no network.
    archive.event({'url': url, 'status': 'failed', 'error': 'timeout'})
    assert archive.get(url) == raw  # Failure cannot displace successful bytes.
    (archive.root / 'objects' / sha).write_bytes(b'tampered')
    try:
        archive.get(url)
        raise AssertionError('Expected hash refusal')
    except ValueError as error:
        assert str(error) == 'OBJECT_HASH'
with tempfile.TemporaryDirectory() as directory:
    r = Path(directory)
    (r/'cases.json').write_text(json.dumps({'scope': 'fabricated_failure_test', 'failures': [], 'cases': [{'case_number': '23-477'}, {'case_number': '23-478'}, {'case_number': '23-479'}]}))
    class FakeArchive:
        root = r
        def get(self, url):
            if '23-479' in url:
                raise TimeoutError('simulated timeout')
            return raw
    assert m.inventory(FakeArchive()) is True
    coverage=json.loads((r/'coverage.json').read_text())
    assert coverage['successful_dockets']==1 and len(coverage['failed_dockets'])==2
    assert coverage['unattempted_dockets']==0 and coverage['all_cases_complete'] is False
    assert all(e['license']['redistribution']=='unknown' for e in json.loads((r/'pdf-inventory.json').read_text())['entries'])
same = copy.deepcopy(docket)
same['source_sha256'] = 'different_raw_markup'
assert m.compare_dockets(docket, same)['kind'] == 'unchanged_projection'
changed = copy.deepcopy(docket)
changed['proceedings'].pop(0)
changed['proceedings'].append({'date_text': 'Oct 09 2026', 'text': 'Document submitted.', 'filing_status': 'submitted', 'pdf_links': []})
change = m.compare_dockets(docket, changed)
assert change['kind'] == 'semantic_change'
assert change['added_proceedings'][0]['filing_status'] == 'submitted'
assert len(change['missing_from_latest_snapshot']) == 1
assert 'withdrawn' not in change
assert m.compare_dockets(None, docket)['kind'] == 'initial_snapshot'
# Batch selection covers each URL once, preserving unknown rights and case associations.
spec2 = importlib.util.spec_from_file_location('batches', ROOT / 'scripts/domain-packs/supreme-court-batches.py')
b = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(b)
with tempfile.TemporaryDirectory() as directory:
    r = Path(directory)
    entries = [{'id': 'a', 'url': 'https://www.supremecourt.gov/a.pdf', 'media_type': 'application/pdf', 'license': {'redistribution': 'unknown'}, 'metadata': {'case_numbers': ['23-477', '23-478']}}, {'id': 'b', 'url': 'https://www.supremecourt.gov/b.pdf', 'media_type': 'application/pdf', 'license': {'redistribution': 'unknown'}}]
    (r/'pdf-inventory.json').write_text(json.dumps({'entries': entries}))
    (r/'dockets.json').write_text(json.dumps({'dockets': [{'pdf_links': [{'url': e['url']} for e in entries]}, {'pdf_links': [{'url': entries[0]['url']}]}]}))
    b.prepare(r, 1)
    first=(r/'batches/0001.json').read_bytes()
    b.prepare(r, 1)
    assert (r/'batches/0001.json').read_bytes() == first
    plan=json.loads((r/'batch-plan.json').read_text())
    assert plan['pdf_urls'] == 2 and len(plan['batches']) == 2
    assert json.loads(first)['entries'][0]['license']['redistribution'] == 'unknown'
    assert json.loads(first)['request_interval_ms'] >= 1000
    entries.append({'id': 'c', 'url': 'https://www.supremecourt.gov/c.pdf', 'media_type': 'application/pdf', 'license': {'redistribution': 'unknown'}})
    (r/'pdf-inventory.json').write_text(json.dumps({'entries': entries}))
    (r/'dockets.json').write_text(json.dumps({'dockets': [{'pdf_links': [{'url': e['url']} for e in entries]}]}))
    b.prepare(r, 1)
    assert (r/'batches/0001.json').read_bytes() == first
    assert json.loads((r/'batch-plan.json').read_text())['batches'][-1]['batch'] == '0003'
print('mirror checks passed')
