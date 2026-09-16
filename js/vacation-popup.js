(function(){
  const KEY='scs_vacation_popup_seen';
  const FALLBACK='We’re taking a short break. You’re welcome to browse, but ordering is temporarily unavailable.';

  function closePopup(root,key){
    try{sessionStorage.setItem(KEY,key)}catch{}
    root.remove();
    document.body.style.overflow='';
  }

  function showPopup(message){
    const key=message;
    try{if(sessionStorage.getItem(KEY)===key)return}catch{}

    const style=document.createElement('style');
    style.textContent=`
      .vacation-popup-backdrop{position:fixed;inset:0;background:rgba(48,38,42,.48);display:grid;place-items:center;padding:20px;z-index:9999}
      .vacation-popup-card{width:min(520px,100%);background:#fffaf6;border:1px solid #eadfe1;border-radius:22px;box-shadow:0 24px 70px rgba(61,36,43,.22);padding:32px;text-align:center;color:#30262a;position:relative}
      .vacation-popup-icon{font-size:2rem;margin-bottom:8px}
      .vacation-popup-card h2{font-family:'Playfair Display',serif;margin:0 0 12px;font-size:1.8rem}
      .vacation-popup-card p{margin:0 0 22px;line-height:1.65;color:#75686d;white-space:pre-line}
      .vacation-popup-close{border:0;background:#b76e79;color:#fff;border-radius:999px;padding:11px 22px;font:inherit;font-weight:600;cursor:pointer}
      .vacation-popup-x{position:absolute;right:14px;top:12px;border:0;background:transparent;color:#75686d;font-size:1.5rem;line-height:1;cursor:pointer;padding:6px}
    `;
    document.head.appendChild(style);

    const root=document.createElement('div');
    root.className='vacation-popup-backdrop';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-labelledby','vacation-popup-title');

    const card=document.createElement('div');
    card.className='vacation-popup-card';

    const x=document.createElement('button');
    x.type='button';
    x.className='vacation-popup-x';
    x.setAttribute('aria-label','Close');
    x.textContent='×';

    const icon=document.createElement('div');
    icon.className='vacation-popup-icon';
    icon.textContent='🌸';

    const title=document.createElement('h2');
    title.id='vacation-popup-title';
    title.textContent='A little note from Sarah Craft Studio';

    const text=document.createElement('p');
    text.textContent=message;

    const button=document.createElement('button');
    button.type='button';
    button.className='vacation-popup-close';
    button.textContent='Continue browsing';

    card.append(x,icon,title,text,button);
    root.appendChild(card);
    document.body.appendChild(root);
    document.body.style.overflow='hidden';

    const close=()=>closePopup(root,key);
    x.addEventListener('click',close);
    button.addEventListener('click',close);
    root.addEventListener('click',e=>{if(e.target===root)close()});
    document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){document.removeEventListener('keydown',esc);close()}});
    button.focus();
  }

  async function init(){
    try{
      const r=await fetch('/api/store-status',{cache:'no-store'});
      if(!r.ok)return;
      const status=await r.json();
      if(status.vacationMode!==true)return;
      showPopup(String(status.vacationMessage||FALLBACK).trim()||FALLBACK);
    }catch{}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
