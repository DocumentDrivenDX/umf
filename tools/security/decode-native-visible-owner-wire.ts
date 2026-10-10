/** Decode exact retained psql stdout bytes; no native cut/authority grant. */
import {decodeVisibleDatasetOwners} from '/Users/erik/Projects/truss/packages/postgresql/src/dataset-visible-owner-inventory';
const path=process.argv[2];if(!path)throw Error('Original wire file required');
const expected=process.argv[3];if(!expected||!/^([0-9a-f]{64})$/.test(expected))throw Error('Original wire digest required');
const bytes=await Bun.file(path).arrayBuffer();if(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')!==expected)throw Error('Original wire byte mismatch');
const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
const decoded=decodeVisibleDatasetOwners(text);
console.log(JSON.stringify({wireSha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),originalText:decoded.originalText,rows:decoded.rows,scope:decoded.scope}));
