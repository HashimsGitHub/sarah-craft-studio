const REVIEW_ADMIN_API='/api/manage';
const reEsc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const reStars=n=>'★'.repeat(Number(n)||0)+'☆'.repeat(5-(Number(n)||0));

async function reviewReq(path,opt={}){
  const r=await fetch(REVIEW_ADMIN_API+path,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(j.message||'Request failed');
  return j;
}

async function initReviewAdmin(){
  const root=document.querySelector('#admin-reviews');
  const form=document.querySelector('#admin-review-form');
  if(!root||!form)return;

  const products=(await reviewReq('/products')).products||[];
  const options=products.map(p=>`<option value="${reEsc(p.id)}">${reEsc(p.name)}</option>`).join('');
  form.productId.insertAdjacentHTML('beforeend',options);
  document.querySelector('#review-product-filter').insertAdjacentHTML('beforeend',options);

  const search=document.querySelector('#review-search');
  const status=document.querySelector('#review-status-filter');
  const rating=document.querySelector('#review-rating-filter');
  const product=document.querySelector('#review-product-filter');
  const saveStatus=document.querySelector('#admin-review-save-status');

  async function load(){
    const qs=new URLSearchParams();
    if(status.value)qs.set('status',status.value);
    if(rating.value)qs.set('rating',rating.value);
    if(product.value)qs.set('productId',product.value);
    const data=await reviewReq('/reviews'+(qs.toString()?'?'+qs:''));
    const q=search.value.trim().toLowerCase();
    const reviews=(data.reviews||[]).filter(x=>!q||[x.productName,x.reviewText,x.displayName,x.email].some(v=>String(v||'').toLowerCase().includes(q)));
    if(!reviews.length){root.innerHTML='<div class="admin-empty">No reviews match these filters.</div>';return;}
    root.innerHTML=`<div class="review-admin-list">${reviews.map(x=>`<article class="review-admin-row" data-id="${x._id}">
      <div class="review-admin-product"><img src="${reEsc(x.productImage||'')}" alt=""><div><strong>${reEsc(x.productName)}</strong><small>${reEsc(x.productId)}</small></div></div>
      <div class="review-admin-copy"><div><span class="review-stars">${reStars(x.rating)}</span> <time>${new Date(x.submittedAt).toLocaleDateString('en-CA')}</time></div><p>${reEsc(x.reviewText)}</p><small>Shown as <strong>${reEsc(x.displayName||'Anonymous')}</strong>${x.email?' · '+reEsc(x.email):''} · Source: ${reEsc(x.source||'customer')}</small></div>
      <div class="review-admin-status"><span class="admin-status-pill">${reEsc(x.status)}</span><div class="admin-actions">${x.status!=='published'?'<button class="btn admin-small" data-action="publish">Approve</button>':''}${x.status!=='rejected'?'<button class="btn secondary admin-small" data-action="reject">Reject</button>':''}<button class="admin-danger" data-action="delete">Delete</button></div></div>
    </article>`).join('')}</div>`;

    root.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=async()=>{
      const row=btn.closest('[data-id]');
      const id=row.dataset.id;
      if(btn.dataset.action==='delete'){
        if(!confirm('Delete this review permanently?'))return;
        await reviewReq('/reviews/'+encodeURIComponent(id),{method:'DELETE'});
      }else{
        const next=btn.dataset.action==='publish'?'published':'rejected';
        await reviewReq('/reviews/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({status:next})});
      }
      await load();
    });
  }

  [status,rating,product].forEach(x=>x.onchange=load);
  search.oninput=()=>load().catch(console.error);

  form.onsubmit=async e=>{
    e.preventDefault();
    saveStatus.textContent='Saving review…';
    try{
      const d=Object.fromEntries(new FormData(form));
      d.rating=Number(d.rating);
      if(d.nameMode!=='anonymous'&&!String(d.fullName||'').trim())throw Error('Enter the reviewer name or choose Anonymous.');
      await reviewReq('/reviews',{method:'POST',body:JSON.stringify(d)});
      saveStatus.textContent='Review added successfully.';
      form.reset();
      form.rating.value='5';form.status.value='published';form.source.value='migrated';
      await load();
    }catch(err){saveStatus.textContent='Save failed: '+err.message;}
  };

  await load();
}

document.addEventListener('DOMContentLoaded',()=>initReviewAdmin().catch(err=>{
  console.error(err);
  const e=document.querySelector('#admin-error');if(e)e.textContent=err.message;
}));