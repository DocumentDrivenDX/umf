export {};
// Experimental optional runtime; does not alter the default TypeScript browser build.
for(const command of [['python3','scripts/prepare-smithy-js.py'],['mvn','-q','-f','native/smithy/browser/pom.xml','clean','process-classes']]){
 const run=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'});if(await run.exited)process.exit(1);
}
await Bun.write('native/smithy/browser/target/javascript/worker.js',Bun.file('native/smithy/browser/worker.js'));
console.log('Experimental Smithy JavaScript runtime compiled; conformance is a separate check');
