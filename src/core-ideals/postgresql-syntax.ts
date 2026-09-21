import {UmfError} from '../model/types';
export const carriers={boolean:['bool','boolean'],smallint:['int2','integer'],integer:['int4','integer'],bigint:['int8','integer'],numeric:['numeric','decimal'],real:['float4','float'],'double precision':['float8','float'],text:['text','string'],bytea:['bytea','binary'],date:['date','date'],time:['time','time'],'time with time zone':['timetz','time'],timestamp:['timestamp','timestamp'],'timestamp with time zone':['timestamptz','timestamp']} as const;
export function identifier(value:string):string {
 if(!value||value.includes('\0')||Array.from(value).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)||new TextEncoder().encode(value).length>63)throw new UmfError('POSTGRESQL_FIELD_IDENTIFIER','Expected nonempty valid Unicode identifier of at most 63 UTF-8 bytes');
 return '"'+value.replace(/"/g,'""')+'"';
}
export function literal(value:string):string {
 if(value.includes('\0')||Array.from(value).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff))throw new UmfError('POSTGRESQL_FIELD_DESCRIPTION','Description cannot contain NUL or unpaired surrogates');
 return "E'"+value.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'";
}
