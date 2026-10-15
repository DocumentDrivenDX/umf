"""Scoped structure check for the typed data access SDK specifications.

Compares the working tree with the merge base of HEAD and origin/main (or the
ref given as the first argument), so every artifact added on the branch is
checked, whether committed or not.
"""
from pathlib import Path
import subprocess, re, json, sys

root = Path(__file__).resolve().parents[5]
def git(*args): return subprocess.check_output(['git', *args], cwd=root, text=True)

base = git('merge-base', 'HEAD', sys.argv[1] if len(sys.argv) > 1 else 'origin/main').strip()
status = [l.split('\t') for l in git('diff', '--name-status', '-M', base).splitlines()]
added = {s[-1] for s in status if s[0][0] in 'AR'}
modified = {s[-1] for s in status if s[0][0] == 'M'}
added |= set(git('ls-files', '--others', '--exclude-standard').splitlines())
def docs(names): return sorted(root / p for p in names if p.startswith('docs/helix/') and p.endswith('.md'))
newpaths, modpaths = docs(added), docs(modified)

errors, ids, newids, acs, count = [], {}, {}, {}, 0
for p in (root / 'docs/helix').rglob('*.md'):
    if '/evidence/' in str(p) or '/spikes/' in str(p): continue
    m = re.match(r'---\n(.*?)\n---', p.read_text(), re.S)
    if m and (i := re.search(r'^  id: (.+)$', m[1], re.M)): ids.setdefault(i[1], []).append(p)

required = {
    'feature-specification': ['Problem Statement', 'Requirements', 'Edge Cases and Error Handling', 'Success Metrics', 'Constraints and Assumptions', 'Out of Scope'],
    'user-stories': ['Story', 'Context', 'Walkthrough', 'Acceptance Criteria', 'Edge Cases', 'Test Scenarios', 'Dependencies'],
    'adr': ['Problem', 'Decision', 'Why We Chose This', 'Consequences'],
    'contract': ['Purpose', 'Scope and Boundaries', 'Normative Surface', 'Precedence and Compatibility', 'Error Semantics', 'Examples'],
    'solution-design': ['Scope', 'Requirements Mapping', 'Solution Approaches', 'Domain Model', 'System Decomposition', 'Traceability', 'Concern Alignment', 'Constraints & Assumptions', 'Risks'],
    'technical-design': ['Technical Approach', 'Component Changes', 'Testing', 'Security', 'Migration & Rollback'],
    'story-test-plan': ['Story Reference', 'Scope and Objective', 'Acceptance Criteria Test Mapping', 'Executable Proof', 'Data and Setup', 'Build Handoff'],
    'implementation-plan': ['Scope', 'Implementation Slices', 'Execution Contract', 'Continuation Evidence', 'Exit Criteria', 'Validation Plan', 'Risks and Rollbacks'],
}
for p in newpaths:
    text = p.read_text(); fm = re.match(r'---\n(.*?)\n---', text, re.S)
    if not fm:
        if '/evidence/' not in str(p): errors.append(str(p.relative_to(root)) + ' missing frontmatter')
        continue
    id = re.search(r'^  id: (.+)$', fm[1], re.M).group(1); newids[id] = p
    if len(ids.get(id, [])) != 1: errors.append(id + ' duplicate ID')
    typ = re.search(r'^  type: (.+)$', fm[1], re.M).group(1)
    for heading in required.get(typ, []):
        if not re.search(r'^## ' + re.escape(heading) + r'\s*$', text, re.M): errors.append(id + ' missing section ' + heading)
    if typ == 'user-stories':
        a = re.findall(r'^- \[ \] \*\*(US-\d+-AC\d+)\*\*', text, re.M); acs[id] = a
        if not a: errors.append(id + ' has no ACs')
    for linked in re.findall(r'^    - id: (.+)$', fm[1], re.M):
        if linked not in ids: errors.append(id + ' unresolved ddx link ' + linked)

for p in newpaths + modpaths:
    for target in re.findall(r'(?<!!)\[[^\]]*\]\(([^)]+)\)', p.read_text()):
        if re.match(r'^[a-z][a-z+.-]*:', target) or target.startswith('#'): continue
        target = target.split('#')[0]
        if target and not (p.parent / target).resolve().exists():
            errors.append(str(p.relative_to(root)) + ' broken local link ' + target)

for us, a in acs.items():
    n = us.split('-')[1]
    td = next((root / 'docs/helix/02-design/technical-designs').glob('TD-' + n + '-*.md'), None)
    stp = next((root / 'docs/helix/03-test/test-plans').glob('STP-' + n + '-*.md'), None)
    if not td or not stp: errors.append(us + ' missing TD or STP'); continue
    td, stp = td.read_text(), stp.read_text()
    for ac in a:
        count += 1
        if ac not in td or '@covers ' + ac not in stp: errors.append(ac + ' incomplete TD/STP trace')

for p in modpaths:
    name = str(p.relative_to(root))
    before = git('show', base + ':' + name)
    a = re.match(r'---\n.*?\n---', before, re.S); b = re.match(r'---\n.*?\n---', p.read_text(), re.S)
    if a and (not b or a[0] != b[0]): errors.append(name + ' changed existing frontmatter')

report = {
    'kind': 'scoped-design-structure', 'base': base, 'status': 'pass' if not errors else 'fail',
    'newArtifacts': len(newpaths), 'modifiedDocuments': len(modpaths), 'newArtifactIds': sorted(newids),
    'acceptanceCriteria': count,
    'checks': ['new ID uniqueness outside historical evidence/spikes', 'required sections', 'new ddx link resolution',
               'local Markdown links in new and modified documents', 'all ACs referenced by TD and cited in STP',
               'frontmatter of pre-existing documents unchanged since base'],
    'errors': errors,
    'limitations': ['Text/structure checks do not establish semantic correctness, implementation, native acceptance or actual test coverage.',
                    'Existing unrelated documentation inconsistencies excluded.'],
}
print(json.dumps(report, indent=2))
(Path(__file__).parent / 'structure-check.json').write_text(json.dumps(report, indent=2) + '\n')
raise SystemExit(bool(errors))
