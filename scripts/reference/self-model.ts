// SPDX-License-Identifier: MIT OR Apache-2.0
import {join} from 'node:path';
import type {SelfModelCatalog} from '../../docs/helix/05-deploy/reference/model';
import {rustReferenceSelfModel} from '../metamodel/rust';
import {sourceText,read,json} from './io';

export const modelPath='spec/metamodel/umf.yaml';

/** Return the document admitted from authored source; generated schemas are never source inputs. */
export async function expectedSelfModel():Promise<SelfModelCatalog['document']>{
 return (await loadSelfModel()).document;
}

export async function loadSelfModel(){
 const [modelText,manifest]=await Promise.all([sourceText(modelPath),read('spec/metamodel/generated/manifest.json')]);
 // Rust owns parsing, provenance admission and graph validation. This boundary
 // intentionally covers the authored string-ID profile; dynamic non-string
 // identifiers/reference targets remain an explicit refusal in Rust.
 return rustReferenceSelfModel(modelText,manifest) as SelfModelCatalog;
}

export async function buildSelfModel(stage:string){
 const catalog=await loadSelfModel();
 await Bun.write(join(stage,'metamodel.json'),json(catalog));
 await Bun.write(join(stage,'umf.yaml'),await sourceText(modelPath));
 await Bun.write(join(stage,'umf.json'),json(catalog.document));
}
if(import.meta.main){const catalog=await loadSelfModel();console.log(catalog.document.id);}
