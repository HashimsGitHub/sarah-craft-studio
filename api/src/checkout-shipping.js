const { app } = require('@azure/functions');
const { MongoClient } = require('mongodb');

let client;
let database;

const json=(body,status=200)=>({status,jsonBody:body,headers:{'Cache-Control':'no-store'}});
const cleanString=(value,max=500)=>String(value??'').trim().slice(0,max);
const normalizeEmail=value=>cleanString(value,320).toLowerCase();
async function readBody(req){try{return await req.json()}catch{return {}}}
async function db(){
  if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is not configured');
  if(!client){client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});await client.connect()}
  if(!database)database=client.db(process.env.MONGODB_DB||'sarahcraftstudio');
  return database;
}

function exactEmailRegex(email){
  const escaped=email.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`^${escaped}$`,'i');
}

async function vacationGuard(d){
  const settings=await d.collection('settings').findOne({_id:'store'});
  if(settings?.vacationMode===true){
    return json({message:cleanString(settings.vacationMessage,500)||'Sarah Craft Studio is currently on a short break. Ordering is temporarily unavailable.',vacationMode:true},503);
  }
  return null;
}

async function officialCart(d,items=[]){
  let total=0;const out=[];
  for(const i of items){
    const p=await d.collection('products').findOne({id:i.productId,active:{$ne:false}});
    if(!p)throw new Error(`Product ${i.productId} is unavailable`);
    const q=Math.max(1,Math.min(99,Number(i.quantity)||1));
    if(Number.isFinite(Number(p.stock))&&Number(p.stock)>0&&q>Number(p.stock))throw new Error(`Only ${p.stock} of ${p.name} are available`);
    out.push({productId:p.id,name:p.name,unitPrice:Number(p.price),quantity:q,personalization:cleanString(i.personalization,500)});
    total+=Number(p.price)*q;
  }
  return{items:out,subtotal:total};
}

async function paypalToken(){
  const id=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
  if(!id||!secret)throw new Error('PayPal is not configured');
  const base=process.env.PAYPAL_BASE_URL||'https://api-m.sandbox.paypal.com';
  const r=await fetch(`${base}/v1/oauth2/token`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${id}:${secret}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  if(!r.ok)throw new Error('Could not authenticate with PayPal');
  return{base,token:(await r.json()).access_token};
}

app.http('checkoutCreateV2',{
  methods:['POST'],authLevel:'anonymous',route:'checkout/create-v2',
  handler:async req=>{
    try{
      const x=await readBody(req);
      const d=await db();
      const blocked=await vacationGuard(d);if(blocked)return blocked;
      const oc=await officialCart(d,x.cart);
      const requestedMethod=cleanString(x.deliveryMethod,50).toLowerCase();
      const pickupCode=cleanString(x.pickupCode,50).toUpperCase();
      const isPickup=requestedMethod==='pickup'&&pickupCode==='PICKUPYYC';
      const deliveryMethod=isPickup?'pickup':'shipping';

      let discount=0;
      let shipping=isPickup?0:(oc.subtotal>=75?0:5);
      let discountCode=null;

      if(x.discount?.code){
        const c=await d.collection('discounts').findOne({code:cleanString(x.discount.code,50).toUpperCase(),active:true});
        const now=new Date();
        const usable=c&&(!c.startsAt||new Date(c.startsAt)<=now)&&(!c.expiresAt||new Date(c.expiresAt)>=now)&&(!c.minimumOrder||oc.subtotal>=Number(c.minimumOrder))&&(c.usageLimit==null||Number(c.usageCount||0)<Number(c.usageLimit));
        if(c?.welcomeDiscount){
          const checkoutEmail=normalizeEmail(x.customer?.email);
          if(!checkoutEmail||checkoutEmail!==normalizeEmail(c.allowedEmail))throw new Error('This welcome discount code is linked to a different email address.');
          const previousOrder=await d.collection('orders').findOne({'customer.email':exactEmailRegex(checkoutEmail),paymentStatus:'COMPLETED'});
          if(previousOrder)throw new Error('This 10% welcome discount is available on your first order only.');
        }
        if(usable){
          discountCode=c.code;
          if(c.type==='percentage')discount=oc.subtotal*(Number(c.value)/100);
          if(c.type==='fixed')discount=Math.min(oc.subtotal,Number(c.value));
          if(c.type==='free_shipping')shipping=0;
        }
      }

      const total=Math.max(0,oc.subtotal-discount+shipping);
      const pp=await paypalToken();
      const site=process.env.PUBLIC_SITE_URL||'https://gray-plant-097bd000f.6.azurestaticapps.net';
      const r=await fetch(`${pp.base}/v2/checkout/orders`,{
        method:'POST',
        headers:{Authorization:`Bearer ${pp.token}`,'Content-Type':'application/json'},
        body:JSON.stringify({intent:'CAPTURE',purchase_units:[{amount:{currency_code:'CAD',value:total.toFixed(2)}}],application_context:{return_url:`${site}/order-success.html`,cancel_url:`${site}/cart.html`}})
      });
      const p=await r.json();
      if(!r.ok)throw new Error(p.message||'PayPal order failed');

      const orderNumber=`SCS-${Date.now()}`;
      await d.collection('orders').insertOne({
        orderNumber,
        paypalOrderId:p.id,
        customer:x.customer||{},
        items:oc.items,
        subtotal:oc.subtotal,
        discount,
        discountCode,
        shipping,
        total,
        currency:'CAD',
        paymentStatus:'CREATED',
        fulfilmentStatus:'new',
        delivery:{method:deliveryMethod,pickupCode:isPickup?'PICKUPYYC':null,carrier:'',trackingNumber:'',shippedAt:null,deliveredAt:null},
        adminNotes:'',
        createdAt:new Date(),
        updatedAt:new Date()
      });

      return json({orderId:p.id,orderNumber,deliveryMethod,shipping,approveUrl:p.links?.find(l=>l.rel==='approve')?.href});
    }catch(e){return json({message:e.message},500)}
  }
});
