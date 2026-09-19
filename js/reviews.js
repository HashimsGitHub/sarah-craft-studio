const REVIEW_API='/api';

const reviewEsc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const starText=n=>'★'.repeat(Number(n)||0)+'☆'.repeat(5-(Number(n)||0));

async function initProductReviews(){
  const root=document.querySelector('#product-reviews');
  if(!root)return;
  const productId=new URLSearchParams(location.search).get('id');
  if(!productId)return;

  const list=document.querySelector('#review-list');
  const form=document.querySelector('#review-form');
  const status=document.querySelector('#review-form-status');
  const summary=document.querySelector('#review-summary');

  async function load(){
    const r=await fetch(`${REVIEW_API}/reviews/${encodeURIComponent(productId)}`);
    const j=await r.json();
    const reviews=j.reviews||[];
    if(reviews.length){
      const avg=reviews.reduce((a,x)=>a+Number(x.rating||0),0)/reviews.length;
      summary.innerHTML=`<span class="review-stars">${starText(Math.round(avg))}</span> <strong>${avg.toFixed(1)}</strong> · ${reviews.length} review${reviews.length===1?'':'s'}`;
      list.innerHTML=reviews.map(x=>`<article class="review-card"><div class="review-card-head"><span class="review-stars">${starText(x.rating)}</span><time>${new Date(x.submittedAt).toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'})}</time></div><p>${reviewEsc(x.reviewText)}</p><strong>${reviewEsc(x.displayName||'Anonymous')}</strong></article>`).join('');
    }else{
      summary.textContent='No reviews yet.';
      list.innerHTML='<p class="review-empty">Be the first to review this product.</p>';
    }
  }

  form.querySelectorAll('[data-rating]').forEach(btn=>btn.onclick=()=>{
    form.rating.value=btn.dataset.rating;
    form.querySelectorAll('[data-rating]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.rating)<=Number(btn.dataset.rating)));
  });

  const nameMode=form.elements.nameMode;
  function syncName(){
    const selected=form.querySelector('input[name="nameMode"]:checked')?.value||'anonymous';
    const field=document.querySelector('#review-name-field');
    field.hidden=selected==='anonymous';
    form.fullName.required=selected!=='anonymous';
  }
  form.querySelectorAll('input[name="nameMode"]').forEach(x=>x.onchange=syncName);
  syncName();

  form.onsubmit=async e=>{
    e.preventDefault();
    status.textContent='Submitting review…';
    try{
      const data=Object.fromEntries(new FormData(form));
      data.productId=productId;
      data.rating=Number(data.rating);
      if(!data.rating)throw Error('Please choose a star rating.');
      const r=await fetch(`${REVIEW_API}/reviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const j=await r.json();
      if(!r.ok)throw Error(j.message||'Review could not be submitted.');
      status.textContent=j.message;
      form.reset();form.rating.value='';form.querySelectorAll('[data-rating]').forEach(x=>x.classList.remove('selected'));syncName();
    }catch(err){status.textContent=err.message;}
  };

  await load();
}

document.addEventListener('DOMContentLoaded',()=>initProductReviews().catch(console.error));