// Capture the actual local baseline; commit identity alone cannot describe dirty files.
import {resolve,relative} from 'node:path';
const sourceRoot=resolve(process.argv[2]??'/home/erik/Projects/tablespec');
const git=(args:string[])=>{const r=Bun.spawnSync(['git','-C',sourceRoot,...args]);if(r.exitCode)throw Error(r.stderr.toString());return r.stdout.toString().trim();};
const paths=['pyproject.toml','LICENSE','src/tablespec/models/umf.py','src/tablespec/type_mappings.py','src/tablespec/umf_loader.py','src/tablespec/umf_validator.py','src/tablespec/schemas/umf.schema.json','tests/unit/test_umf_models.py','tests/unit/test_umf_loader.py','tests/unit/test_umf_validator.py','examples/providers.yaml'];
for await(const p of new Bun.Glob('examples/synthea/umfs/providers/**/*.yaml').scan({cwd:sourceRoot}))paths.push(p);
const files=[];
for(const path of [...new Set(paths)].sort()){
 const source=resolve(sourceRoot,path);if(relative(sourceRoot,source).startsWith('..'))throw Error('Path leaves source');
 const data=await Bun.file(source).arrayBuffer(),target='native/tablespec/sources/'+path;
 await Bun.write(target,data);files.push({path:target,upstreamPath:path,sha256:new Bun.CryptoHasher('sha256').update(data).digest('hex'),worktreeStatus:git(['status','--porcelain','--',path])});
}
await Bun.write('native/tablespec/sources.json',JSON.stringify({sourceRoot,commit:git(['rev-parse','HEAD']),scope:'Local source snapshot for TableSpec schema ingestion; not an implemented adapter or compatibility claim',files},null,2)+'\n');
console.log({files:files.length,modified:files.filter(f=>f.worktreeStatus).length});
