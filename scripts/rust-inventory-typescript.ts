// SPDX-License-Identifier: MIT OR Apache-2.0
/** Compiler-backed TypeScript export/import census helper for rust-inventory.py. */
import ts from 'typescript-api';
import {resolve,relative} from 'node:path';

const root=resolve(import.meta.dir,'..');
const configPath=ts.findConfigFile(root,ts.sys.fileExists,'tsconfig.json');
if(!configPath)throw new Error('tsconfig.json not found');
const config=ts.readConfigFile(configPath,ts.sys.readFile);
if(config.error)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root,{noEmit:true});
const codeDirs=['scripts','tests','tools','docs/helix/05-deploy/schema-browser','bindings'];
const files=[...new Set([...parsed.fileNames,...codeDirs.flatMap(dir=>
  ts.sys.readDirectory(resolve(root,dir),['.ts','.tsx','.js','.mjs','.cjs']))])];
const program=ts.createProgram({rootNames:files,options:{...parsed.options,noEmit:true,allowJs:true,checkJs:false}});
const checker=program.getTypeChecker();
const out:Record<string,{publicExports:string[];imports:string[];resolvedImports:string[]}>={};
for(const source of program.getSourceFiles()){
  const abs=resolve(source.fileName);
  if(!abs.startsWith(root+'/')||abs.includes('/node_modules/'))continue;
  const imports:string[]=[],resolvedImports:string[]=[];
  for(const statement of source.statements){
    let specifier:ts.Expression|undefined;
    if(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))specifier=statement.moduleSpecifier;
    else if(ts.isImportEqualsDeclaration(statement)&&ts.isExternalModuleReference(statement.moduleReference))specifier=statement.moduleReference.expression;
    if(specifier&&ts.isStringLiteral(specifier)){
      imports.push(specifier.text);
      const resolution=ts.resolveModuleName(specifier.text,source.fileName,program.getCompilerOptions(),ts.sys).resolvedModule;
      if(resolution)resolvedImports.push(relative(root,resolve(resolution.resolvedFileName)).replaceAll('\\','/'));
    }
  }
  const symbol=checker.getSymbolAtLocation(source);
  const exports=symbol?checker.getExportsOfModule(symbol).map(s=>s.getName()).sort():[];
  out[relative(root,abs).replaceAll('\\','/')]={publicExports:exports,imports:[...new Set(imports)].sort(),resolvedImports:[...new Set(resolvedImports)].sort()};
}
console.log(JSON.stringify({typescriptVersion:ts.version,files:out}));
