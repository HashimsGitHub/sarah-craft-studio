(function(){
  document.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById('migrate-hostinger-catalog');
    const status=document.getElementById('migrate-hostinger-status');
    if(!button||!status)return;

    button.addEventListener('click',async()=>{
      if(!confirm('Migrate all 51 Hostinger products and copy their images to Azure Blob Storage? Existing matching product IDs will be updated; other products will not be deleted.'))return;
      button.disabled=true;
      status.textContent='Loading the 51-product migration catalogue…';
      try{
        const source=await fetch('/data/hostinger-products.json?v=hostinger-migration-1',{cache:'no-store'});
        if(!source.ok)throw new Error('Could not load the migration catalogue.');
        const products=await source.json();
        if(!Array.isArray(products)||products.length!==51)throw new Error(`Expected 51 products but found ${Array.isArray(products)?products.length:0}.`);

        let completed=0;
        let created=0;
        let updated=0;
        for(const product of products){
          status.textContent=`Migrating ${completed+1} of ${products.length}: ${product.name}…`;
          const r=await fetch('/api/manage/hostinger-catalog-migration',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(product)
          });
          const body=await r.json().catch(()=>({}));
          if(!r.ok)throw new Error(`${product.name}: ${body.message||'migration request failed'}`);
          completed++;
          if(body.created)created++;else updated++;
        }
        status.textContent=`Migration complete: ${completed} products processed (${created} created, ${updated} updated). Images were copied to Azure Blob Storage. Refreshing…`;
        setTimeout(()=>location.reload(),1500);
      }catch(e){
        console.error(e);
        status.textContent='Migration stopped: '+e.message+' You can safely run the migration again; completed products will be updated rather than duplicated.';
        button.disabled=false;
      }
    });
  });
})();
