// SPDX-License-Identifier: MIT OR Apache-2.0
// Build-only AST transformer for the exact Ajv standalone output. This module
// is intentionally not imported by application code and is not run here.
import ts from 'typescript-api';
import {createHash} from 'node:crypto';

const GENERATED_SOURCE_SHA256='88e4252883b595782c01d6b63fd86e7a5ba8492aa4fec953a628e32a051bbbc4';
const EXPECTED_VALIDATORS={checkCore:'validate20',checkSemanticTypeReference:'validate44',checkPackage:'validate57',checkCoreLiteral:'validate58',checkSemanticTypeReferences:'validate61'} as const;
const ACCOUNTING_PATH='/generated/core';
let generatedCallableNames=new Set<string>();
let activeTransformationContext:ts.TransformationContext|undefined;
function fail(code:string,detail:string):never{throw new Error(`STRUCTURAL_ACCOUNTING_${code}:${detail}`);}
function sha256(text:string):string{return createHash('sha256').update(text,'utf8').digest('hex');}
function literal(node:ts.Expression):unknown{
 if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
 if(ts.isNumericLiteral(node))return Number(node.text);
 if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
 if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
 if(node.kind===ts.SyntaxKind.NullKeyword)return null;
 if(ts.isArrayLiteralExpression(node))return node.elements.map((item)=>{if(ts.isSpreadElement(item))fail('SCHEMA_SPREAD',item.getText());return literal(item as ts.Expression);});
 if(ts.isObjectLiteralExpression(node)){
  const result:Record<string,unknown>={};
  for(const property of node.properties){
   if(!ts.isPropertyAssignment(property)||(!ts.isIdentifier(property.name)&&!ts.isStringLiteral(property.name)))fail('SCHEMA_PROPERTY',property.getText());
   const key=ts.isIdentifier(property.name)?property.name.text:property.name.text;
   result[key]=literal(property.initializer);
  }
  return result;
 }
 fail('SCHEMA_LITERAL',node.getText());
}
function propertyString(value:unknown,key:string):string|undefined{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&typeof (value as Record<string,unknown>)[key]==='string'?(value as Record<string,string>)[key]:undefined;}
function nameOf(node:ts.Expression):string{
 if(ts.isIdentifier(node))return node.text;
 if(ts.isPropertyAccessExpression(node))return `${nameOf(node.expression)}.${node.name.text}`;
 if(ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression))return `${nameOf(node.expression)}.${node.argumentExpression.text}`;
 return '<dynamic-callee>';
}
const KNOWN_DIRECT_CALLS=new Set([
 'Array.isArray','Object.assign','Object.keys','JSON.stringify','RegExp','Set','isNaN','isFinite',
 'str.charCodeAt',
 'func0.call','func27','func72','canonicalJson','wrapper0.validate','wrapper2.validate',
 ...Object.keys(EXPECTED_VALIDATORS).map((key)=>EXPECTED_VALIDATORS[key as keyof typeof EXPECTED_VALIDATORS]),
]);
function callKind(node:ts.CallExpression):string{
 const callee=nameOf(node.expression);
 if(callee.endsWith('.push'))return 'push';
 if(callee.endsWith('.concat'))return 'concat';
 if(callee.endsWith('.map'))return 'map';
 if(callee.endsWith('.some'))return 'some';
 if(callee.endsWith('.join'))return 'join';
 if(callee.endsWith('.sort'))return 'sort';
 if(callee.endsWith('.replace'))return 'replace';
 if(callee.endsWith('.test'))return 'test';
 if(KNOWN_DIRECT_CALLS.has(callee)||generatedCallableNames.has(callee))return 'direct';
 fail('UNKNOWN_CALL',callee);
}
function asStatement(expression:ts.Expression):ts.Statement{return ts.factory.createExpressionStatement(expression);}
function id(text:string):ts.Identifier{return ts.factory.createIdentifier(text);}
function str(text:string):ts.StringLiteral{return ts.factory.createStringLiteral(text);}
function callAccount(method:string,args:ts.Expression[]=[]):ts.CallExpression{return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(id('account'),method),undefined,args);}
function visitEachChild<T extends ts.Node>(node:T,visitor:ts.Visitor):T{
 if(!activeTransformationContext)fail('TRANSFORM_CONTEXT','visitor called outside the pinned TypeScript transform');
 return ts.visitEachChild(node,visitor,activeTransformationContext);
}
function marked(expression:ts.Expression,category:string,count?:ts.Expression):ts.Expression{
 const args=[str(category),str(ACCOUNTING_PATH),...(count?[count]:[])];
 return ts.factory.createParenthesizedExpression(ts.factory.createCommaListExpression([callAccount('visit',args),expression]));
}
function blockWithPrefix(statement:ts.Statement,category:string):ts.Block{
 const original=ts.isBlock(statement)?statement:ts.factory.createBlock([statement],true);
 const statements:ts.Statement[]=[asStatement(callAccount('visit',[str(category),str(ACCOUNTING_PATH)]))];
 for(const child of original.statements){
  if(ts.isFunctionDeclaration(child)){statements.push(instrumentStatement(child));continue;}
  if(ts.isExpressionStatement(child)&&ts.isStringLiteral(child.expression)){statements.push(child);continue;}
  statements.push(asStatement(callAccount('visit',[str('validator-statement'),str(ACCOUNTING_PATH)])),instrumentStatement(child));
 }
 return ts.factory.updateBlock(original,statements);
}
function isStringLike(node:ts.Expression):boolean{
 if(ts.isStringLiteralLike(node)||ts.isNoSubstitutionTemplateLiteral(node))return true;
 if(ts.isIdentifier(node))return new Set(['instancePath','schemaPath','keyword','message','key','key1','key2','str','role','type','pattern','missingProperty','additionalProperty','propertyName']).has(node.text);
 if(ts.isCallExpression(node)){
  const callee=nameOf(node.expression);
  return callee==='JSON.stringify'||callee.endsWith('.replace')||callee==='func27'||callee==='canonicalJson'||isPinnedCanonicalJsonMapJoin(node);
 }
 if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return isStringLike(node.left)||isStringLike(node.right);
 return false;
}
/** Only the two pinned canonicalJson array/object map-join pipelines are string-valued. */
/** Build-tool predicate exported only so source controls exercise the real narrow classifier. */
export function isPinnedCanonicalJsonMapJoin(node:ts.CallExpression):boolean{
 if(!ts.isPropertyAccessExpression(node.expression)||node.expression.name.text!=='join'||node.arguments.length!==1||!ts.isStringLiteral(node.arguments[0]!)||node.arguments[0]!.text!==',')return false;
 const mapped=node.expression.expression;
 if(!ts.isCallExpression(mapped)||!ts.isPropertyAccessExpression(mapped.expression)||mapped.expression.name.text!=='map'||mapped.arguments.length!==1)return false;
 const callback=mapped.arguments[0]!;
 if(ts.isIdentifier(callback)&&callback.text==='canonicalJson')return ts.isIdentifier(mapped.expression.expression)&&mapped.expression.expression.text==='value';
 if(!ts.isArrowFunction(callback)||!ts.isBinaryExpression(callback.body)||callback.body.operatorToken.kind!==ts.SyntaxKind.PlusToken)return false;
 // Pinned JavaScript addition is left-associated:
 // (JSON.stringify(key) + ":") + canonicalJson(value[key]).
 const prefix=callback.body.left,call=callback.body.right;
 if(!ts.isBinaryExpression(prefix)||prefix.operatorToken.kind!==ts.SyntaxKind.PlusToken||!ts.isStringLiteral(prefix.right)||prefix.right.text!==':')return false;
 const stringify=prefix.left;
 if(!ts.isCallExpression(stringify)||nameOf(stringify.expression)!=='JSON.stringify'||stringify.arguments.length!==1||!ts.isIdentifier(stringify.arguments[0]!)||stringify.arguments[0]!.text!=='key')return false;
 if(!ts.isCallExpression(call)||nameOf(call.expression)!=='canonicalJson'||call.arguments.length!==1||!ts.isElementAccessExpression(call.arguments[0]!))return false;
 const element=call.arguments[0]!;
 if(!ts.isIdentifier(element.expression)||element.expression.text!=='value'||!element.argumentExpression||!ts.isIdentifier(element.argumentExpression)||element.argumentExpression.text!=='key')return false;
 const source=mapped.expression.expression;
 return ts.isCallExpression(source)&&ts.isPropertyAccessExpression(source.expression)&&source.expression.name.text==='sort'&&source.arguments.length===0&&ts.isCallExpression(source.expression.expression)&&nameOf(source.expression.expression.expression)==='Object.keys'&&source.expression.expression.arguments.length===1&&ts.isIdentifier(source.expression.expression.arguments[0]!)&&source.expression.expression.arguments[0]!.text==='value';
}
function instrumentExpression(node:ts.Node):ts.VisitResult<ts.Node>{
 if(ts.isArrowFunction(node)){
  const body=ts.isBlock(node.body)?instrumentBlock(node.body,'validator-callback-entry'):marked(ts.visitNode(node.body,instrumentExpression) as ts.Expression,'validator-callback-entry');
  return ts.factory.updateArrowFunction(node,node.modifiers,node.typeParameters,node.parameters,node.type,node.equalsGreaterThanToken,body);
 }
 if(ts.isFunctionExpression(node)&&node.body){const body=instrumentBlock(node.body,'validator-helper-entry');return ts.factory.updateFunctionExpression(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,body);}
 if(ts.isConditionalExpression(node))return ts.factory.updateConditionalExpression(node,marked(ts.visitNode(node.condition,instrumentExpression) as ts.Expression,'validator-conditional-test'),node.questionToken,marked(ts.visitNode(node.whenTrue,instrumentExpression) as ts.Expression,'validator-conditional-true-arm'),node.colonToken,marked(ts.visitNode(node.whenFalse,instrumentExpression) as ts.Expression,'validator-conditional-false-arm'));
 if(ts.isCallExpression(node)){
  const kind=callKind(node);
  const receiver=ts.isPropertyAccessExpression(node.expression)?ts.visitNode(node.expression.expression,instrumentExpression) as ts.Expression:undefined;
  if(kind==='push')return marked(ts.factory.createCallExpression(id('accountedPush'),undefined,[receiver!,...node.arguments.map((arg)=>ts.visitNode(arg,instrumentExpression) as ts.Expression),id('account')]),'validator-error-array-slot-reservation',ts.factory.createNumericLiteral(node.arguments.length));
  if(kind==='concat'){if(node.arguments.length!==1)fail('CONCAT_ARITY',node.getText());return ts.factory.createCallExpression(id('accountedConcat'),undefined,[receiver!,ts.visitNode(node.arguments[0]!,instrumentExpression) as ts.Expression,id('account')]);}
  if(kind==='map'||kind==='some'||kind==='join'||kind==='sort'||kind==='replace'||kind==='test'){
   const maxArity=kind==='join'||kind==='sort'?1:kind==='replace'?2:1;
   const minArity=kind==='sort'?0:1;
   if(node.arguments.length<minArity||node.arguments.length>maxArity)fail('ARRAY_METHOD_ARITY',kind+':'+node.getText());
   const helper={map:'accountedMap',some:'accountedSome',join:'accountedJoin',sort:'accountedSort',replace:'accountedReplace',test:'accountedTest'}[kind]!;
   const escapeKind=kind==='replace'?escapingReplaceKind(node):undefined;
   if(kind==='replace'&&!escapeKind)fail('UNBOUNDED_REPLACE',node.getText());
   const args=kind==='join'?[receiver!,node.arguments[0]?ts.visitNode(node.arguments[0],instrumentExpression) as ts.Expression:ts.factory.createIdentifier('undefined'),id('account')]:kind==='replace'?[receiver!,...node.arguments.map((arg)=>ts.visitNode(arg,instrumentExpression) as ts.Expression),str(escapeKind!),id('account')]:[receiver!,...node.arguments.map((arg)=>ts.visitNode(arg,instrumentExpression) as ts.Expression),id('account')];
   return ts.factory.createCallExpression(id(helper),undefined,args);
  }
  if(nameOf(node.expression)==='Object.keys'){if(node.arguments.length!==1)fail('OBJECT_KEYS_ARITY',node.getText());return ts.factory.createCallExpression(id('accountedKeys'),undefined,[ts.visitNode(node.arguments[0]!,instrumentExpression) as ts.Expression,id('account')]);}
  if(nameOf(node.expression)==='Object.assign')return marked(ts.factory.createCallExpression(id('accountedAssign'),undefined,[...node.arguments.map((arg)=>ts.visitNode(arg,instrumentExpression) as ts.Expression),id('account')]),'validator-assignment-argument-reservation',ts.factory.createNumericLiteral(node.arguments.length));
  if(nameOf(node.expression)==='JSON.stringify'){if(node.arguments.length!==1)fail('JSON_STRINGIFY_ARITY',node.getText());return ts.factory.createCallExpression(id('accountedStringify'),undefined,[ts.visitNode(node.arguments[0]!,instrumentExpression) as ts.Expression,id('account')]);}
  const updated=visitEachChild(node,instrumentExpression);
  return marked(updated as ts.Expression,'validator-call');
 }
 if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='RegExp'){
  if(!node.arguments||node.arguments.length<1||node.arguments.length>2||node.arguments.some((argument)=>!ts.isStringLiteralLike(argument)))fail('REGEXP_DOMAIN',node.getText());
  const [pattern,flags]=node.arguments;
  return ts.factory.createCallExpression(id('accountedRegExp'),undefined,[pattern!,flags??id('undefined'),id('account')]);
 }
 if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='Set'){
  const input=node.arguments?.[0];if(!input)fail('SET_ARITY',node.getText());
  return ts.factory.createCallExpression(id('accountedSet'),undefined,[ts.visitNode(input,instrumentExpression) as ts.Expression,id('account')]);
 }
 if(ts.isNewExpression(node))fail('UNKNOWN_NEW',node.getText());
 if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){
  const left=ts.visitNode(node.left,instrumentExpression) as ts.Expression,right=ts.visitNode(node.right,instrumentExpression) as ts.Expression;
  if(isStringLike(node.left)||isStringLike(node.right)){
   if(!isStringLike(node.left)&&!isBoundedStringCoercion(node.left)||!isStringLike(node.right)&&!isBoundedStringCoercion(node.right))fail('UNBOUNDED_STRING_COERCION',node.getText());
   return ts.factory.createCallExpression(id('accountedConcatText'),undefined,[left,right,id('account')]);
  }
  if(!isKnownNumericAdd(node))fail('AMBIGUOUS_PLUS',node.getText());
  return ts.factory.updateBinaryExpression(node,left,node.operatorToken,right);
 }
 if(ts.isBinaryExpression(node)&&ts.isElementAccessExpression(node.left)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken){
  if(!ts.isIdentifier(node.left.expression)||!node.left.argumentExpression||!ts.isIdentifier(node.left.argumentExpression))fail('COMPUTED_ASSIGNMENT_SHAPE',node.getText());
  return ts.factory.createCallExpression(id('accountedPropertyWrite'),undefined,[node.left.expression,node.left.argumentExpression,ts.visitNode(node.right,instrumentExpression) as ts.Expression,id('account')]);
 }
 if(ts.isBinaryExpression(node)&&(node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken||node.operatorToken.kind===ts.SyntaxKind.BarBarToken||node.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken)){
  const left=marked(ts.visitNode(node.left,instrumentExpression) as ts.Expression,'validator-short-circuit-left');
  const right=marked(ts.visitNode(node.right,instrumentExpression) as ts.Expression,'validator-short-circuit-right');
  return ts.factory.updateBinaryExpression(node,left,node.operatorToken,right);
 }
 if(ts.isObjectLiteralExpression(node)){
  for(const member of node.properties)if((!ts.isPropertyAssignment(member)&&!ts.isShorthandPropertyAssignment(member))||(ts.isPropertyAssignment(member)&&ts.isComputedPropertyName(member.name)))fail('OBJECT_MEMBER',member.getText());
  const properties=node.properties.map((member)=>{
   if(ts.isPropertyAssignment(member)){
    const value=ts.visitNode(member.initializer,instrumentExpression) as ts.Expression;
    const retained=ts.factory.createCallExpression(id('accountedValue'),undefined,[value,id('account')]);
    return ts.factory.updatePropertyAssignment(member,member.name,retained);
   }
   if(ts.isShorthandPropertyAssignment(member)){
    const value=ts.factory.createCallExpression(id('accountedValue'),undefined,[member.name,id('account')]);
    return ts.factory.createPropertyAssignment(member.name,value);
   }
   return member;
  });
  const updated=ts.factory.updateObjectLiteralExpression(node,properties);
  return marked(updated,'validator-object-literal',ts.factory.createNumericLiteral(updated.properties.length));
 }
 if(ts.isArrayLiteralExpression(node)){
  for(const item of node.elements)if(ts.isSpreadElement(item)||ts.isOmittedExpression(item))fail('ARRAY_SPREAD',item.getText());
  const elements=node.elements.map((item)=>ts.factory.createCallExpression(id('accountedValue'),undefined,[ts.visitNode(item,instrumentExpression) as ts.Expression,id('account')]) as ts.Expression);
  const updated=ts.factory.updateArrayLiteralExpression(node,elements);
  return marked(updated,'validator-array-literal',ts.factory.createNumericLiteral(updated.elements.length));
 }
 return visitEachChild(node,instrumentExpression);
}
function escapingReplaceKind(node:ts.CallExpression):'tilde'|'slash'|undefined{
 if(node.arguments.length!==2)return undefined;
 const patternNode=node.arguments[0],replacement=node.arguments[1];
 if(!patternNode||!replacement||!ts.isRegularExpressionLiteral(patternNode)||!ts.isStringLiteral(replacement))return undefined;
 const pattern=patternNode.text;
 if(pattern==='/~/g'&&replacement.text==='~0')return 'tilde';
 if(pattern==='/\\//g'&&replacement.text==='~1')return 'slash';
 return undefined;
}
function isKnownNumericAdd(node:ts.BinaryExpression):boolean{
 const known=(value:ts.Expression):boolean=>ts.isNumericLiteral(value)||ts.isIdentifier(value)&&/^(?:i[0-9]*|len[0-9]*|errors|_errs[0-9]*|passing[0-9]*)$/.test(value.text);
 return known(node.left)&&known(node.right);
}
function isBoundedStringCoercion(node:ts.Expression):boolean{
 if(ts.isNumericLiteral(node)||node.kind===ts.SyntaxKind.TrueKeyword||node.kind===ts.SyntaxKind.FalseKeyword||node.kind===ts.SyntaxKind.NullKeyword)return true;
 return ts.isIdentifier(node)&&/^(?:undefined|i[0-9]*|len[0-9]*|errors|_errs[0-9]*|passing[0-9]*)$/.test(node.text);
}
function instrumentStatement(node:ts.Statement):ts.Statement{
 if(ts.isFunctionDeclaration(node)){
  if(!node.body)return node;
  const body=instrumentBlock(node.body,'validator-function-entry');
  return ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,body);
 }
 if(ts.isBlock(node))return instrumentBlock(node,'validator-block-entry');
 if(ts.isIfStatement(node)){
  const expression=marked(ts.visitNode(node.expression,instrumentExpression) as ts.Expression,'validator-branch');
  return ts.factory.updateIfStatement(node,expression,instrumentStatement(node.thenStatement),node.elseStatement?instrumentStatement(node.elseStatement):undefined);
 }
 if(ts.isForStatement(node))return ts.factory.updateForStatement(node,node.initializer,node.condition?marked(ts.visitNode(node.condition,instrumentExpression) as ts.Expression,'validator-loop-test'):undefined,node.incrementor?ts.visitNode(node.incrementor,instrumentExpression) as ts.Expression:undefined,blockWithPrefix(node.statement,'validator-loop-iteration'));
 if(ts.isForInStatement(node))return ts.factory.updateForInStatement(node,node.initializer,ts.visitNode(node.expression,instrumentExpression) as ts.Expression,blockWithPrefix(node.statement,'validator-loop-iteration'));
 if(ts.isForOfStatement(node))return ts.factory.updateForOfStatement(node,node.awaitModifier,node.initializer,ts.visitNode(node.expression,instrumentExpression) as ts.Expression,blockWithPrefix(node.statement,'validator-loop-iteration'));
 if(ts.isWhileStatement(node))return ts.factory.updateWhileStatement(node,marked(ts.visitNode(node.expression,instrumentExpression) as ts.Expression,'validator-loop-test'),blockWithPrefix(node.statement,'validator-loop-iteration'));
 if(ts.isDoStatement(node))return ts.factory.updateDoStatement(node,blockWithPrefix(node.statement,'validator-loop-iteration'),marked(ts.visitNode(node.expression,instrumentExpression) as ts.Expression,'validator-loop-test'));
 if(ts.isExpressionStatement(node)&&ts.isStringLiteral(node.expression))return node;
 if(ts.isTryStatement(node)||ts.isSwitchStatement(node)||ts.isLabeledStatement(node)||ts.isWithStatement(node))fail('UNSUPPORTED_CONTROL',node.getText());
 return visitEachChild(node,instrumentExpression) as ts.Statement;
}
function instrumentBlock(node:ts.Block,entry:string):ts.Block{
 const statements:ts.Statement[]=[asStatement(callAccount('visit',[str(entry),str(ACCOUNTING_PATH)]))];
 for(const statement of node.statements){if(ts.isFunctionDeclaration(statement)){statements.push(instrumentStatement(statement));continue;}if(ts.isExpressionStatement(statement)&&ts.isStringLiteral(statement.expression)){statements.push(statement);continue;}statements.push(asStatement(callAccount('visit',[str('validator-statement'),str(ACCOUNTING_PATH)])),instrumentStatement(statement));}
 return ts.factory.updateBlock(node,statements);
}

const PRIVATE_HELPERS=`
function accountedValue<T>(value:T,account:AccountingContext):T{account.visit('validator-property-value','/generated/core');if(typeof value==='string')account.scanUtf8(value,'/generated/core/@value');return value;}
function accountedPropertyWrite(target:Record<string,unknown>,key:string,value:unknown,account:AccountingContext):unknown{if(typeof key!=='string')throw new Error('STRUCTURAL_ACCOUNTING_PROPERTY_KEY');account.visit('validator-computed-property-write','/generated/core');account.scanUtf8(key,'/generated/core/@property-key');target[key]=value;return value;}
function accountedKeys(value:object,account:AccountingContext):string[]{let count=0;for(const key in value)if(Object.hasOwn(value,key)){account.visit('validator-key-enumeration','/generated/core');account.scanUtf8(key,'/generated/core/@key');count++;}account.visit('validator-key-array-reservation','/generated/core',count);return Object.keys(value);}
function accountedMap<T,U>(values:T[],callback:(value:T,index:number,array:T[])=>U,account:AccountingContext):U[]{account.visit('validator-map-reservation','/generated/core',values.length);return values.map((value,index,array)=>{account.visit('validator-map-callback','/generated/core');return callback(value,index,array);});}
function accountedSome<T>(values:T[],callback:(value:T,index:number,array:T[])=>unknown,account:AccountingContext):boolean{return values.some((value,index,array)=>{account.visit('validator-some-callback','/generated/core');return callback(value,index,array);});}
function accountedJoin(values:unknown[],separator?:string,account?:AccountingContext):string{const sep=separator===undefined?',':separator;let bytes=0;for(let index=0;index<values.length;index++){if(index)bytes+=account!.scanUtf8(sep,'/generated/core/@separator');const value=values[index];if(value!==null&&value!==undefined){if(typeof value!=='string')throw new Error('STRUCTURAL_ACCOUNTING_JOIN_DOMAIN');bytes+=account!.scanUtf8(value,'/generated/core/@join-value');}}account!.retainBytes('validator-joined-text',bytes,'/generated/core');return values.join(separator);}
function accountedSort(values:string[],account:AccountingContext):string[]{return values.sort((left,right)=>{account.visit('validator-key-sort-comparator','/generated/core');const limit=Math.min(left.length,right.length);for(let index=0;index<limit;index++){account.visit('validator-key-sort-code-unit-comparison','/generated/core');const first=left.charCodeAt(index),second=right.charCodeAt(index);if(first!==second)return first<second?-1:1;}return left.length<right.length?-1:left.length>right.length?1:0;});}
function accountedReplace(value:string,pattern:RegExp,replacement:string,kind:'tilde'|'slash',account:AccountingContext):string{let extra=0;for(let index=0;index<value.length;index++){account.visit('validator-pointer-escape-scan','/generated/core');const unit=value.charCodeAt(index);if(kind==='tilde'&&unit===126||kind==='slash'&&unit===47)extra++;}const sourceBytes=account.scanUtf8(value,'/generated/core/@path');account.retainBytes('validator-pointer-escape-output',sourceBytes+extra,'/generated/core');return value.replace(pattern,replacement);}
function accountedTest(pattern:RegExp,value:string,account:AccountingContext):boolean{account.scanUtf8(value,'/generated/core/@pattern-input');return pattern.test(value);}
function accountedRegExp(pattern:string,flags:string,account:AccountingContext):RegExp{account.scanUtf8(pattern,'/generated/core/@pattern');account.scanUtf8(flags,'/generated/core/@flags');return new RegExp(pattern,flags);}
function accountedConcat<T>(values:T[],other:ConcatArray<T>|T,account:AccountingContext):T[]{const added=Array.isArray(other)?other.length:1;account.visit('validator-array-concat-reservation','/generated/core',values.length+added);return values.concat(other as any);}
function accountedPush<T>(values:T[],...rest:any[]):number{rest.pop();return values.push(...rest);}
function accountedSet<T>(values:Iterable<T>,account:AccountingContext):Set<T>{if(!Array.isArray(values))throw new Error('STRUCTURAL_ACCOUNTING_SET_DOMAIN');account.visit('validator-set-carrier-reservation','/generated/core',values.length);const result=new Set<T>();for(const value of values){account.visit('validator-set-probe','/generated/core');if(!result.has(value)){account.visit('validator-set-entry-retention','/generated/core');if(typeof value==='string')account.scanUtf8(value,'/generated/core/@set-value');result.add(value);}}return result;}
function accountedAssign<T extends object>(target:T,...rest:any[]):T{const account=rest.pop() as AccountingContext;for(const source of rest)if(source!==null&&typeof source==='object')for(const key in source)if(Object.hasOwn(source,key)){account.visit('validator-assignment-key','/generated/core');account.scanUtf8(key,'/generated/core/@assignment-key');}return Object.assign(target,...rest);}
function jsonStringBytes(value:string):number{let bytes=2;for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code===34||code===92||code===8||code===9||code===10||code===12||code===13)bytes+=2;else if(code<32)bytes+=6;else if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(next>=0xdc00&&next<=0xdfff){bytes+=4;index++;}else bytes+=6;}else if(code>=0xdc00&&code<=0xdfff)bytes+=6;else bytes+=code<128?1:code<2048?2:3;}return bytes;}
function accountedStringify(value:unknown,account:AccountingContext):string|undefined{let reserve:number;if(typeof value==='string')reserve=jsonStringBytes(value);else if(value===null)reserve=4;else if(typeof value==='boolean')reserve=value?4:5;else if(typeof value==='number')reserve=24;else throw new Error('STRUCTURAL_ACCOUNTING_STRINGIFY_DOMAIN');account.retainBytes('validator-json-token-bound',reserve,'/generated/core');return JSON.stringify(value);}
function accountedConcatText(left:unknown,right:unknown,account:AccountingContext):string{const convert=(value:unknown,path:string):string=>{if(typeof value==='string')return value;if(typeof value==='number'){account.retainBytes('validator-number-to-string-bound',24,path);account.visit('validator-number-to-string','/generated/core');return String(value);}if(typeof value==='boolean'){account.retainBytes('validator-boolean-to-string',value?4:5,path);return String(value);}if(value===null){account.retainBytes('validator-null-to-string',4,path);return String(value);}if(value===undefined){account.retainBytes('validator-undefined-to-string',9,path);return String(value);}throw new Error('STRUCTURAL_ACCOUNTING_STRING_COERCION_DOMAIN');};const first=convert(left,'/generated/core/@concat-left-temp'),second=convert(right,'/generated/core/@concat-right-temp');const length=account.scanUtf8(first,'/generated/core/@concat-left')+account.scanUtf8(second,'/generated/core/@concat-right');account.retainBytes('validator-concatenated-text',length,'/generated/core');return first+second;}
`;

/** Return an accounted private companion source for the pinned generated file. */
export function structuralAccountingSource(generatedSource:string,schemas:readonly unknown[]):string{
 if(sha256(generatedSource)!==GENERATED_SOURCE_SHA256)fail('SOURCE_PIN','generated standalone bytes differ');
 if(schemas.length!==3)fail('SCHEMA_ARITY',String(schemas.length));
 const source=ts.createSourceFile('core-validators.ts',generatedSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const compilerOptions={noLib:true,noResolve:true,noEmit:true,target:ts.ScriptTarget.Latest};
 const host=ts.createCompilerHost(compilerOptions),readSource=host.getSourceFile.bind(host);
 host.getSourceFile=(fileName,languageVersion,onError,shouldCreateNewSourceFile)=>fileName===source.fileName?source:readSource(fileName,languageVersion,onError,shouldCreateNewSourceFile);
 const syntaxProgram=ts.createProgram([source.fileName],compilerOptions,host);
 const syntaxDiagnostics=syntaxProgram.getSyntacticDiagnostics(source);
 if(syntaxDiagnostics.length)fail('PARSE',String(syntaxDiagnostics.length));
 const schemaValues:unknown[]=[];
 const staticStatements:ts.Statement[]=[],dynamicStatements:ts.Statement[]=[],imports:ts.Statement[]=[];
 const aliases=new Map<string,string>();let validateCount=0;generatedCallableNames=new Set<string>();
 const bindings=new Map<string,ts.Expression>();
 for(const statement of source.statements){
  if(ts.isImportDeclaration(statement)){imports.push(statement);continue;}
  if(ts.isVariableStatement(statement)){
   const declarations=statement.declarationList.declarations;
   if(declarations.length!==1)fail('TOP_LEVEL_VARIABLE',statement.getText(source));
   const declaration=declarations[0];
   if(!declaration||!ts.isIdentifier(declaration.name))fail('TOP_LEVEL_VARIABLE',statement.getText(source));
   const name=declaration.name.text;
   if(declaration.initializer)bindings.set(name,declaration.initializer);
   if(/^schema[0-9]+$/.test(name)&&declaration.initializer&&ts.isObjectLiteralExpression(declaration.initializer)){
    const data=literal(declaration.initializer),id=propertyString(data,'$id');if(id)schemaValues.push(data);
    staticStatements.push(statement);continue;
   }
   if(/^pattern[0-9]+$/.test(name)||name==='func0'){staticStatements.push(statement);continue;}
   if(name in EXPECTED_VALIDATORS){
    if(!declaration.initializer||!ts.isIdentifier(declaration.initializer))fail('VALIDATOR_ALIAS',name);
    aliases.set(name,declaration.initializer.text);
    const modifiers=statement.modifiers?.filter((modifier)=>modifier.kind!==ts.SyntaxKind.ExportKeyword);
    dynamicStatements.push(ts.factory.updateVariableStatement(statement,modifiers,statement.declarationList));continue;
   }
   dynamicStatements.push(statement);continue;
  }
  if(ts.isFunctionDeclaration(statement)){if(statement.name){generatedCallableNames.add(statement.name.text);if(/^validate[0-9]+$/.test(statement.name.text))validateCount++;}dynamicStatements.push(statement);continue;}
  if(ts.isExpressionStatement(statement)&&ts.isStringLiteral(statement.expression)&&statement.expression.text==='use strict')continue;
  if(ts.isExpressionStatement(statement)&&ts.isBinaryExpression(statement.expression)&&statement.expression.operatorToken.kind===ts.SyntaxKind.EqualsToken){dynamicStatements.push(statement);continue;}
  fail('TOP_LEVEL_STATEMENT',statement.getText(source).slice(0,120));
 }
 if(validateCount!==19)fail('VALIDATOR_COUNT',String(validateCount));
 for(const [alias,target]of Object.entries(EXPECTED_VALIDATORS))if(aliases.get(alias)!==target)fail('VALIDATOR_BINDING',`${alias}:${aliases.get(alias)}`);
 for(const [wrapper,target]of [['wrapper0','validate32'],['wrapper2','validate59']] as const){
  const initializer=bindings.get(wrapper);
  if(!initializer||!ts.isObjectLiteralExpression(initializer)||initializer.properties.length!==1)fail('WRAPPER_SHAPE',wrapper);
  const property=initializer.properties[0];
  if(!property)fail('WRAPPER_SHAPE',wrapper);
  if(!ts.isPropertyAssignment(property)||!ts.isIdentifier(property.name)||property.name.text!=='validate'||!ts.isIdentifier(property.initializer)||property.initializer.text!==target)fail('WRAPPER_BINDING',wrapper);
 }
 for(const expected of schemas){const id=propertyString(expected,'$id');if(!id||!schemaValues.some((actual)=>propertyString(actual,'$id')===id&&JSON.stringify(actual)===JSON.stringify(expected)))fail('SCHEMA_BINDING',String(id));}
 const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
 const staticText=staticStatements.map((statement)=>printer.printNode(ts.EmitHint.Unspecified,statement,source)).join('\n');
 let dynamicText='';
 const transformation=ts.transform(source,[context=>root=>{
  activeTransformationContext=context;
  try{
   dynamicText=dynamicStatements.map((statement)=>{
    const instrumented=instrumentStatement(statement);
    if(ts.isFunctionDeclaration(statement))return printer.printNode(ts.EmitHint.Unspecified,instrumented,source);
    return `${printer.printNode(ts.EmitHint.Unspecified,asStatement(callAccount('visit',[str('validator-factory-statement'),str(ACCOUNTING_PATH)])),source)}\n${printer.printNode(ts.EmitHint.Unspecified,instrumented,source)}`;
   }).join('\n');
   return root;
  }finally{activeTransformationContext=undefined;}
 }]);
 transformation.dispose();
 const typeImports=imports.map((statement)=>printer.printNode(ts.EmitHint.Unspecified,statement,source)).join('\n');
 return `// Generated accounted companion for the exact pinned Ajv standalone source.\n${typeImports}\nimport type {AccountingContext} from '../model/internal/accounting-context';\n${staticText}\n${PRIVATE_HELPERS}\nfunction makeAccountedStructural(account:AccountingContext){\n${dynamicText}\nreturn {core(document:unknown){account.visit('validator-entry','/generated/core');const valid=checkCore(document);return {valid,errors:checkCore.errors??[]};}};\n}\nexport function runAccountedCore(document:unknown,account:AccountingContext):{valid:boolean;errors:unknown[]}{account.visit('validator-factory','/generated/core',${validateCount});return makeAccountedStructural(account).core(document);}\n`;
}
