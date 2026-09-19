const A='/api/manage';

async function req(path,opt={}){
  const r=await fetch(A+path,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
  if(r.status===401||r.status===403){
    document.body.innerHTML='<div class="admin-shell"><h1>Admin sign-in required</h1><p>You must sign in with an account assigned the <strong>admin</strong> role in Azure Static Web Apps.</p><a class="btn" href="/.auth/login/github?post_login_redirect_uri=/admin/">Sign in with GitHub</a></div>';
    throw Error('Unauthorized');
  }
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw Error(j.message||'Request failed');
  return j;
}

const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n)||0);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const date=v=>v?new Date(v).toLocaleString('en-CA',{dateStyle:'medium',timeStyle:'short'}):'—';
const statusLabel=s=>String(s||'new').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

async function initIdentity(){
  const status=document.querySelector('#admin-status');
  if(!status) return;
  const me=await req('/me');
  status.innerHTML=`Signed in as <strong>${esc(me.userDetails||'administrator')}</strong>. <a href="/.auth/logout?post_logout_redirect_uri=/">Sign out</a>`;
}

async function initDashboard(){
  const root=document.querySelector('#admin-dashboard');
  if(!root) return;
  const x=await req('/dashboard');
  const s=x.stats;
  root.innerHTML=`
    <div class="admin-kpi-grid">
      <div class="admin-kpi"><span>Revenue</span><strong>${money(s.revenue)}</strong></div>
      <div class="admin-kpi"><span>Total orders</span><strong>${s.totalOrders}</strong></div>
      <div class="admin-kpi"><span>Awaiting fulfilment</span><strong>${s.pendingOrders}</strong></div>
      <div class="admin-kpi"><span>Shipped</span><strong>${s.shippedOrders}</strong></div>
      <div class="admin-kpi"><span>Products</span><strong>${s.totalProducts}</strong><small>${s.activeProducts} active</small></div>
      <div class="admin-kpi"><span>Low stock</span><strong>${s.lowStockProducts}</strong></div>
      <div class="admin-kpi"><span>Active discounts</span><strong>${s.activeDiscounts}</strong></div>
      <div class="admin-kpi"><span>Delivered</span><strong>${s.deliveredOrders}</strong></div>
    </div>
    <div class="admin-panel"><div class="admin-panel-head"><h2>Recent orders</h2><a href="/admin/orders.html">View all orders →</a></div>${ordersTable(x.recentOrders,false)}</div>`;
}

function ordersTable(orders,editable=true){
  if(!orders.length) return '<div class="admin-empty">No orders yet.</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Payment</th><th>Fulfilment</th>${editable?'<th>Manage</th>':''}</tr></thead><tbody>${orders.map(o=>`<tr><td><strong>${esc(o.orderNumber||o.paypalOrderId||'')}</strong></td><td>${date(o.createdAt)}</td><td>${esc(o.customer?.email||'')}</td><td>${money(o.total)}</td><td>${esc(o.paymentStatus||'')}</td><td><span class="admin-status-pill">${esc(statusLabel(o.fulfilmentStatus))}</span></td>${editable?`<td><button class="btn secondary admin-small" data-order="${esc(o.orderNumber||o.paypalOrderId||o._id)}">Manage</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}

async function initProducts(){
  const form=document.querySelector('#admin-product-form');
  const list=document.querySelector('#admin-products');
  if(!form||!list) return;
  const msg=document.querySelector('#admin-form-status');

  async function draw(){
    const x=await req('/products');
    list.innerHTML=x.products.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${x.products.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.id)}</small></td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${Number(p.stock)||0}</td><td>${p.active?'Active':'Hidden'}</td><td><div class="admin-actions"><button class="btn secondary admin-small" data-edit-product="${esc(p.id)}">Edit</button><button class="admin-danger" data-delete-product="${esc(p.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-empty">No products in MongoDB yet.</div>';
    list.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=async()=>fillProduct((await req('/products/'+encodeURIComponent(b.dataset.editProduct))).product));
    list.querySelectorAll('[data-delete-product]').forEach(b=>b.onclick=async()=>{if(confirm(`Delete ${b.dataset.deleteProduct}?`)){await req('/products/'+encodeURIComponent(b.dataset.deleteProduct),{method:'DELETE'});await draw();}});
  }

  function fillProduct(p){
    form.reset();
    document.querySelector('#product-image-upload-status').textContent='';
    for(const [k,v] of Object.entries(p)){if(form.elements[k]&&form.elements[k].type!=='checkbox') form.elements[k].value=Array.isArray(v)?v.join(', '):(v??'');}
    form.personalizable.checked=!!p.personalizable;
    form.active.checked=p.active!==false;
    form.dataset.editing=p.id;
    document.querySelector('#product-form-title').textContent='Edit product';
    document.querySelector('#product-cancel').hidden=false;
    window.scrollTo({top:0,behavior:'smooth'});
  }

  document.querySelector('#product-cancel').onclick=()=>{form.reset();form.dataset.editing='';document.querySelector('#product-form-title').textContent='Add product';document.querySelector('#product-cancel').hidden=true;document.querySelector('#product-image-upload-status').textContent='';};
  form.onsubmit=async e=>{
    e.preventDefault();
    const save=form.querySelector('button[type="submit"]');
    const imageInput=document.querySelector('#product-image-file');
    const imageStatus=document.querySelector('#product-image-upload-status');
    save.disabled=true;msg.textContent='Saving product…';
    try{
      if(imageInput.files?.[0]){
        await window.uploadProductImage(imageInput.files[0],form,imageStatus);
        imageInput.value='';
      }
      const d=Object.fromEntries(new FormData(form));
      if(!d.image) throw Error('Add an image URL or choose an image to upload.');
      d.price=Number(d.price);d.stock=Number(d.stock||0);d.personalizable=form.personalizable.checked;d.active=form.active.checked;
      d.collections=String(d.collections||'').split(',').map(x=>x.trim()).filter(Boolean);
      const editing=form.dataset.editing;
      await req(editing?'/products/'+encodeURIComponent(editing):'/products',{method:editing?'PUT':'POST',body:JSON.stringify(d)});
      const imageMessage=imageStatus.textContent;
      msg.textContent='Product saved successfully.';
      imageStatus.textContent=imageMessage.replace('Save the product to use it.','Image saved to product.');
      form.reset();form.dataset.editing='';document.querySelector('#product-form-title').textContent='Add product';document.querySelector('#product-cancel').hidden=true;await draw();
    }catch(error){msg.textContent='Save failed: '+error.message;}
    finally{save.disabled=false;}
  };
  await draw();
}

async function initDiscounts(){
  const form=document.querySelector('#admin-discount-form');
  const list=document.querySelector('#admin-discounts');
  if(!form||!list) return;
  const msg=document.querySelector('#admin-discount-status');
  const type=form.elements.type;
  const valueUnit=document.querySelector('#discount-value-unit');
  const minItems=document.querySelector('#minimum-items-fields');
  const minTotal=document.querySelector('#minimum-total-fields');
  const usageFields=document.querySelector('#usage-limit-fields');
  const voucherEmailFields=document.querySelector('#voucher-email-fields');
  const voucherCampaignNote=document.querySelector('#voucher-campaign-note');

  function surpriseCode(){
    const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes=new Uint32Array(6);
    crypto.getRandomValues(bytes);
    return 'SURPRISE'+Array.from(bytes,n=>chars[n%chars.length]).join('');
  }
  function sync(){
    valueUnit.textContent=type.value==='percentage'?'%':type.value==='fixed'?'CAD':'';
    form.value.disabled=type.value==='free_shipping';
    const mt=form.querySelector('input[name="minimumType"]:checked')?.value||'none';
    minItems.hidden=mt!=='items'; minTotal.hidden=mt!=='total';
    form.minimumItems.required=mt==='items'; form.minimumOrder.required=mt==='total';
    const rt=form.querySelector('input[name="redemptionType"]:checked')?.value||'unlimited';
    usageFields.hidden=rt!=='limited'; form.usageLimit.required=rt==='limited';
    form.expiresAt.disabled=form.noEndDate.checked;
    if(form.noEndDate.checked) form.expiresAt.value='';
    const audience=form.querySelector('input[name="audienceType"]:checked')?.value||'email';
    voucherEmailFields.hidden=audience!=='email';
    voucherCampaignNote.hidden=audience!=='campaign';
    form.allowedEmail.required=audience==='email';
    if(audience==='campaign') form.allowedEmail.value='';
  }
  type.onchange=sync;
  form.querySelectorAll('input[name="minimumType"],input[name="redemptionType"],input[name="noEndDate"],input[name="audienceType"]').forEach(x=>x.onchange=sync);
  document.querySelector('#generate-discount-code').onclick=()=>{form.code.value=surpriseCode();};

  async function draw(){
    const x=await req('/discounts');
    list.innerHTML=x.discounts.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Audience</th><th>Discount</th><th>Minimum</th><th>Usage</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>${x.discounts.map(d=>`<tr><td><strong>${esc(d.code)}</strong></td><td>${d.audienceType==='campaign'?'Mass campaign':esc(d.allowedEmail||'Customer email')}</td><td>${d.type==='percentage'?`${Number(d.value)}%`:d.type==='fixed'?money(d.value):'Free shipping'}</td><td>${Number(d.minimumItems||0)>0?`${Number(d.minimumItems)} items`:Number(d.minimumOrder||0)>0?money(d.minimumOrder):'None'}</td><td>${Number(d.usageCount||0)}${d.usageLimit!=null?` / ${Number(d.usageLimit)}`:' / ∞'}${d.singleUsePerBuyer?' · 1/buyer':''}</td><td>${d.expiresAt?date(d.expiresAt):'No end date'}</td><td>${d.active?'Active':'Disabled'}</td><td><div class="admin-actions"><button class="btn secondary admin-small" data-edit-discount="${esc(d.code)}">Edit</button><button class="admin-danger" data-delete-discount="${esc(d.code)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-empty">No discount codes configured.</div>';
    list.querySelectorAll('[data-edit-discount]').forEach(b=>b.onclick=async()=>fill((await req('/discounts/'+encodeURIComponent(b.dataset.editDiscount))).discount));
    list.querySelectorAll('[data-delete-discount]').forEach(b=>b.onclick=async()=>{if(confirm(`Delete discount ${b.dataset.deleteDiscount}?`)){await req('/discounts/'+encodeURIComponent(b.dataset.deleteDiscount),{method:'DELETE'});await draw();}});
  }

  function fill(d){
    form.reset();
    form.code.value=d.code||'';
    form.type.value=d.type||'percentage';
    form.value.value=d.value??0;
    form.allowedEmail.value=d.allowedEmail||'';
    const audience=d.audienceType==='campaign'||!d.allowedEmail?'campaign':'email';
    form.querySelector(`input[name="audienceType"][value="${audience}"]`).checked=true;
    const mt=Number(d.minimumItems||0)>0?'items':Number(d.minimumOrder||0)>0?'total':'none';
    form.querySelector(`input[name="minimumType"][value="${mt}"]`).checked=true;
    form.minimumItems.value=d.minimumItems??'';
    form.minimumOrder.value=d.minimumOrder??'';
    form.startsAt.value=d.startsAt?new Date(d.startsAt).toISOString().slice(0,10):'';
    form.noEndDate.checked=!d.expiresAt;
    form.expiresAt.value=d.expiresAt?new Date(d.expiresAt).toISOString().slice(0,10):'';
    const rt=d.usageLimit==null?'unlimited':'limited';
    form.querySelector(`input[name="redemptionType"][value="${rt}"]`).checked=true;
    form.usageLimit.value=d.usageLimit??'';
    form.singleUsePerBuyer.checked=d.singleUsePerBuyer!==false;
    form.active.checked=d.active!==false;
    form.dataset.editing=d.code;
    document.querySelector('#discount-form-title').textContent='Edit offer';
    document.querySelector('#discount-cancel').hidden=false;
    sync();window.scrollTo({top:0,behavior:'smooth'});
  }
  function reset(){
    form.reset();form.dataset.editing='';form.code.value=surpriseCode();form.noEndDate.checked=true;form.singleUsePerBuyer.checked=true;
    document.querySelector('#discount-form-title').textContent='Customize your offer details';document.querySelector('#discount-cancel').hidden=true;msg.textContent='';sync();
  }
  document.querySelector('#discount-cancel').onclick=reset;
  form.onsubmit=async e=>{
    e.preventDefault();msg.textContent='Saving discount…';
    try{
      const d=Object.fromEntries(new FormData(form));
      d.value=form.type.value==='free_shipping'?0:Number(d.value||0);
      d.audienceType=d.audienceType||'email';
      d.allowedEmail=d.audienceType==='email'?String(d.allowedEmail||'').trim().toLowerCase():'';
      d.minimumItems=d.minimumType==='items'?Number(d.minimumItems||0):0;
      d.minimumOrder=d.minimumType==='total'?Number(d.minimumOrder||0):0;
      d.usageLimit=d.redemptionType==='limited'?Number(d.usageLimit||0):null;
      d.singleUsePerBuyer=form.singleUsePerBuyer.checked;
      d.expiresAt=form.noEndDate.checked?'':d.expiresAt;
      d.active=form.active.checked;
      const editing=form.dataset.editing;
      await req(editing?'/discounts/'+encodeURIComponent(editing):'/discounts',{method:editing?'PUT':'POST',body:JSON.stringify(d)});
      msg.textContent='Discount saved successfully.';reset();await draw();
    }catch(error){msg.textContent='Save failed: '+error.message;}
  };
  reset();await draw();
}

async function initOrders(){
  const list=document.querySelector('#admin-orders');
  if(!list) return;
  const filter=document.querySelector('#order-status-filter');
  const editor=document.querySelector('#order-editor');

  async function draw(){
    const q=filter?.value?`?status=${encodeURIComponent(filter.value)}`:'';
    const x=await req('/orders'+q);
    list.innerHTML=ordersTable(x.orders,true);
    list.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.order));
  }

  async function openOrder(id){
    const o=(await req('/orders/'+encodeURIComponent(id))).order;
    editor.hidden=false;editor.dataset.order=o.orderNumber||o.paypalOrderId||o._id;
    editor.querySelector('#order-editor-title').textContent=`Order ${o.orderNumber||o.paypalOrderId||''}`;
    editor.querySelector('#order-customer').innerHTML=`<strong>${esc(o.customer?.name||o.customer?.email||'Customer')}</strong><br>${esc(o.customer?.email||'')}<br>${esc(o.customer?.phone||'')}`;
    editor.querySelector('#order-items').innerHTML=(o.items||[]).map(i=>`<div class="admin-order-item"><span>${Number(i.quantity)||1} × ${esc(i.name)}</span><strong>${money((Number(i.unitPrice)||0)*(Number(i.quantity)||1))}</strong>${i.personalization?`<small>Personalization: ${esc(i.personalization)}</small>`:''}</div>`).join('');
    editor.querySelector('[name="fulfilmentStatus"]').value=o.fulfilmentStatus||'new';
    editor.querySelector('[name="method"]').value=o.delivery?.method||'shipping';
    editor.querySelector('[name="carrier"]').value=o.delivery?.carrier||'';
    editor.querySelector('[name="trackingNumber"]').value=o.delivery?.trackingNumber||'';
    editor.querySelector('[name="adminNotes"]').value=o.adminNotes||'';
    editor.querySelector('#order-summary').innerHTML=`Subtotal ${money(o.subtotal)} · Discount ${money(o.discount)} · Shipping ${money(o.shipping)} · <strong>Total ${money(o.total)}</strong><br>Payment: ${esc(o.paymentStatus||'')} · Created: ${date(o.createdAt)}`;
    window.scrollTo({top:editor.offsetTop-30,behavior:'smooth'});
  }

  editor.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const d=Object.fromEntries(new FormData(f));await req('/orders/'+encodeURIComponent(editor.dataset.order),{method:'PUT',body:JSON.stringify({fulfilmentStatus:d.fulfilmentStatus,adminNotes:d.adminNotes,delivery:{method:d.method,carrier:d.carrier,trackingNumber:d.trackingNumber}})});document.querySelector('#order-save-status').textContent='Order updated successfully.';await draw();};
  document.querySelector('#order-editor-close').onclick=()=>{editor.hidden=true;};
  if(filter) filter.onchange=draw;
  await draw();
}

async function init(){
  await initIdentity();
  await Promise.all([initDashboard(),initProducts(),initDiscounts(),initOrders()]);
}

document.addEventListener('DOMContentLoaded',()=>init().catch(e=>{console.error(e);const el=document.querySelector('#admin-error');if(el)el.textContent=e.message;}));
