#!/usr/bin/env python3
"""Explicit local Supreme Court discovery consumer; CONTRACT-060 1.0.0."""
import argparse
from collections import Counter
import hashlib
import io
import json
import fcntl
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

BASE = 'https://www.supremecourt.gov'
AGENT = 'UMF-SupremeCourtMirror/1.0.0'
LISTS = {2024: BASE + '/orders/24grantednotedlist.pdf', 2026: BASE + '/orders/26grantednotedlist.pdf'}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write_json(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)

def safe_url(url):
    u = urllib.parse.urlsplit(url)
    if u.scheme != 'https' or u.hostname != 'www.supremecourt.gov' or u.username or u.password or u.port not in (None, 443):
        raise ValueError('URL_SCOPE')
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, u.query, ''))

class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl)
        # Refuse redirects so pacing/robots are checked before every request.
        raise ValueError('REDIRECT_REQUIRES_REVIEW')

class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def text(self):
        return ' '.join(' '.join(c.text() if isinstance(c, Node) else c for c in self.children).split())
    def find(self, predicate):
        result = [self] if predicate(self) else []
        for c in self.children:
            if isinstance(c, Node):
                result.extend(c.find(predicate))
        return result

class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {'meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'col'}:
            self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag:
            self.stack.pop()
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break
    def handle_data(self, data):
        if self.stack[-1].tag not in {'script', 'style'}:
            self.stack[-1].children.append(data)

def class_has(node, value):
    return value in node.attrs.get('class', '').split()

def pdf_links(node, url):
    links = {}
    for a in node.find(lambda n: n.tag == 'a' and 'href' in n.attrs):
        candidate = urllib.parse.urljoin(url, a.attrs['href'])
        if urllib.parse.urlsplit(candidate).path.lower().endswith('.pdf'):
            links.setdefault(candidate, {'url': candidate, 'label': a.text(), 'in_scope': True})
            try:
                safe_url(candidate)
            except ValueError:
                links[candidate]['in_scope'] = False
    return list(links.values())

def parse_docket(data, case, url):
    parser = Tree()
    parser.feed(data.decode('utf-8-sig', errors='strict'))
    root = parser.root
    titles = root.find(lambda n: n.tag == 'title')
    if not titles or not re.search(r'\b' + re.escape(case) + r'\b', titles[0].text()):
        raise ValueError('DOCKET_IDENTITY')
    if not root.find(lambda n: n.attrs.get('id') == 'docketinfo'):
        raise ValueError('DOCKET_LAYOUT')
    metadata = {n.attrs['name']: n.attrs.get('content', '') for n in root.find(lambda n: n.tag == 'meta' and 'name' in n.attrs)}
    proceedings = []
    for item in root.find(lambda n: class_has(n, 'ProceedingItem')):
        cells = item.find(lambda n: n.tag == 'td')
        dates = item.find(lambda n: class_has(n, 'ProceedingDate'))
        if len(cells) < 2 or len(dates) != 1:
            raise ValueError('PROCEEDING_LAYOUT')
        text = cells[1].text()
        lower = text.lower()
        status = 'not_accepted' if 'not accepted for filing' in lower else 'submitted' if 'submitted' in lower else 'filed' if re.search(r'\bfiled\b', lower) else 'unknown'
        proceedings.append({'date_text': dates[0].text(), 'text': text, 'filing_status': status, 'pdf_links': pdf_links(item, url)})
    if not proceedings:
        raise ValueError('PROCEEDINGS_MISSING')
    contacts = root.find(lambda n: n.attrs.get('id') == 'Contacts')
    counsel = []
    if contacts:
        for card in contacts[0].find(lambda n: class_has(n, 'card')):
            names = card.find(lambda n: class_has(n, 'ContactName'))
            heading = card.find(lambda n: class_has(n, 'card-heading'))
            if names:
                # Preserve whole card evidence; do not guess person-to-party alignment.
                counsel.append({'side_text': heading[0].text() if heading else '', 'names_text': [n.text() for n in names], 'source_text': card.text()})
    return {'case_number': case, 'source_url': url, 'source_sha256': digest(data), 'metadata': metadata,
            'proceedings': proceedings, 'counsel': counsel, 'counsel_status': 'observed_source_text' if counsel else 'not_available_in_parsed_contacts',
            'pdf_links': pdf_links(root, url), 'extraction': 'lossy_text_original_html_authoritative'}

def compare_dockets(previous, current):
    """Describe changes without deciding that removed entries were withdrawn."""
    if previous is None:
        return {'kind': 'initial_snapshot', 'case_number': current['case_number'], 'sha256': current['source_sha256']}
    old = Counter(json.dumps(p, sort_keys=True) for p in previous['proceedings'])
    new = Counter(json.dumps(p, sort_keys=True) for p in current['proceedings'])
    added = [json.loads(p) for p, count in (new-old).items() for _ in range(count)]
    missing = [json.loads(p) for p, count in (old-new).items() for _ in range(count)]
    semantic = any(previous[k] != current[k] for k in ['metadata', 'proceedings', 'counsel', 'pdf_links'])
    return {'kind': 'semantic_change' if semantic else 'unchanged_projection', 'case_number': current['case_number'],
            'prior_sha256': previous['source_sha256'], 'sha256': current['source_sha256'],
            'added_proceedings': added, 'missing_from_latest_snapshot': missing,
            'counsel_changed': previous['counsel'] != current['counsel']}

def case_ids_from_text(text):
    return sorted(set(re.findall(r'(?m)^\s*(\d{2}(?:-\d+|[AO]\d+))\b', text)))

def case_numbers(data):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    # Include consolidated cases; recognize regular, application and original numbers.
    cases = case_ids_from_text(text)
    if not cases:
        raise ValueError('LIST_CASES_MISSING')
    return cases

class Archive:
    def __init__(self, root, refresh=False):
        self.root, self.refresh = Path(root), refresh
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / 'objects').mkdir(exist_ok=True)
        self.latest = json.loads((self.root / 'latest.json').read_text()) if (self.root / 'latest.json').exists() else {}
        self.last_request = 0
        self.robots = None
        self.interval = 1.0
        self.opener = urllib.request.build_opener(Redirect())
    def object(self, sha):
        data = (self.root / 'objects' / sha).read_bytes()
        if digest(data) != sha:
            raise ValueError('OBJECT_HASH')
        return data
    def event(self, row):
        with (self.root / 'observations.jsonl').open('a') as f:
            f.write(json.dumps(row) + '\n')
    def get(self, url, pdf=False):
        url = safe_url(url)
        if not self.refresh and url in self.latest:
            return self.object(self.latest[url]['sha256'])
        observation = {'url': url, 'retrieved_at': datetime.now(timezone.utc).isoformat()}
        try:
            if self.robots and not self.robots.can_fetch(AGENT, url):
                raise ValueError('ROBOTS_DISALLOW')
            time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            request = urllib.request.Request(url, headers={'User-Agent': AGENT})
            with self.opener.open(request, timeout=30) as response:
                data = response.read(12 * 1024 * 1024 + 1)
                if len(data) > 12 * 1024 * 1024:
                    raise ValueError('BYTE_LIMIT')
                if pdf and not data.startswith(b'%PDF-'):
                    raise ValueError('PDF_SIGNATURE')
            sha = digest(data)
            (self.root / 'objects' / sha).write_bytes(data)
            observation.update(status='complete', sha256=sha, bytes=len(data))
            self.latest[url] = observation
            write_json(self.root / 'latest.json', self.latest)
            self.event(observation)
            return data
        except Exception as error:
            observation.update(status='failed', error=str(error))
            self.event(observation)
            raise
    def policy(self):
        robots = self.get(BASE + '/robots.txt')
        self.robots = urllib.robotparser.RobotFileParser()
        self.robots.parse(robots.decode().splitlines())
        self.interval = max(1, self.robots.crawl_delay(AGENT) or 1)

def discover(archive):
    records, failures = {}, []
    for term, url in LISTS.items():
        try:
            data = archive.get(url, pdf=True)
            for case in case_numbers(data):
                records.setdefault(case, {'case_number': case, 'discovery': []})['discovery'].append({'term': term, 'url': url, 'sha256': digest(data)})
        except Exception as error:
            failures.append({'term': term, 'url': url, 'error': str(error)})
    result = {'version': '1.0.0', 'scope': '2024_and_2026_granted_noted_lists_only', 'all_cases_complete': False,
              'cases': list(records.values()), 'failures': failures}
    write_json(archive.root / 'cases.json', result)
    return bool(failures)

def inventory(archive):
    cases = json.loads((archive.root / 'cases.json').read_text())
    coverage_path = archive.root / 'coverage.json'
    existing_coverage = json.loads(coverage_path.read_text()) if coverage_path.exists() else {}
    pdf_coverage = {k: v for k, v in existing_coverage.items() if k in ['acquired_pdf_urls', 'pending_pdf_urls', 'unattempted_pdf_urls', 'pdf_bytes', 'successful_pdf_batches', 'failed_pdf_batches', 'pdf_coverage_note']}
    prior_path = archive.root / 'dockets.json'
    prior = {d['case_number']: d for d in json.loads(prior_path.read_text())['dockets']} if prior_path.exists() else {}
    dockets, failures, entries, excluded = [], [], {}, []
    for case in cases['cases']:
        number = case['case_number']
        url = BASE + '/docket/docketfiles/html/public/' + number + '.html'
        try:
            docket = parse_docket(archive.get(url), number, url)
            change = compare_dockets(prior.get(number), docket)
            change['observed_at'] = datetime.now(timezone.utc).isoformat()
            with (archive.root / 'changes.jsonl').open('a') as stream:
                stream.write(json.dumps(change) + '\n')
            dockets.append(docket)
            for link in docket['pdf_links']:
                if not link['in_scope']:
                    excluded.append({'case_number': number, **link})
                    continue
                entry = entries.setdefault(link['url'], {'id': 'pdf-' + digest(link['url'].encode()), 'url': link['url'],
                    'media_type': 'application/pdf', 'license': {'redistribution': 'unknown', 'notices': ['Publicly accessible; reuse rights not assessed. Local-use only.']},
                    'metadata': {'case_numbers': [], 'labels': []}})
                if number not in entry['metadata']['case_numbers']:
                    entry['metadata']['case_numbers'].append(number)
                if link['label'] not in entry['metadata']['labels']:
                    entry['metadata']['labels'].append(link['label'])
            print(number, len(docket['proceedings']), len(docket['pdf_links']), flush=True)
        except Exception as error:
            failures.append({'case_number': number, 'url': url, 'error': str(error)})
            print(number, 'FAILED', str(error), flush=True)
        # Persist per case so interruption leaves reviewable progress.
        write_json(archive.root / 'dockets.json', {'version': '1.0.0', 'dockets': dockets, 'failures': failures})
        write_json(archive.root / 'pdf-inventory.json', {'version': '1.0.0', 'entries': list(entries.values()), 'excluded_links': excluded})
        write_json(archive.root / 'coverage.json', {'scope': cases['scope'], 'all_cases_complete': False,
            'expected_cases': len(cases['cases']), 'successful_dockets': len(dockets), 'failed_dockets': failures,
            'unattempted_dockets': len(cases['cases']) - len(dockets) - len(failures), 'discovered_pdf_urls': len(entries),
            'pdf_acquisition': 'separate_shared_companion_receipts', **(pdf_coverage if len(dockets) + len(failures) == len(cases['cases']) and len(entries) == existing_coverage.get('discovered_pdf_urls') else {}), 'excluded_populations': ['ungranted_petitions', 'applications_not_in_lists', 'other_cases_not_in_lists', 'sealed_or_unposted_documents']})
    return bool(failures or cases['failures'])

def check(archive):
    for row in archive.latest.values():
        archive.object(row['sha256'])
    cases = json.loads((archive.root / 'cases.json').read_text())
    derived = set()
    for url in LISTS.values():
        if url in archive.latest:
            derived.update(case_numbers(archive.object(archive.latest[url]['sha256'])))
    assert derived == {c['case_number'] for c in cases['cases']}, 'CASE_RECOVERY'
    dockets = json.loads((archive.root / 'dockets.json').read_text())
    for docket in dockets['dockets']:
        assert parse_docket(archive.object(docket['source_sha256']), docket['case_number'], docket['source_url']) == docket, 'DOCKET_RECOVERY'
    print(json.dumps({'verified_objects': len(archive.latest), 'verified_dockets': len(dockets['dockets']), 'discovery_cases': len(derived)}))
    return False

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--phase', choices=['discover', 'inventory', 'check'], required=True)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    archive = Archive(args.root, args.refresh)
    with (archive.root / 'collector.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('COLLECTOR_BUSY')
        if args.phase != 'check':
            archive.policy()
        return int({'discover': discover, 'inventory': inventory, 'check': check}[args.phase](archive))

if __name__ == '__main__':
    raise SystemExit(main())
