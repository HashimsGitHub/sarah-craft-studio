(function(){
  function fileToBase64(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
      reader.onerror=()=>reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(file);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const form=document.querySelector('#admin-product-form');
    const input=document.querySelector('#product-image-file');
    const button=document.querySelector('#product-image-upload');
    const status=document.querySelector('#product-image-upload-status');
    if(!form||!input||!button||!status)return;

    button.addEventListener('click',async()=>{
      const file=input.files?.[0];
      if(!file){status.textContent='Choose an image first.';return;}
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent='Use a JPG, PNG or WEBP image.';return;}
      if(file.size>8*1024*1024){status.textContent='Image must be 8 MB or smaller.';return;}

      button.disabled=true;
      status.textContent='Uploading image to Azure Blob Storage…';
      try{
        const data=await fileToBase64(file);
        const productSlug=String(form.elements.slug?.value||form.elements.name?.value||'product-image').trim();
        const r=await fetch('/api/manage/product-image',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({fileName:file.name,productSlug,contentType:file.type,data})
        });
        const body=await r.json().catch(()=>({}));
        if(r.status===401||r.status===403)throw new Error('Administrator sign-in is required.');
        if(!r.ok)throw new Error(body.message||'Image upload failed.');
        form.elements.image.value=body.url;
        status.textContent='Image uploaded. The Azure Blob URL has been added to Primary image URL.';
      }catch(e){
        console.error(e);
        status.textContent='Upload failed: '+e.message;
      }finally{
        button.disabled=false;
      }
    });
  });
})();
