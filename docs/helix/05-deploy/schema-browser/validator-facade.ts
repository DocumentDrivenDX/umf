import {createValidator} from '../../../../src/validation/schema';
/** Build replacement for native recovery: fixed checks only, dynamic work refuses. */
export default class BrowserValidator {
 fixedBrowserProfile=true;errors:any;
 compile(schema:any){return createValidator().compile(schema);}
 validateSchema(schema:any){const check=createValidator().compile({umfBrowserMeta:true});const valid=check(schema);this.errors=check.errors;return valid;}
 addSchema(){throw Error('Dynamic native schema compilation is outside the fixed browser profile; source recovery remains qualified.');}
 getSchema(){throw Error('Dynamic native schema compilation is outside the fixed browser profile.');}
 removeKeyword(){return this;}
 addKeyword(){return this;}
}
