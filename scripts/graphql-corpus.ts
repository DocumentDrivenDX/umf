// Extract static literal inputs without executing upstream test code.
import ts from 'typescript-api';
const path='fixtures/graphql/upstream/src/language/__tests__/schema-parser-test.ts';
const source=ts.createSourceFile(path,await Bun.file(path).text(),ts.ScriptTarget.Latest,true);
const cases:{line:number;syntaxValid:boolean;text:string}[]=[];const skipped:number[]=[];
function literal(node:ts.Node|undefined):string|undefined {
 if(!node)return;
 if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
 if(ts.isTaggedTemplateExpression(node)&&node.tag.getText(source)==='dedent'&&ts.isNoSubstitutionTemplateLiteral(node.template))return node.template.text;
}
function visit(node:ts.Node){
 if(ts.isCallExpression(node)&&['parse','expectSyntaxError'].includes(node.expression.getText(source))){
  const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
  const text=literal(node.arguments[0]);
  if(text===undefined)skipped.push(line);else cases.push({line,syntaxValid:node.expression.getText(source)==='parse',text});
 }
 ts.forEachChild(node,visit);
}
visit(source);
await Bun.write('fixtures/graphql/parser-cases.json',JSON.stringify({source:'src/language/__tests__/schema-parser-test.ts',method:'Direct static string/template arguments, including dedent tags without evaluation; dynamic references excluded with line numbers',skippedLines:skipped,cases},null,2)+'\n');
console.log({cases:cases.length,skipped:skipped.length});
const kitchenPath='fixtures/graphql/upstream/src/__testUtils__/kitchenSinkSDL.ts';
const kitchen=ts.createSourceFile(kitchenPath,await Bun.file(kitchenPath).text(),ts.ScriptTarget.Latest,true);
let kitchenText:string|undefined;
function kitchenVisit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(kitchen)==='kitchenSinkSDL')kitchenText=literal(node.initializer);ts.forEachChild(node,kitchenVisit);}
kitchenVisit(kitchen);if(kitchenText===undefined)throw new Error('Static kitchenSinkSDL not found');
await Bun.write('fixtures/graphql/kitchen-sink-sdl.graphql',kitchenText);
