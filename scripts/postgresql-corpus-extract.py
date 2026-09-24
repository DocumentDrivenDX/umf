"""Extract upstream C string literals using a C compiler, not an SQL splitter."""
import pathlib, tempfile, subprocess, json, hashlib
base=pathlib.Path('fixtures/postgresql/upstream')
with tempfile.TemporaryDirectory() as directory:
    source=pathlib.Path(directory)/'extract.c'
    source.write_text('#include <stdio.h>\n#include <string.h>\n#include "'+str((base/'deparse_tests.c').resolve())+'"\nint main(void){for(size_t i=0;i<sizeof(tests)/sizeof(tests[0]);i++){fwrite(tests[i],1,strlen(tests[i]),stdout);fputc(0,stdout);}return 0;}\n')
    binary=pathlib.Path(directory)/'extract'
    subprocess.run(['cc',str(source),'-o',str(binary)],check=True)
    raw=subprocess.check_output([str(binary)])
    assert raw.endswith(b'\0')
    cases=[{'id':f'deparse-{i+1:03d}','sql':sql.decode()} for i,sql in enumerate(raw[:-1].split(b'\0'))]
    (base/'deparse-cases.json').write_text(json.dumps(cases,indent=2,ensure_ascii=False)+'\n')
manifest={'repository':'https://github.com/pganalyze/libpg_query','tag':'17-6.1.0','commit':'1c1a32ed2f4c7799830d50bf4cb159222aafec48','source':'test/deparse_tests.c','cases':len(cases),'files':[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(base.iterdir()) if p.name!='manifest.json']}
(base/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Extracted {len(cases)} upstream deparser cases')
