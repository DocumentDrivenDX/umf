// SPDX-License-Identifier: MIT OR Apache-2.0
import {join,relative,resolve} from 'node:path';
import {verifyPackage} from '../schema-browser-integrity';
import {verifySiteAssets} from '../../docs/helix/05-deploy/schema-browser/site-assets';

export function rendererArguments(args:readonly string[]){
 let check=false,candidate:string|undefined;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--check'&&!check){check=true;continue;}
  if(arg==='--candidate'&&!candidate&&args[i+1]&&!args[i+1]!.startsWith('--')){candidate=resolve(args[++i]!);continue;}
  throw Error('REFERENCE_INPUT use --check and/or --candidate <verified-package-directory>');
 }
 return {check,candidate};
}

/** Preview the exact verified package mounted by publish-site --candidate.
 * Default builds continue to consume the exact installed release pin. */
export async function rendererPackage(root:string,site:string,candidate?:string){
 const installed=join(root,'node_modules/@documentdrivendx/umf-schema-browser');
 if(!candidate){
  const pin=(await Bun.file(join(root,'package.json')).json()).devDependencies['@documentdrivendx/umf-schema-browser'];
  const metadata=await Bun.file(join(installed,'package.json')).json();
  if(!/^\d+\.\d+\.\d+$/.test(pin)||metadata.name!=='@documentdrivendx/umf-schema-browser'||metadata.version!==pin)throw Error('REFERENCE_RENDERER differs from the exact installed release pin');
  await verifyPackage(installed);return {path:relative(root,installed),preview:false};
 }
 const expected=(await Bun.file(join(root,'docs/helix/05-deploy/schema-browser/package.json')).json()).version;
 const metadata=await Bun.file(join(candidate,'package.json')).json();
 if(metadata.name!=='@documentdrivendx/umf-schema-browser'||metadata.version!==expected)throw Error('REFERENCE_RENDERER candidate differs from the authored renderer release identity');
 const receipt=await Bun.file(join(site,'schema-browser-release.json')).json();
 if(receipt.profile!=='umf.schema-browser.local-preview/1'||receipt.published!==false)throw Error('REFERENCE_RENDERER candidate requires an explicitly unpublished local preview mount');
 const verified=await verifySiteAssets(candidate,site,expected);
 const inventory=(value:Record<string,string>)=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
 if(receipt.package!==verified.package||receipt.version!==verified.version||!receipt.assets||inventory(receipt.assets)!==inventory(verified.assets))throw Error('REFERENCE_RENDERER preview receipt does not identify the verified mounted package');
 // published:false is a local staging declaration, not a registry observation.
 return {path:relative(root,join(site,'schema-browser')),preview:true};
}

export function assertRendererInputs(inputs:readonly {path:string;sha256:string}[],packagePath:string,expected:Record<string,string>){
 for(const [name,hash] of Object.entries(expected))if(inputs.find(input=>input.path===packagePath+'/'+name)?.sha256!==hash)throw Error('REFERENCE_RENDERER host does not bind the verified renderer resource '+name);
}

/** Bind the canonical host's generated provenance and executable/style bytes to
 * the actual renderer package, in addition to checking the copied package. */
export async function verifyRendererHost(root:string,site:string,packagePath:string){
 const base=join(site,'reference'),manifestFile=Bun.file(join(base,'manifest.json'));
 const manifestBytes=await manifestFile.bytes(),manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
 const hash=(bytes:Uint8Array)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
 const expected:Record<string,string>={};
 for(const name of ['index.js','assets/components.css'])expected[name]=hash(await Bun.file(join(root,packagePath,name)).bytes());
 assertRendererInputs(manifest.inputs,packagePath,expected);
 const sri:Record<string,string>={};
 for(const name of ['assets/reference.js','assets/reference.css']){
  const bytes=await Bun.file(join(base,name)).bytes();
  if(manifest.outputs.find((output:{path:string})=>output.path===name)?.sha256!==hash(bytes))throw Error('REFERENCE_RENDERER altered canonical host asset '+name);
  sri[name]='sha256-'+Buffer.from(hash(bytes),'hex').toString('base64');
 }
 const html=await Bun.file(join(base,'core.html')).text();
 if(!html.includes(hash(manifestBytes))||!Object.values(sri).every(value=>html.includes('integrity="'+value+'"')))throw Error('REFERENCE_RENDERER canonical host is detached from its verified asset manifest');
 return {packagePath,resources:expected,hostAssets:sri};
}

if(import.meta.main){const root=resolve(import.meta.dir,'../..'),site=join(root,'docs/helix/05-deploy/microsite/dist');const {candidate}=rendererArguments(Bun.argv.slice(2));const renderer=await rendererPackage(root,site,candidate);console.log(await verifyRendererHost(root,site,renderer.path));}
