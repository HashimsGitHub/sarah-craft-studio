function collectionKey(value){return String(value||'').trim().toLowerCase()}
function collectionLabel(value){return String(value||'').trim()}

async function initCollectionsPage(){
  const root=document.querySelector('#collection-products');
  const filter=document.querySelector('#collection-filter');
  if(!root||!filter)return;

  const ps=(await products()).filter(p=>p.active!==false);
  const map=new Map();
  ps.forEach(p=>(p.collections||[]).forEach(raw=>{
    const label=collectionLabel(raw);
    if(!label)return;
    const key=collectionKey(label);
    if(!map.has(key))map.set(key,label);
  }));

  const collections=[...map.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const params=new URLSearchParams(location.search);
  const requested=collectionKey(params.get('collection'));
  let selected=requested&&map.has(requested)?requested:'';

  function draw(){
    const items=ps.filter(p=>{
      const tags=(p.collections||[]).map(collectionKey).filter(Boolean);
      return selected?tags.includes(selected):tags.length>0;
    });

    const heading=document.querySelector('#collection-heading');
    const copy=document.querySelector('#collection-copy');
    if(selected){
      const label=map.get(selected);
      heading.textContent=label;
      copy.textContent=`Showing products tagged with the ${label} collection.`;
      document.title=`${label} Collection | Sarah Craft Studio`;
    }else{
      heading.textContent='All Collections';
      copy.textContent='Showing products assigned to at least one collection.';
      document.title='Collections | Sarah Craft Studio';
    }

    filter.innerHTML=`<button class="collection-chip ${selected?'':'active'}" data-collection="">All Collections</button>${collections.map(([key,label])=>`<button class="collection-chip ${selected===key?'active':''}" data-collection="${encodeURIComponent(key)}">${label}</button>`).join('')}`;

    filter.querySelectorAll('[data-collection]').forEach(btn=>btn.onclick=()=>{
      const key=decodeURIComponent(btn.dataset.collection||'');
      selected=key;
      const url=new URL(location.href);
      if(selected)url.searchParams.set('collection',map.get(selected));else url.searchParams.delete('collection');
      history.replaceState({},'',url);
      draw();
    });

    root.innerHTML=items.length?items.map(card).join(''):'<p>No active products are currently assigned to this collection.</p>';
  }

  if(!collections.length){
    filter.innerHTML='';
    document.querySelector('#collection-heading').textContent='Collections';
    document.querySelector('#collection-copy').textContent='No collections have been created yet.';
    root.innerHTML='<p>The shop owner can add collection names from Admin → Products.</p>';
    return;
  }
  draw();
}

document.addEventListener('DOMContentLoaded',()=>initCollectionsPage().catch(err=>{
  console.error(err);
  const root=document.querySelector('#collection-products');
  if(root)root.innerHTML='<p>Collections could not be loaded right now.</p>';
}));