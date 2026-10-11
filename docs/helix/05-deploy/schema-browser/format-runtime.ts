let yaml:any;let initialization:Promise<any>|undefined;
export function ensureYaml(){return initialization??= (async()=>{const loaded=await import('yaml');const native=await import('../../../../src/model/native-json');const serial=await import('../../../../src/model/serialization');(native as any).configureYaml?.(loaded);(serial as any).configureYaml?.(loaded);yaml=loaded;return yaml;})();}
export function pretty(value:unknown){return yaml?yaml.stringify(value,{aliasDuplicateObjects:false,lineWidth:0}).trimEnd():JSON.stringify(value,null,2);}
export async function yamlSource(text:string){const y=await ensureYaml();return y.parseDocument(text,{intAsBigInt:true}).toString({collectionStyle:'block',lineWidth:0});}
