import type {Diagnostic} from '../../model/types';
/** Diagnostics for pinned JSON spellings, not DDL or execution validity. */
export function sparkParameterDiagnostics(value:string,path:string):Diagnostic[]{
 const ds:Diagnostic[]=[];const add=(code:string,message:string)=>ds.push({code,path,message,severity:'warning'});
 const decimal=/^decimal\(\s*(\d+)\s*,\s*(-?\d+)\s*\)$/.exec(value);
 if(decimal){const precision=BigInt(decimal[1]!),scale=BigInt(decimal[2]!);
  if(precision>2147483647n||scale>2147483647n||scale< -2147483648n)add('SPARK_PARAMETER_INT32','Spark JVM parses decimal parameters as int32; this value exceeds that range');
  if(precision>38n)add('SPARK_DECIMAL_PRECISION','Spark JVM decimal precision exceeds the supported maximum of 38');
  if(scale>precision)add('SPARK_DECIMAL_SCALE','Spark JVM rejects decimal scale greater than precision');
  if(scale<0n)add('SPARK_DECIMAL_NEGATIVE_SCALE','Negative decimal scale depends on spark.sql.legacy.allowNegativeScaleOfDecimal; default JVM configuration rejects it');
 }
 const chars=/^(?:char|varchar)\(\s*(\d+)\s*\)$/.exec(value);
 if(chars&&BigInt(chars[1]!)>2147483647n)add('SPARK_PARAMETER_INT32','Spark JVM parses character length as int32; this value exceeds that range');
 const interval=/^interval (year|month|day|hour|minute|second) to (year|month|day|hour|minute|second)$/.exec(value);
 if(interval){const units=['year','month','day','hour','minute','second'],start=units.indexOf(interval[1]!),end=units.indexOf(interval[2]!);
  if((start<2)!==(end<2)||start>=end)add('SPARK_INTERVAL_RANGE','Spark JVM JSON interval spelling must use an increasing range within year/month or day/time units');
 }
 return ds;
}
