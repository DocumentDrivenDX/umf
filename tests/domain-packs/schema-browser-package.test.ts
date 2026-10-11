import {test,expect} from 'bun:test';
import {browserDocument} from '../../docs/helix/05-deploy/schema-browser';
test('caller catalog stays inert and assets resolve independently of host routing',()=>{
 const html=browserDocument({assetsUrl:'/tools/browser',entries:[{id:'example',title:'Example',category:'example',path:'example.json',format:'json',text:'</script><script>evil()</script>'}],assetBaseUrl:'/sources/',initialRoute:'schema=example'},'https://consumer.test/app/');
 expect(html).toContain('https://consumer.test/tools/browser/explorer.js');
 expect(html).not.toContain('<base '); // Absolute asset URLs preserve host routing without a CSP base-uri exception.
 const config=html.match(/<script id="umf-browser-config" type="application\/json">([^]*?)<\/script>/)?.[1];expect(config).toBeDefined();expect(JSON.parse(config!).entries[0].text).toBe('</script><script>evil()</script>');expect(html).not.toContain('<script>evil()');
 expect(html).toContain('"assetBaseUrl":"https://consumer.test/sources/"');
 expect(html).not.toContain('documentdrivendx.github.io');expect(html).not.toContain('fonts.googleapis');
});
test('explicit catalogs and hosted HTTP assets are required',()=>{
 expect(()=>browserDocument({assetsUrl:'javascript:evil()',entries:[]},'https://consumer.test/')).toThrow('HTTP(S)');
 expect(()=>browserDocument({assetsUrl:'/browser/'},'https://consumer.test/')).toThrow('Supply entries or catalogUrl');
 expect(browserDocument({assetsUrl:'/browser/',catalogUrl:'/catalog.json'},'https://consumer.test/')).toContain('"catalogUrl":"https://consumer.test/catalog.json"');
});
