import {test,expect} from 'bun:test';
import {browserDocument} from '../../docs/helix/05-deploy/schema-browser';
test('caller catalog stays inert and assets resolve independently of host routing',()=>{
 const html=browserDocument({assetsUrl:'/tools/browser',entries:[{id:'example',title:'Example',category:'example',path:'example.json',format:'json',text:'</script><script>evil()</script>'}],assetBaseUrl:'/sources/',initialRoute:'schema=example'},'https://consumer.test/app/');
 expect(html).toContain('https://consumer.test/tools/browser/explorer.js');
 expect(html).not.toContain('<base ');
 expect(html).toContain('\\u003c/script>');expect(html).not.toContain('<script>evil()');
 expect(html).toContain('"assetBaseUrl":"https://consumer.test/sources/"');
 expect(html).not.toContain('documentdrivendx.github.io');expect(html).not.toContain('fonts.googleapis');
});
test('explicit catalogs and hosted HTTP assets are required',()=>{
 expect(()=>browserDocument({assetsUrl:'javascript:evil()',entries:[]},'https://consumer.test/')).toThrow('HTTP(S)');
 expect(()=>browserDocument({assetsUrl:'/browser/'},'https://consumer.test/')).toThrow('Supply entries or catalogUrl');
 expect(browserDocument({assetsUrl:'/browser/',catalogUrl:'/catalog.json'},'https://consumer.test/')).toContain('"catalogUrl":"https://consumer.test/catalog.json"');
});
