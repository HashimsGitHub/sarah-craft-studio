(function(){
  const uniq=a=>[...new Set((a||[]).filter(Boolean))];

  function classifyProduct(product){
    const text=`${product.name||''} ${product.slug||''}`.toLowerCase();
    let category='home-decor';

    if(text.includes('bookmark')) category='bookmark';
    else if(text.includes('wood panel')) category='wood-art-panel';
    else if(text.includes('canvas')) category='canvas-art';
    else if(text.includes('coaster')) category='coasters';
    else if(text.includes('coloring book')) category='coloring-book';
    else if(text.includes('digital')) category='digital-downloads';
    else if(text.includes('glass can')||text.includes('libbey glass')||text.includes('glass cup')) category='glass-can';
    else if(text.includes('mug')||text.includes('drinkware')) category='drinkware';
    else if(text.includes('keychain')) category='keychains';
    else if(text.includes('magnet')) category='magnets';
    else if(text.includes('planner')) category='planners';
    else if(text.includes('sticker')) category='stickers';
    else if(text.includes('notepad')||text.includes('stationery')) category='stationery';

    const collections=uniq([...(product.collections||[])]);
    if(text.includes('father')||text.includes('dad')) collections.push('fathers-day-collection');
    if(text.includes('moroccan')) collections.push('moroccan-series');
    if(product.personalizable||text.includes('personalized')||text.includes('customizable')||text.includes('custom ')) collections.push('personalized-gifts');
    if(text.includes('kid')||text.includes('coloring book')) collections.push('kids');

    return {...product,category,collections:uniq(collections)};
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById('migrate-hostinger-catalog');
    const status=document.getElementById('migrate-hostinger-status');
    if(!button||!status)return;

    button.addEventListener('click',async()=>{
      if(!confirm('Migrate all 51 Hostinger products and copy their images to Azure Blob Storage? Existing matching product IDs will be updated; other products will not be deleted.'))return;
      button.disabled=true;
      status.textContent='Loading the 51-product migration catalogue…';
      try{
        const source=await fetch('/data/hostinger-products.json?v=hostinger-migration-2',{cache:'no-store'});
        if(!source.ok)throw new Error('Could not load the migration catalogue.');
        const rawProducts=await source.json();
        if(!Array.isArray(rawProducts)||rawProducts.length!==51)throw new Error(`Expected 51 products but found ${Array.isArray(rawProducts)?rawProducts.length:0}.`);
        const products=rawProducts.map(classifyProduct);

        let completed=0;
        let created=0;
        let updated=0;
        for(const product of products){
          status.textContent=`Migrating ${completed+1} of ${products.length}: ${product.name} [${product.category}]…`;
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
        status.textContent=`Migration complete: ${completed} products processed (${created} created, ${updated} updated). Categories were normalized to the production taxonomy and images were copied to Azure Blob Storage. Refreshing…`;
        setTimeout(()=>location.reload(),1500);
      }catch(e){
        console.error(e);
        status.textContent='Migration stopped: '+e.message+' You can safely run the migration again; completed products will be updated rather than duplicated.';
        button.disabled=false;
      }
    });
  });
})();
