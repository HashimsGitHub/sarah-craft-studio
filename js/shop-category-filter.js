(function(){
  const labelCategory=value=>String(value||'')
    .replace(/[-_]+/g,' ')
    .replace(/\b\w/g,c=>c.toUpperCase());

  window.renderProducts=async function(){
    const el=document.querySelector('#product-grid');
    if(!el)return;

    let ps=(await products()).filter(x=>x.active!==false);
    const fixedCategory=el.dataset.category;
    if(fixedCategory)ps=ps.filter(p=>p.category===fixedCategory||(p.collections||[]).includes(fixedCategory));

    const search=document.querySelector('#search-products');
    const sort=document.querySelector('#sort-products');
    const categoryPanel=document.querySelector('#category-filter');
    let selectedCategory='all';

    if(categoryPanel&&!fixedCategory){
      const counts=new Map();
      ps.forEach(p=>{
        const category=String(p.category||'').trim();
        if(category)counts.set(category,(counts.get(category)||0)+1);
      });

      const categories=[...counts.keys()].sort((a,b)=>labelCategory(a).localeCompare(labelCategory(b)));
      categoryPanel.innerHTML=`
        <button class="category-option active" type="button" data-shop-category="all" aria-pressed="true">
          <span>All Products</span><small>${ps.length}</small>
        </button>
        ${categories.map(category=>`<button class="category-option" type="button" data-shop-category="${category}" aria-pressed="false"><span>${labelCategory(category)}</span><small>${counts.get(category)}</small></button>`).join('')}`;

      categoryPanel.querySelectorAll('[data-shop-category]').forEach(button=>{
        button.addEventListener('click',()=>{
          selectedCategory=button.dataset.shopCategory;
          categoryPanel.querySelectorAll('[data-shop-category]').forEach(x=>{
            const active=x===button;
            x.classList.toggle('active',active);
            x.setAttribute('aria-pressed',String(active));
          });
          draw();
        });
      });
    }

    const draw=()=>{
      let out=[...ps];
      if(selectedCategory!=='all')out=out.filter(p=>p.category===selectedCategory);
      if(search?.value){
        const term=search.value.toLowerCase();
        out=out.filter(p=>`${p.name||''} ${p.description||''}`.toLowerCase().includes(term));
      }
      if(sort?.value==='price-asc')out.sort((a,b)=>Number(a.price)-Number(b.price));
      if(sort?.value==='price-desc')out.sort((a,b)=>Number(b.price)-Number(a.price));
      if(sort?.value==='newest')out.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
      el.innerHTML=out.length?out.map(card).join(''):'<p>No products found.</p>';
    };

    search?.addEventListener('input',draw);
    sort?.addEventListener('change',draw);
    draw();
  };
})();
