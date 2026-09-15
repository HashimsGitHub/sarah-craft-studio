const WOO_PRODUCTS=[
  {
    id:'wc-17-floral-planner',slug:'floral-planner',name:'Floral Planner',category:'stationery',collections:['planners'],price:28,currency:'CAD',stock:0,active:true,personalizable:true,
    description:'Stay organized with this handmade planner featuring monthly and weekly layouts, customizable sections, and a durable cover adorned with delicate floral designs.',
    image:'https://images.unsplash.com/photo-1674383843388-9efe8a11a6b8'
  },
  {
    id:'wc-19-painted-bookmarks',slug:'painted-bookmarks',name:'Painted Bookmarks',category:'stationery',collections:['bookmarks'],price:12,currency:'CAD',stock:0,active:true,personalizable:false,
    description:'Add charm to your reading with these hand-painted bookmarks, each one unique and perfect for gifting or personal use.',
    image:'https://images.unsplash.com/photo-1702817058945-181086f94c0b'
  },
  {
    id:'wc-21-custom-drinkware',slug:'custom-drinkware',name:'Custom Drinkware',category:'drinkware',collections:['personalized'],price:22,currency:'CAD',stock:0,active:true,personalizable:true,
    description:'Sip in style with this personalized ceramic mug, featuring hand-drawn botanical illustrations and your choice of name or message.',
    image:'https://images.unsplash.com/photo-1646270719451-95e55479ffdb'
  },
  {
    id:'wc-23-whimsical-stickers',slug:'whimsical-stickers',name:'Whimsical Stickers',category:'stationery',collections:['stickers'],price:10,currency:'CAD',stock:0,active:true,personalizable:false,
    description:'Brighten your notebooks, laptops, or planners with this collection of hand-drawn stickers that bring a touch of magic to everyday items.',
    image:'https://images.unsplash.com/photo-1684569679940-193a0c277dd1'
  },
  {
    id:'wc-25-minimalist-notepad',slug:'minimalist-notepad',name:'Minimalist Notepad',category:'stationery',collections:['notepads','personalized'],price:15,currency:'CAD',stock:0,active:true,personalizable:true,
    description:'Jot down your thoughts and to-dos on this sleek notepad, crafted with quality paper and a cover you can personalize to suit your style.',
    image:'https://images.unsplash.com/photo-1678625451562-c0752ad45dae'
  }
];

async function importWooProducts(){
  const button=document.querySelector('#import-woocommerce-products');
  const status=document.querySelector('#import-products-status');
  if(!button||!status)return;
  if(!confirm('Import/update the 5 WooCommerce products in MongoDB? Existing products will not be deleted.'))return;
  button.disabled=true;
  status.textContent='Importing 5 products…';
  try{
    let imported=0;
    for(const product of WOO_PRODUCTS){
      const r=await fetch('/api/manage/products',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(product)
      });
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(body.message||`Could not import ${product.name}`);
      imported++;
      status.textContent=`Imported ${imported} of ${WOO_PRODUCTS.length} products…`;
    }
    status.textContent='Import complete. 5 WooCommerce products are now in MongoDB. Refreshing…';
    setTimeout(()=>location.reload(),800);
  }catch(e){
    status.textContent=`Import failed: ${e.message}`;
    button.disabled=false;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  const button=document.querySelector('#import-woocommerce-products');
  if(button)button.addEventListener('click',importWooProducts);
});
