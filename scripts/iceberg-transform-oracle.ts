import {inspectIcebergTransformType} from '../src';
const base='fixtures/iceberg/transforms/';
const build=Bun.spawn(['mvn','-q','-f','native/iceberg/oracle/pom.xml','compile','dependency:build-classpath','-Dmdep.outputFile='+process.cwd()+'/.cache/iceberg-java/classpath.txt'],{stdout:'inherit',stderr:'inherit'});if(await build.exited)throw Error('Oracle compile failed');
const cp='.cache/iceberg-java/classes:'+(await Bun.file('.cache/iceberg-java/classpath.txt').text()).trim();
const run=Bun.spawn([process.env.JAVA_HOME?process.env.JAVA_HOME+'/bin/java':'java','-cp',cp,'IcebergTransformOracle',base+'cases.json',base+'java-results.json'],{stdout:'inherit',stderr:'inherit'});if(await run.exited)throw Error('Native oracle failed');
let compared=0;for(const c of await Bun.file(base+'java-results.json').json()){
 const r=inspectIcebergTransformType(c.sourceType,c.transform);if((r.status==='compatible')!==c.nativeCompatible)throw Error('Type compatibility differs: '+JSON.stringify({c,r}));if(c.nativeCompatible&&r.resultType!==(c.transform==='day'?'int':c.nativeResultType))throw Error('Result type differs');if(c.nativeCompatible&&c.transform==='day'&&c.nativeResultType!=='date')throw Error('Native day type changed');compared++;
}
await Bun.write(base+'results.json',JSON.stringify({authority:'Apache Iceberg 1.11.0',compared,nativeDayResult:'date; pinned specification result int is retained separately',scope:'Single-source transform type compatibility; no value execution or table validity'},null,2)+'\n');console.log({compared});
