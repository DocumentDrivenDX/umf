import {createHash} from 'node:crypto';
const bundles:Record<string,{version:string;files:Record<string,string>}>=Object.create(null);
const evidence=[];
for(const name of ['http','rest','openapi','streams','graphql','json-schema','protobuf','versioning','openapi3','sse','events']){
 const packageName='@typespec/'+name;const root='node_modules/'+packageName;const pkg=await Bun.file(root+'/package.json').json();
 const files:Record<string,string>={'package.json':await Bun.file(root+'/package.json').text()};
 for await(const file of new Bun.Glob('lib/**/*.tsp').scan(root))files[file]=await Bun.file(root+'/'+file).text();
 if(await Bun.file(root+'/tspconfig.yaml').exists())files['tspconfig.yaml']=await Bun.file(root+'/tspconfig.yaml').text();
 bundles[packageName]={version:pkg.version,files};
 await Bun.write('spec/extensions/typespec/LICENSE.'+name,await Bun.file(root+'/LICENSE').text());
 evidence.push({package:packageName,version:pkg.version,source:'https://www.npmjs.com/package/'+packageName+'/v/'+pkg.version,license:pkg.license,files:Object.fromEntries(Object.entries(files).map(([path,text])=>[path,createHash('sha256').update(text).digest('hex')]))});
}
await Bun.write('spec/extensions/typespec/libraries.json',JSON.stringify(bundles,null,2)+'\n');
await Bun.write('spec/extensions/typespec/libraries-manifest.json',JSON.stringify(evidence,null,2)+'\n');
