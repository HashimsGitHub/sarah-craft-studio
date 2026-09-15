const PICKUP_KEY='scs_pickup';

function pickupActive(){return localStorage.getItem(PICKUP_KEY)==='PICKUPYYC'}
function setPickup(active){if(active)localStorage.setItem(PICKUP_KEY,'PICKUPYYC');else localStorage.removeItem(PICKUP_KEY)}

function totals(c,disc,pickup=pickupActive()){
  const subtotal=c.reduce((a,x)=>a+x.price*x.quantity,0);
  let discount=0;
  let shipping=pickup?0:(subtotal>=75?0:5);
  if(disc?.valid){
    if(disc.type==='percentage')discount=subtotal*(disc.value/100);
    if(disc.type==='fixed')discount=Math.min(subtotal,disc.value);
    if(disc.type==='free_shipping')shipping=0;
  }
  return{subtotal,discount,shipping,pickup,total:Math.max(0,subtotal-discount+shipping)};
}

function renderSummary(sel){
  const el=document.querySelector(sel);if(!el)return;
  const t=totals(cart(),JSON.parse(localStorage.getItem(DISCOUNT_KEY)||'null'));
  const delivery=t.pickup?'<p>Delivery <strong>Calgary Pickup</strong></p>':`<p>Shipping <strong>${t.shipping?money(t.shipping):'FREE'}</strong></p>`;
  el.innerHTML=`<p>Subtotal <strong>${money(t.subtotal)}</strong></p>${t.discount?`<p>Discount <strong>−${money(t.discount)}</strong></p>`:''}${delivery}<hr><p>Total <strong>${money(t.total)}</strong></p>`;
}

async function discount(){
  const btn=document.querySelector('#apply-discount');if(!btn)return;
  btn.onclick=async()=>{
    const code=document.querySelector('#discount-code').value.trim().toUpperCase();
    const m=document.querySelector('#discount-message');
    if(!code)return;
    if(code==='PICKUPYYC'){
      setPickup(true);
      m.textContent='Calgary pickup applied. Shipping is $0. You can still apply a separate promo code.';
      document.querySelector('#discount-code').value='';
      renderSummary('#cart-summary');
      return;
    }
    try{
      const subtotal=totals(cart(),null).subtotal;
      const r=await fetch(`${API}/discounts/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,subtotal})});
      const d=await r.json();
      if(!r.ok||!d.valid)throw Error(d.message||'Invalid code');
      localStorage.setItem(DISCOUNT_KEY,JSON.stringify(d));
      m.textContent=`${code} applied${pickupActive()?' (Calgary pickup remains active)':''}`;
      document.querySelector('#discount-code').value='';
      renderSummary('#cart-summary');
    }catch(e){m.textContent=e.message}
  };
}

async function checkout(){
  const f=document.querySelector('#checkout-form');if(!f)return;
  const pickupBox=document.querySelector('#pickup');
  const pickupNote=document.querySelector('#pickup-note');
  if(pickupBox){
    const active=pickupActive();
    pickupBox.checked=active;
    pickupBox.disabled=!active;
    if(pickupNote)pickupNote.textContent=active?'PICKUPYYC is applied. Uncheck to use shipping instead.':'Apply PICKUPYYC in the cart to enable free Calgary pickup.';
    pickupBox.addEventListener('change',()=>{
      if(!pickupBox.checked){
        setPickup(false);
        pickupBox.disabled=true;
        if(pickupNote)pickupNote.textContent='Calgary pickup removed. Apply PICKUPYYC in the cart to enable it again.';
      }
      renderSummary('#checkout-summary');
    });
  }
  renderSummary('#checkout-summary');
  f.onsubmit=async e=>{
    e.preventDefault();
    const status=document.querySelector('#checkout-status');
    status.textContent='Creating secure PayPal checkout…';
    try{
      const fd=new FormData(f);
      fd.delete('pickup');
      const isPickup=Boolean(pickupBox?.checked&&pickupActive());
      const body={
        customer:Object.fromEntries(fd),
        cart:cart(),
        discount:JSON.parse(localStorage.getItem(DISCOUNT_KEY)||'null'),
        deliveryMethod:isPickup?'pickup':'shipping',
        pickupCode:isPickup?'PICKUPYYC':null
      };
      const r=await fetch(`${API}/checkout/create-v2`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok)throw Error(j.message||'Unable to start checkout');
      if(j.approveUrl)location.href=j.approveUrl;else throw Error('PayPal approval URL was not returned');
    }catch(err){status.textContent=err.message}
  };
}
