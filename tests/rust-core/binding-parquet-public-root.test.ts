// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import type {Document} from '../../src/model/types';
import {captureParquet,projectBindingToParquet} from '../../src/index-node-v4';

const fixture=await Bun.file('fixtures/binding/parquet/case.json').json();
const logical=fixture.logical as Document,binding=fixture.binding as Document;
const bytes=new Uint8Array(await Bun.file(fixture.native).arrayBuffer());
const native=captureParquet(bytes,{id:'binding-parquet-source'});
test('public Parquet binding projection validates native capture and preserves reported losses or blocks strict lowering',()=>{
 const report=projectBindingToParquet(logical,binding,'report',native);
 expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(12);expect(report.nativeArchive).toEqual(native);expect(report.binding).toEqual(binding);expect(report.logical).toEqual(logical);
 const strict=projectBindingToParquet(logical,binding,'strict',native);
 expect(strict.status).toBe('blocked');expect(strict.nativeArchive).toEqual(native);expect(strict.residuals).toHaveLength(12);
},60_000);
