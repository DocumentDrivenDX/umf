/** Authored selected-Key metadata fixture; no native graph acceptance claim. */
import {generateAccessPackage} from '../src/compilation/index';
import {profile,request} from '../tests/compilation/access-fixtures';
const output=process.argv[2];if(!output)throw Error('output directory required');
const req=request();req.sources=[{id:'logical',format:'json',text:await Bun.file(new URL('../tests/compilation/fixtures/many-navigation.json',import.meta.url)).text()}];req.records=[{module:'sales',element:'order'},{module:'sales',element:'customer'}];req.package='many_keys';
const pinned=profile();pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:'0.1.0.dev0'}:d);
const result=generateAccessPackage(req,pinned);if(result.outcome!=='candidate')throw Error(JSON.stringify(result.diagnostics));
for(const file of result.files)await Bun.write(`${output}/${file.path}`,file.text);
