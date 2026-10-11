"""A corrupted render must fail --check without being rewritten; untouched control passes."""
from pathlib import Path
import tempfile,shutil,subprocess,hashlib
repo=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='umf-diagram-drift-') as temporary:
 root=Path(temporary);target=root/'docs/helix/04-build/guides/actions/diagrams';target.parent.mkdir(parents=True)
 shutil.copytree(repo/'docs/helix/04-build/guides/actions/diagrams',target)
 renderer=repo/'scripts/actions-docs/render-diagrams.py'
 subprocess.run(['python3',str(renderer),'--check'],cwd=root,check=True)
 changed=target/'retry-mobile.svg';changed.write_text(changed.read_text().replace('Response lost','Response acknowledged'))
 before=hashlib.sha256(changed.read_bytes()).hexdigest()
 result=subprocess.run(['python3',str(renderer),'--check'],cwd=root,capture_output=True,text=True)
 assert result.returncode!=0 and 'Stale diagram' in result.stderr
 assert hashlib.sha256(changed.read_bytes()).hexdigest()==before,'Check silently repaired drift'
 print('Render-drift negative control rejected; check left corrupted bytes unchanged')
