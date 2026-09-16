(function(){
  const DEFAULT_MESSAGE='We’re taking a short break. You’re welcome to browse, but ordering is temporarily unavailable.';
  let status={vacationMode:false,vacationMessage:DEFAULT_MESSAGE};

  function injectStyles(){
    if(document.querySelector('#vacation-mode-styles'))return;
    const s=document.createElement('style');s.id='vacation-mode-styles';s.textContent=`
      .vacation-banner{background:#f6e8ea;color:#30262a;border-bottom:1px solid #eadfe1;padding:13px 20px;text-align:center;font-weight:600;position:relative;z-index:35}
      .vacation-banner strong{font-family:'Playfair Display',serif;font-size:1.05rem;margin-right:6px}
      .vacation-disabled{opacity:.55!important;cursor:not-allowed!important;pointer-events:none!important}
      .vacation-note{margin-top:12px;padding:12px 14px;border:1px solid #eadfe1;border-radius:12px;background:#fff7f7;color:#75686d;font-size:.92rem}
    `;document.head.appendChild(s);
  }

  function ensureBanner(){
    if(!status.vacationMode||document.querySelector('.vacation-banner'))return;
    const header=document.querySelector('.site-header');
    const b=document.createElement('div');b.className='vacation-banner';b.setAttribute('role','status');
    b.innerHTML=`<strong>Vacation Mode 🌸</strong>${status.vacationMessage||DEFAULT_MESSAGE}`;
    if(header)header.insertAdjacentElement('afterend',b);else document.body.prepend(b);
  }

  function disableOrdering(){
    if(!status.vacationMode)return;
    ensureBanner();
    const add=document.querySelector('#add-cart');
    if(add){add.disabled=true;add.classList.add('vacation-disabled');add.textContent='Ordering temporarily unavailable';if(!add.parentElement.querySelector('.vacation-note')){const n=document.createElement('p');n.className='vacation-note';n.textContent=status.vacationMessage||DEFAULT_MESSAGE;add.insertAdjacentElement('afterend',n)}}
    const checkout=document.querySelector('#checkout-btn');
    if(checkout){checkout.classList.add('vacation-disabled');checkout.removeAttribute('href');checkout.setAttribute('aria-disabled','true')}
    const form=document.querySelector('#checkout-form');
    if(form){const submit=form.querySelector('button[type="submit"]');if(submit){submit.disabled=true;submit.classList.add('vacation-disabled');submit.textContent='Ordering temporarily unavailable'}if(!form.querySelector('.vacation-note')){const n=document.createElement('p');n.className='vacation-note';n.textContent=status.vacationMessage||DEFAULT_MESSAGE;form.prepend(n)}}
    const coupon=document.querySelector('#apply-discount');if(coupon){coupon.disabled=true;coupon.classList.add('vacation-disabled')}
  }

  async function init(){
    injectStyles();
    try{const r=await fetch('/api/store-status',{cache:'no-store'});if(r.ok)status=await r.json()}catch{}
    window.SCS_STORE_STATUS=status;
    disableOrdering();
    if(status.vacationMode){const observer=new MutationObserver(disableOrdering);observer.observe(document.body,{childList:true,subtree:true})}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
