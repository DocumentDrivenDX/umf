export function sqlServerKeyDiscoveryCases(){
 const rows:{id:string;statement:string;error:number;value:string|null}[]=[];
 const add=(id:string,statement:string,error=0,value:string|null='1')=>rows.push({id,statement,error,value});
 const insert=(id:string,table:string,values:string,error=0)=>add(id,`INSERT INTO umf_key.${table} VALUES(${values}); SET @out=CONVERT(nvarchar(20),@@ROWCOUNT);`,error,error?null:'1');
 insert('primary-duplicate','enforced','1,11',2627);insert('alternate-duplicate','enforced','2,10',2627);insert('primary-null','enforced','NULL,11',515);insert('alternate-null','enforced','2,NULL',515);insert('independent-tuples','enforced','2,20');
 insert('partial-outside-first','partial','1,0');insert('partial-outside-second','partial','1,0');insert('partial-inside-duplicate','partial','1,1',2601);
 insert('disabled-accepts-duplicate','disabled','1');add('disabled-duplicate-count','SELECT @out=COUNT(*) FROM umf_key.disabled WHERE value=1;',0,'2');
 insert('unique-second-null','nullable','NULL',2627);add('unique-stores-one-null','SELECT @out=COUNT(*) FROM umf_key.nullable WHERE value IS NULL;');
 add('ignore-duplicate-skips-row','INSERT INTO umf_key.ignore_duplicates VALUES(1); SET @out=CONVERT(nvarchar(20),@@ROWCOUNT);',0,'0');add('ignore-duplicate-count','SELECT @out=COUNT(*) FROM umf_key.ignore_duplicates;');
 insert('binary-collation-trailing-space','binary_text',"N'a '",2627);insert('binary-collation-case-distinct','binary_text',"N'A'");insert('binary-collation-decomposed-distinct','binary_text',"N'e'+NCHAR(769)");
 insert('folded-case','folded_text',"N'A'",2627);insert('folded-accent','folded_text',"N'á'",2627);
 insert('binary-exact-duplicate','binary_value','0x01',2627);insert('binary-trailing-zero','binary_value','0x0100',2627);insert('binary-other-value','binary_value','0x02');
 add('binary-comparison','SELECT @out=CASE WHEN CONVERT(varbinary(16),0x01)=CONVERT(varbinary(16),0x0100) THEN N\'equal\' ELSE N\'distinct\' END;',0,'equal');
 insert('boolean-distinct','boolean_value','1');insert('boolean-coercion','boolean_value','2',2627);
 insert('decimal-rounding-collision','rounded','1.234',2627);insert('decimal-rounded-value','rounded','1.235');add('decimal-stored-value','SELECT @out=CONVERT(nvarchar(20),value) FROM umf_key.rounded WHERE value>1.23;',0,'1.24');insert('decimal-overflow','rounded','1000',8115);
 insert('compound-duplicate','compound','1,1',2627);insert('compound-distinct','compound','1,2');insert('compound-null','compound','NULL,3',515);
 insert('included-not-key','included',"2,N'same'");insert('included-key-duplicate','included',"1,N'other'",2601);
 for(const [id,value,error] of [['encoded-trailing-space',"N'a '",0],['encoded-decomposed',"N'e'+NCHAR(769)",0],['encoded-exact-duplicate',"N'a'",2601]] as const)add(id,`INSERT INTO umf_key.encoded_text(value) VALUES(${value}); SET @out=CONVERT(nvarchar(20),@@ROWCOUNT);`,error,error?null:'1');
 return rows;
}
