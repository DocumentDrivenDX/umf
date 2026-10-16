import {expect,test} from 'bun:test';
import {licenseModules,moduleNotice,dependencyLicenseBasename} from '../../scripts/protobuf-module-notices';

test('module notices are identical across host paths and inventory order',()=>{
 const mac='umf.local/protobuf||/Users/a/repo/native/protobuf|true|false\nz/module|v2.0.0|/Users/a/go/z|false|false\na/module|v1.0.0|/Users/a/go/a|false|false\n';
 const linux='a/module|v1.0.0|/home/runner/go/a|false|false\numf.local/protobuf||/home/runner/repo/native/protobuf|true|false\nz/module|v2.0.0|/home/runner/go/z|false|false\n';
 expect(moduleNotice(licenseModules(mac))).toBe(moduleNotice(licenseModules(linux)));
 expect(moduleNotice(licenseModules(mac))).toContain('a/module|v1.0.0\nz/module|v2.0.0');
 expect(moduleNotice(licenseModules(mac))).not.toContain('/Users/');
 expect(moduleNotice(licenseModules(linux))).not.toContain('/home/runner/');
});
test('uncached or ambiguous module license inventories refuse instead of omitting a dependency',()=>{
 for(const text of ['a/module|v1.0.0||false|false','a/module||/cache|false|false','a|v1|/cache|invalid','a|v1|/cache|false|false\na|v2|/cache2|false|false'])expect(()=>licenseModules(text)).toThrow();
});

test('replacements and flattened license-name collisions refuse explicitly',()=>{
 expect(()=>licenseModules('example.org/a|v1.0.0|/replacement|false|true')).toThrow('replacements');
 expect(()=>licenseModules('example.org/a/b|v1.0.0|/cache/a|false|false\nexample.org/a-b|v1.0.0|/cache/b|false|false')).toThrow('filename');
});

test('license lookup preserves real filename case and refuses missing or ambiguous entries',()=>{
 expect(dependencyLicenseBasename(['Readme','License','go.mod'])).toBe('License');
 expect(dependencyLicenseBasename(['README.md','LICENSE','go.mod'])).toBe('LICENSE');
 expect(()=>dependencyLicenseBasename(['README.md','LICENSE.txt'])).toThrow();
 expect(()=>dependencyLicenseBasename(['LICENSE','License'])).toThrow();
});
