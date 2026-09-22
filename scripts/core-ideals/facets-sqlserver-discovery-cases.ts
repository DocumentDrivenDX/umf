/** Independent scalar/constraint probes; outputs are strings to avoid JS number loss. */
export interface SqlServerFacetProbe {id:string;statement:string;expected:string|null;error:number}
export function sqlServerFacetDiscoveryCases(){
 const cases:SqlServerFacetProbe[]=[];
 const add=(id:string,statement:string,expected:string|null,error=0)=>cases.push({id,statement,expected,error});
 const select=(id:string,expression:string,expected:string|null,error=0)=>add(id,'SELECT @out='+expression+';',expected,error);
 const insert=(id:string,table:string,expression:string,expected:string|null,error=0,output='CONVERT(nvarchar(max),value)')=>add(id,`DELETE FROM facet.${table}; INSERT INTO facet.${table}(value) VALUES(${expression}); SELECT @out=${output} FROM facet.${table};`,expected,error);
 const hex='CONVERT(varchar(max),CONVERT(varbinary(max),value),2)';
 for(const [type,min,max] of [['tinyint','0','255'],['smallint','-32768','32767'],['int','-2147483648','2147483647'],['bigint','-9223372036854775808','9223372036854775807']] as const){
  for(const [edge,value,error] of [['min',min,0],['max',max,0],['below',String(BigInt(min)-1n),8115],['above',String(BigInt(max)+1n),8115]] as const)select(`${type}-${edge}`,`CONVERT(nvarchar(max),CONVERT(${type},'${value}'))`,error?null:value,error?(type==='tinyint'||type==='smallint'?244:type==='int'?248:8115):0);
 }
 for(const [table,min,max] of [['signed8',-128,127],['unsigned16',0,65535]] as const){
  for(const [edge,value,error] of [['min',min,0],['max',max,0],['below',min-1,547],['above',max+1,547]] as const)insert(table+'-'+edge,table,String(value),error?null:String(value),error);
 }
 insert('decimal-rounds','decimal52','1.235','1.24');insert('decimal-checked-still-rounds','decimal_checked','1.235','1.24');
 insert('decimal-max','decimal52','999.99','999.99');insert('decimal-overflow','decimal52','1000',null,8115);
 insert('decimal33-max','decimal33','0.999','0.999');insert('decimal33-round-overflow','decimal33','0.9999',null,8115);
 insert('decimal38-exact','decimal380',"'99999999999999999999999999999999999999'",'99999999999999999999999999999999999999');
 insert('decimal3838-exact','decimal3838',"'0.99999999999999999999999999999999999999'",'0.99999999999999999999999999999999999999');
 insert('alias-rounds','alias_value','1.235','1.24');
 for(const warnings of ['OFF','ON'])for(const round of ['OFF','ON'])for(const abort of ['OFF','ON'])add(`roundabort-warnings-${warnings}-${round}-${abort}`,`SET ANSI_WARNINGS ${warnings}; SET NUMERIC_ROUNDABORT ${round}; SET ARITHABORT ${abort}; DECLARE @a decimal(5,4)=1.1234,@b decimal(5,4)=1.1234,@v decimal(5,2); SET @v=@a+@b; SELECT @out=CONVERT(nvarchar(max),@v);`,round==='OFF'?'2.25':null,round==='ON'&&(abort==='ON'||warnings==='ON')?8115:0);
 select('float-narrowing',"CONVERT(nvarchar(max),CONVERT(float(53),CONVERT(real,CONVERT(float(53),'1.0000000000000002'))),3)",'1.0000000000000000e+000');
 select('float64-retains',"CONVERT(nvarchar(max),CONVERT(float(53),'1.0000000000000002'),3)",'1.0000000000000002e+000');
 for(const n of [1,24,25,53])select('float-storage-'+n,`CONVERT(nvarchar(max),DATALENGTH(CONVERT(float(${n}),1)))`,n<=24?'4':'8');
 insert('nvarchar1-astral-refusal','nvarchar1',"N'😀'",null,2628,hex);
 insert('nvarchar2-astral','nvarchar2',"N'😀'",'3DD800DE',0,hex);
 insert('nvarchar2-trailing-truncation','nvarchar2',"N'a  '",'61002000',0,hex);
 insert('nvarchar-explicit-truncation','nvarchar2',"CONVERT(nvarchar(2),N'abc')",'61006200',0,hex);
 insert('nvarchar-nul','nvarchar2','NCHAR(0)','0000',0,hex);
 insert('nvarchar-isolated-surrogate','nvarchar2','CONVERT(nvarchar(1),0x00D8)','00D8',0,hex);
 insert('varchar-utf8-astral','varchar_utf8',"N'😀'",'F09F9880',0,hex);
 insert('varchar-legacy-substitution','varchar_legacy',"N'😀'",'3F3F',0,hex);
 insert('nchar-padding','nchar2',"N'a'",'61002000',0,hex);insert('char-padding','char2',"'a'",'6120',0,hex);
 insert('binary-padding','binary2','0x01','0100',0,hex);insert('varbinary-empty','varbinary2','0x','',0,hex);
 insert('varbinary-overflow','varbinary2','0x010203',null,2628,hex);
 insert('len-misses-trailing-spaces','length_len',"N'a   '",'6100200020002000',0,hex);
 insert('sentinel-counts-spaces','length_sentinel',"N'a   '",null,547,hex);
 insert('sentinel-two-astral','length_sentinel',"N'😀😀'",'3DD800DE3DD800DE',0,hex);
 insert('zero-empty','length_zero',"N''",'',0,hex);insert('zero-space-refusal','length_zero',"N' '",null,547,hex);
 insert('bytes-nul','bytes_bound','0x0000','0000',0,hex);insert('bytes-overflow','bytes_bound','0x000000',null,547,hex);
 select('len-sc',"CONVERT(nvarchar(max),LEN(N'😀' COLLATE Latin1_General_100_CI_AS_SC))",'1');
 select('len-legacy',"CONVERT(nvarchar(max),LEN(N'😀' COLLATE Latin1_General_100_CI_AS))",'2');
 select('len-combining',"CONVERT(nvarchar(max),LEN(N'é' COLLATE Latin1_General_100_CI_AS_SC))",'2');
 select('untrusted-existing','CONVERT(nvarchar(max),(SELECT value FROM facet.untrusted))','256');
 add('untrusted-new-rejects','INSERT INTO facet.untrusted VALUES(256);',null,547);
 insert('disabled-accepts','disabled','256','256');insert('replication-ordinary-rejects','replica_value','256',null,547);
 insert('custom-accepts','custom','9999','9999');insert('check-null-unknown','signed8','NULL',null);
 insert('sentinel-malformed-surrogate','length_sentinel','CONVERT(nvarchar(1),0x00D8)','00D8',0,hex);
 insert('utf8-byte-conversion-truncation','varchar_utf8','CONVERT(varchar(1),0xFF) COLLATE Latin1_General_100_CI_AS_SC_UTF8','',0,hex);
 insert('utf8-byte-conversion-wide','varchar_utf8','CONVERT(varchar(4),0xFF) COLLATE Latin1_General_100_CI_AS_SC_UTF8','C3BF',0,hex);
 insert('utf8-two-astral-refusal','varchar_utf8',"N'😀😀'",null,2628,hex);
 select('integer-conversion-truncates',"CONVERT(nvarchar(max),CONVERT(bigint,1.9))",'1');
 select('binary-explicit-truncation',"CONVERT(varchar(max),CONVERT(binary(2),0x010203),2)",'0102');
 select('float-nan-refusal',"CONVERT(nvarchar(max),CONVERT(float,'NaN'),3)",null,8114);
 select('float-infinity-refusal',"CONVERT(nvarchar(max),CONVERT(float,'Infinity'),3)",null,8114);
 add('filtered-index-accepts-duplicates','INSERT INTO facet.filtered_unique VALUES(1,0),(1,0); SELECT @out=CONVERT(nvarchar(max),COUNT(*)) FROM facet.filtered_unique;','2');
 add('disabled-index-accepts-duplicates','INSERT INTO facet.disabled_unique VALUES(1),(1); SELECT @out=CONVERT(nvarchar(max),COUNT(*)) FROM facet.disabled_unique;','2');
 return cases;
}
