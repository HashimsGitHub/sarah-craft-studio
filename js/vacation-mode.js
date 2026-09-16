(function(){
  async function init(){
    const checkout=document.querySelector('#checkout-btn');
    if(!checkout)return;
    try{
      const r=await fetch('/api/store-status',{cache:'no-store'});
      if(!r.ok)return;
      const status=await r.json();
      if(status.vacationMode!==true)return;
      checkout.removeAttribute('href');
      checkout.setAttribute('aria-disabled','true');
      checkout.style.opacity='.55';
      checkout.style.cursor='not-allowed';
      checkout.style.pointerEvents='none';
      checkout.textContent='Checkout unavailable — Vacation Mode';
      checkout.title=status.vacationMessage||'Ordering is temporarily unavailable.';
    }catch{}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
