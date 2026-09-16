const VACATION_API='/api/manage/store-settings';

async function initVacationAdmin(){
  const panel=document.querySelector('#vacation-panel');
  if(!panel)return;
  const toggle=panel.querySelector('#vacation-toggle');
  const message=panel.querySelector('#vacation-message');
  const state=panel.querySelector('#vacation-state');
  const save=panel.querySelector('#vacation-save');
  const status=panel.querySelector('#vacation-save-status');

  const r=await fetch(VACATION_API,{headers:{'Content-Type':'application/json'}});
  if(!r.ok)throw Error('Could not load Vacation Mode settings');
  const s=await r.json();
  toggle.checked=!!s.vacationMode;
  message.value=s.vacationMessage||'';

  const paint=()=>{
    state.textContent=toggle.checked?'ON — ordering is paused':'OFF — store is accepting orders';
    panel.classList.toggle('vacation-on',toggle.checked);
  };
  toggle.addEventListener('change',paint);paint();

  save.onclick=async()=>{
    save.disabled=true;status.textContent='Saving…';
    try{
      const rr=await fetch(VACATION_API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({vacationMode:toggle.checked,vacationMessage:message.value})});
      const j=await rr.json().catch(()=>({}));
      if(!rr.ok)throw Error(j.message||'Could not save Vacation Mode');
      status.textContent=toggle.checked?'Vacation Mode is ON. New checkout attempts are blocked.':'Vacation Mode is OFF. Store ordering is open.';
      paint();
    }catch(e){status.textContent=e.message}
    finally{save.disabled=false}
  };
}

document.addEventListener('DOMContentLoaded',()=>initVacationAdmin().catch(e=>{const x=document.querySelector('#vacation-save-status');if(x)x.textContent=e.message;}));
