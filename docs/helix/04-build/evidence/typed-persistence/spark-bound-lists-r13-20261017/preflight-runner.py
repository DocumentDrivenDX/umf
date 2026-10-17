import ast,hashlib,json,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);source=Path(sys.argv[2]);root.mkdir(exist_ok=True)
logical=(source/'logical.json').read_text();physical=(source/'physical.json').read_text();schema='sdk_list_preflight';sha=lambda s:hashlib.sha256(s.encode()).hexdigest();version=1
h=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/python/umf_access/tests/spark_list_e2e.py').read_text()
a=h.index('    binding = ');b=h.index('    checks = ',a);exec(h[a:b].strip(),globals())
a=h.index("        (root / 'raw-binding.json')");b=h.index('        for extra in ',a)
import textwrap
exec(textwrap.dedent(h[a:b]),globals())
for extra in ([],['--check']):
 p=subprocess.run([sys.executable,'-I','-B','-m','umf_access.build.catalog','catalog','--root',str(root),'--config',str(root/'config.json'),*extra],capture_output=True,text=True)
 (root/('catalog-check.log' if extra else 'catalog-build.log')).write_text(p.stdout+p.stderr)
 assert p.returncode==0,p.stdout+p.stderr
print('public CLI Spark list preflight PASS')
