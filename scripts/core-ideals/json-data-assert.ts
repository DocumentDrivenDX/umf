import assert from 'node:assert/strict';
import {copyJson} from '../../src/model/json';
/** Compare admitted JSON data, including every unknown member and array position.
 * Object.prototype versus null-prototype is not a UMF semantic distinction.
 * Admission still rejects custom prototypes, getters and non-JSON values.
 */
export function assertJsonDataEqual(actual:unknown,expected:unknown,message?:string):void {
 if(message===undefined)assert.deepEqual(copyJson(actual),copyJson(expected));
 else assert.deepEqual(copyJson(actual),copyJson(expected),message);
}
/** Native binary carriers have explicit byte semantics outside the JSON envelope. */
export function assertNativeRepresentationEqual(actual:unknown,expected:unknown,message?:string):void {
 if(actual instanceof Uint8Array&&expected instanceof Uint8Array){
  const left=new Uint8Array(actual),right=new Uint8Array(expected);
  if(message===undefined)assert.deepEqual(left,right);else assert.deepEqual(left,right,message);
 }else assertJsonDataEqual(actual,expected,message);
}
