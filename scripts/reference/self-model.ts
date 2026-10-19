import {join} from 'node:path';
import {parse} from 'yaml';
import {selfModelGraph,type SelfModelCatalog} from '../../docs/helix/05-deploy/reference/model';
import {source,text,read,json} from './io';

export const modelPath='spec/metamodel/umf.yaml';

/** Parse the authored language definition directly; generated schemas are outputs, never source inputs. */
export async function expectedSelfModel():Promise<SelfModelCatalog['document']>{
 const document=parse(await text(modelPath));
 if(document.umf!=='0.10.0'||document.id!=='urn:umf:metamodel')throw Error('SELF_MODEL_SOURCE unexpected authored metamodel identity');
 return document;
}

export async function loadSelfModel(){
 const [document,manifest]=await Promise.all([expectedSelfModel(),read('spec/metamodel/generated/manifest.json')]);
 const modelSource=await source(modelPath);
 if(manifest.profile!=='umf.metamodel.outputs/1'||manifest.sources?.[modelPath]!==modelSource.sha256
   ||manifest.provenance?.modelSha256!==modelSource.sha256)throw Error('SELF_MODEL_PROVENANCE authored model/compiler manifest mismatch');
 const catalog:SelfModelCatalog={profile:'umf.metamodel/1',document:document as any,sources:[modelSource],provenance:manifest.provenance};
 selfModelGraph(catalog);
 return catalog;
}

export async function buildSelfModel(stage:string){
 const catalog=await loadSelfModel();
 await Bun.write(join(stage,'metamodel.json'),json(catalog));
 await Bun.write(join(stage,'umf.yaml'),await text(modelPath));
 await Bun.write(join(stage,'umf.json'),json(catalog.document));
}
if(import.meta.main){const catalog=await loadSelfModel();console.log(catalog.document.id);}
