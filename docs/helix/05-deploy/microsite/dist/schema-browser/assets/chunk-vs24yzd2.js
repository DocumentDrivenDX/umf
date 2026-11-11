import{readJsonValue2}from"./chunk-kdyvjwx3.js";import{validateDocument}from"./chunk-60aq4gnb.js";import{UmfError}from"./chunk-rne4mzjk.js";function readDocument(text,format="yaml"){let value=readJsonValue2(text,format),result=validateDocument(value);if(!result.valid)throw new UmfError("INVALID_DOCUMENT",JSON.stringify(result.diagnostics));return value}
export{readDocument};
