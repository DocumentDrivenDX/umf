import {exportPack} from './loaders/export';
const args=process.argv.slice(2),input=args[args.indexOf('--pack')+1],output=args[args.indexOf('--output')+1];
if(!args.includes('--pack')||!args.includes('--output')||!input||!output)throw Error('Usage: --pack <pack.json> --output <directory> [--check] [--include-sources]');
console.log(JSON.stringify(await exportPack(input,output,{check:args.includes('--check'),includeSources:args.includes('--include-sources')})));
