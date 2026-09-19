const ALL_REVIEWS_API='/api';

const allReviewEsc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const allReviewStars=n=>'★'.repeat(Number(n)||0)+'☆'.repeat(5-(Number(n)||0));

async function initAllProductReviews(){
  const root=document.querySelector('#all-product-reviews');
  if(!root)return;

  const response=await fetch(`${ALL_REVIEWS_API}/reviews`);
  const data=await response.json();
  if(!response.ok)throw Error(data.message||'Unable to load reviews.');
  const reviews=data.reviews||[];

  const summary=document.querySelector('#all-reviews-summary');
  const search=document.querySelector('#all-reviews-search');
  const rating=document.querySelector('#all-reviews-rating');
  const product=document.querySelector('#all-reviews-product');

  const productNames=[...new Map(reviews.map(x=>[x.productId,x.productName])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
  productNames.forEach(([id,name])=>product.insertAdjacentHTML('beforeend',`<option value="${allReviewEsc(id)}">${allReviewEsc(name)}</option>`));

  const average=reviews.length?reviews.reduce((sum,x)=>sum+Number(x.rating||0),0)/reviews.length:0;
  summary.innerHTML=reviews.length?`<span class="review-stars">${allReviewStars(Math.round(average))}</span> <strong>${average.toFixed(1)}</strong> average from <strong>${reviews.length}</strong> published review${reviews.length===1?'':'s'}`:'No published reviews yet.';

  function draw(){
    const q=search.value.trim().toLowerCase();
    const stars=Number(rating.value||0);
    const pid=product.value;
    const filtered=reviews.filter(x=>{
      if(stars&&Number(x.rating)!==stars)return false;
      if(pid&&x.productId!==pid)return false;
      if(q&&!String(x.productName+' '+x.reviewText+' '+x.displayName).toLowerCase().includes(q))return false;
      return true;
    });

    if(!filtered.length){
      root.innerHTML='<div class="review-empty all-reviews-empty">No reviews match your filters.</div>';
      return;
    }

    root.innerHTML=filtered.map(x=>`<article class="all-review-card">
      <a class="all-review-product" href="/product.html?id=${encodeURIComponent(x.productId)}">
        <img src="${allReviewEsc(x.productImage||'')}" alt="${allReviewEsc(x.productName||'Product')}" loading="lazy">
        <div><span>Reviewed product</span><strong>${allReviewEsc(x.productName||'Product')}</strong></div>
      </a>
      <div class="all-review-body">
        <div class="review-card-head"><span class="review-stars">${allReviewStars(x.rating)}</span><time>${new Date(x.submittedAt).toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'})}</time></div>
        <p>${allReviewEsc(x.reviewText)}</p>
        <strong>${allReviewEsc(x.displayName||'Anonymous')}</strong>
      </div>
      <a class="all-review-link" href="/product.html?id=${encodeURIComponent(x.productId)}">View product →</a>
    </article>`).join('');
  }

  search.oninput=draw;
  rating.onchange=draw;
  product.onchange=draw;
  draw();
}

document.addEventListener('DOMContentLoaded',()=>initAllProductReviews().catch(err=>{
  console.error(err);
  const root=document.querySelector('#all-product-reviews');
  if(root)root.innerHTML=`<div class="admin-error">${allReviewEsc(err.message)}</div>`;
}));