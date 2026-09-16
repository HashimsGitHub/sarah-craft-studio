const { app } = require('@azure/functions');
const { MongoClient } = require('mongodb');
const { EmailClient } = require('@azure/communication-email');
const crypto = require('crypto');

let client;
let database;

const json=(body,status=200)=>({status,jsonBody:body,headers:{'Cache-Control':'no-store'}});
const cleanString=(value,max=500)=>String(value??'').trim().slice(0,max);
const normalizeEmail=value=>cleanString(value,320).toLowerCase();
const emailRegex=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function db(){
  if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is not configured');
  if(!client){client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});await client.connect()}
  if(!database)database=client.db(process.env.MONGODB_DB||'sarahcraftstudio');
  return database;
}

async function readBody(req){try{return await req.json()}catch{return {}}}

function exactEmailRegex(email){
  const escaped=email.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`^${escaped}$`,'i');
}

async function sendMail(to,subject,html){
  if(!to||!process.env.ACS_EMAIL_CONNECTION_STRING||!process.env.EMAIL_SENDER)return;
  const c=new EmailClient(process.env.ACS_EMAIL_CONNECTION_STRING);
  await c.beginSend({senderAddress:process.env.EMAIL_SENDER,content:{subject,html},recipients:{to:[{address:to}]}});
}

async function uniqueWelcomeCode(d){
  for(let i=0;i<10;i++){
    const code='WELCOME-'+crypto.randomBytes(4).toString('hex').toUpperCase();
    if(!await d.collection('discounts').findOne({code}))return code;
  }
  throw new Error('Could not generate a unique welcome code');
}

app.http('newsletterSubscribe',{
  methods:['POST'],authLevel:'anonymous',route:'newsletter/subscribe',
  handler:async req=>{
    try{
      const x=await readBody(req);
      const email=normalizeEmail(x.email);
      if(!emailRegex.test(email))return json({message:'Please enter a valid email address.'},400);

      const d=await db();
      const now=new Date();
      const contacts=d.collection('contacts');
      const existing=await contacts.findOne({email});
      const completedOrder=await d.collection('orders').findOne({
        'customer.email':exactEmailRegex(email),
        paymentStatus:'COMPLETED'
      });

      await contacts.updateOne(
        {email},
        {
          $set:{email,marketingOptIn:true,source:'website-footer',updatedAt:now},
          $setOnInsert:{joinedAt:now}
        },
        {upsert:true}
      );

      if(completedOrder){
        if(!existing){
          await Promise.allSettled([
            sendMail(email,'Welcome to Sarah Craft Studio',`<h2>Welcome to Sarah Craft Studio 🌸</h2><p>Thanks for joining our mailing list.</p><p>Our 10% welcome offer is reserved for first-time customers, and our records show this email has already been used for an order.</p>`),
            sendMail(process.env.ADMIN_EMAIL||'info@sarahcraftstudio.com','New Sarah Craft Studio mailing list signup',`<h2>New mailing list signup</h2><p>${email}</p><p>Existing customer — no first-order discount issued.</p>`)
          ]);
        }
        return json({success:true,eligible:false,message:'Thanks for joining! The 10% welcome discount is available to first-time customers only.'});
      }

      let code=existing?.welcomeDiscountCode||null;
      let discount=code?await d.collection('discounts').findOne({code}):null;
      if(!discount||discount.active===false||Number(discount.usageCount||0)>=1){
        code=await uniqueWelcomeCode(d);
        await d.collection('discounts').insertOne({
          code,
          type:'percentage',
          value:10,
          minimumOrder:0,
          usageLimit:1,
          usageCount:0,
          active:true,
          allowedEmail:email,
          welcomeDiscount:true,
          startsAt:now,
          expiresAt:null,
          createdAt:now,
          updatedAt:now
        });
        await contacts.updateOne({email},{$set:{welcomeDiscountCode:code,welcomeDiscountIssuedAt:now,updatedAt:now}});
      }

      if(!existing){
        await Promise.allSettled([
          sendMail(email,'Your Sarah Craft Studio 10% welcome discount',`<h2>Welcome to Sarah Craft Studio 🌸</h2><p>Thanks for joining our circle.</p><p>Your unique first-order discount code is:</p><p style="font-size:22px;font-weight:bold;letter-spacing:1px">${code}</p><p>Use it at checkout for <strong>10% off your first order</strong>. This code is single-use and linked to ${email}.</p>`),
          sendMail(process.env.ADMIN_EMAIL||'info@sarahcraftstudio.com','New Sarah Craft Studio mailing list signup',`<h2>New mailing list signup</h2><p>${email}</p><p>First-time customer welcome code issued: <strong>${code}</strong></p>`)
        ]);
      }

      return json({success:true,eligible:true,code,message:existing?'You are already subscribed. Here is your unused first-order discount code.':'Welcome! Your unique 10% first-order discount code is ready.'});
    }catch(e){
      return json({message:e.message||'Unable to join the mailing list.'},500);
    }
  }
});
