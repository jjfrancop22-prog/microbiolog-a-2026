let deferredInstallPrompt=null;
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
const byId=id=>document.getElementById(id);
const CURRENT_VERSION=document.querySelector('meta[name="app-version"]')?.content||'UNKNOWN';
let updateRegistration=null;
let updateDetected=false;
function setInstallVisible(show){const el=byId('microInstallApp');if(el)el.style.display=show&&!isStandalone()?'inline-flex':'none'}
async function installApp(){
  if(isStandalone())return;
  if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}catch{}deferredInstallPrompt=null;setInstallVisible(false);return}
  const msg=/Mac/i.test(navigator.platform||'')?'Para instalar MICROBIOLOGÍA ERP: en Chrome/Edge use el icono Instalar de la barra de direcciones; en Safari use Archivo → Añadir al Dock.':'Para instalar MICROBIOLOGÍA ERP, use el icono Instalar aplicación de Chrome o Edge en la barra de direcciones.';alert(msg);
}
function showUpdate(registration,remoteVersion=''){
  updateRegistration=registration||updateRegistration;
  updateDetected=true;
  let bar=document.getElementById('microPwaUpdate');
  if(!bar){
    bar=document.createElement('div');bar.id='microPwaUpdate';
    bar.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:999999;background:#173c29;color:#fff;padding:11px 13px;border-radius:11px;box-shadow:0 12px 34px #0004;display:flex;gap:10px;align-items:center;font:600 12px system-ui;max-width:min(94vw,620px)';
    bar.innerHTML='<span id="microPwaUpdateText">Nueva versión de MICROBIOLOGÍA ERP disponible.</span><button type="button" style="border:0;border-radius:8px;padding:7px 10px;font-weight:800;cursor:pointer;white-space:nowrap">Actualizar ahora</button>';
    bar.querySelector('button').addEventListener('click',applyUpdate);
    document.body.appendChild(bar);
  }
  const txt=byId('microPwaUpdateText');if(txt)txt.textContent=remoteVersion?`Nueva versión ${remoteVersion} disponible. Estás usando ${CURRENT_VERSION}.`:'Nueva versión de MICROBIOLOGÍA ERP disponible.';
}
async function applyUpdate(){
  const btn=document.querySelector('#microPwaUpdate button');if(btn){btn.disabled=true;btn.textContent='Actualizando…'}
  try{
    if(updateRegistration){
      await updateRegistration.update().catch(()=>{});
      if(updateRegistration.waiting){updateRegistration.waiting.postMessage({type:'SKIP_WAITING'});return;}
    }
  }catch{}
  const u=new URL(location.href);u.searchParams.set('_pwa_update',Date.now().toString());location.replace(u.toString());
}
async function checkPublishedVersion(registration){
  try{
    const r=await fetch(`/version.json?_=${Date.now()}`,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(!r.ok)return;
    const data=await r.json();const remote=String(data?.version||'').trim();
    if(remote&&CURRENT_VERSION!=='UNKNOWN'&&remote!==CURRENT_VERSION)showUpdate(registration,remote);
  }catch{}
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;setInstallVisible(true)});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;setInstallVisible(false)});
window.addEventListener('DOMContentLoaded',()=>{byId('microInstallApp')?.addEventListener('click',installApp);setInstallVisible(false)});
if('serviceWorker' in navigator){
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)return;refreshing=true;const u=new URL(location.href);u.searchParams.set('_pwa_update',Date.now().toString());location.replace(u.toString())});
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});updateRegistration=reg;
      if(reg.waiting)showUpdate(reg);
      reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate(reg)})});
      await reg.update().catch(()=>{});await checkPublishedVersion(reg);
      setInterval(()=>{reg.update().catch(()=>{});checkPublishedVersion(reg)},60*1000);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){reg.update().catch(()=>{});checkPublishedVersion(reg)}});
      window.addEventListener('focus',()=>checkPublishedVersion(reg));
    }catch{}
  });
}
