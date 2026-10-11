"""Malformed guide sources must refuse in an isolated copy; the real worktree stays untouched."""
from pathlib import Path
import hashlib,json,shutil,subprocess,tempfile
repo=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='umf-guide-controls-') as temporary:
 root=Path(temporary)
 for name in ['docs/helix','scripts','src','spec','native/tablespec','fixtures/actions','patches']:
  shutil.copytree(repo/name,root/name)
 for name in ['package.json','bun.lock','tsconfig.json','.github/workflows/microsite.yml']:
  target=root/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(repo/name,target)
 (root/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
 command=['bun','scripts/actions-docs/build.ts','--check']
 positive=subprocess.run(command,cwd=root,capture_output=True,text=True)
 if positive.returncode:raise RuntimeError('Untouched build control failed:\n'+positive.stdout+positive.stderr)
 guide=root/'docs/helix/04-build/guides/actions/getting-started.md';original=guide.read_bytes()
 cases=[
  ('malformed-frontmatter',b'---\nunclosed: metadata\n'+original,'Unsupported guide frontmatter'),
  ('unsafe-html',original+b'\n<script>alert(1)</script>\n','Unsupported raw HTML'),
  ('unresolved-include',original+b'\n{{missing-include}}\n','Unresolved include'),
  ('unclosed-fence',original+b'\n```ts\nconst unfinished = 1;\n','Unclosed code fence'),
  ('unsafe-link',original+b'\n[unsafe](javascript:alert)\n','Unsafe link'),
  ('missing-repository-link',original+b'\n[missing](missing-source.ts)\n','Missing repository link'),
 ]
 results=[]
 for name,bytes_,diagnostic in cases:
  guide.write_bytes(bytes_);before=hashlib.sha256(guide.read_bytes()).hexdigest()
  result=subprocess.run(command,cwd=root,capture_output=True,text=True)
  assert result.returncode!=0 and diagnostic in result.stderr,(name,result.stdout,result.stderr)
  assert hashlib.sha256(guide.read_bytes()).hexdigest()==before,'Check modified source '+name
  results.append({'case':name,'refused':True,'sourceUnchanged':True,'diagnostic':diagnostic})
  guide.write_bytes(original)
 stale=root/'docs/helix/05-deploy/microsite/dist/actions/obsolete.html';stale.write_text('Unexpected stale output')
 result=subprocess.run(command,cwd=root,capture_output=True,text=True)
 assert result.returncode!=0 and 'Generated output ownership differs' in result.stderr,result.stderr
 assert stale.read_text()=='Unexpected stale output','Check repaired output'
 results.append({'case':'extra-generated-output','refused':True,'sourceUnchanged':True,'diagnostic':'Generated output ownership differs'})
 output=repo/'.cache/actions-documentation-build-controls.json';output.parent.mkdir(exist_ok=True)
 output.write_text(json.dumps({'profile':'umf.actions.documentation-build-controls/1','untouchedControlPassed':True,'isolatedCopy':True,'cases':results},indent=2)+'\n')
 print('Untouched build passes; all seven malformed-source/output controls refuse without repair')
