// Host navigation around the exact released catalog workspace. Old catalog hashes remain valid.
const main=document.querySelector('main.explorer-main');
if(main){
 const routeSelfModel=()=>{const params=new URLSearchParams(location.hash.slice(1));if(params.get('schema')==='spec/metamodel/umf.yaml')location.replace('reference/core.html#view=ontology');};
 window.addEventListener('hashchange',routeSelfModel);routeSelfModel();
 const hub=document.createElement('section');hub.className='schema-hub';
 hub.innerHTML='<h1>Schemas</h1><p>Explore UMF’s own model, look up object keys and values, or browse models written in UMF.</p><nav aria-label="Schema views"><a href="reference/core.html#view=ontology">Ontology</a><a href="reference/core.html#view=reference">Object reference</a><a href="explorer.html" aria-current="page">Model catalog</a></nav>';
 main.before(hub);
 const style=document.createElement('style');style.textContent='.explorer-main>.page-top{display:none}.schema-hub{max-width:1440px;margin:auto;padding:24px 4%}.schema-hub h1{font:normal clamp(32px,4vw,48px) Georgia,serif;margin:12px 0 22px}.schema-hub p{max-width:70ch;color:var(--muted,#65736b);font-size:18px}.schema-hub nav{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line,#d2d9ce);padding:12px 0 22px}.schema-hub nav a{padding:9px 15px;border:1px solid var(--line,#d2d9ce);border-radius:4px;text-decoration:none}.schema-hub nav a[aria-current]{background:#203c35;color:#f4f1e9}';document.head.append(style);
}
