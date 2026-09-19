(function(){
  const MAX_INPUT_BYTES = 8 * 1024 * 1024;
  const MAX_DIMENSION = 1600;

  function fileToBase64(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
      reader.onerror=()=>reject(new Error('Could not read the converted image.'));
      reader.readAsDataURL(file);
    });
  }

  async function convertToWebP(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
    if(!file.size || file.size>MAX_INPUT_BYTES) throw new Error('Image must be 8 MB or smaller.');

    // Browser decoding applies the photo's EXIF orientation before it is drawn.
    const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    try{
      const scale=Math.min(1,MAX_DIMENSION/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');
      if(!context) throw new Error('Image conversion is unavailable in this browser.');
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.8));
      if(!blob || blob.type!=='image/webp') throw new Error('This browser cannot convert images to WebP.');
      if(blob.size>MAX_INPUT_BYTES) throw new Error('Converted image is still larger than 8 MB. Choose a smaller image.');
      return blob;
    }finally{
      bitmap.close();
    }
  }

  function formatSize(bytes){return (bytes/1024).toFixed(0)+' KB';}

  async function uploadProductImage(file,form,status){
    status.textContent='Optimizing image as WebP…';
    const optimized=await convertToWebP(file);
    status.textContent='Uploading optimized image…';
    const data=await fileToBase64(optimized);
    const productSlug=String(form.elements.slug?.value||form.elements.name?.value||'product-image').trim();
    const r=await fetch('/api/manage/product-image',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fileName:file.name,productSlug,contentType:'image/webp',data})
    });
    const body=await r.json().catch(()=>({}));
    if(r.status===401||r.status===403) throw new Error('Administrator sign-in is required.');
    if(!r.ok) throw new Error(body.message||'Image upload failed.');
    form.elements.image.value=body.url;
    status.textContent=`WebP ready: ${formatSize(file.size)} → ${formatSize(optimized.size)}. Save the product to use it.`;
    return body.url;
  }

  window.uploadProductImage=uploadProductImage;
})();
