(function(){
  const root=document.querySelector('#admin-products');
  const controls=document.querySelector('#product-table-controls');
  if(!root||!controls)return;

  const search=controls.querySelector('#product-filter-search');
  const category=controls.querySelector('#product-filter-category');
  const minPrice=controls.querySelector('#product-filter-price-min');
  const maxPrice=controls.querySelector('#product-filter-price-max');
  const minStock=controls.querySelector('#product-filter-stock-min');
  const maxStock=controls.querySelector('#product-filter-stock-max');
  const status=controls.querySelector('#product-filter-status');
  const clear=controls.querySelector('#product-filter-clear');
  const count=controls.querySelector('#product-filter-count');

  let sortIndex=0;
  let sortDirection='asc';
  let scheduled=false;

  function numberFrom(value){
    const n=Number(String(value||'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  }

  function cells(row){return Array.from(row.cells||[])}

  function refreshCategoryOptions(rows){
    const current=category.value;
    const values=[...new Set(rows.map(row=>cells(row)[1]?.textContent.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    category.innerHTML='<option value="">All categories</option>'+values.map(v=>`<option value="${v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}">${v}</option>`).join('');
    if(values.includes(current))category.value=current;
  }

  function valueForSort(row,index){
    const text=cells(row)[index]?.textContent.trim()||'';
    if(index===2||index===3)return numberFrom(text);
    return text.toLowerCase();
  }

  function apply(){
    scheduled=false;
    observer.disconnect();
    const table=root.querySelector('table');
    const tbody=table?.querySelector('tbody');
    if(!table||!tbody){
      if(count)count.textContent='';
      observe();
      return;
    }

    const rows=Array.from(tbody.rows);
    refreshCategoryOptions(rows);

    const query=String(search.value||'').trim().toLowerCase();
    const selectedCategory=category.value;
    const priceMin=minPrice.value===''?null:Number(minPrice.value);
    const priceMax=maxPrice.value===''?null:Number(maxPrice.value);
    const stockMin=minStock.value===''?null:Number(minStock.value);
    const stockMax=maxStock.value===''?null:Number(maxStock.value);
    const selectedStatus=status.value;

    rows.sort((a,b)=>{
      const av=valueForSort(a,sortIndex),bv=valueForSort(b,sortIndex);
      let result=0;
      if(typeof av==='number'&&typeof bv==='number')result=av-bv;
      else result=String(av).localeCompare(String(bv));
      return sortDirection==='asc'?result:-result;
    });
    rows.forEach(row=>tbody.appendChild(row));

    let visible=0;
    rows.forEach(row=>{
      const c=cells(row);
      const product=(c[0]?.textContent||'').toLowerCase();
      const cat=(c[1]?.textContent||'').trim();
      const price=numberFrom(c[2]?.textContent);
      const stockValue=numberFrom(c[3]?.textContent);
      const rowStatus=(c[4]?.textContent||'').trim();
      const show=(!query||product.includes(query))&&
        (!selectedCategory||cat===selectedCategory)&&
        (priceMin===null||price>=priceMin)&&
        (priceMax===null||price<=priceMax)&&
        (stockMin===null||stockValue>=stockMin)&&
        (stockMax===null||stockValue<=stockMax)&&
        (!selectedStatus||rowStatus===selectedStatus);
      row.hidden=!show;
      if(show)visible++;
    });

    const headers=Array.from(table.querySelectorAll('thead th')).slice(0,5);
    const labels=['Product','Category','Price','Stock','Status'];
    headers.forEach((th,index)=>{
      th.classList.add('admin-sortable');
      th.tabIndex=0;
      th.setAttribute('role','button');
      th.setAttribute('aria-label',`Sort by ${labels[index]}`);
      th.textContent=labels[index]+(sortIndex===index?(sortDirection==='asc'?' ↑':' ↓'):' ↕');
      th.onclick=()=>{if(sortIndex===index)sortDirection=sortDirection==='asc'?'desc':'asc';else{sortIndex=index;sortDirection='asc'}apply()};
      th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();th.click()}};
    });

    if(count)count.textContent=`Showing ${visible} of ${rows.length} products`;
    observe();
  }

  function schedule(){if(scheduled)return;scheduled=true;setTimeout(apply,0)}
  const observer=new MutationObserver(schedule);
  function observe(){observer.observe(root,{childList:true,subtree:true})}

  [search,minPrice,maxPrice,minStock,maxStock].forEach(el=>el?.addEventListener('input',apply));
  [category,status].forEach(el=>el?.addEventListener('change',apply));
  clear?.addEventListener('click',()=>{
    search.value='';category.value='';minPrice.value='';maxPrice.value='';minStock.value='';maxStock.value='';status.value='';sortIndex=0;sortDirection='asc';apply();
  });

  observe();
  schedule();
})();
