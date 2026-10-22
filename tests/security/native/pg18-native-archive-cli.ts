/** Host-only transport for the existing browser-compatible source owners. */
import {inspectNativeArchiveRoundTrip} from './pg18-native-archive';
const text=await Bun.stdin.text();
if(text.length>4_000_000)throw Error('Native archive input bound');
console.log(JSON.stringify(inspectNativeArchiveRoundTrip(JSON.parse(text))));
