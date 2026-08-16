const VERSION='V3.5.3-C1';
const SCHEMA_VERSION=1;
const WORKSPACE_ID='lab-psi';
let CLOUD_SYNC_ENABLED=localStorage.getItem('microbio_cloud_enabled')==='true'; // sesión unificada puede activarla automáticamente tras login válido
function syncVisibleAppVersion(){
  const el=document.getElementById('appVersionLabel');
  if(el) el.textContent=`${VERSION} · Local-First`;
}
const DB_NAME='microbiology_erp';
const DB_VERSION=2;
const MEDIA_DOMAINS=['mediaPrep','mediaQC','mediaRelease','catalogMedia','catalogPersonnel','catalogBottles','systemConfig','auditLog','performanceTasks','performanceTests','performanceLinks'];
const STRAIN_DOMAINS=['catalogStrains','strainPreparations','strainReactivations','strainCryovialEvents'];
const MICRO_DOMAINS=['catalogMonitoringPoints','microbiologicalControls','microPlateEvents','microActions','monitoringFrequencyDecisions'];
const QUALITY_DOMAINS=['coliformQCControls','coliformQCActions'];
const SAMPLE_DOMAINS=['sampleIntakes','sampleAnalyses','duplicateEvaluations'];
const PRODUCT_DOMAINS=['productCatalog','productLots','productUsage','productClosures','productTrace'];
const EQUIPMENT_DOMAINS=['equipmentCatalog','equipmentControls','equipmentCleaning','equipmentTrace','environmentalConditions','environmentHolidays','environmentTrace','environmentConfig','refrigeratorConfig','refrigeratorReadings','refrigeratorTrace','refrigerator2Config','refrigerator2Readings','refrigerator2Trace','incubatorConfig','incubatorReadings','incubatorVerifications','incubatorTrace','waterBathConfig','waterBathReadings','waterBathVerifications','waterBathTrace','phMeterConfig','phMeterReadings','phMeterAccuracy','phMeterTrace'];
const RULE_DOMAINS=['criteriaRules','criteriaVersions','catalogMicroorganisms'];
const DOMAINS=[...MEDIA_DOMAINS,...STRAIN_DOMAINS,...MICRO_DOMAINS,...QUALITY_DOMAINS,...SAMPLE_DOMAINS,...PRODUCT_DOMAINS,...EQUIPMENT_DOMAINS,...RULE_DOMAINS];
const CLOUD_COLLECTIONS=Object.freeze(Object.fromEntries(DOMAINS.map(d=>[d,d])));
const deviceId=localStorage.getItem('microbio_device_id') || crypto.randomUUID();
localStorage.setItem('microbio_device_id',deviceId);
const state={mediaPrep:[],mediaQC:[],mediaRelease:[],catalogMedia:[],catalogPersonnel:[],catalogBottles:[],systemConfig:[],auditLog:[],performanceTasks:[],performanceTests:[],performanceLinks:[],catalogStrains:[],strainPreparations:[],strainReactivations:[],strainCryovialEvents:[],catalogMonitoringPoints:[],microbiologicalControls:[],microPlateEvents:[],microActions:[],monitoringFrequencyDecisions:[],coliformQCControls:[],coliformQCActions:[],sampleIntakes:[],sampleAnalyses:[],duplicateEvaluations:[],productCatalog:[],productLots:[],productUsage:[],productClosures:[],productTrace:[],equipmentCatalog:[],equipmentControls:[],equipmentCleaning:[],equipmentTrace:[],environmentalConditions:[],environmentHolidays:[],environmentTrace:[],environmentConfig:[],refrigeratorConfig:[],refrigeratorReadings:[],refrigeratorTrace:[],refrigerator2Config:[],refrigerator2Readings:[],refrigerator2Trace:[],incubatorConfig:[],incubatorReadings:[],incubatorVerifications:[],incubatorTrace:[],waterBathConfig:[],waterBathReadings:[],waterBathVerifications:[],waterBathTrace:[],phMeterConfig:[],phMeterReadings:[],phMeterAccuracy:[],phMeterTrace:[],criteriaRules:[],criteriaVersions:[],catalogMicroorganisms:[],firebase:null,firestore:null,listeners:[],connected:false,auth:null,authMod:null,authUnsub:null};
const ACCESS_MODULES=Object.freeze([
  {view:'samples',label:'Registro de muestra y duplicados'},
  {view:'products',label:'Trazabilidad de productos'},
  {view:'media',label:'Control de medios preparados'},
  {view:'strains',label:'Preparación de cepas de referencia'},
  {view:'coliforms',label:'Control de calidad de muestras'},
  {view:'micro',label:'Control de calidad de áreas'},
  {view:'equipment',label:'Control de equipos y áreas'},
  {view:'dashboard',label:'Dashboard'},
  {view:'settings',label:'Administración'}
]);
const ACCESS_LEVELS=Object.freeze(['NONE','READ','WRITE','ADMIN']);
const ROLE_LABELS=Object.freeze({ADMIN:'Administrador',OPERADOR:'Operador',SUPERVISOR:'Supervisor'});
const ROLE_TEMPLATES=Object.freeze({
  ADMIN:Object.freeze(Object.fromEntries(ACCESS_MODULES.map(m=>[m.view,'ADMIN']))),
  OPERADOR:Object.freeze({
    samples:'WRITE',products:'WRITE',media:'WRITE',strains:'WRITE',
    coliforms:'WRITE',micro:'WRITE',equipment:'WRITE',dashboard:'READ',settings:'NONE'
  }),
  SUPERVISOR:Object.freeze({
    samples:'READ',products:'READ',media:'READ',strains:'READ',
    coliforms:'READ',micro:'READ',equipment:'READ',dashboard:'READ',settings:'NONE'
  })
});


const SESSION_INACTIVITY_MS=30*60*1000;
let sessionInactivityTimer=null;
function secureLoginStatus(text,mode=''){const el=document.getElementById('secureLoginStatus');if(el){el.textContent=text;el.dataset.mode=mode}}
function showSecureLogin(reason=''){const overlay=document.getElementById('secureLoginOverlay');if(overlay){overlay.classList.add('show');overlay.setAttribute('aria-hidden','false')}document.body.classList.add('secure-locked');if(reason)secureLoginStatus(reason,'INFO')}
function hideSecureLogin(){const overlay=document.getElementById('secureLoginOverlay');if(overlay){overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true')}document.body.classList.remove('secure-locked')}
function findErpUserByFirebaseEmail(email){const target=String(email||'').trim().toLowerCase();if(!target)return null;return state.catalogPersonnel.find(p=>firebaseEmailForUser(p.code).toLowerCase()===target)||null}
function setActiveUserFromFirebaseEmail(email){const person=findErpUserByFirebaseEmail(email);if(!person)return null;localStorage.setItem('microbio_active_user',person.code);const userEl=document.getElementById('secureActiveUser');if(userEl)userEl.textContent=person.code;return person}
function resetSessionInactivityTimer(){if(!state.auth?.currentUser)return;if(sessionInactivityTimer)clearTimeout(sessionInactivityTimer);sessionInactivityTimer=setTimeout(()=>secureSessionLogout('Sesión cerrada por 30 minutos de inactividad.'),SESSION_INACTIVITY_MS)}
function bindSessionActivityMonitor(){['click','keydown','input','change','pointerdown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{if(document.body.classList.contains('secure-locked'))return;resetSessionInactivityTimer()},{passive:true}))}
async function secureSessionLogout(message='Sesión cerrada.'){
  if(sessionInactivityTimer){clearTimeout(sessionInactivityTimer);sessionInactivityTimer=null}
  const fb=state.auth?.currentUser;
  const code=activeUser();
  const inactivity=String(message||'').toLowerCase().includes('inactividad');
  if(fb){
    try{
      await centralAuditEvent({
        action:inactivity?'LOGOUT_INACTIVITY':'LOGOUT',
        module:'Seguridad',
        domain:'session',
        entityId:fb.uid,
        recordLabel:code,
        userCode:code,
        email:fb.email,
        uid:fb.uid,
        reason:message,
        details:{summary:inactivity?'Cierre automático por inactividad':'Cierre de sesión manual'}
      });
      if(state.connected&&cloudWriteAllowed())await flushOutbox();
    }catch{}
  }
  try{if(state.auth&&state.authMod)await state.authMod.signOut(state.auth)}catch{}
  CLOUD_SYNC_ENABLED=false;
  localStorage.setItem('microbio_cloud_enabled','false');
  state.connected=false;
  state.listeners?.forEach(fn=>{try{fn()}catch{}});
  state.listeners=[];
  setSyncStatus('offline','LOCAL');
  const userEl=document.getElementById('secureActiveUser');if(userEl)userEl.textContent='—';
  const roleEl=document.getElementById('activeRoleBadge');if(roleEl){roleEl.textContent='—';roleEl.className='badge role-badge'}
  showSecureLogin(message)
}


function normalizeFirebaseEmail(email){return String(email||'').trim().toLowerCase()}
function userDirectoryDocId(email){return normalizeFirebaseEmail(email)}
async function getCloudUserDirectoryEntry(firebaseUser){
  if(!firebaseUser?.email)return null;
  try{
    const cfg=getFirebaseConfig();
    const appMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const fbApp=appMod.getApps().length?appMod.getApp():appMod.initializeApp(cfg);
    const fs=fsMod.getFirestore(fbApp);
    const ref=fsMod.doc(fs,'erpDirectory',userDirectoryDocId(firebaseUser.email));
    const snap=await fsMod.getDoc(ref);
    if(!snap.exists())return null;
    const data=snap.data()||{};
    if(data.active!==true||data.workspaceId!=='lab-psi')return null;
    return data;
  }catch(err){
    console.warn('getCloudUserDirectoryEntry',err);
    return null;
  }
}
async function publishErpUserDirectory(){
  if(!isAdminUser()){toast('Solo el Administrador puede publicar el directorio de usuarios.');return}
  if(!(await initFirebaseAuthOnly()))return;
  if(!state.auth?.currentUser){toast('Primero inicie sesión Firebase como Administrador.');return}
  try{
    const cfg=getFirebaseConfig();
    const appMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const fbApp=appMod.getApps().length?appMod.getApp():appMod.initializeApp(cfg);
    const fs=fsMod.getFirestore(fbApp);
    const batch=fsMod.writeBatch(fs);
    let count=0,missing=[];
    for(const person of state.catalogPersonnel){
      const email=normalizeFirebaseEmail(firebaseEmailForUser(person.code));
      if(!email){missing.push(person.code);continue}
      const profile=userAccessProfile(person.code);
      const ref=fsMod.doc(fs,'erpDirectory',userDirectoryDocId(email));
      batch.set(ref,{
        email,
        userCode:String(person.code||'').toUpperCase(),
        role:profile.role,
        permissions:profile.permissions||{},
        active:person.active!==false,
        workspaceId:'lab-psi',
        updatedAt:nowISO(),
        updatedBy:activeUser()
      },{merge:true});
      count++;
    }
    if(!count){toast('No hay correos Firebase configurados para publicar.');return}
    await batch.commit();
    const el=document.getElementById('userDirectoryStatus');
    if(el)el.textContent=`Directorio cloud publicado: ${count} usuario(s).${missing.length?' Sin correo: '+missing.join(', '):''}`;
    toast(`Directorio Firebase actualizado: ${count} usuario(s).`);centralAuditEvent({action:'USER_DIRECTORY_PUBLISH',module:'Administración',domain:'erpDirectory',entityId:'lab-psi',recordLabel:'Directorio de usuarios',details:{summary:`Directorio publicado · ${count} usuario(s)`,missing}}).catch(()=>{});
  }catch(err){
    const el=document.getElementById('userDirectoryStatus');
    if(el)el.textContent='Error al publicar directorio: '+String(err?.message||err);
    toast('No se pudo publicar el directorio de usuarios.');
  }
}
function bindUserDirectoryControls(){
  document.getElementById('publishUserDirectoryBtn')?.addEventListener('click',publishErpUserDirectory);
}
async function resolveErpIdentityFromCloud(firebaseUser){
  if(!firebaseUser?.uid)return null;

  // 1) Directorio cloud A2: fuente principal para cualquier computadora.
  const directory=await getCloudUserDirectoryEntry(firebaseUser);
  if(directory){
    const code=String(directory.userCode||'').trim().toUpperCase();
    if(code){
      const person=state.catalogPersonnel.find(p=>String(p.code||'').toUpperCase()===code);
      return {
        ...(person||{code,name:code,cloudOnly:true}),
        code,
        role:directory.role||(person?userAccessProfile(code).role:'SUPERVISOR'),
        permissions:directory.permissions||{},
        identitySource:'ERP_DIRECTORY'
      };
    }
  }

  // 2) Compatibilidad con erpAccess/{uid}; no obliga a crear nuevos documentos.
  try{
    const cfg=getFirebaseConfig();
    const appMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const fbApp=appMod.getApps().length?appMod.getApp():appMod.initializeApp(cfg);
    const fs=fsMod.getFirestore(fbApp);
    const ref=fsMod.doc(fs,'erpAccess',firebaseUser.uid);
    const snap=await fsMod.getDoc(ref);
    if(snap.exists()){
      const access=snap.data()||{};
      if(access.active===true&&access.workspaceId==='lab-psi'){
        const mappedLocal=findErpUserByFirebaseEmail(firebaseUser.email);
        const code=String(access.userCode||mappedLocal?.code||activeUser()||'').trim().toUpperCase();
        if(code){
          const person=state.catalogPersonnel.find(p=>String(p.code||'').toUpperCase()===code);
          return {
            ...(person||{code,name:code,cloudOnly:true}),
            code,
            role:access.role||(person?userAccessProfile(code).role:'ADMIN'),
            permissions:access.permissions||{},
            identitySource:'ERP_ACCESS_LEGACY'
          };
        }
      }
    }
  }catch(err){console.warn('resolveErpIdentityFromCloud legacy',err)}

  // 3) Respaldo local seguro: útil en la PC administradora durante la migración A2→B1.
  // Firebase Authentication ya validó correo y contraseña; aquí solo resolvemos el código ERP.
  const localPerson=findErpUserByFirebaseEmail(firebaseUser.email);
  if(localPerson){
    const profile=userAccessProfile(localPerson.code);
    return {...localPerson,role:profile.role,permissions:profile.permissions||{},identitySource:'LOCAL_DIRECTORY_FALLBACK'};
  }

  return null;
}
function applyCloudIdentity(identity){
  if(!identity?.code)return false;
  localStorage.setItem('microbio_active_user',identity.code);
  const userEl=document.getElementById('secureActiveUser');
  if(userEl)userEl.textContent=identity.code;

  // El rol de nube se refleja localmente para la sesión actual sin crear otro catálogo.
  if(identity.role&&identity.code!=='JJF'){
    const base=ROLE_TEMPLATES[identity.role]||ROLE_TEMPLATES.SUPERVISOR;
    localStorage.setItem(accessStorageKey(identity.code),JSON.stringify({
      role:identity.role,
      permissions:Object.keys(identity.permissions||{}).length?identity.permissions:{...base},
      updatedAt:nowISO(),
      updatedBy:'FIREBASE_AUTH'
    }));
  }
  return true;
}


function markAuthenticatedState(){
  const user=state.auth?.currentUser;
  if(!user){
    setSyncStatus('offline','LOCAL');
    return;
  }
  // AUTH solo debe ser un estado transitorio; una sesión válida pasa enseguida a SINCRONIZANDO.
  setSyncStatus('syncing','SINCRONIZANDO');
  updateFirebaseAuthForm();
}
async function ensureUnifiedCloudSession(){
  const cfg=getFirebaseConfig();
  if(!cfg?.apiKey||!cfg?.projectId||!cfg?.appId){
    setSyncStatus('offline','LOCAL');
    return false;
  }
  if(!state.auth?.currentUser){
    setSyncStatus('offline','LOCAL');
    return false;
  }

  CLOUD_SYNC_ENABLED=true;
  localStorage.setItem('microbio_cloud_enabled','true');
  markAuthenticatedState();
  await connectFirebase(cfg);
  return !!state.connected;
}
async function secureLoginSubmit(e){
  e.preventDefault();
  if(!(await initFirebaseAuthOnly()))return;
  const email=String(document.getElementById('secureLoginEmail')?.value||'').trim().toLowerCase();
  const password=String(document.getElementById('secureLoginPassword')?.value||'');
  if(!email||!password){secureLoginStatus('Ingrese correo y contraseña.','ERROR');return}

  try{
    secureLoginStatus('Autenticando…','WORKING');
    const cred=await state.authMod.signInWithEmailAndPassword(state.auth,email,password);

    // La identidad ERP ya no depende del localStorage de esta computadora.
    // Se obtiene primero desde erpDirectory; erpAccess queda solo como compatibilidad.
    const identity=await resolveErpIdentityFromCloud(cred.user);
    if(!identity){
      await state.authMod.signOut(state.auth);
      secureLoginStatus('Cuenta autenticada, pero no existe un perfil ERP autorizado en el directorio cloud.','ERROR');
      return;
    }

    applyCloudIdentity(identity);
    saveFirebaseEmailForUser(identity.code,email);
    const pwd=document.getElementById('secureLoginPassword');if(pwd)pwd.value='';

    renderActiveUser();
    applyAccessControl();
    updateFirebaseAuthForm();
    hideSecureLogin();
    resetSessionInactivityTimer();
    secureLoginStatus(`Sesión iniciada como ${identity.code}.`,'OK');console.info('ERP identity source:',identity.identitySource||'UNKNOWN');await centralAuditEvent({action:'LOGIN',module:'Seguridad',domain:'session',entityId:cred.user.uid,recordLabel:identity.code,userCode:identity.code,email:cred.user.email,uid:cred.user.uid,details:{summary:'Inicio de sesión',role:identity.role,identitySource:identity.identitySource||'UNKNOWN'}});

    markAuthenticatedState();
  }catch(err){
    secureLoginStatus('No se pudo iniciar sesión. Verifique correo y contraseña.','ERROR');
  }
}
function bindSecureLogin(){document.getElementById('secureLoginForm')?.addEventListener('submit',secureLoginSubmit);document.getElementById('secureLogoutBtn')?.addEventListener('click',()=>secureSessionLogout('Sesión cerrada manualmente.'));bindSessionActivityMonitor()}
function firebaseEmailStorageKey(code){return `microbio_firebase_email_${String(code||'').toUpperCase()}`}
function firebaseEmailForUser(code=activeUser()){return localStorage.getItem(firebaseEmailStorageKey(code))||''}
function saveFirebaseEmailForUser(code,email){
  const key=firebaseEmailStorageKey(code),value=String(email||'').trim().toLowerCase();
  if(value)localStorage.setItem(key,value);else localStorage.removeItem(key);
}
function accessStorageKey(code){return `microbio_access_${String(code||'').toUpperCase()}`}
function defaultRoleForCode(code){return String(code||'').toUpperCase()==='JJF'?'ADMIN':'OPERADOR'}
function normalizeAccessLevel(v){return ACCESS_LEVELS.includes(v)?v:'NONE'}
function userAccessProfile(code=activeUser()){
  const userCode=String(code||'').toUpperCase();
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(accessStorageKey(userCode))||'null')}catch{}
  const role=saved?.role&&ROLE_TEMPLATES[saved.role]?saved.role:defaultRoleForCode(userCode);
  const base=ROLE_TEMPLATES[role]||ROLE_TEMPLATES.OPERADOR;
  const permissions={...base,...(saved?.permissions||{})};
  if(userCode==='JJF'){
    return {userCode,role:'ADMIN',permissions:{...ROLE_TEMPLATES.ADMIN}};
  }
  return {userCode,role,permissions:Object.fromEntries(ACCESS_MODULES.map(m=>[m.view,normalizeAccessLevel(permissions[m.view])]))};
}
function adminAccessSafetyCheck(){
  if(String(activeUser()||'').toUpperCase()!=='JJF')return;
  const settings=document.querySelector('#view-settings');
  settings?.querySelectorAll('[data-access-locked="1"]').forEach(el=>{
    el.disabled=false;
    delete el.dataset.accessLocked;
  });
}
function accessLevelFor(view,code=activeUser()){return userAccessProfile(code).permissions[view]||'NONE'}
function canAccessView(view,code=activeUser()){return accessLevelFor(view,code)!=='NONE'}
function canWriteView(view,code=activeUser()){return ['WRITE','ADMIN'].includes(accessLevelFor(view,code))}
function isAdminUser(code=activeUser()){return userAccessProfile(code).role==='ADMIN'}
function currentViewName(){return document.querySelector('.nav.active')?.dataset?.view||'dashboard'}
function currentViewWriteAllowed(){return canWriteView(currentViewName())}
function applyReadOnlyToView(view){
  const section=document.querySelector(`#view-${view}`);if(!section)return;
  const writable=canWriteView(view);
  section.classList.toggle('access-readonly',!writable);

  // Liberar únicamente controles que fueron bloqueados por el motor de permisos.
  if(writable){
    section.querySelectorAll('[data-access-locked="1"]').forEach(el=>{
      el.disabled=false;
      delete el.dataset.accessLocked;
    });
    return;
  }

  // En SOLO LECTURA bloqueamos únicamente controles actualmente habilitados.
  // Así no alteramos estados disabled que pertenecen a la lógica normal del ERP.
  section.querySelectorAll('form input, form select, form textarea, form button, .actions button, button[onclick], button[type="button"]').forEach(el=>{
    if(el.closest('#accessControlPanel'))return;
    if(!el.disabled){
      el.disabled=true;
      el.dataset.accessLocked='1';
    }
  });
}
function applyAccessControl(){
  const profile=userAccessProfile();
  const badge=document.getElementById('activeRoleBadge');
  if(badge){badge.textContent=ROLE_LABELS[profile.role]||profile.role;badge.className=`badge role-badge role-${profile.role.toLowerCase()}`}

  // El administrador nunca queda bloqueado por el motor de permisos.
  if(profile.role==='ADMIN'){
    document.querySelectorAll('[data-access-locked="1"]').forEach(el=>{
      el.disabled=false;
      delete el.dataset.accessLocked;
    });
  }

  document.querySelectorAll('.nav[data-view]').forEach(btn=>{
    const allowed=canAccessView(btn.dataset.view);
    btn.hidden=!allowed;
    btn.classList.toggle('nav-no-access',!allowed);
  });

  ACCESS_MODULES.forEach(m=>applyReadOnlyToView(m.view));

  const active=document.querySelector('.nav.active');
  if(!active || active.hidden || !canAccessView(active.dataset.view)){
    const first=[...document.querySelectorAll('.nav[data-view]')].find(b=>!b.hidden&&canAccessView(b.dataset.view));
    if(first) first.click();
  }
  renderAccessAdmin();
}

function updateExistingUserAccessNote(){
  const el=document.getElementById('accessUserSourceNote');if(!el)return;
  el.textContent=`Fuente de usuarios: Catálogo de personal existente del ERP · ${state.catalogPersonnel.length} usuario(s) disponible(s).`;
}
function renderAccessAdmin(){
  const panel=document.getElementById('accessControlPanel');if(!panel)return;
  panel.hidden=!isAdminUser();
  if(panel.hidden)return;
  updateExistingUserAccessNote();
  const sel=document.getElementById('accessUserSelect');
  const current=sel?.value||activeUser();
  if(sel){
    sel.innerHTML=[...state.catalogPersonnel].sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''))).map(p=>`<option value="${esc(p.code)}">${esc(p.code)}${p.name&&p.name!==p.code?' · '+esc(p.name):''}</option>`).join('');
    if([...sel.options].some(o=>o.value===current))sel.value=current;
    else if(sel.options.length)sel.selectedIndex=0;
  }
  loadAccessEditor();
}
function loadAccessEditor(){
  const sel=document.getElementById('accessUserSelect'),rows=document.getElementById('accessPermissionRows'),roleSel=document.getElementById('accessRoleSelect');
  if(!sel||!rows||!roleSel)return;
  const code=sel.value||activeUser(),profile=userAccessProfile(code);
  roleSel.value=profile.role;
  const emailEl=document.getElementById('accessFirebaseEmail');if(emailEl)emailEl.value=firebaseEmailForUser(code);
  const locked=String(code).toUpperCase()==='JJF';
  rows.innerHTML=ACCESS_MODULES.map(m=>{
    const level=locked?'ADMIN':profile.permissions[m.view];
    return `<tr><td>${esc(m.label)}</td><td><select data-access-view="${m.view}" ${locked?'disabled':''}>
      <option value="NONE" ${level==='NONE'?'selected':''}>Sin acceso</option>
      <option value="READ" ${level==='READ'?'selected':''}>Solo lectura</option>
      <option value="WRITE" ${level==='WRITE'?'selected':''}>Registrar</option>
      <option value="ADMIN" ${level==='ADMIN'?'selected':''}>Administrar</option>
    </select></td></tr>`
  }).join('');
  roleSel.disabled=locked;
}
function saveAccessProfile(code,role,permissions){
  if(String(code).toUpperCase()==='JJF')return null;
  const key=accessStorageKey(code);
  let before=null;
  try{before=JSON.parse(localStorage.getItem(key)||'null')}catch{}
  const after={role,permissions,updatedAt:nowISO(),updatedBy:activeUser()};
  localStorage.setItem(key,JSON.stringify(after));
  return {before,after};
}
function restoreRoleTemplateInEditor(){
  const sel=document.getElementById('accessUserSelect'),roleSel=document.getElementById('accessRoleSelect');
  if(!sel||!roleSel)return;
  const code=sel.value,role=roleSel.value,base=ROLE_TEMPLATES[role]||ROLE_TEMPLATES.OPERADOR;
  document.querySelectorAll('#accessPermissionRows select[data-access-view]').forEach(s=>s.value=base[s.dataset.accessView]||'NONE');
}

function cloudWriteAllowed(){
  const role=userAccessProfile().role;
  return role==='ADMIN'||role==='OPERADOR';
}
function cloudReadOnlyClient(){return userAccessProfile().role==='SUPERVISOR'}
function cloudSyncModeLabel(){return !CLOUD_SYNC_ENABLED?'LOCAL':(cloudReadOnlyClient()?'NUBE · SOLO LECTURA':'NUBE · OPERATIVO')}
function guardWriteAction(view){
  if(canWriteView(view))return true;
  toast('Este usuario tiene acceso de SOLO LECTURA en este módulo.');
  return false;
}

function viewFromElement(el){
  const section=el?.closest?.('section.view[id^="view-"]');
  return section?section.id.replace(/^view-/,''):'';
}


async function requireQualityDeleteAuthorization(label='registro'){
  if(!isAdminUser()){
    toast('Acción bloqueada: solo el Administrador puede eliminar.');
    return false;
  }
  const user=state.auth?.currentUser;
  if(!user?.email||!state.authMod){
    toast('Debe existir una sesión Firebase válida para autorizar una eliminación.');
    return false;
  }

  const pwd=prompt(`Acción crítica: eliminar ${label}.\nVuelva a ingresar la contraseña Firebase de ${user.email}:`);
  if(pwd===null)return false;

  try{
    const credential=state.authMod.EmailAuthProvider.credential(user.email,pwd);
    await state.authMod.reauthenticateWithCredential(user,credential);
    await centralAuditEvent({
      action:'DELETE_AUTHORIZED',
      module:'Seguridad',
      domain:'security',
      entityId:user.uid,
      recordLabel:label,
      details:{summary:`Reautenticación aprobada para eliminación · ${label}`}
    });
    return true;
  }catch(err){
    toast('Autorización rechazada. Verifique su contraseña Firebase.');
    await centralAuditEvent({
      action:'DELETE_DENIED',
      module:'Seguridad',
      domain:'security',
      entityId:user.uid,
      recordLabel:label,
      details:{summary:`Intento de eliminación rechazado · ${label}`,reason:'Reautenticación Firebase fallida'}
    }).catch(()=>{});
    return false;
  }
}
function isDestructiveButton(btn){
  if(!btn)return false;
  const text=String(btn.textContent||'').trim().toLowerCase();
  const onclick=String(btn.getAttribute?.('onclick')||'').toLowerCase();
  const id=String(btn.id||'').toLowerCase();
  return /\beliminar\b|\bdelete\b/.test(text)||/\bdelete/.test(onclick)||/\bdelete/.test(id);
}
function bindDeletionSecurityGuard(){
  document.addEventListener('click',async e=>{
    const btn=e.target?.closest?.('button');
    if(!isDestructiveButton(btn))return;
    if(btn.dataset.qualityAuthorized==='1'){
      delete btn.dataset.qualityAuthorized;
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    const label=String(btn.closest('tr')?.innerText||btn.textContent||'registro').replace(/\s+/g,' ').slice(0,160);
    if(!(await requireQualityDeleteAuthorization(label)))return;
    btn.dataset.qualityAuthorized='1';
    queueMicrotask(()=>btn.click());
  },true);
}
function bindRealPermissionGuards(){
  document.addEventListener('submit',e=>{
    const view=viewFromElement(e.target);
    if(!view||canWriteView(view))return;
    e.preventDefault();e.stopImmediatePropagation();
    toast('Acción bloqueada: este usuario tiene permiso de SOLO LECTURA.');
  },true);
  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('button'); if(!btn)return;
    const view=viewFromElement(btn); if(!view||canWriteView(view))return;
    if(btn.closest('#accessControlPanel'))return;
    e.preventDefault();e.stopImmediatePropagation();
    toast('Acción bloqueada: este usuario tiene permiso de SOLO LECTURA.');
  },true);
}


const DEFAULT_MEDIA=[
 {id:'medium-a1-simple',name:'A-1 medium simple',type:'Caldo',prefix:'AS1',technicalClass:'SELECTIVO',concentration:31.5,shelfLifeDays:7,phMin:6.7,phMax:7.1,expectedColor:'Amarillo claro a ámbar claro',expectedAppearance:'Transparente a ligeramente opalescente, sin turbidez',performanceProfile:{productivity:{strainId:'strain-ec-25922',expectedGas:'SI',expectedTurbidity:'SI'},selectivity:{strainId:'strain-ent-29212',expectedGas:'NO',expectedTurbidity:'NO'},specificity:{strainId:'strain-kbl-13883',expectedGas:'NO',expectedTurbidity:'NO'}}},
 {id:'medium-a1-conc',name:'A-1 medium conc',type:'Caldo',prefix:'AC1',technicalClass:'SELECTIVO',concentration:62,shelfLifeDays:7,phMin:6.7,phMax:7.1,expectedColor:'Amarillo claro a ámbar claro',expectedAppearance:'Transparente a ligeramente opalescente, sin turbidez',performanceProfile:{productivity:{strainId:'strain-ec-25922',expectedGas:'SI',expectedTurbidity:'SI'},selectivity:{strainId:'strain-ent-29212',expectedGas:'NO',expectedTurbidity:'NO'},specificity:{strainId:'strain-kbl-13883',expectedGas:'NO',expectedTurbidity:'NO'}}},
 {id:'medium-lmx',name:'LMX Fluorocult',type:'Caldo',prefix:'LMX',technicalClass:'DIFERENCIAL_CROMOGENICO',concentration:17,shelfLifeDays:7,phMin:6.6,phMax:7.0,expectedColor:'Amarillo pálido',expectedAppearance:'Transparente, sin turbidez ni partículas',performanceProfile:{productivity:{strainId:'strain-ec-25922'},selectivity:{strainId:'strain-sal-14028'},specificity:{strainId:'strain-kbl-13883'}}},
 {id:'medium-pda',name:'PDA',type:'Agar',prefix:'PDA',technicalClass:'GENERAL',concentration:39,shelfLifeDays:15,phMin:5.4,phMax:5.8,expectedColor:'Ámbar claro a amarillo pálido',expectedAppearance:'Superficie lisa, ligeramente translúcida',performanceProfile:{productivity:{strainId:'strain-ec-25922'}}},
 {id:'medium-pca',name:'PCA',type:'Agar',prefix:'PCA',technicalClass:'GENERAL',concentration:23.5,shelfLifeDays:15,phMin:6.8,phMax:7.2,expectedColor:'Ámbar claro a translúcido',expectedAppearance:'Superficie lisa, homogénea, sin grietas',performanceProfile:{productivity:{strainId:'strain-ec-25922'}}},
 {id:'medium-emb',name:'EMB',type:'Agar',prefix:'EMB',technicalClass:'DIFERENCIAL_CROMOGENICO',concentration:37.5,shelfLifeDays:15,phMin:7.0,phMax:7.4,expectedColor:'Púrpura oscuro a rojo violáceo',expectedAppearance:'Superficie lisa, homogénea, sin grietas ni burbujas',performanceProfile:{productivity:{strainId:'strain-ec-25922'},selectivity:{strainId:'strain-ent-29212'},specificity:{strainId:'strain-kbl-13883'}}},
 {id:'medium-an',name:'AN Agar nutrients',type:'Agar',prefix:'AN',technicalClass:'GENERAL',concentration:28,shelfLifeDays:15,phMin:6.8,phMax:7.4,expectedColor:'Amarillo claro a ámbar',expectedAppearance:'Superficie lisa, homogénea, sin burbujas',performanceProfile:{productivity:{strainId:'strain-ec-25922'}}},
 {id:'medium-bhi',name:'BHI',type:'Agar',prefix:'BHI',technicalClass:'GENERAL',concentration:37,shelfLifeDays:15,phMin:7.2,phMax:7.6,expectedColor:'Ámbar claro a marrón claro',expectedAppearance:'Superficie lisa, brillante, sin precipitados',performanceProfile:{productivity:{strainId:'strain-ec-25922'}}},
];
const DEFAULT_PERSONNEL=[{id:'person-ns',code:'NS',name:'NS'},{id:'person-lp',code:'LP',name:'LP'},{id:'person-jjf',code:'JJF',name:'JJF'}];
const DEFAULT_SYSTEM_CONFIG={id:'media-control',sterilityDays:0,macroscopicDays:0,performanceDays:2,alertDays:2};
const COLIFORM_QC_CONFIG=Object.freeze({
  anchor:'2026-01-01',
  q1:{code:'Q1',label:'Control de esterilidad · microorganismo',frequencyDays:2,allowedDays:[2,3,4]},
  q2:{code:'Q2',label:'Muestra fortificada',frequencyDays:15,allowedDays:[2,3,4]},
  q3:{code:'Q3',label:'Esterilidad del medio',frequencyDays:1,allowedDays:[1,2,3,4]},
  temp35:{min:34.5,max:35.5,targetHours:3,toleranceHours:0.5},
  temp44:{min:44,max:45,targetHours:21,toleranceHours:2},
  positive:{activityQ1:'Control positivo unificado · coliformes fecales + totales',activityQ2:'Muestra fortificada positiva · fecales + totales',strainId:'strain-ec-25922',expectedGas:'SI',expectedGrowth:'SI',expectedLMXGrowth:'SI',expectedLMXColor:'SI',expectedLMXFluorescence:'SI'},
  negative:{activityQ1:'Control negativo unificado · A-1 + LMX',activityQ2:'Muestra fortificada negativa · A-1 + LMX',strainId:'strain-ent-29212',expectedGas:'NO',expectedGrowth:'NO'},
  negativeTotal:{strainId:'strain-sal-14028',expectedLMXGrowth:'SI',expectedLMXColor:'NO',expectedLMXFluorescence:'NO'},
  q2PositiveNmp:{min:1.8,max:20},q2NegativeNmp:{max:1.8}
});

// V2.3.0-A4 · Catálogo central de tipos de muestra fortificada.
const QC_SAMPLE_TYPES=[
  {key:'AGUA_DESTILADA',label:'Agua destilada',prefix:'AD'},
];
function qcSampleTypeDef(value){const v=String(value||'').trim().toLowerCase();return QC_SAMPLE_TYPES.find(x=>x.key.toLowerCase()===v||x.label.toLowerCase()===v)||null}
function qcSampleCodeParts(code,prefix){const safe=String(prefix||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=String(code||'').trim().match(new RegExp('^'+safe+'-(\\d+)$','i'));return m?{sequence:Number(m[1])}:null}
function qcNextSampleSequence(matrix,date){const def=qcSampleTypeDef(matrix);if(!def||!date)return 1;const year=String(date).slice(0,4);let max=0;for(const r of (state.coliformQCControls||[])){if(r.type!=='Q2'||String(r.actualDate||'').slice(0,4)!==year)continue;const rd=qcSampleTypeDef(r.matrix);if((rd?.prefix||'').toUpperCase()!==def.prefix.toUpperCase())continue;const part=qcSampleCodeParts(r.sampleCode,def.prefix);if(part&&part.sequence>max)max=part.sequence}return max+1}
function qcNextSampleCode(matrix,date){const def=qcSampleTypeDef(matrix);if(!def||!date)return '';let n=qcNextSampleSequence(matrix,date),code=`${def.prefix}-${n}`;const year=String(date).slice(0,4);const used=new Set((state.coliformQCControls||[]).filter(r=>r.type==='Q2'&&String(r.actualDate||'').slice(0,4)===year).map(r=>String(r.sampleCode||'').toUpperCase()));while(used.has(code.toUpperCase()))code=`${def.prefix}-${++n}`;return code}
function qcPopulateSampleTypes(){const f=$('#coliformQCForm');if(!f?.elements?.matrix)return;const current=f.elements.matrix.value;f.elements.matrix.innerHTML=QC_SAMPLE_TYPES.map(x=>`<option value="${esc(x.label)}">${esc(x.label)} · ${esc(x.prefix)}</option>`).join('');if(QC_SAMPLE_TYPES.some(x=>x.label===current))f.elements.matrix.value=current}
function updateQCSampleCodePreview(){const f=$('#coliformQCForm');if(!f?.elements?.sampleCode)return;const type=f.dataset.mode==='HISTORICAL'?(f.elements.historicalType?.value||f.dataset.type):f.dataset.type;if(type!=='Q2'){f.elements.sampleCode.value='';return}f.elements.sampleCode.value=qcNextSampleCode(f.elements.matrix.value,f.elements.actualDate.value)}


const MPN_9221_DRINKING_10X10={
  0:{num:null,text:'<1,1',lower:'—',upper:'3,4'},
  1:{num:1.1,text:'1,1',lower:'0,051',upper:'5,9'},
  2:{num:2.2,text:'2,2',lower:'0,37',upper:'8,2'},
  3:{num:3.6,text:'3,6',lower:'0,91',upper:'9,7'},
  4:{num:5.1,text:'5,1',lower:'1,6',upper:'13'},
  5:{num:6.9,text:'6,9',lower:'2,5',upper:'15'},
  6:{num:9.2,text:'9,2',lower:'3,3',upper:'19'},
  7:{num:12,text:'12',lower:'4,8',upper:'24'},
  8:{num:16,text:'16',lower:'5,8',upper:'34'},
  9:{num:23,text:'23',lower:'8,1',upper:'53'},
  10:{num:null,text:'>23',lower:'13',upper:'—'}
};
function isDrinkingWaterSample(s){return String(s?.sampleType||'').trim().toLowerCase()==='agua de consumo'}
function calcDrinkingMPNValues(positive){const n=Number(positive);return Number.isInteger(n)&&n>=0&&n<=10?MPN_9221_DRINKING_10X10[n]:null}
const MPN_9221_IV={"0-0-0":{"num":null,"text":"<1,8"},"0-0-1":{"num":1.8,"text":"1,8"},"0-0-2":{"num":3.6,"text":"3,6"},"0-0-3":{"num":5.4,"text":"5,4"},"0-0-4":{"num":7.2,"text":"7,2"},"0-0-5":{"num":9,"text":"9"},"0-1-0":{"num":1.8,"text":"1,8"},"0-1-1":{"num":3.6,"text":"3,6"},"0-1-2":{"num":5.5,"text":"5,5"},"0-1-3":{"num":7.3,"text":"7,3"},"0-1-4":{"num":9.1,"text":"9,1"},"0-1-5":{"num":11,"text":"11"},"0-2-0":{"num":3.7,"text":"3,7"},"0-2-1":{"num":5.5,"text":"5,5"},"0-2-2":{"num":7.4,"text":"7,4"},"0-2-3":{"num":9.2,"text":"9,2"},"0-2-4":{"num":11,"text":"11"},"0-2-5":{"num":13,"text":"13"},"0-3-0":{"num":5.6,"text":"5,6"},"0-3-1":{"num":7.4,"text":"7,4"},"0-3-2":{"num":9.3,"text":"9,3"},"0-3-3":{"num":11,"text":"11"},"0-3-4":{"num":13,"text":"13"},"0-3-5":{"num":15,"text":"15"},"0-4-0":{"num":7.5,"text":"7,5"},"0-4-1":{"num":9.4,"text":"9,4"},"0-4-2":{"num":11,"text":"11"},"0-4-3":{"num":13,"text":"13"},"0-4-4":{"num":15,"text":"15"},"0-4-5":{"num":17,"text":"17"},"0-5-0":{"num":9.4,"text":"9,4"},"0-5-1":{"num":11,"text":"11"},"0-5-2":{"num":13,"text":"13"},"0-5-3":{"num":15,"text":"15"},"0-5-4":{"num":17,"text":"17"},"0-5-5":{"num":19,"text":"19"},"1-0-0":{"num":2,"text":"2"},"1-0-1":{"num":4,"text":"4"},"1-0-2":{"num":6,"text":"6"},"1-0-3":{"num":8.1,"text":"8,1"},"1-0-4":{"num":10,"text":"10"},"1-0-5":{"num":12,"text":"12"},"1-1-0":{"num":4,"text":"4"},"1-1-1":{"num":6.1,"text":"6,1"},"1-1-2":{"num":8.1,"text":"8,1"},"1-1-3":{"num":10,"text":"10"},"1-1-4":{"num":12,"text":"12"},"1-1-5":{"num":14,"text":"14"},"1-2-0":{"num":6.1,"text":"6,1"},"1-2-1":{"num":8.2,"text":"8,2"},"1-2-2":{"num":10,"text":"10"},"1-2-3":{"num":12,"text":"12"},"1-2-4":{"num":15,"text":"15"},"1-2-5":{"num":17,"text":"17"},"1-3-0":{"num":8.3,"text":"8,3"},"1-3-1":{"num":10,"text":"10"},"1-3-2":{"num":13,"text":"13"},"1-3-3":{"num":15,"text":"15"},"1-3-4":{"num":17,"text":"17"},"1-3-5":{"num":19,"text":"19"},"1-4-0":{"num":11,"text":"11"},"1-4-1":{"num":13,"text":"13"},"1-4-2":{"num":15,"text":"15"},"1-4-3":{"num":17,"text":"17"},"1-4-4":{"num":19,"text":"19"},"1-4-5":{"num":22,"text":"22"},"1-5-0":{"num":13,"text":"13"},"1-5-1":{"num":15,"text":"15"},"1-5-2":{"num":17,"text":"17"},"1-5-3":{"num":19,"text":"19"},"1-5-4":{"num":22,"text":"22"},"1-5-5":{"num":24,"text":"24"},"2-0-0":{"num":4.5,"text":"4,5"},"2-0-1":{"num":6.8,"text":"6,8"},"2-0-2":{"num":9.1,"text":"9,1"},"2-0-3":{"num":12,"text":"12"},"2-0-4":{"num":14,"text":"14"},"2-0-5":{"num":16,"text":"16"},"2-1-0":{"num":6.8,"text":"6,8"},"2-1-1":{"num":9.2,"text":"9,2"},"2-1-2":{"num":12,"text":"12"},"2-1-3":{"num":14,"text":"14"},"2-1-4":{"num":17,"text":"17"},"2-1-5":{"num":19,"text":"19"},"2-2-0":{"num":9.3,"text":"9,3"},"2-2-1":{"num":12,"text":"12"},"2-2-2":{"num":14,"text":"14"},"2-2-3":{"num":17,"text":"17"},"2-2-4":{"num":19,"text":"19"},"2-2-5":{"num":22,"text":"22"},"2-3-0":{"num":12,"text":"12"},"2-3-1":{"num":14,"text":"14"},"2-3-2":{"num":17,"text":"17"},"2-3-3":{"num":20,"text":"20"},"2-3-4":{"num":22,"text":"22"},"2-3-5":{"num":25,"text":"25"},"2-4-0":{"num":15,"text":"15"},"2-4-1":{"num":17,"text":"17"},"2-4-2":{"num":20,"text":"20"},"2-4-3":{"num":23,"text":"23"},"2-4-4":{"num":25,"text":"25"},"2-4-5":{"num":28,"text":"28"},"2-5-0":{"num":17,"text":"17"},"2-5-1":{"num":20,"text":"20"},"2-5-2":{"num":23,"text":"23"},"2-5-3":{"num":26,"text":"26"},"2-5-4":{"num":29,"text":"29"},"2-5-5":{"num":32,"text":"32"},"3-0-0":{"num":7.8,"text":"7,8"},"3-0-1":{"num":11,"text":"11"},"3-0-2":{"num":13,"text":"13"},"3-0-3":{"num":16,"text":"16"},"3-0-4":{"num":20,"text":"20"},"3-0-5":{"num":23,"text":"23"},"3-1-0":{"num":11,"text":"11"},"3-1-1":{"num":14,"text":"14"},"3-1-2":{"num":17,"text":"17"},"3-1-3":{"num":20,"text":"20"},"3-1-4":{"num":23,"text":"23"},"3-1-5":{"num":27,"text":"27"},"3-2-0":{"num":14,"text":"14"},"3-2-1":{"num":17,"text":"17"},"3-2-2":{"num":20,"text":"20"},"3-2-3":{"num":24,"text":"24"},"3-2-4":{"num":27,"text":"27"},"3-2-5":{"num":31,"text":"31"},"3-3-0":{"num":17,"text":"17"},"3-3-1":{"num":21,"text":"21"},"3-3-2":{"num":24,"text":"24"},"3-3-3":{"num":28,"text":"28"},"3-3-4":{"num":31,"text":"31"},"3-3-5":{"num":35,"text":"35"},"3-4-0":{"num":21,"text":"21"},"3-4-1":{"num":24,"text":"24"},"3-4-2":{"num":28,"text":"28"},"3-4-3":{"num":32,"text":"32"},"3-4-4":{"num":36,"text":"36"},"3-4-5":{"num":40,"text":"40"},"3-5-0":{"num":25,"text":"25"},"3-5-1":{"num":29,"text":"29"},"3-5-2":{"num":32,"text":"32"},"3-5-3":{"num":37,"text":"37"},"3-5-4":{"num":41,"text":"41"},"3-5-5":{"num":45,"text":"45"},"4-0-0":{"num":13,"text":"13"},"4-0-1":{"num":17,"text":"17"},"4-0-2":{"num":21,"text":"21"},"4-0-3":{"num":25,"text":"25"},"4-0-4":{"num":30,"text":"30"},"4-0-5":{"num":36,"text":"36"},"4-1-0":{"num":17,"text":"17"},"4-1-1":{"num":21,"text":"21"},"4-1-2":{"num":26,"text":"26"},"4-1-3":{"num":31,"text":"31"},"4-1-4":{"num":36,"text":"36"},"4-1-5":{"num":42,"text":"42"},"4-2-0":{"num":22,"text":"22"},"4-2-1":{"num":26,"text":"26"},"4-2-2":{"num":32,"text":"32"},"4-2-3":{"num":38,"text":"38"},"4-2-4":{"num":44,"text":"44"},"4-2-5":{"num":50,"text":"50"},"4-3-0":{"num":27,"text":"27"},"4-3-1":{"num":33,"text":"33"},"4-3-2":{"num":39,"text":"39"},"4-3-3":{"num":45,"text":"45"},"4-3-4":{"num":52,"text":"52"},"4-3-5":{"num":59,"text":"59"},"4-4-0":{"num":34,"text":"34"},"4-4-1":{"num":40,"text":"40"},"4-4-2":{"num":47,"text":"47"},"4-4-3":{"num":54,"text":"54"},"4-4-4":{"num":61,"text":"61"},"4-4-5":{"num":69,"text":"69"},"4-5-0":{"num":41,"text":"41"},"4-5-1":{"num":48,"text":"48"},"4-5-2":{"num":56,"text":"56"},"4-5-3":{"num":64,"text":"64"},"4-5-4":{"num":72,"text":"72"},"4-5-5":{"num":81,"text":"81"},"5-0-0":{"num":23,"text":"23"},"5-0-1":{"num":31,"text":"31"},"5-0-2":{"num":43,"text":"43"},"5-0-3":{"num":58,"text":"58"},"5-0-4":{"num":76,"text":"76"},"5-0-5":{"num":95,"text":"95"},"5-1-0":{"num":33,"text":"33"},"5-1-1":{"num":46,"text":"46"},"5-1-2":{"num":63,"text":"63"},"5-1-3":{"num":84,"text":"84"},"5-1-4":{"num":110,"text":"110"},"5-1-5":{"num":130,"text":"130"},"5-2-0":{"num":49,"text":"49"},"5-2-1":{"num":70,"text":"70"},"5-2-2":{"num":94,"text":"94"},"5-2-3":{"num":120,"text":"120"},"5-2-4":{"num":150,"text":"150"},"5-2-5":{"num":180,"text":"180"},"5-3-0":{"num":79,"text":"79"},"5-3-1":{"num":110,"text":"110"},"5-3-2":{"num":140,"text":"140"},"5-3-3":{"num":170,"text":"170"},"5-3-4":{"num":210,"text":"210"},"5-3-5":{"num":250,"text":"250"},"5-4-0":{"num":130,"text":"130"},"5-4-1":{"num":170,"text":"170"},"5-4-2":{"num":220,"text":"220"},"5-4-3":{"num":280,"text":"280"},"5-4-4":{"num":350,"text":"350"},"5-4-5":{"num":430,"text":"430"},"5-5-0":{"num":240,"text":"240"},"5-5-1":{"num":350,"text":"350"},"5-5-2":{"num":540,"text":"540"},"5-5-3":{"num":920,"text":"920"},"5-5-4":{"num":1600,"text":"1600"},"5-5-5":{"num":null,"text":">1600"}};

const DEFAULT_MONITORING_POINTS=[{"id":"MC-AREA-001","code":"MC-AREA-001","name":"Acceso Puerta principal","type":"Ambiente","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PDA","microorganism":"Mohos y Levadura","method":"Sedimentación en placa","exposureMinutes":15,"plateDiameterMm":90,"swabAreaCm2":0,"limitTarget":50,"limitMax":200,"unit":"UFC/m3","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-002","code":"MC-AREA-002","name":"Piso del area general","type":"Superficie","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-003","code":"MC-AREA-003","name":"Area de Pesado","type":"Ambiente","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PDA","microorganism":"Mohos y Levadura","method":"Sedimentación en placa","exposureMinutes":15,"plateDiameterMm":90,"swabAreaCm2":0,"limitTarget":50,"limitMax":200,"unit":"UFC/m3","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-004","code":"MC-AREA-004","name":"Area de Siembra","type":"Ambiente","criticality":"CRÍTICA","frequency":"Semanal","frequencyDays":7,"medium":"PDA","microorganism":"Mohos y Levadura","method":"Sedimentación en placa","exposureMinutes":15,"plateDiameterMm":90,"swabAreaCm2":0,"limitTarget":0,"limitMax":1,"unit":"UFC/m3","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-005","code":"MC-AREA-005","name":"Area de incubación","type":"Ambiente","criticality":"ALTA","frequency":"Cada 15 días","frequencyDays":15,"medium":"PDA","microorganism":"Mohos y Levadura","method":"Sedimentación en placa","exposureMinutes":15,"plateDiameterMm":90,"swabAreaCm2":0,"limitTarget":50,"limitMax":200,"unit":"UFC/m3","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-006","code":"MC-AREA-006","name":"Autoclave 1 EI/348-A","type":"Ambiente","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PDA","microorganism":"Mohos y Levadura","method":"Sedimentación en placa","exposureMinutes":15,"plateDiameterMm":90,"swabAreaCm2":0,"limitTarget":50,"limitMax":200,"unit":"UFC/m3","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-007","code":"MC-AREA-007","name":"Autoclave 1 EI/348-S","type":"Superficie","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-008","code":"MC-AREA-008","name":"Autoclave 2 EI/258-A","type":"Ambiente","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PDA","microorganism":"Mohos y Levadura","method":"Sedimentación en placa","exposureMinutes":15,"plateDiameterMm":90,"swabAreaCm2":0,"limitTarget":50,"limitMax":200,"unit":"UFC/m3","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-009","code":"MC-AREA-009","name":"Autoclave 2 EI/258-S","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-010","code":"MC-AREA-010","name":"Balanza EI/199","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-011","code":"MC-AREA-011","name":"Baño de maria EI/283","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-012","code":"MC-AREA-012","name":"Baño maria EI/364","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-013","code":"MC-AREA-013","name":"Cabina de flujo laminar EI/132","type":"Superficie","criticality":"CRÍTICA","frequency":"Semanal","frequencyDays":7,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-014","code":"MC-AREA-014","name":"Estufa EI/254","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-015","code":"MC-AREA-015","name":"Incubadora EI/365","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-016","code":"MC-AREA-016","name":"Nevera 1 EI/61","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-017","code":"MC-AREA-017","name":"Nevera 2 EI/350","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-018","code":"MC-AREA-018","name":"Meson de pesado de caldo y agares","type":"Superficie","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-019","code":"MC-AREA-019","name":"Piso del área de incubación","type":"Superficie","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-020","code":"MC-AREA-020","name":"Piso del área de siembra","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-021","code":"MC-AREA-021","name":"Vidrio del área de incubacion","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-022","code":"MC-AREA-022","name":"Vidrio del área de siembra","type":"Superficie","criticality":"NORMAL","frequency":"Cada 15 días","frequencyDays":15,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-023","code":"MC-AREA-023","name":"Vidrio del área general","type":"Superficie","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Hisopado 100 cm2","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":100,"limitTarget":10,"limitAlert":20,"limitMax":20,"unit":"UFC/100 cm²","criteriaSource":"MC2109-03 / Instructivo interno","active":true},{"id":"MC-AREA-024","code":"MC-AREA-024","name":"Agua destilada (llave)","type":"Agua","criticality":"NORMAL","frequency":"Mensual","frequencyDays":30,"medium":"PCA","microorganism":"Aerobios Mesofilos","method":"Recuento en placa por profundidad","exposureMinutes":0,"plateDiameterMm":0,"swabAreaCm2":0,"limitTarget":100,"limitMax":100,"unit":"UFC/mL","criteriaSource":"MC2109-03 / Instructivo interno","active":true}];
const DEFAULT_STRAINS=[
 {id:'strain-ec-25922',name:'Escherichia coli',referenceCode:'ATCC 25922',supplierLot:'BCCL5033',referenceExpiry:'2026-02-28',shortCode:'EC',recommendedMedium:'Agar Nutriente',incubationTemp:35,incubationHours:24,expectedMorphology:'Colonias circulares, lisas, convexas, color crema-grisáceo, borde entero',cryovialLifeMonths:4,storageTemp:'-15 a -25 °C'},
 {id:'strain-sal-14028',name:'Salmonella Typhimurium',referenceCode:'ATCC 14028',supplierLot:'BCCL7529',referenceExpiry:'2026-05-31',shortCode:'SAL',recommendedMedium:'Agar Nutriente',incubationTemp:35,incubationHours:24,expectedMorphology:'Colonias circulares, lisas, ligeramente convexas, color incoloro a grisáceo',cryovialLifeMonths:4,storageTemp:'-15 a -25 °C'},
 {id:'strain-ent-29212',name:'Enterococcus Faecalis',referenceCode:'ATCC 29212',supplierLot:'BCCM7317',referenceExpiry:'2027-01-31',shortCode:'ENT',recommendedMedium:'Agar Nutriente',incubationTemp:35,incubationHours:24,expectedMorphology:'Colonias pequeñas, circulares, lisas, color blanco-crema',cryovialLifeMonths:4,storageTemp:'-15 a -25 °C'},
 {id:'strain-kbl-13883',name:'Klebsiella Pneumoniae',referenceCode:'ATCC 13883',supplierLot:'BCCM1019',referenceExpiry:'2026-07-31',shortCode:'KBL',recommendedMedium:'Agar Nutriente',incubationTemp:35,incubationHours:24,expectedMorphology:'Colonias grandes, mucoides, convexas, color crema brillante',cryovialLifeMonths:4,storageTemp:'-15 a -25 °C'},
 {id:'strain-ec1-25922',name:'Escherichia coli-1',referenceCode:'ATCC 25922',supplierLot:'BCCM5277',referenceExpiry:'2027-03-29',shortCode:'EC1',recommendedMedium:'Agar Nutriente',incubationTemp:35,incubationHours:24,expectedMorphology:'Colonias circulares, lisas, convexas, color crema-grisáceo, borde entero',cryovialLifeMonths:4,storageTemp:'-15 a -25 °C'}
];

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function today(){return new Date().toISOString().slice(0,10)}
function nowISO(){return new Date().toISOString()}
function addDays(dateStr,days){if(!dateStr)return '';const d=new Date(dateStr+'T12:00:00');d.setDate(d.getDate()+Number(days||0));return d.toISOString().slice(0,10)}
// V2.0.0-I1: Smart Planificador. Control directo, precarga, EN PROCESO, recálculo y actualización inmediata.
function adjustToNextWorkingDay(dateStr){if(!dateStr)return '';const d=new Date(dateStr+'T12:00:00');const day=d.getDay();if(day===6)d.setDate(d.getDate()+2);else if(day===0)d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
function addScheduledDays(dateStr,days){return adjustToNextWorkingDay(addDays(dateStr,days))}
function daysBetween(a,b){if(!a||!b)return null;return Math.ceil((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000)}
function pill(v){const s=String(v||'—');const cls=/NO APTO|NO_CUMPLE|BLOQUEADO|VENCIDO|DESECHADO/.test(s)?'bad':/APTO|LIBERADO|CUMPLE|DISPONIBLE|CALIFICADO|VIGENTE/.test(s)?'ok':'warn';return `<span class="pill ${cls}">${esc(s)}</span>`}
function systemConfig(){return state.systemConfig.find(x=>x.id==='media-control')||DEFAULT_SYSTEM_CONFIG}
// V2.0.0-H1B: Motor de Validación por Fecha del Documento.
// Toda validación operativa usa la fecha propia del documento/registro.
// Las vistas de inventario/consulta llaman sin fecha y por ello usan HOY.
function validityReferenceDate(recordDate=''){return recordDate||today()}
function activeUser(){return localStorage.getItem('microbio_active_user')||state.catalogPersonnel[0]?.code||''}
function activePerson(){return state.catalogPersonnel.find(x=>x.code===activeUser())||null}
function mediumByName(name){return state.catalogMedia.find(x=>x.name===name)||DEFAULT_MEDIA.find(x=>x.name===name)}
function defaultTechnicalClass(name){return DEFAULT_MEDIA.find(x=>x.name===name)?.technicalClass||'SIN_CLASIFICAR'}
function mediumTechnicalClass(m){return String(m?.technicalClass||defaultTechnicalClass(m?.name||m?.mediumName||'')).toUpperCase()}
function technicalClassLabel(v){return ({GENERAL:'General',SELECTIVO:'Selectivo',DIFERENCIAL_CROMOGENICO:'Diferencial / Cromogénico',SIN_CLASIFICAR:'Sin clasificar'})[String(v||'').toUpperCase()]||v||'Sin clasificar'}
function performanceTestsForMedium(m){const name=String(m?.name||m?.mediumName||m?.medium||'');if(isANMedium(name))return [];if(bottleFamilyForMedium(name)==='A1')return ['productivity','selectivity','specificity'];const c=mediumTechnicalClass(m);if(c==='GENERAL')return ['productivity'];if(c==='SELECTIVO')return ['productivity','selectivity'];if(c==='DIFERENCIAL_CROMOGENICO')return ['productivity','selectivity','specificity'];return []}
function performanceTestsForPrep(p){if(!performanceRequiredForPrep(p))return [];const m=p?.criteriaSnapshot||mediumByName(p?.medium);return performanceTestsForMedium(m)}
function performanceTestLabel(n){return ({productivity:'Productividad',selectivity:'Selectividad',specificity:'Especificidad'})[n]||n}

function performanceProfileForMedium(m){const live=mediumByName(m?.name||m?.mediumName||m?.medium||'');return structuredClone(live?.performanceProfile||m?.performanceProfile||{});}
function performanceTaskForPrep(prepId){return state.performanceTasks.filter(t=>t.prepId===prepId).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0]||null}
function performanceTestsForTask(task){return state.performanceTests.filter(t=>t.taskId===task?.id).sort((a,b)=>(a.testType||'').localeCompare(b.testType||''))}
function nextPerformanceCode(date){const y=String(date||today()).slice(0,4);const n=state.performanceTasks.filter(t=>String(t.code||'').startsWith(`PR-${y}-`)).reduce((m,t)=>Math.max(m,Number(String(t.code).split('-').pop())||0),0)+1;return `PR-${y}-${String(n).padStart(4,'0')}`}
function resolvedPerformanceStrain(test){const base=strainById(test?.strainId);if(!base)return null;const task=state.performanceTasks.find(t=>t.id===test?.taskId),refDate=state.mediaPrep.find(p=>p.id===task?.prepId)?.date||today();if(!base.referenceExpiry||base.referenceExpiry>=refDate)return base;const alternatives=state.catalogStrains.filter(s=>s.referenceCode===base.referenceCode&&(!s.referenceExpiry||s.referenceExpiry>=refDate)).sort((a,b)=>(b.referenceExpiry||'9999').localeCompare(a.referenceExpiry||'9999'));return alternatives[0]||base}
function eligiblePerformanceReactivations(strainId){return state.strainReactivations.filter(r=>r.strainId===strainId&&r.result==='APTO').sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.updatedAt||'').localeCompare(a.updatedAt||''))}
function performanceTaskStatus(task){if(!task||isANMedium(task?.medium))return 'NO APLICA';const tests=performanceTestsForTask(task);if(!tests.length)return 'PENDIENTE';if(tests.some(t=>t.result==='NO CUMPLE'))return 'NO APTO';if(tests.every(t=>t.result==='CUMPLE'))return 'APTO';return 'PENDIENTE'}
function performanceResolvedForPrep(prep){if(!performanceRequiredForPrep(prep))return true;const task=performanceTaskForPrep(prep.id);if(!task&&bottleById(prep?.bottleId)?.qualificationStatus==='CALIFICADO')return true;return performanceTaskStatus(task)==='APTO'}
async function createPerformanceTaskForPrep(prep){if(!prep?.performanceRequired||isANMedium(prep?.medium)||performanceTaskForPrep(prep.id))return null;const m=prep.criteriaSnapshot||mediumByName(prep.medium),required=performanceTestsForPrep(prep),profile=performanceProfileForMedium(m);if(!required.length)return null;const task=await saveLocal('performanceTasks',{id:crypto.randomUUID(),code:nextPerformanceCode(prep.date),prepId:prep.id,bottleId:prep.bottleId,medium:prep.medium,lotCode:prep.lotCode,bottleCode:prep.bottleCode,technicalClass:mediumTechnicalClass(m),requiredTests:required,profileSnapshot:profile,status:'PENDIENTE'},{render:false});for(const testType of required){const cfg=profile?.[testType]||{};await saveLocal('performanceTests',{id:crypto.randomUUID(),taskId:task.id,prepId:prep.id,testType,strainId:cfg.strainId||'',expectedGas:cfg.expectedGas||'',expectedTurbidity:cfg.expectedTurbidity||'',reactivationId:'',gasObserved:'',turbidityObserved:'',manualConformity:'',result:'PENDIENTE'},{render:false})}await audit('performanceTask',task.id,'PRUEBA DE RENDIMIENTO CREADA',{prepId:prep.id,summary:`${task.code} · ${required.map(performanceTestLabel).join(' + ')}`});return task}
function performanceTestResult(test){if(!test?.reactivationId)return 'PENDIENTE';const r=state.strainReactivations.find(x=>x.id===test.reactivationId);if(!r||r.result!=='APTO')return 'PENDIENTE';if(test.expectedGas||test.expectedTurbidity){if(!test.gasObserved||!test.turbidityObserved)return 'PENDIENTE';const gasOk=!test.expectedGas||test.gasObserved===test.expectedGas;const turOk=!test.expectedTurbidity||test.turbidityObserved===test.expectedTurbidity;return gasOk&&turOk?'CUMPLE':'NO CUMPLE'}if(!test.manualConformity)return 'PENDIENTE';return test.manualConformity==='SI'?'CUMPLE':'NO CUMPLE'}
async function finalizePerformanceTask(taskId){const task=state.performanceTasks.find(t=>t.id===taskId);if(!task)return;const tests=performanceTestsForTask(task),status=tests.some(t=>t.result==='NO CUMPLE')?'NO APTO':tests.length&&tests.every(t=>t.result==='CUMPLE')?'APTO':'PENDIENTE';if(task.status!==status)await saveLocal('performanceTasks',{...task,status,completedAt:status==='PENDIENTE'?'':nowISO(),completedBy:status==='PENDIENTE'?'':activeUser()},{render:false});const prep=state.mediaPrep.find(p=>p.id===task.prepId),b=bottleById(task.bottleId);if(!prep||!b||status==='PENDIENTE')return;if(status==='APTO'){await saveLocal('catalogBottles',{...b,qualificationStatus:'CALIFICADO',qualifiedAt:today(),qualifiedByLotId:prep.id,qualifiedByLotCode:prep.lotCode,qualificationTaskId:task.id,qualificationTests:task.requiredTests},{render:false});for(const sp of state.strainPreparations.filter(x=>x.provisionalQualification&&x.qualificationMediumPrepId===prep.id&&x.status==='APTA'))await saveLocal('strainPreparations',{...sp,usageScope:'GENERAL',provisionalQualification:false,qualificationReleasedAt:nowISO()},{render:false});await audit('catalogBottle',b.id,'FRASCO CALIFICADO POR RENDIMIENTO',{prepId:prep.id,summary:`${task.code} · ${task.requiredTests.map(performanceTestLabel).join(' + ')} · cepas provisionales liberadas`})}else{await saveLocal('catalogBottles',{...b,qualificationStatus:'BLOQUEADO',qualificationTaskId:task.id},{render:false});for(const sp of state.strainPreparations.filter(x=>x.provisionalQualification&&x.qualificationMediumPrepId===prep.id&&x.status==='APTA'))await saveLocal('strainPreparations',{...sp,status:'BLOQUEADA',usageScope:'NO_UTILIZABLE',provisionalQualification:false,qualificationRejectedAt:nowISO()},{render:false});await audit('catalogBottle',b.id,'FRASCO BLOQUEADO POR RENDIMIENTO',{prepId:prep.id,summary:`${task.code} · resultado NO APTO · cepas provisionales bloqueadas`})}}

function bottleFamilyForMedium(name){const n=String(name||'').trim();return (n==='A-1 medium simple'||n==='A-1 medium conc'||n==='A-1 medium')?'A1':n}
function isANMedium(value){const n=String(value?.name||value?.mediumName||value?.medium||value||'').trim().toLowerCase();return n==='an agar nutrients'||n==='an agar nutriente'||n==='agar nutrients'||n==='agar nutriente'||n==='an'}
function bottleFamilyLabel(value){return bottleFamilyForMedium(value)==='A1'?'A-1 medium (simple + concentrado)':String(value||'')}
function bottleMatchesMedium(b,medium){return bottleFamilyForMedium(b?.mediumFamily||b?.medium)===bottleFamilyForMedium(medium)}
function bottleById(id){return state.catalogBottles.find(x=>x.id===id)}
function latestQC(prepId){return state.mediaQC.filter(x=>x.prepId===prepId).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0]}
function latestRelease(prepId){return state.mediaRelease.filter(x=>x.prepId===prepId).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0]}
function isClosed(p){return !!p?.closureType||p?.status==='CERRADO'}
function validityState(p,recordDate=''){if(!p?.expiryDate)return 'SIN FECHA';return p.expiryDate<validityReferenceDate(recordDate)?'VENCIDO':'VIGENTE'}
function availabilityState(p){const q=latestQC(p.id),r=latestRelease(p.id);if(isClosed(p)||validityState(p)==='VENCIDO'||q?.result!=='APTO'||r?.decision!=='LIBERADO')return 'NO DISPONIBLE';return 'DISPONIBLE'}
function lotState(p){const q=latestQC(p.id),r=latestRelease(p.id);if(isClosed(p))return 'CERRADO';if(q?.result==='NO APTO'||r?.decision==='BLOQUEADO')return 'BLOQUEADO';if(r?.decision==='LIBERADO')return 'LIBERADO';if(q)return 'QC';return 'PREPARADO'}
function lotAlert(p){if(isClosed(p))return 'SIN ALERTA';if(p.expiryDate&&p.expiryDate<today())return 'VENCIDO · BLOQUEAR USO';const remain=daysBetween(today(),p.expiryDate);if(remain!==null&&remain>=0&&remain<=Number(systemConfig().alertDays||0))return `VENCE EN ${remain} DÍA${remain===1?'':'S'}`;const q=latestQC(p.id);if(q?.result==='NO APTO')return 'QC NO APTO';if(!q)return 'PENDIENTE QC';return 'SIN ALERTA'}
function closureLabel(type){return ({AGOTADO:'Agotado / consumido completamente',VENCIMIENTO:'Desechado por vencimiento',CONTAMINACION:'Desechado por contaminación',NO_CONFORMIDAD:'Desechado por no conformidad',DETERIORO:'Desechado por deterioro',OTRO:'Otro motivo'})[type]||type||'—'}
function performanceRequiredForPrep(p){if(isANMedium(p?.medium||p?.criteriaSnapshot?.mediumName))return false;if(typeof p?.performanceRequired==='boolean')return p.performanceRequired;const b=bottleById(p?.bottleId);return !!b&&b.qualificationStatus!=='CALIFICADO'&&b.qualificationStatus!=='NO_APLICA'}
function bottleExpiredOn(b,onDate=today()){const ref=validityReferenceDate(onDate);return !!(b?.expiryDate&&ref&&ref>b.expiryDate)}
function bottleHasQualificationPrep(b){return !!b&&state.mediaPrep.some(p=>p.bottleId===b.id)}
function bottleSelectable(b,onDate=today()){if(!b)return false;const op=b.operationalStatus||'ACTIVO';if(op!=='ACTIVO')return false;if(!b.expiryDate||bottleExpiredOn(b,onDate))return false;if(b.qualificationStatus==='BLOQUEADO'||b.qualificationStatus==='PENDIENTE_RENDIMIENTO')return false;if(b.qualificationStatus==='CALIFICADO'||b.qualificationStatus==='NO_APLICA')return true;return (b.qualificationStatus||'NUEVO')==='NUEVO'&&!bottleHasQualificationPrep(b)}
function bottleStatusText(b){if(!b)return '—';if((b.operationalStatus||'ACTIVO')==='BAJA')return 'BAJA';return b.qualificationStatus||'NUEVO'}



// ===== V2.0.0-B · Motor transversal de Reglas y Criterios =====
function criterionCurrentVersion(rule){
  if(!rule)return null;
  const versions=state.criteriaVersions.filter(v=>v.ruleId===rule.id).sort((a,b)=>Number(b.version||0)-Number(a.version||0));
  return versions.find(v=>v.id===rule.currentVersionId)||versions[0]||null;
}
function activeCriterion(domain,scopeKey,onDate=today()){
  const candidates=state.criteriaRules.filter(r=>r.domain===domain&&r.scopeKey===scopeKey&&r.status!=='INACTIVO');
  for(const r of candidates){const v=criterionCurrentVersion(r);if(!v)continue;if(v.effectiveFrom&&onDate<v.effectiveFrom)continue;if(v.effectiveTo&&onDate>v.effectiveTo)continue;return {rule:r,version:v};}
  return null;
}
function criterionSnapshot(domain,scopeKey,onDate=today()){
  const c=activeCriterion(domain,scopeKey,onDate);if(!c)return null;
  const {rule,version}=c;return {ruleId:rule.id,code:rule.code,domain:rule.domain,scopeKey:rule.scopeKey,versionId:version.id,version:Number(version.version||1),effectiveFrom:version.effectiveFrom||'',effectiveTo:version.effectiveTo||'',target:version.target??null,alert:version.alert??null,action:version.action??null,min:version.min??null,max:version.max??null,unit:version.unit||'',sourceType:version.sourceType||'',sourceReference:version.sourceReference||'',capturedAt:nowISO()};
}
function monitoringCriterion(pointId,onDate=today()){return activeCriterion('CONTROL_MICROBIOLOGICO',`POINT:${pointId}`,onDate)}
function criterionBandLabel(v){if(!v)return 'SIN CRITERIO';const parts=[];if(v.target!==null&&v.target!==undefined&&v.target!=='')parts.push(`Target ≤ ${v.target}`);if(v.alert!==null&&v.alert!==undefined&&v.alert!=='')parts.push(`Alerta > ${v.alert}`);if(v.action!==null&&v.action!==undefined&&v.action!=='')parts.push(`Acción > ${v.action}`);if(v.min!==null&&v.min!==undefined&&v.max!==null&&v.max!==undefined)parts.push(`${v.min}–${v.max}`);return `${parts.join(' · ')||'Configurar valores'}${v.unit?' '+v.unit:''}`}
function evaluateCriterionValue(snapshot,value){
  if(!snapshot||value===null||value===undefined||Number.isNaN(Number(value)))return {status:'SIN_EVALUAR',reason:'Dato o criterio incompleto'};
  const n=Number(value);
  if(snapshot.min!==null&&snapshot.min!==undefined&&snapshot.max!==null&&snapshot.max!==undefined)return n>=Number(snapshot.min)&&n<=Number(snapshot.max)?{status:'CONFORME'}:{status:'ACCION_REQUERIDA'};
  if(snapshot.action!==null&&snapshot.action!==undefined&&snapshot.action!==''&&n>Number(snapshot.action))return {status:'ACCION_REQUERIDA'};
  if(snapshot.alert!==null&&snapshot.alert!==undefined&&snapshot.alert!==''&&n>Number(snapshot.alert))return {status:'ALERTA'};
  if(snapshot.target!==null&&snapshot.target!==undefined&&snapshot.target!==''&&n<=Number(snapshot.target))return {status:'CONFORME'};
  if(snapshot.target!==null&&snapshot.target!==undefined&&snapshot.target!==''&&snapshot.alert===null)return {status:'ALERTA',reason:'Supera target; nivel de alerta aún no definido'};
  return {status:'CONFORME'};
}
async function createCriterionRule({code,name,domain,scopeKey,description='',versionData={},queue=false}){
  let rule=state.criteriaRules.find(r=>r.code===code)||state.criteriaRules.find(r=>r.domain===domain&&r.scopeKey===scopeKey);
  if(!rule){rule=await saveLocal('criteriaRules',{id:crypto.randomUUID(),code,name,domain,scopeKey,description,status:'ACTIVO',currentVersionId:''},{queue,render:false});}
  const existing=state.criteriaVersions.filter(v=>v.ruleId===rule.id).sort((a,b)=>Number(b.version||0)-Number(a.version||0));
  if(existing.length)return {rule,version:existing[0]};
  const version=await saveLocal('criteriaVersions',{id:crypto.randomUUID(),ruleId:rule.id,version:1,effectiveFrom:versionData.effectiveFrom||'2026-01-01',effectiveTo:'',target:versionData.target??null,alert:versionData.alert??null,action:versionData.action??null,min:versionData.min??null,max:versionData.max??null,unit:versionData.unit||'',sourceType:versionData.sourceType||'PROCEDIMIENTO_INTERNO',sourceReference:versionData.sourceReference||'',notes:versionData.notes||'',status:'VIGENTE'},{queue,render:false});
  rule=await saveLocal('criteriaRules',{...rule,currentVersionId:version.id},{queue,render:false});return {rule,version};
}
async function seedRuleEngine(){
  const all=await idbAll('records');const has=d=>all.some(x=>x.domain===d&&!x.deleted);
  if(!has('catalogMicroorganisms')){
    const seen=new Set();for(const st of DEFAULT_STRAINS){const key=String(st.referenceCode||st.name).toUpperCase();if(seen.has(key))continue;seen.add(key);await saveLocal('catalogMicroorganisms',{id:`micro-${key.replace(/[^A-Z0-9]+/g,'-').toLowerCase()}`,name:st.name,referenceCode:st.referenceCode||'',shortCode:st.shortCode||'',scientificName:st.name,uses:['CEPAS','RENDIMIENTO'],active:true},{queue:false,render:false});}
  }
  if(!has('criteriaRules')){
    // Criterios microbiológicos: migración fiel del Excel/catálogo actual. No se inventa nivel de alerta.
    for(const pt of DEFAULT_MONITORING_POINTS){await createCriterionRule({code:`CR-${pt.code}`,name:`${pt.name} · ${pt.type}`,domain:'CONTROL_MICROBIOLOGICO',scopeKey:`POINT:${pt.id}`,versionData:{target:pt.limitTarget,alert:pt.limitAlert??null,action:pt.limitMax,unit:pt.unit,sourceType:'PROCEDIMIENTO_INTERNO',sourceReference:pt.criteriaSource||'MC2109-03 / Instructivo interno',notes:pt.type==='Superficie'&&pt.medium==='PCA'&&Number(pt.swabAreaCm2)===100?'Criterio interno: CUMPLE ≤10 · ALERTA 11–20 · NO CUMPLE >20 UFC/100 cm².':'Migrado desde catálogo de áreas.'}})}
    // Criterio de reactivación ya validado por el laboratorio.
    await createCriterionRule({code:'CR-CEP-TURB-001',name:'Turbidez de trabajo inicial',domain:'CEPAS',scopeKey:'REACTIVACION:TURBIDEZ_INICIAL',versionData:{min:0.48,max:0.52,unit:'mFc',sourceType:'PROCEDIMIENTO_INTERNO',sourceReference:'Criterio técnico interno vigente'}});
    // Perfiles de rendimiento de medios: la clasificación decide las pruebas, las cepas vienen del catálogo maestro.
    for(const m of DEFAULT_MEDIA){await createCriterionRule({code:`CR-MED-${m.prefix}`,name:`Rendimiento ${m.name}`,domain:'MEDIOS',scopeKey:`MEDIUM:${m.id}`,versionData:{unit:'',sourceType:'CATALOGO_TECNICO',sourceReference:'Catálogo maestro de medios / método aplicable',notes:`Clasificación ${m.technicalClass}. Pruebas y cepas definidas por el perfil técnico del medio.`}})}
  }
}

let db;
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('records'))d.createObjectStore('records',{keyPath:'key'});if(!d.objectStoreNames.contains('outbox'))d.createObjectStore('outbox',{keyPath:'key'});if(!d.objectStoreNames.contains('inbox'))d.createObjectStore('inbox',{keyPath:'key'});if(!d.objectStoreNames.contains('conflicts'))d.createObjectStore('conflicts',{keyPath:'key'});if(!d.objectStoreNames.contains('syncMeta'))d.createObjectStore('syncMeta',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function idbPut(store,value){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function idbDelete(store,key){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function idbAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}

function ensureStateDomains(){for(const d of DOMAINS)if(!Array.isArray(state[d]))state[d]=[]}
async function loadLocal(){const all=await idbAll('records');for(const d of DOMAINS)state[d]=all.filter(x=>x.domain===d&&!x.deleted).map(x=>x.data);renderAll()}

const AUDIT_DOMAIN_LABELS=Object.freeze({
  sampleIntakes:'Registro de muestra y duplicados',
  sampleAnalyses:'Registro de muestra y duplicados',
  duplicateEvaluations:'Registro de muestra y duplicados',
  productCatalog:'Trazabilidad de productos',
  productLots:'Trazabilidad de productos',
  productUsage:'Trazabilidad de productos',
  productClosures:'Trazabilidad de productos',
  productTrace:'Trazabilidad de productos',
  mediaPrep:'Control de medios preparados',
  mediaQC:'Control de medios preparados',
  mediaRelease:'Control de medios preparados',
  catalogMedia:'Control de medios preparados',
  catalogBottles:'Control de medios preparados',
  performanceTasks:'Control de medios preparados',
  performanceTests:'Control de medios preparados',
  performanceLinks:'Control de medios preparados',
  catalogStrains:'Preparación de cepas de referencia',
  strainPreparations:'Preparación de cepas de referencia',
  strainReactivations:'Preparación de cepas de referencia',
  strainCryovialEvents:'Preparación de cepas de referencia',
  coliformQCControls:'Control de calidad de muestras',
  coliformQCActions:'Control de calidad de muestras',
  catalogMonitoringPoints:'Control de calidad de áreas',
  microbiologicalControls:'Control de calidad de áreas',
  microPlateEvents:'Control de calidad de áreas',
  microActions:'Control de calidad de áreas',
  monitoringFrequencyDecisions:'Control de calidad de áreas',
  equipmentCatalog:'Control de equipos y áreas',
  equipmentControls:'Control de equipos y áreas',
  equipmentCleaning:'Control de equipos y áreas',
  equipmentTrace:'Control de equipos y áreas',
  environmentalConditions:'Control de equipos y áreas',
  environmentTrace:'Control de equipos y áreas',
  refrigeratorReadings:'Control de equipos y áreas',
  refrigeratorTrace:'Control de equipos y áreas',
  refrigerator2Readings:'Control de equipos y áreas',
  refrigerator2Trace:'Control de equipos y áreas',
  incubatorReadings:'Control de equipos y áreas',
  incubatorVerifications:'Control de equipos y áreas',
  incubatorTrace:'Control de equipos y áreas',
  waterBathReadings:'Control de equipos y áreas',
  waterBathVerifications:'Control de equipos y áreas',
  waterBathTrace:'Control de equipos y áreas',
  phMeterReadings:'Control de equipos y áreas',
  phMeterAccuracy:'Control de equipos y áreas',
  phMeterTrace:'Control de equipos y áreas',
  systemConfig:'Administración',
  catalogPersonnel:'Administración',
  criteriaRules:'Administración',
  criteriaVersions:'Administración',
  catalogMicroorganisms:'Administración',
  auditLog:'Auditoría'
});
const AUDIT_META_FIELDS=new Set(['revision','createdAt','updatedAt','updatedAtMs','originDeviceId','deviceId','version','createdBy','updatedBy','schemaVersion','workspaceId','deleted']);
function auditModuleForDomain(domain){return AUDIT_DOMAIN_LABELS[domain]||domain||'Sistema'}
function compactAuditValue(v){
  if(v===null||v===undefined)return '';
  if(Array.isArray(v))return v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(', ').slice(0,300);
  if(typeof v==='object')return JSON.stringify(v).slice(0,300);
  return String(v).slice(0,300);
}
function genericAuditChanges(before,after){
  const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);
  const out=[];
  for(const key of keys){
    if(AUDIT_META_FIELDS.has(key))continue;
    const a=compactAuditValue(before?.[key]),b=compactAuditValue(after?.[key]);
    if(a!==b)out.push({field:key,before:a||'—',after:b||'—'});
    if(out.length>=20)break;
  }
  return out;
}
function humanRecordLabel(domain,data){
  return String(data?.code||data?.lotCode||data?.sampleCode||data?.name||data?.equipment||data?.medium||data?.id||'').slice(0,120);
}
async function centralAuditEvent({action,module='Sistema',domain='',entityId='',recordLabel='',details={},before=null,after=null,userCode='',email='',uid='',reason=''}) {
  const user=userCode||activeUser()||'—';
  const fb=state.auth?.currentUser;
  const entry={
    id:crypto.randomUUID(),
    entityType:domain||module,
    entityId:entityId||'',
    action,
    module,
    domain,
    recordLabel,
    details:{...details,reason,changes:details.changes||genericAuditChanges(before,after)},
    eventAt:nowISO(),
    user,
    email:email||fb?.email||'',
    uid:uid||fb?.uid||'',
    deviceId,
    version:VERSION,
    immutable:true
  };
  await saveLocal('auditLog',entry,{render:false,audit:false});
  return entry;
}
function shouldAutoAudit(domain){
  return domain!=='auditLog' && !!state.auth?.currentUser && !document.body.classList.contains('secure-locked');
}
async function saveLocal(domain,record,{queue=true,render=true,audit=true}={}){const old=state[domain]?.find?.(x=>x.id===record.id);const stamp=nowISO();const revision=Number(old?.revision||0)+1;const data={...record,id:record.id||crypto.randomUUID(),schemaVersion:SCHEMA_VERSION,workspaceId:WORKSPACE_ID,revision,createdAt:record.createdAt||old?.createdAt||stamp,updatedAt:stamp,updatedAtMs:Date.now(),originDeviceId:record.originDeviceId||old?.originDeviceId||deviceId,deviceId,version:VERSION,createdBy:record.createdBy||old?.createdBy||activeUser(),updatedBy:activeUser(),deleted:false};const key=`${domain}:${data.id}`;await idbPut('records',{key,domain,data,deleted:false});if(queue&&cloudWriteAllowed()){const opId=crypto.randomUUID();await idbPut('outbox',{key:opId,opId,workspaceId:WORKSPACE_ID,schemaVersion:SCHEMA_VERSION,domain,entityId:data.id,operation:'UPSERT',payload:data,status:'PENDING',attempts:0,createdAt:stamp,lastAttemptAt:'',ackedAt:''})}if(render)await loadLocal();else{const i=state[domain].findIndex(x=>x.id===data.id);if(i>=0)state[domain][i]=data;else state[domain].push(data)}updateOutbox();if(CLOUD_SYNC_ENABLED&&state.connected&&cloudWriteAllowed())flushOutbox();if(audit&&shouldAutoAudit(domain)){const action=old?'EDIT':'CREATE';await centralAuditEvent({action,module:auditModuleForDomain(domain),domain,entityId:data.id,recordLabel:humanRecordLabel(domain,data),before:old,after:data,details:{summary:`${action} · ${humanRecordLabel(domain,data)}`}})}return data}
async function saveRemote(domain,data){const key=`${domain}:${data.id}`;const receivedAt=nowISO();await idbPut('inbox',{key:`${domain}:${data.id}:${data.revision||data.updatedAtMs||receivedAt}`,workspaceId:WORKSPACE_ID,domain,entityId:data.id,payload:data,receivedAt,status:'RECEIVED'});const pending=(await idbAll('outbox')).some(x=>x.domain===domain&&x.entityId===data.id&&x.status==='PENDING');const all=await idbAll('records');const current=all.find(x=>x.key===key)?.data;if(pending&&current&&JSON.stringify(current)!==JSON.stringify(data)){const conflictId=crypto.randomUUID();await idbPut('conflicts',{key:conflictId,id:conflictId,workspaceId:WORKSPACE_ID,domain,entityId:data.id,local:current,remote:data,status:'OPEN',detectedAt:receivedAt});return}if(current&&(current.updatedAtMs||0)>(data.updatedAtMs||0))return;await idbPut('records',{key,domain,data,deleted:!!data.deleted});await loadLocal()}
async function audit(entityType,entityId,action,details={}){
  const e={
    id:crypto.randomUUID(),
    entityType,entityId,action,
    module:details.module||auditModuleForDomain(entityType),
    domain:entityType,
    recordLabel:details.recordLabel||details.summary||entityId,
    details,
    eventAt:nowISO(),
    user:activeUser(),
    email:state.auth?.currentUser?.email||'',
    uid:state.auth?.currentUser?.uid||'',
    deviceId,
    version:VERSION,
    immutable:true
  };
  await saveLocal('auditLog',e,{render:false,audit:false});
  return e
}
function auditValue(v){if(Array.isArray(v))return v.join(', ');if(v===null||v===undefined||v==='')return '—';return String(v)}
function auditChanges(before,after,fields){const out=[];for(const [key,label] of fields){const a=auditValue(before?.[key]),b=auditValue(after?.[key]);if(a!==b)out.push({field:label,before:a,after:b})}return out}
function sampleTraceEvents(s){if(!s)return[];const ids=new Set([s.id]);const o=originalForSample(s);const d=o?duplicateForSample(o):null;if(o?.id)ids.add(o.id);if(d?.id)ids.add(d.id);return state.auditLog.filter(e=>{const x=e.details||{};return ids.has(e.entityId)||ids.has(x.sampleId)||ids.has(x.originalSampleId)||ids.has(x.duplicateSampleId)||ids.has(x.duplicateId)}).sort((a,b)=>String(a.eventAt||'').localeCompare(String(b.eventAt||'')))}
function showSampleTrace(id){const s=sampleById(id);if(!s)return;const events=sampleTraceEvents(s),o=originalForSample(s),d=o?duplicateForSample(o):null;const pair=o&&d?`${o.code} ↔ ${d.code}`:s.code;const content=$('#sampleTraceModalContent');if(!content)return;content.innerHTML=`<div class="sample-trace-head"><div><h2>📋 Trazabilidad · ${esc(s.code)}</h2><p class="muted">Historial automático e inmutable · ${esc(pair)}</p></div><span class="pill ${sampleAnalysisFinalized(s)?'ok':'warn'}">${esc(sampleStatus(s))}</span></div><div class="trace-card"><div><span>Muestra</span><b>${esc(s.code)}</b></div><div><span>Tipo</span><b>${esc(s.sampleType||'—')}</b></div><div><span>Parámetros</span><b>${esc(sampleParameterLabelList(s))}</b></div><div><span>Empresa / sucursal</span><b>${esc(s.company||'—')}${s.branch?' · '+esc(s.branch):''}</b></div></div><div class="sample-trace-note">🔒 Este historial es de solo lectura. Los eventos no se editan ni se eliminan desde el ERP.</div><div class="timeline sample-trace-timeline">${events.map(e=>{const changes=Array.isArray(e.details?.changes)?e.details.changes:[];return `<div class="timeline-item"><b>${esc(e.action)}</b><span>${esc(new Date(e.eventAt).toLocaleString())} · ${esc(e.user||'—')} · ${esc(e.deviceId||'—')}</span>${e.details?.summary?`<small>${esc(e.details.summary)}</small>`:''}${changes.length?`<div class="trace-changes">${changes.map(c=>`<div><span>${esc(c.field)}</span><del>${esc(c.before)}</del><b>→</b><ins>${esc(c.after)}</ins></div>`).join('')}</div>`:''}</div>`}).join('')||'<p class="muted">Sin eventos históricos todavía.</p>'}</div>`;$('#sampleTraceModal').classList.add('open');$('#sampleTraceModal').setAttribute('aria-hidden','false')}
window.showSampleTrace=showSampleTrace;

async function migrateSurfaceSwabLimitsD2(){
  const isSurfacePca100=p=>p&&p.type==='Superficie'&&String(p.medium||'').toUpperCase()==='PCA'&&Number(p.swabAreaCm2||0)===100;
  let changed=false;
  for(const p of (state.catalogMonitoringPoints||[]).filter(isSurfacePca100)){
    if(Number(p.limitTarget)!==10||Number(p.limitAlert)!==20||Number(p.limitMax)!==20||p.unit!=='UFC/100 cm²'){
      await saveLocal('catalogMonitoringPoints',{...p,limitTarget:10,limitAlert:20,limitMax:20,unit:'UFC/100 cm²'},{queue:false,render:false});changed=true;
    }
    const rule=(state.criteriaRules||[]).find(r=>r.domain==='CONTROL_MICROBIOLOGICO'&&r.scopeKey===`POINT:${p.id}`);
    if(rule){const v=criterionCurrentVersion(rule);if(v&&(Number(v.target)!==10||Number(v.alert)!==20||Number(v.action)!==20||v.unit!=='UFC/100 cm²')){await saveLocal('criteriaVersions',{...v,target:10,alert:20,action:20,unit:'UFC/100 cm²',notes:'Criterio interno V2.0.0-D2: CUMPLE ≤10 · ALERTA 11–20 · NO CUMPLE >20 UFC/100 cm².'},{queue:false,render:false});changed=true;}}
  }
  if(changed)await loadLocal();
}

async function seed(){const all=await idbAll('records');const has=d=>all.some(x=>x.domain===d&&!x.deleted);if(!has('catalogMedia'))for(const x of DEFAULT_MEDIA)await saveLocal('catalogMedia',x,{queue:false,render:false});if(!has('catalogPersonnel'))for(const x of DEFAULT_PERSONNEL)await saveLocal('catalogPersonnel',x,{queue:false,render:false});if(!has('systemConfig'))await saveLocal('systemConfig',DEFAULT_SYSTEM_CONFIG,{queue:false,render:false});if(!has('catalogStrains'))for(const x of DEFAULT_STRAINS)await saveLocal('catalogStrains',x,{queue:false,render:false});if(!has('catalogMonitoringPoints'))for(const x of DEFAULT_MONITORING_POINTS)await saveLocal('catalogMonitoringPoints',x,{queue:false,render:false});await seedRuleEngine();}
async function migrate(){const all=await idbAll('records');let seq=1;for(const row of all.filter(x=>x.domain==='mediaPrep'&&!x.deleted).sort((a,b)=>(a.data?.date||'').localeCompare(b.data?.date||''))){const p={...row.data};let changed=false;if(!p.internalCode){p.internalCode=`MED-${String(p.date||today()).slice(0,4)}-${String(seq).padStart(6,'0')}`;changed=true}seq++;if(p.sterilityDueDate!==p.date){p.sterilityDueDate=p.date;changed=true}if(!p.macroscopicDueDate){p.macroscopicDueDate=p.date;changed=true}if(changed)await idbPut('records',{...row,data:p})}for(const row of all.filter(x=>x.domain==='catalogBottles'&&!x.deleted)){const b={...row.data};if(!b.operationalStatus){b.operationalStatus='ACTIVO';await idbPut('records',{...row,data:b})}}const cfg=all.find(x=>x.key==='systemConfig:media-control')?.data;if(cfg&&cfg.alertDays===undefined)await idbPut('records',{key:'systemConfig:media-control',domain:'systemConfig',data:{...cfg,alertDays:2},deleted:false});for(const row of all.filter(x=>x.domain==='catalogMedia'&&!x.deleted)){const m={...row.data};let changed=false;if(!m.technicalClass){m.technicalClass=defaultTechnicalClass(m.name);changed=true}const recommendedLife={'AS1':7,'AC1':7,'LMX':7,'PDA':15,'PCA':15,'EMB':15,'AN':15,'BHI':15}[m.prefix];const legacyLife={'PDA':14,'PCA':14,'EMB':14,'AN':14,'BHI':7}[m.prefix];if(recommendedLife!==undefined&&(m.shelfLifeDays===undefined||m.shelfLifeDays===null||Number(m.shelfLifeDays)===Number(legacyLife))){m.shelfLifeDays=recommendedLife;changed=true}if(!m.performanceProfile){const d=DEFAULT_MEDIA.find(x=>x.name===m.name);if(d?.performanceProfile){m.performanceProfile=structuredClone(d.performanceProfile);changed=true}}if((m.id==='medium-lmx'||m.prefix==='LMX'||m.name==='LMX Fluorocult')&&m.performanceProfile?.selectivity?.strainId!=='strain-sal-14028'){m.performanceProfile={...m.performanceProfile,selectivity:{...(m.performanceProfile?.selectivity||{}),strainId:'strain-sal-14028'}};changed=true}if(changed)await idbPut('records',{...row,data:m})}for(const row of all.filter(x=>x.domain==='performanceTasks'&&!x.deleted)){const t={...row.data};if(t.medium==='LMX Fluorocult'&&t.status==='PENDIENTE'&&t.profileSnapshot?.selectivity?.strainId!=='strain-sal-14028'){t.profileSnapshot={...t.profileSnapshot,selectivity:{...(t.profileSnapshot?.selectivity||{}),strainId:'strain-sal-14028'}};await idbPut('records',{...row,data:t})}}for(const row of all.filter(x=>x.domain==='performanceTests'&&!x.deleted)){const test={...row.data};if(test.testType!=='selectivity'||test.result!=='PENDIENTE')continue;const taskRow=all.find(x=>x.domain==='performanceTasks'&&!x.deleted&&x.data?.id===test.taskId);if(taskRow?.data?.medium==='LMX Fluorocult'&&test.strainId!=='strain-sal-14028'){test.strainId='strain-sal-14028';await idbPut('records',{...row,data:test})}}for(const row of all.filter(x=>x.domain==='mediaPrep'&&!x.deleted)){const p={...row.data};if(p.criteriaSnapshot&&!p.criteriaSnapshot.technicalClass){p.criteriaSnapshot={...p.criteriaSnapshot,technicalClass:defaultTechnicalClass(p.medium)};await idbPut('records',{...row,data:p})}}}


function strainById(id){return state.catalogStrains.find(x=>x.id===id)}
function addMonths(dateStr,months){if(!dateStr)return '';const d=new Date(dateStr+'T12:00:00');d.setMonth(d.getMonth()+Number(months||0));return d.toISOString().slice(0,10)}
function timeAddHours(time,hours){if(!time)return '';const [hh,mm]=time.split(':').map(Number);const mins=(hh*60+mm+Number(hours||0)*60)%(24*60);return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`}
function normalizeDecision(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'_')}
function isReleasedDecision(v){return ['LIBERADO','LIBERAR','RELEASED','APROBADO'].includes(normalizeDecision(v))}
function isNutrientAgarPrep(p){const name=String(p?.medium||'').trim().toLowerCase();return p?.prefix==='AN'||name.includes('agar nutrients')||name.includes('agar nutriente')||name==='an'}
function pendingPerformanceContext(){const id=localStorage.getItem('microbio_performance_pending_test');const test=state.performanceTests.find(t=>t.id===id);const task=test?state.performanceTasks.find(t=>t.id===test.taskId):null;const prep=task?state.mediaPrep.find(p=>p.id===task.prepId):null;if(task&&isANMedium(task.medium)){localStorage.removeItem('microbio_performance_pending_test');return null}return test&&task&&prep?{test,task,prep}:null}
const MediaAvailabilityService=Object.freeze({
  isDateValid(prep,onDate=today()){
    if(!prep||!isNutrientAgarPrep(prep)||isClosed(prep))return false;
    const recordDate=onDate||today(),ref=validityReferenceDate(recordDate);
    if(prep.date&&recordDate<prep.date)return false;
    if(prep.expiryDate&&ref>prep.expiryDate)return false;
    return true;
  },
  isAvailableOn(prep,onDate=today()){
    if(!this.isDateValid(prep,onDate))return false;
    const q=latestQC(prep.id),r=latestRelease(prep.id);
    const qcApt=normalizeDecision(q?.result)==='APTO';
    const released=isReleasedDecision(r?.decision)||normalizeDecision(prep.status)==='LIBERADO';
    return qcApt&&released;
  },
  isQualificationCandidateOn(prep,onDate=today()){
    if(!this.isDateValid(prep,onDate))return false;
    const q=latestQC(prep.id),r=latestRelease(prep.id),task=performanceTaskForPrep(prep.id),b=bottleById(prep.bottleId);
    const qcApt=normalizeDecision(q?.result)==='APTO';
    const released=isReleasedDecision(r?.decision)||normalizeDecision(prep.status)==='LIBERADO';
    const taskPending=!!task&&performanceTaskStatus(task)==='PENDIENTE';
    const bottlePending=['NUEVO','PENDIENTE_RENDIMIENTO'].includes(normalizeDecision(b?.qualificationStatus));
    const requiresPerformance=performanceRequiredForPrep(prep);
    // Bootstrap controlado: un AN con QC APTO puede alimentar exclusivamente la cadena
    // de preparación/reactivación necesaria para completar SU propia calificación.
    // No equivale a liberación y nunca lo vuelve disponible para operación general.
    return qcApt&&!released&&(taskPending||requiresPerformance||bottlePending);
  },
  isAvailable(prep){return this.isAvailableOn(prep,today())},
  availableNutrientAgar(onDate=today()){
    return state.mediaPrep.filter(p=>this.isAvailableOn(p,onDate)).sort((a,b)=>(a.expiryDate||'9999').localeCompare(b.expiryDate||'9999')||(a.date||'').localeCompare(b.date||''));
  },
  qualificationCandidates(onDate=today()){
    return state.mediaPrep.filter(p=>this.isQualificationCandidateOn(p,onDate)).sort((a,b)=>(a.expiryDate||'9999').localeCompare(b.expiryDate||'9999')||(a.date||'').localeCompare(b.date||''));
  },
  forStrainPreparation(onDate=today()){
    const ctx=pendingPerformanceContext();
    if(ctx&&this.isQualificationCandidateOn(ctx.prep,onDate))return [ctx.prep];
    const released=this.availableNutrientAgar(onDate);
    const qualification=this.qualificationCandidates(onDate);
    // Si no existe AN liberado, habilita exclusivamente los candidatos de calificación.
    // Si sí existe AN liberado, la operación normal usa únicamente los liberados.
    return released.length?released:qualification;
  },
  forReactivation(onDate=today()){
    const ctx=pendingPerformanceContext();
    if(ctx&&this.isQualificationCandidateOn(ctx.prep,onDate))return [ctx.prep];
    return this.availableNutrientAgar(onDate);
  },
  diagnostic(onDate=today()){
    const all=state.mediaPrep.filter(isNutrientAgarPrep);
    const qc=all.filter(p=>normalizeDecision(latestQC(p.id)?.result)==='APTO');
    const released=qc.filter(p=>isReleasedDecision(latestRelease(p.id)?.decision)||normalizeDecision(p.status)==='LIBERADO');
    const vigente=released.filter(p=>!isClosed(p)&&validityState(p,onDate)==='VIGENTE');
    const qualification=qc.filter(p=>this.isQualificationCandidateOn(p,onDate));
    return {all:all.length,qc:qc.length,released:released.length,vigente:vigente.length,qualification:qualification.length};
  }
});
function eligibleNutrientAgarPreps(onDate=today(),mode='NORMAL'){return mode==='STRAIN_PREP'?MediaAvailabilityService.forStrainPreparation(onDate):mode==='REACTIVATION'?MediaAvailabilityService.forReactivation(onDate):MediaAvailabilityService.availableNutrientAgar(onDate)}
function nextStrainPrepId(date){const d=String(date||today()).replaceAll('-','');const n=state.strainPreparations.filter(p=>p.prepDate===date).length+1;return `PREP-${d}-${String(n).padStart(3,'0')}`}
function nextStrainWorkSeq(strainId,date){const y=String(date||today()).slice(0,4);return state.strainPreparations.filter(p=>p.strainId===strainId&&String(p.prepDate||'').startsWith(y)).length+1}
function buildWorkLot(strain,date,total){if(!strain||!date||!total)return '';const seq=nextStrainWorkSeq(strain.id,date);return `TRA-${strain.shortCode||'OTR'}-${date.slice(2,4)}-${String(seq).padStart(3,'0')}-${String(total).padStart(2,'0')}CV`}
function buildReserveLot(strain,date,count){if(!strain||!date||!count)return '';const seq=nextStrainWorkSeq(strain.id,date);return `RES-${strain.shortCode||'OTR'}-${date.slice(2,4)}-${String(seq).padStart(3,'0')}-${String(count).padStart(2,'0')}CV`}
function strainTurbidityResult(base,inoc){const a=Number(base),b=Number(inoc);if(!Number.isFinite(a)||!Number.isFinite(b))return {delta:'',compliance:''};const delta=Math.round((b-a)*100)/100;return {delta,compliance:delta>=0.48&&delta<=0.52?'CUMPLE':'NO CUMPLE'}}
function strainObservationResult(m,g,p){if(!m||!g||!p)return '';return m==='SI'&&g==='SI'&&p==='SI'?'APROBADO':'RECHAZADO'}
function scientificValue(m,e){const mantissa=Number(m),exponent=Number(e);if(!Number.isFinite(mantissa)||!Number.isInteger(exponent))return null;return {mantissa,exponent,numeric:mantissa*Math.pow(10,exponent),display:`${mantissa.toFixed(1)} × 10^${exponent} UFC/mL`}}
function scientificDisplay(v){if(!v)return '';return v.display||`${Number(v.mantissa).toFixed(1)} × 10^${Number(v.exponent)} UFC/mL`}
function reactivationResultFromForm(f){if(!f)return 'PENDIENTE DE EVALUACIÓN';const required=[f.elements.incubationStart.value,f.elements.morphology.value,f.elements.growth.value,f.elements.purity.value,f.elements.bhiBase.value,f.elements.bhiInoculated.value,f.elements.initialMantissa.value,f.elements.initialExponent.value,f.elements.finalMantissa.value,f.elements.finalExponent.value,f.elements.use.value,f.elements.verifiedBy.value];if(required.some(v=>String(v??'').trim()===''))return 'PENDIENTE DE EVALUACIÓN';const obs=strainObservationResult(f.elements.morphology.value,f.elements.growth.value,f.elements.purity.value),t=strainTurbidityResult(f.elements.bhiBase.value,f.elements.bhiInoculated.value);if(!t.compliance)return 'PENDIENTE DE EVALUACIÓN';return obs==='APROBADO'&&t.compliance==='CUMPLE'?'APTO':'RECHAZADO'}
function strainPrepStatusFromForm(){const f=$('#strainPrepForm');if(!f)return '';const obs=strainObservationResult(f.elements.morphology.value,f.elements.growth.value,f.elements.purity.value);const t=strainTurbidityResult(f.elements.bhiBase.value,f.elements.bhiInoculated.value);if(!obs||!t.compliance)return '';return obs==='APROBADO'&&t.compliance==='CUMPLE'?'APTA':'RECHAZADA'}
function cryovialUsage(prepId){const consumed=state.strainReactivations.filter(r=>r.prepId===prepId).reduce((n,r)=>n+Number(r.quantity||0),0);const bajas=state.strainCryovialEvents.filter(e=>e.prepId===prepId&&e.type==='BAJA').reduce((n,e)=>n+Number(e.quantity||0),0);return {consumed,bajas}}
function strainInventoryForPrep(p){const u=cryovialUsage(p.id),total=Number(p.totalCryovials||0),available=Math.max(0,total-u.consumed-u.bajas),expired=!!p.cryovialExpiry&&p.cryovialExpiry<today();let status='DISPONIBLE';if(p.status!=='APTA')status='NO APTO';else if(expired)status='VENCIDO';else if(available===0)status='SIN STOCK';else if(available<=2)status='BAJO STOCK';return {...u,total,available,expired,status,usedPct:total?Math.round(((u.consumed+u.bajas)/total)*100):0}}
function eligibleStrainPreps(strainId,onDate=today(),{performanceOnly=false,qualificationMediumPrepId=''}={}){const recordDate=onDate||today(),date=validityReferenceDate(recordDate);return state.strainPreparations.filter(p=>p.strainId===strainId&&p.status==='APTA').map(p=>({...p,_inv:strainInventoryForPrep(p)})).filter(p=>{if(!(p.prepDate<=recordDate&&(!p.cryovialExpiry||p.cryovialExpiry>=date)&&p._inv.available>0))return false;if(p.usageScope==='PERFORMANCE_ONLY')return performanceOnly&&(!qualificationMediumPrepId||p.qualificationMediumPrepId===qualificationMediumPrepId);return true}).sort((a,b)=>(a.cryovialExpiry||'').localeCompare(b.cryovialExpiry||''))}
function eligiblePreparedStrains(onDate=today()){const ctx=pendingPerformanceContext(),opts=ctx?{performanceOnly:true,qualificationMediumPrepId:ctx.prep.id}:{};const ids=[...new Set(state.strainPreparations.filter(p=>p.status==='APTA').map(p=>p.strainId))];return ids.map(id=>({strain:strainById(id)||state.strainPreparations.find(p=>p.strainId===id)?.strainSnapshot,prep:eligibleStrainPreps(id,onDate,opts)[0]})).filter(x=>x.strain&&x.prep).sort((a,b)=>(a.strain.name||'').localeCompare(b.strain.name||''))}
function selectedReactPrep(){const strainId=$('#reactStrainSelect')?.value,date=$('#strainReactForm')?.elements.date.value||today(),ctx=pendingPerformanceContext(),opts=ctx?{performanceOnly:true,qualificationMediumPrepId:ctx.prep.id}:{};return eligibleStrainPreps(strainId,date,opts)[0]||null}
function nextReactivationId(date){const d=String(date||today()).replaceAll('-','');const n=state.strainReactivations.filter(r=>r.date===date).length+1;return `REA-${d}-${String(n).padStart(3,'0')}`}

function nextInternalCode(date){const y=String(date||today()).slice(0,4);const n=state.mediaPrep.filter(p=>String(p.internalCode||'').startsWith(`MED-${y}-`)).reduce((m,p)=>Math.max(m,Number(String(p.internalCode).split('-').pop())||0),0)+1;return `MED-${y}-${String(n).padStart(6,'0')}`}
function nextMediumLotNumber(medium,date){const y=String(date||'').slice(0,4);return String(state.mediaPrep.filter(p=>p.medium===medium&&String(p.date||'').startsWith(y)).length+1).padStart(2,'0')}
function buildLotCode(prefix,lotNumber,qty){if(!prefix||!lotNumber||!qty)return '';return `${prefix}-${lotNumber}-${String(qty).padStart(3,'0')}`}
function daysRemaining(date,from=today()){if(!date)return null;const a=new Date(`${from}T00:00:00`),b=new Date(`${date}T00:00:00`);if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return null;return Math.ceil((b-a)/86400000)}
function daysRemainingLabel(date){const d=daysRemaining(date);if(d===null)return '—';if(d<0)return `Vencido hace ${Math.abs(d)} día${Math.abs(d)===1?'':'s'}`;if(d===0)return 'Vence hoy';return `${d} día${d===1?'':'s'}`}
const MEDIA_TRANSITIONS=Object.freeze({PREPARADO:['QC'],QC:['LIBERADO','BLOQUEADO'],LIBERADO:['CERRADO'],BLOQUEADO:['CERRADO'],CERRADO:[]});
function canMediaTransition(from,to){return (MEDIA_TRANSITIONS[String(from||'PREPARADO')]||[]).includes(to)}
function mediaTransitionGuard(p,to){if(!p)return false;const from=p.status||'PREPARADO';return from===to||canMediaTransition(from,to)}
function setStateCard(id,stateText,detail=''){const el=$(id);if(!el)return;el.className='state-card '+(stateText==='APTO'||stateText==='APTA'||stateText==='LIBERADO'?'state-ok':stateText==='RECHAZADO'||stateText==='RECHAZADA'||stateText==='NO APTO'||stateText==='BLOQUEADO'?'state-bad':'state-pending');el.innerHTML=`<strong>${esc(stateText||'PENDIENTE')}</strong>${detail?`<span>${esc(detail)}</span>`:''}`}
function prepCalc(){const f=$('#prepForm'),m=mediumByName($('#prepMediumSelect').value),date=f.elements.date.value,qty=Number(f.elements.quantity.value||0),vol=Number(f.elements.volumeMl.value||0),lotNumber=nextMediumLotNumber(m?.name,date),mass=m&&vol?Math.round((m.concentration*vol/1000)*1000)/1000:null;return {m,date,qty,vol,lotNumber,lotCode:buildLotCode(m?.prefix,lotNumber,qty),mass}}
function renderActiveUser(){const current=activeUser();const userEl=document.getElementById('secureActiveUser');if(userEl)userEl.textContent=current||'—';updateAutoResponsibleFields();applyAccessControl();adminAccessSafetyCheck()}
function updateAutoResponsibleFields(){const u=activeUser();if($('#prepResponsible'))$('#prepResponsible').value=u;if($('#qcResponsible'))$('#qcResponsible').value=u;if($('#strainPreparedBy'))$('#strainPreparedBy').value=u;if($('#reactPreparedBy'))$('#reactPreparedBy').value=u;applyReleaseDefaults()}
function renderMediaOptions(){const media=[...state.catalogMedia].sort((a,b)=>a.name.localeCompare(b.name));const opts='<option value="">Seleccione</option>'+media.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');$('#prepMediumSelect').innerHTML=opts;const seen=new Set(),familyOpts=[];for(const m of media){const key=bottleFamilyForMedium(m.name);if(seen.has(key))continue;seen.add(key);familyOpts.push(`<option value="${esc(key)}">${esc(bottleFamilyLabel(key))}</option>`)}$('#bottleMediumSelect').innerHTML='<option value="">Seleccione</option>'+familyOpts.join('');$('#catalogTypeSelect').innerHTML='<option value="Caldo">Caldo</option><option value="Agar">Agar</option>';if($('#catalogTechnicalClassSelect'))$('#catalogTechnicalClassSelect').innerHTML='<option value="GENERAL">General → Productividad</option><option value="SELECTIVO">Selectivo → Productividad + Selectividad</option><option value="DIFERENCIAL_CROMOGENICO">Diferencial / Cromogénico → Productividad + Selectividad + Especificidad</option>';const strainOpts='<option value="">Sin configurar</option>'+state.catalogStrains.map(s=>`<option value="${s.id}">${esc(s.name)} · ${esc(s.referenceCode)}</option>`).join('');$$('.performance-strain-admin').forEach(s=>s.innerHTML=strainOpts)}
function renderBottleOptions(){const medium=$('#prepMediumSelect').value;const current=$('#prepBottleSelect').value;const prepDate=$('#prepForm [name="date"]')?.value||today();const allForMedium=state.catalogBottles.filter(b=>bottleMatchesMedium(b,medium)).filter(b=>!b.productLotId||productIntegrationEligibleLot(productLotById(b.productLotId)));const bottles=allForMedium.filter(b=>bottleSelectable(b,prepDate)).sort((a,b)=>a.code.localeCompare(b.code));const pending=allForMedium.filter(b=>(b.operationalStatus||'ACTIVO')==='ACTIVO'&&b.qualificationStatus==='PENDIENTE_RENDIMIENTO');const expired=allForMedium.filter(b=>(b.operationalStatus||'ACTIVO')==='ACTIVO'&&b.expiryDate&&bottleExpiredOn(b,prepDate));const noExpiry=allForMedium.filter(b=>(b.operationalStatus||'ACTIVO')==='ACTIVO'&&!b.expiryDate);const select=$('#prepBottleSelect'),help=$('#prepBottleHelp'),save=$('#prepSaveBtn');if(!medium){select.innerHTML='<option value="">Seleccione primero el medio</option>';select.disabled=true;if(help)help.textContent='Seleccione un medio para ver sus frascos/lotes disponibles.';if(save)save.disabled=true;updatePrepCalculated();return}select.disabled=false;if(bottles.length){select.innerHTML='<option value="">Seleccione frasco/lote</option>'+bottles.map(b=>`<option value="${b.id}">${esc(b.code)} · ${esc(b.qualificationStatus||'NUEVO')}${(b.qualificationStatus||'NUEVO')==='NUEVO'?' · PRIMERA PREPARACIÓN PARA CALIFICACIÓN':''}${b.source==='PRODUCT_TRACEABILITY'?' · TRAZABILIDAD':''}</option>`).join('');if(bottles.some(b=>b.id===current))select.value=current;else if(bottles.length===1)select.value=bottles[0].id;if(help)help.textContent=[pending.length?`${pending.length} pendiente(s) de rendimiento`:'' ,expired.length?`${expired.length} vencido(s) para la fecha de preparación`:'' ,noExpiry.length?`${noExpiry.length} sin fecha de vencimiento del fabricante`:'' ].filter(Boolean).join(' · ')||'Los lotes NUEVOS de Trazabilidad pueden usarse para su primera preparación de calificación aunque el frasco comercial ya tenga fecha de apertura.';if(save)save.disabled=false}else{select.innerHTML='<option value="">NO HAY FRASCO DISPONIBLE</option>';if(help)help.textContent=noExpiry.length?'Complete la fecha de vencimiento del fabricante en Administración.':expired.length?'El/los frasco(s) del medio están vencidos para la fecha seleccionada. Registre un lote vigente.':pending.length?'Existe un frasco abierto PENDIENTE DE RENDIMIENTO. Complete su QC antes de preparar nuevamente este medio.':'Registre un frasco/lote ACTIVO y vigente en Administración antes de preparar este medio.';if(save)save.disabled=true}updatePrepCalculated()}
function updatePrepPlateFeedback(v=prepCalc()){
  const box=$('#prepPlateFeedback'),label=$('#prepQuantityLabel'),help=$('#prepQuantityHelp');if(!box)return;
  const isAgar=v.m?.type==='Agar',qty=Math.max(0,Math.floor(Number(v.qty||0)));
  if(label){const first=label.childNodes[0];if(first&&first.nodeType===3)first.nodeValue=isAgar?'Cantidad de cajas Petri preparadas':'Cantidad preparada';}
  if(help)help.textContent=isAgar?'Registre el número real de cajas Petri obtenidas de este lote. Ese valor será la fuente oficial del inventario.':'Registre la cantidad real preparada para este lote.';
  box.classList.toggle('active',isAgar&&qty>0);box.classList.toggle('non-agar',!!v.m&&!isAgar);
  if(!v.m){box.innerHTML='<b>Inventario de cajas</b><span>Seleccione un medio y registre la cantidad preparada.</span>';return}
  if(!isAgar){box.innerHTML='<b>Inventario de cajas</b><span>Este medio es Caldo; no genera cajas Petri.</span>';return}
  if(!qty){box.innerHTML='<b>Inventario de cajas Petri</b><span>Ingrese cuántas cajas Petri se prepararon realmente.</span>';return}
  box.innerHTML=`<b>Inventario que generará este lote</b><span class="plate-count">${qty} caja${qty===1?'':'s'} Petri</span><span>Se identificarán automáticamente como Caja 001${qty>1?` … Caja ${String(qty).padStart(3,'0')}`:''}. Quedarán registradas desde la preparación y disponibles para uso únicamente después de liberar el lote.</span>`;
}
function updatePrepCalculated(){const v=prepCalc(),b=bottleById($('#prepBottleSelect').value);$('#prepType').value=v.m?.type||'';$('#prepPrefix').value=v.m?.prefix||'';$('#prepYear').value=v.date?.slice(0,4)||'';$('#prepLotNumber').value=v.lotNumber||'';$('#prepLotCode').value=v.lotCode||'';$('#prepUnit').value=v.m?.type==='Agar'?'Caja Petri':'Frasco';$('#prepConcentration').value=v.m?.concentration??'';$('#prepTheoreticalMass').value=v.mass??'';$('#prepSterilityDue').value=v.date||'';$('#prepMacroDue').value=v.date?addDays(v.date,systemConfig().macroscopicDays):'';$('#prepExpiry').value=v.m&&v.date?addDays(v.date,v.m.shelfLifeDays):'';$('#prepPerformanceRequirement').value=b?(isANMedium(v.m?.name)?'NO APLICA · AN EXCLUIDO DE RENDIMIENTO':((b.qualificationStatus==='CALIFICADO'||b.qualificationStatus==='NO_APLICA')?'NO APLICA · FRASCO CALIFICADO':'REQUERIDO · FRASCO NO CALIFICADO')):'';$('#prepResponsible').value=activeUser();updatePrepPlateFeedback(v)}
function resetPrep(){const f=$('#prepForm');f.reset();f.elements.date.value=today();renderMediaOptions();renderBottleOptions();updatePrepCalculated()}

function qcResultFromForm(){const f=$('#qcForm'),prep=state.mediaPrep.find(p=>p.id===f.elements.prepId.value);if(!prep)return null;const ph=Number(f.elements.ph.value),m=prep.criteriaSnapshot||mediumByName(prep.medium);if(!f.elements.noTurbidity.value||!f.elements.noMicroorganism.value||!f.elements.sterility.value||!f.elements.macroscopic.value||!f.elements.ph.value)return null;if(f.elements.noTurbidity.value!=='Sí'||f.elements.noMicroorganism.value!=='Sí'||f.elements.sterility.value!=='CUMPLE'||f.elements.macroscopic.value!=='CUMPLE')return 'NO APTO';if(m&&(ph<Number(m.phMin)||ph>Number(m.phMax)))return 'NO APTO';return 'APTO'}
function updateQCPreview(){const r=qcResultFromForm();$('#qcPreviewResult').textContent=r||'INCOMPLETO';$('#qcPreviewResult').className=r==='APTO'?'text-ok':r==='NO APTO'?'text-bad':'text-warn'}
function prepareQC(){const prep=state.mediaPrep.find(p=>p.id===$('#qcPrepSelect').value),m=prep?.criteriaSnapshot||mediumByName(prep?.medium),b=bottleById(prep?.bottleId),required=performanceRequiredForPrep(prep),tests=performanceTestsForPrep(prep),tech=mediumTechnicalClass(m),task=performanceTaskForPrep(prep?.id),pstatus=performanceTaskStatus(task);$('#qcExpectedColor').value=m?.expectedColor||'';$('#qcExpectedAppearance').value=m?.expectedAppearance||'';$('#qcPhMin').value=m?.phMin??'';$('#qcPhMax').value=m?.phMax??'';$('#qcResponsible').value=activeUser();let reason='Seleccione un lote';if(prep&&!required)reason=isANMedium(prep.medium)?'NO APLICA: AN está excluido de la Prueba de Rendimiento.':`No aplica: ${b?.code||prep?.bottleCode||'frasco'} ya está calificado.`;else if(prep&&required)reason=`${task?.code||'Tarea pendiente'} · ${technicalClassLabel(tech)} · ${tests.map(performanceTestLabel).join(' + ')} · estado ${pstatus}.`;$('#performanceReason').textContent=reason;$('#bottleQualificationPill').innerHTML=pill(b?.qualificationStatus||'SIN REGISTRO');const req=$('#qcRequirementCard');if(req){if(!prep)req.innerHTML='<b>Seleccione un lote</b><span>El ERP mostrará automáticamente su clasificación y las pruebas requeridas.</span>';else req.innerHTML=`<b>${esc(prep.medium)} · ${esc(technicalClassLabel(tech))}</b><span>Rendimiento: ${esc(required?(tests.map(performanceTestLabel).join(' + ')+' · '+pstatus):(isANMedium(prep.medium)?'NO APLICA · AN excluido de rendimiento':'NO APLICA · frasco ya calificado'))}</span>`}for(const n of ['productivity','selectivity','specificity']){const el=$(`#qcForm [name="${n}"]`);if(!el)continue;el.disabled=true;el.innerHTML=`<option value="N/A">${tests.includes(n)?esc(pstatus):'NO APLICA'}</option>`;el.value='N/A'}updateQCPreview()}
function resetQC(){const f=$('#qcForm');f.reset();for(const s of $$('.yesno-select,.compliance-select,.performance-select'))s.value='';renderSelects();prepareQC()}

function applyReleaseDefaults(){const p=state.mediaPrep.find(x=>x.id===$('#releasePrepSelect')?.value);if($('#releaseDate'))$('#releaseDate').value=p?.date||'';if($('#releaseResponsible'))$('#releaseResponsible').value=activeUser();const q=p?latestQC(p.id):null;if($('#releaseAutoSummary'))$('#releaseAutoSummary').innerHTML=p?`<b>${esc(p.lotCode)} · QC ${esc(q?.result||'—')}</b><span>Fecha: ${esc(p.date||'—')} · Responsable: ${esc(activeUser()||'—')}</span>`:'<b>Seleccione un lote con QC APTO</b><span>Fecha y responsable se asignan automáticamente.</span>'}

function renderSelects(){const qcIds=new Set(state.mediaQC.map(q=>q.prepId));$('#qcPrepSelect').innerHTML='<option value="">Seleccione lote</option>'+state.mediaPrep.filter(p=>!qcIds.has(p.id)).sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(p=>`<option value="${p.id}">${esc(p.lotCode)} · ${esc(p.medium)}</option>`).join('');const relIds=new Set(state.mediaRelease.map(r=>r.prepId));$('#releasePrepSelect').innerHTML='<option value="">Seleccione lote</option>'+state.mediaPrep.filter(p=>latestQC(p.id)?.result==='APTO'&&performanceResolvedForPrep(p)&&!relIds.has(p.id)&&!isClosed(p)).map(p=>`<option value="${p.id}">${esc(p.lotCode)} · ${esc(p.medium)}</option>`).join('');$('#releaseDecisionSelect').innerHTML='<option value="">Seleccione</option><option value="LIBERADO">LIBERAR</option><option value="BLOQUEADO">BLOQUEAR</option>';$('#closurePrepSelect').innerHTML='<option value="">Seleccione lote</option>'+state.mediaPrep.filter(p=>!isClosed(p)&&['LIBERADO','BLOQUEADO'].includes(p.status)).map(p=>`<option value="${p.id}">${esc(p.lotCode)} · ${esc(p.medium)}</option>`).join('');for(const s of $$('.yesno-select'))s.innerHTML='<option value="">Seleccione</option><option value="Sí">Sí</option><option value="No">No</option>';for(const s of $$('.compliance-select,.performance-select'))s.innerHTML='<option value="">Seleccione</option><option value="CUMPLE">CUMPLE</option><option value="NO_CUMPLE">NO CUMPLE</option>';const vols=[];for(let i=100;i<=1500;i+=100)vols.push(`<option value="${i}">${i} mL</option>`);$('#prepVolumeSelect').innerHTML='<option value="">Seleccione</option>'+vols.join('')}
function renderPendingQC(){const rows=state.mediaPrep.filter(p=>!latestQC(p.id)&&!isClosed(p));$('#qcPendingCount').textContent=`${rows.length} ${rows.length===1?'pendiente':'pendientes'}`;$('#qcPendingRows').innerHTML=rows.map(p=>`<tr><td><b>${esc(p.lotCode)}</b></td><td>${esc(p.date)}</td><td>${esc(p.medium)}</td><td>${esc(p.bottleCode||'SIN REGISTRO')}</td><td>${pill(performanceRequiredForPrep(p)?(performanceTestsForPrep(p).map(performanceTestLabel).join(' + ')||'CLASIFICAR MEDIO'):'NO APLICA')}</td><td>${esc(p.expiryDate||'—')}</td><td>${pill(lotAlert(p))}</td><td><button class="mini primary-mini" onclick="openPendingQC('${p.id}')">Evaluar QC</button></td></tr>`).join('')||'<tr><td colspan="8" class="empty-success">✓ No hay lotes pendientes de QC.</td></tr>'}
function renderPrep(){const rows=[...state.mediaPrep].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#prepRows').innerHTML=rows.map(p=>`<tr><td><b>${esc(p.lotCode)}</b></td><td>${esc(p.date)}</td><td>${esc(p.medium)}</td><td>${esc(p.bottleCode||'SIN REGISTRO')}</td><td>${esc(p.quantity)}</td><td>${esc(p.volumeMl||'—')} mL</td><td>${esc(p.theoreticalMass??'—')} g</td><td>${esc(p.expiryDate||'—')}</td><td>${pill(lotState(p))}</td><td>${pill(lotAlert(p))}</td><td>${esc(p.responsible||'—')}</td></tr>`).join('')||'<tr><td colspan="11">Sin registros.</td></tr>'}
function renderQC(){$('#qcRows').innerHTML=[...state.mediaQC].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).map(q=>{const p=state.mediaPrep.find(x=>x.id===q.prepId)||{};const perf=q.performanceRequired?[['Prod.',q.productivity],['Sel.',q.selectivity],['Esp.',q.specificity]].filter(([,v])=>v&&v!=='N/A').map(([k,v])=>`${k} ${v}`).join(' · '):'N/A';return `<tr><td><b>${esc(p.lotCode||'—')}</b></td><td>${esc(p.medium||'—')}</td><td>${esc(p.bottleCode||'—')}</td><td>${pill(q.sterility)}</td><td>${pill(q.macroscopic)}</td><td>${esc(q.ph)}</td><td>${esc(perf)}</td><td>${pill(q.result)}</td><td>${esc(q.responsible||'—')}</td></tr>`}).join('')||'<tr><td colspan="9">Sin controles.</td></tr>'}
function renderRelease(){ $('#releaseRows').innerHTML=[...state.mediaRelease].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).map(r=>{const p=state.mediaPrep.find(x=>x.id===r.prepId)||{},q=latestQC(r.prepId);return `<tr><td><b>${esc(p.lotCode||'—')}</b></td><td>${esc(p.medium||'—')}</td><td>${pill(q?.result||'—')}</td><td>${pill(r.decision)}</td><td>${esc(r.date)}</td><td>${esc(r.responsible)}</td></tr>`}).join('')||'<tr><td colspan="6">Sin liberaciones.</td></tr>'}
function renderInventory(){const rows=state.mediaPrep.filter(p=>latestRelease(p.id)?.decision==='LIBERADO'||isClosed(p)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#inventoryRows').innerHTML=rows.map(p=>`<tr><td><b>${esc(p.lotCode)}</b></td><td>${esc(p.medium)}</td><td>${esc(p.bottleCode||'—')}</td><td>${pill(lotState(p))}</td><td>${esc(p.expiryDate||'—')}</td><td>${esc(daysRemainingLabel(p.expiryDate))}</td><td>${pill(validityState(p))}</td><td>${pill(availabilityState(p))}</td><td>${pill(lotAlert(p))}</td><td>${isClosed(p)?esc(closureLabel(p.closureType)):'—'}</td><td><button class="mini" onclick="showLot('${p.id}')">Ver trazabilidad</button>${!isClosed(p)?` <button class="mini" onclick="openClosure('${p.id}')">Cerrar</button>`:''}</td></tr>`).join('')||'<tr><td colspan="11">Sin lotes liberados o cerrados.</td></tr>'}
function renderKPIs(){$('#kpiPrep').textContent=state.mediaPrep.length;$('#kpiPending').textContent=state.mediaPrep.filter(p=>!latestQC(p.id)).length;$('#kpiApt').textContent=state.mediaPrep.filter(p=>latestQC(p.id)?.result==='APTO').length;$('#kpiReleased').textContent=state.mediaPrep.filter(p=>latestRelease(p.id)?.decision==='LIBERADO'&&!isClosed(p)).length}
function renderCatalogs(){
 $('#mediaCatalogRows').innerHTML=state.catalogMedia.sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.type)}</td><td>${esc(technicalClassLabel(mediumTechnicalClass(x)))}</td><td>${esc(performanceTestsForMedium(x).map(performanceTestLabel).join(' + ')||'CLASIFICAR')}</td><td>${esc(x.prefix)}</td><td>${esc(x.concentration)} g/L</td><td>${esc(x.shelfLifeDays)} días</td><td>${esc(x.phMin)}–${esc(x.phMax)}</td><td>${esc(x.expectedColor||'—')}</td><td>${esc(x.expectedAppearance||'—')}</td><td><button class="mini" onclick="editMedium('${x.id}')">Editar</button></td></tr>`).join('');
 $('#bottleCatalogRows').innerHTML=state.catalogBottles.sort((a,b)=>bottleFamilyLabel(a.mediumFamily||a.medium).localeCompare(bottleFamilyLabel(b.mediumFamily||b.medium))||a.code.localeCompare(b.code)).map(x=>{const op=x.operationalStatus||'ACTIVO';const used=state.mediaPrep.some(p=>p.bottleId===x.id);const expiryState=!x.expiryDate?'SIN FECHA':bottleExpiredOn(x)?'VENCIDO':'VIGENTE';return `<tr><td>${esc(bottleFamilyLabel(x.mediumFamily||x.medium))}</td><td><b>${esc(x.code)}</b></td><td>${esc(x.expiryDate||'PENDIENTE')}</td><td>${pill(expiryState)}</td><td>${esc(x.openedAt||'—')}</td><td>${pill(x.qualificationStatus||'NUEVO')}</td><td>${pill(op)}</td><td>${esc(x.qualifiedAt||'—')}</td><td>${esc(x.qualifiedByLotCode||'—')}</td><td>${op==='BAJA'?`${esc(x.retiredAt||'—')}<br><small>${esc(x.retiredReason||'')}</small>`:'—'}</td><td>${x.source==='PRODUCT_TRACEABILITY'?`<span class="pill ok">GESTIONADO POR TRAZABILIDAD</span>`:(op==='ACTIVO'?`<button class="mini danger" onclick="retireBottle('${x.id}')">Dar de baja</button> <button class="mini" onclick="editBottle('${x.id}')">${used?'Completar vencimiento':'Corregir'}</button>`:`<button class="mini" onclick="reactivateBottle('${x.id}')">Reactivar</button>`)}</td></tr>`}).join('')||'<tr><td colspan="11">Registre el primer frasco/lote para comenzar.</td></tr>';
 $('#personCatalogRows').innerHTML=state.catalogPersonnel.sort((a,b)=>a.code.localeCompare(b.code)).map(x=>`<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.name||'')}</td><td><button class="mini" onclick="editPerson('${x.id}')">Editar</button></td></tr>`).join('');
}

function renderStrainCatalogOptions(){
  const opts='<option value="">Seleccione</option>'+[...state.catalogStrains].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${x.id}">${esc(x.name)} · ${esc(x.referenceCode)}</option>`).join('');
  if($('#strainPrepStrainSelect'))$('#strainPrepStrainSelect').innerHTML=opts;
  renderReactivationStrainOptions();
  const personnel='<option value="">Seleccione</option>'+state.catalogPersonnel.map(p=>`<option value="${esc(p.code)}">${esc(p.code)}${p.name&&p.name!==p.code?' · '+esc(p.name):''}</option>`).join('');
  if($('#strainVerifierSelect'))$('#strainVerifierSelect').innerHTML=personnel;
  if($('#reactVerifierSelect'))$('#reactVerifierSelect').innerHTML=personnel;
  if($('#reactUseSelect'))$('#reactUseSelect').innerHTML='<option value="">Seleccione</option><option>Control de calidad</option><option>Validación</option><option>Verificación</option><option>Prueba de rendimiento</option><option>Otro</option>';
  for(const el of $$('.strain-yesno'))el.innerHTML='<option value="">Seleccione</option><option value="SI">SI</option><option value="NO">NO</option>';
  const mantissaOpts='<option value="">Mantisa</option>'+Array.from({length:90},(_,i)=>(1+i/10).toFixed(1)).map(v=>`<option value="${v}">${v}</option>`).join('');
  const exponentOpts='<option value="">Exp.</option>'+Array.from({length:13},(_,i)=>i-2).map(v=>`<option value="${v}">10^${v}</option>`).join('');
  for(const el of $$('.sci-mantissa'))el.innerHTML=mantissaOpts;
  for(const el of $$('.sci-exponent'))el.innerHTML=exponentOpts;
}

function renderReactivationStrainOptions(){
  const sel=$('#reactStrainSelect');if(!sel)return;
  const date=$('#strainReactForm')?.elements.date.value||today(),previous=sel.value;
  const rows=eligiblePreparedStrains(date);
  sel.innerHTML='<option value="">Seleccione cepa preparada vigente</option>'+rows.map(({strain,prep})=>`<option value="${strain.id}">${esc(strain.name)} · ${esc(strain.referenceCode||'')} · ${esc(prep.workLot)} · vence ${esc(prep.cryovialExpiry||'—')}</option>`).join('');
  if(rows.some(x=>x.strain.id===previous))sel.value=previous;
  else if(rows.length===1)sel.value=rows[0].strain.id;
}
function renderReactivationMediumOptions(){
  const sel=$('#reactMediumSelect');if(!sel)return;
  const date=$('#strainReactForm')?.elements.date.value||today(),previous=sel.value,preps=eligibleNutrientAgarPreps(date,'REACTIVATION');
  sel.innerHTML='<option value="">Seleccione lote AN vigente</option>'+preps.map(p=>`<option value="${p.id}">${esc(p.lotCode)} · vence ${esc(p.expiryDate)}</option>`).join('');
  if(preps.some(p=>p.id===previous))sel.value=previous;else if(preps.length===1)sel.value=preps[0].id;
}
function strainPrepDocumentDate(){const f=$('#strainPrepForm');if(!f)return today();return f.elements.prepDate.value||f.elements.referenceOpenedDate.value||today()}
function renderStrainMediumOptions(){
  const recordDate=strainPrepDocumentDate(),ref=validityReferenceDate(recordDate),preps=eligibleNutrientAgarPreps(recordDate,'STRAIN_PREP');
  const opts='<option value="">Seleccione lote AN</option>'+preps.map(p=>{const restricted=!MediaAvailabilityService.isAvailableOn(p,recordDate);return `<option value="${p.id}">${esc(p.lotCode)} · vence ${esc(p.expiryDate)} · válido al ${esc(ref)}${restricted?' · QC APTO · USO RESTRINGIDO PARA CALIFICACIÓN':''}</option>`}).join('');
  const prepSel=$('#strainPrepMediumSelect');
  if(prepSel){const previous=prepSel.value;prepSel.innerHTML=opts;if(preps.some(p=>p.id===previous))prepSel.value=previous;else if(preps.length===1)prepSel.value=preps[0].id;}
  renderReactivationMediumOptions();
  if($('#strainMediumHelp')){
    if(preps.length){const restricted=preps.some(p=>!MediaAvailabilityService.isAvailableOn(p,recordDate));$('#strainMediumHelp').textContent=restricted?'Modo de calificación inicial: AN con QC APTO y rendimiento pendiente. Uso restringido exclusivamente para preparar cepas destinadas a completar su calificación.':preps.length===1?'Agar Nutriente liberado disponible seleccionado automáticamente.':'Seleccione un lote de Agar Nutriente APTO, liberado y vigente.';}
    else{const d=MediaAvailabilityService.diagnostic(recordDate);$('#strainMediumHelp').textContent=`No hay AN utilizable. Registrados: ${d.all} · QC APTO: ${d.qc} · Liberados: ${d.released} · Vigentes: ${d.vigente} · En calificación: ${d.qualification}.`;}
  }
  updateStrainPrepCalculated();updateReactivationCalculated();
}
function updateStrainPrepCalculated(){const f=$('#strainPrepForm');if(!f)return;const strain=strainById(f.elements.strainId.value),m=state.mediaPrep.find(p=>p.id===f.elements.mediumPrepId.value),date=f.elements.prepDate.value,total=Number(f.elements.reserveCount.value||0)+Number(f.elements.workCount.value||0),t=strainTurbidityResult(f.elements.bhiBase.value,f.elements.bhiInoculated.value);$('#strainRefCode').value=strain?.referenceCode||'';$('#strainSupplierLot').value=strain?.supplierLot||'';$('#strainReferenceExpiry').value=strain?.referenceExpiry||'';$('#strainMediumPrepDate').value=m?.date||'';$('#strainMediumExpiry').value=m?.expiryDate||'';$('#strainIncubationHours').value=strain?.incubationHours??'';$('#strainIncubationTemp').value=strain?.incubationTemp??'';$('#strainIncubationEnd').value=timeAddHours(f.elements.incubationStart.value,strain?.incubationHours||0);$('#strainExpectedMorphology').value=strain?.expectedMorphology||'';$('#strainTotalCryovials').value=total||0;$('#strainWorkLot').value=buildWorkLot(strain,date,total);$('#strainReserveLot').value=buildReserveLot(strain,date,Number(f.elements.reserveCount.value||0));$('#strainTurbidityDelta').value=t.delta;$('#strainTurbidityCompliance').value=t.compliance;$('#strainStorageTemp').value=strain?.storageTemp||'';$('#strainPreparedBy').value=activeUser();const obs=strainObservationResult(f.elements.morphology.value,f.elements.growth.value,f.elements.purity.value);$('#strainPrepResult').value=obs;const final=strainPrepStatusFromForm();$('#strainPrepFinalStatus').textContent=final||'PENDIENTE';setStateCard('#strainPrepStateCard',final||'PENDIENTE DE EVALUACIÓN',final==='APTA'?'Preparación conforme; podrá generar crioviales.':final==='RECHAZADA'?'La preparación no generará inventario apto.':'Complete morfología, crecimiento, pureza y turbidez.');renderStrainPlateOptions();const plateOk=!!selectedStrainPlate('STRAIN_PREP');$('#strainPrepSaveBtn').disabled=!strain||!m||!date||total<=0||!final||!plateOk}
function resetStrainPrep(){const f=$('#strainPrepForm');if(!f)return;f.reset();f.elements.referenceOpenedDate.value=today();f.elements.prepDate.value=today();f.elements.reserveCount.value=0;f.elements.workCount.value=10;renderStrainCatalogOptions();renderStrainMediumOptions();updateStrainPrepCalculated()}
function updateReactivationCalculated(){const f=$('#strainReactForm');if(!f)return;const date=f.elements.date.value||today(),prep=selectedReactPrep(),strain=strainById(f.elements.strainId.value),m=state.mediaPrep.find(p=>p.id===f.elements.mediumPrepId.value),t=strainTurbidityResult(f.elements.bhiBase.value,f.elements.bhiInoculated.value);$('#reactWorkLot').value=prep?.workLot||'';$('#reactAvailable').value=prep?strainInventoryForPrep(prep).available:'';$('#reactExpiry').value=prep?.cryovialExpiry||'';$('#reactMediumExpiry').value=m?.expiryDate||'';$('#reactIncubationHours').value=strain?.incubationHours??'';$('#reactIncubationTemp').value=strain?.incubationTemp??'';$('#reactIncubationEnd').value=timeAddHours(f.elements.incubationStart.value,strain?.incubationHours||0);$('#reactTurbidityDelta').value=t.delta;$('#reactTurbidityCompliance').value=t.compliance;const result=reactivationResultFromForm(f),resultEl=$('#reactResult');resultEl.value=result;resultEl.classList.remove('result-pending','result-ok','result-bad');resultEl.classList.add(result==='APTO'?'result-ok':result==='RECHAZADO'?'result-bad':'result-pending');setStateCard('#reactStateCard',result,result==='APTO'?'Reactivación conforme y apta para el uso registrado.':result==='RECHAZADO'?'Existe al menos un criterio no conforme.':'Complete todos los controles requeridos.');$('#reactPreparedBy').value=activeUser();const qty=Number(f.elements.quantity.value||0),strainDateOk=!!prep&&(!prep.cryovialExpiry||date<=prep.cryovialExpiry)&&date>=prep.prepDate,mediumDateOk=!!m&&eligibleNutrientAgarPreps(date,'REACTIVATION').some(x=>x.id===m.id);renderStrainPlateOptions();const plateOk=!!selectedStrainPlate('REACTIVATION');$('#reactSaveBtn').disabled=!prep||!m||!strainDateOk||!mediumDateOk||!plateOk||qty<1||qty>Number($('#reactAvailable').value||0)||result==='PENDIENTE DE EVALUACIÓN'}
function resetReactivation(){const f=$('#strainReactForm');if(!f)return;f.reset();f.elements.date.value=today();f.elements.quantity.value=1;renderStrainCatalogOptions();renderStrainMediumOptions();updateReactivationCalculated()}
function renderStrainPrepRows(){$('#strainPrepRows').innerHTML=[...state.strainPreparations].sort((a,b)=>(b.prepDate||'').localeCompare(a.prepDate||'')).map(p=>{const s=strainById(p.strainId)||p.strainSnapshot||{};return `<tr><td><b>${esc(p.prepCode)}</b></td><td>${esc(p.prepDate)}</td><td>${esc(s.name||p.strainName)}</td><td>${esc(s.referenceCode||p.referenceCode)}</td><td>${esc(p.workLot||'—')}</td><td>${esc(p.totalCryovials||0)}</td><td>${esc(p.cryovialExpiry||'—')}</td><td>${pill(p.status)}${p.usageScope==='PERFORMANCE_ONLY'?'<small class="cycle-summary">Uso restringido: rendimiento</small>':''}</td><td>${esc(p.preparedBy||'—')}</td></tr>`}).join('')||'<tr><td colspan="9">Sin preparaciones de cepas.</td></tr>'}
function renderStrainReactRows(){$('#strainReactRows').innerHTML=[...state.strainReactivations].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>{const p=state.strainPreparations.find(x=>x.id===r.prepId)||{},s=strainById(r.strainId)||{};return `<tr><td><b>${esc(r.reactivationCode)}</b></td><td>${esc(r.date)}</td><td>${esc(s.name||r.strainName)}</td><td>${esc(p.workLot||r.workLot)}</td><td>${esc(r.quantity)}</td><td>${esc(r.use)}</td><td>${esc(r.anPlateCode||'SIN ASIGNACIÓN HISTÓRICA')}</td><td>${pill(r.result)}</td><td>${esc(r.preparedBy)}</td></tr>`}).join('')||'<tr><td colspan="9">Sin reactivaciones.</td></tr>'}
function renderStrainInventory(){const rows=state.strainPreparations.filter(p=>p.status==='APTA').sort((a,b)=>(b.prepDate||'').localeCompare(a.prepDate||''));$('#strainInventoryRows').innerHTML=rows.map(p=>{const s=strainById(p.strainId)||p.strainSnapshot||{},i=strainInventoryForPrep(p);return `<tr><td>${esc(s.name||p.strainName)}</td><td><b>${esc(p.workLot)}</b></td><td>${i.total}</td><td>${i.consumed}</td><td>${i.bajas}</td><td><b>${i.available}</b></td><td>${i.usedPct}%</td><td>${esc(p.cryovialExpiry)}</td><td>${esc(daysRemainingLabel(p.cryovialExpiry))}</td><td>${pill(i.status)}</td><td>${i.available>0?`<button class="mini" onclick="openCryovialWriteoff('${p.id}')">Dar de baja</button>`:'—'}</td></tr>`}).join('')||'<tr><td colspan="11">No hay crioviales aptos en inventario.</td></tr>'}
function renderStrainConsolidated(){const byStrain=[...state.catalogStrains].map(s=>{const preps=state.strainPreparations.filter(p=>p.strainId===s.id&&p.status==='APTA').sort((a,b)=>(b.prepDate||'').localeCompare(a.prepDate||''));const eligible=eligibleStrainPreps(s.id);const p=eligible[0]||preps[0];const inv=p?strainInventoryForPrep(p):null;const reactCount=state.strainReactivations.filter(r=>r.strainId===s.id).length;const consumed=state.strainReactivations.filter(r=>r.strainId===s.id).reduce((n,r)=>n+Number(r.quantity||0),0);const bajas=state.strainCryovialEvents.filter(e=>e.strainId===s.id&&e.type==='BAJA').reduce((n,e)=>n+Number(e.quantity||0),0);return {s,p,inv,reactCount,consumed,bajas}});$('#strainConsolidatedRows').innerHTML=byStrain.map(({s,p,inv,reactCount,consumed,bajas})=>{const need=!p||!inv||inv.available===0||inv.expired;const cycle=p?`Preparada ${p.prepDate} → ${Number(p.totalCryovials||0)} crioviales → ${reactCount} reactivación(es) → ${consumed} consumidos / ${bajas} bajas → ${inv?.available??0} disponibles`:'Sin preparación apta';return `<tr><td><b>${esc(s.name)}</b><small class="cycle-summary">${esc(cycle)}</small></td><td>${esc(p?.prepCode||'—')}</td><td>${esc(p?.workLot||'—')}</td><td>${inv?.available??0}</td><td>${esc(p?.cryovialExpiry||'—')}</td><td>${pill(inv?.status||'SIN PREPARACIÓN')}</td><td>${pill(need?'NUEVA PREPARACIÓN REQUERIDA':'NO REQUERIDA')}</td></tr>`}).join('')}
function renderStrainCatalog(){if(!$('#strainCatalogRows'))return;$('#strainCatalogRows').innerHTML=[...state.catalogStrains].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.referenceCode)}</td><td>${esc(x.supplierLot)}</td><td>${esc(x.referenceExpiry)}</td><td>${esc(x.incubationTemp)} °C · ${esc(x.incubationHours)} h</td><td>${esc(x.cryovialLifeMonths)} meses</td><td>${esc(x.storageTemp)}</td><td><button class="mini" onclick="editStrainCatalog('${x.id}')">Editar</button></td></tr>`).join('')}
function renderStrains(){if(!$('#strainPrepForm'))return;renderStrainCatalogOptions();renderStrainMediumOptions();renderStrainPlateOptions();renderStrainPrepRows();renderStrainReactRows();renderStrainInventory();renderStrainConsolidated();renderStrainCatalog();updateStrainPrepCalculated();updateReactivationCalculated()}


function renderPerformanceTasks(){const tbody=$('#performanceTaskRows');if(!tbody)return;const rows=state.performanceTasks.filter(t=>!isANMedium(t.medium)).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));tbody.innerHTML=rows.map(t=>{const p=state.mediaPrep.find(x=>x.id===t.prepId),tests=performanceTestsForTask(t);return `<tr><td><b>${esc(t.code)}</b></td><td>${esc(p?.lotCode||t.lotCode)}</td><td>${esc(t.medium)}</td><td>${esc(t.bottleCode)}</td><td>${esc(t.requiredTests.map(performanceTestLabel).join(' + '))}</td><td>${tests.filter(x=>x.result==='CUMPLE').length}/${tests.length}</td><td>${pill(performanceTaskStatus(t))}</td><td><button class="mini" onclick="openPerformanceTask('${t.id}')">Abrir</button></td></tr>`}).join('')||'<tr><td colspan="8">Sin pruebas de rendimiento creadas.</td></tr>';const sel=$('#performanceTaskSelect');if(sel){const prev=sel.value;sel.innerHTML='<option value="">Seleccione tarea</option>'+rows.map(t=>`<option value="${t.id}">${esc(t.code)} · ${esc(t.lotCode)} · ${esc(performanceTaskStatus(t))}</option>`).join('');if(rows.some(t=>t.id===prev))sel.value=prev;}const count=rows.filter(t=>performanceTaskStatus(t)==='PENDIENTE').length;$('#performancePendingCount').textContent=`${count} pendiente${count===1?'':'s'}`}
function performanceTestCard(test){const strain=resolvedPerformanceStrain(test),resolvedStrainId=strain?.id||test.strainId,reacts=eligiblePerformanceReactivations(resolvedStrainId),selected=state.strainReactivations.find(r=>r.id===test.reactivationId);const reactOpts='<option value="">Seleccione reactivación APTA</option>'+reacts.map(r=>`<option value="${r.id}" ${r.id===test.reactivationId?'selected':''}>${esc(r.reactivationCode)} · ${esc(r.date)} · ${esc(r.finalConcentrationDisplay||'')}</option>`).join('');const linked=selected?`<div class="linked-data"><span>Lote: <b>${esc(selected.workLot||'—')}</b></span><span>Fecha: <b>${esc(selected.date)}</b></span><span>Turbidez inicial: <b>${esc(selected.turbidityDelta)}</b></span><span>Concentración final: <b>${esc(selected.finalConcentrationDisplay||'—')}</b></span></div>`:'<div class="linked-data muted">No hay reactivación vinculada.</div>';const observation=(test.expectedGas||test.expectedTurbidity)?`<div class="performance-observations"><label>Formación de gas<select data-field="gasObserved"><option value="">Seleccione</option><option value="SI" ${test.gasObserved==='SI'?'selected':''}>Sí</option><option value="NO" ${test.gasObserved==='NO'?'selected':''}>No</option></select><small>Esperado: ${esc(test.expectedGas||'según método')}</small></label><label>Cambio de turbidez<select data-field="turbidityObserved"><option value="">Seleccione</option><option value="SI" ${test.turbidityObserved==='SI'?'selected':''}>Sí</option><option value="NO" ${test.turbidityObserved==='NO'?'selected':''}>No</option></select><small>Esperado: ${esc(test.expectedTurbidity||'según método')}</small></label></div>`:`<label>Cumple criterio del método<select data-field="manualConformity"><option value="">Seleccione</option><option value="SI" ${test.manualConformity==='SI'?'selected':''}>Sí</option><option value="NO" ${test.manualConformity==='NO'?'selected':''}>No</option></select></label>`;return `<div class="performance-test-card" data-test-id="${test.id}"><div class="performance-test-title"><div><b>${esc(performanceTestLabel(test.testType))}</b><span>${esc(strain?.name||'CEPA NO CONFIGURADA')} · ${esc(strain?.referenceCode||'')}</span></div>${pill(test.result||'PENDIENTE')}</div>${test.strainId?`<label>Reactivación APTA<select data-field="reactivationId">${reactOpts}</select></label>`:`<div class="state-card state-bad"><strong>PERFIL INCOMPLETO</strong><span>Configure la cepa requerida en el Catálogo Maestro.</span></div>`}${linked}${test.strainId&&reacts.length===0?`<button type="button" class="mini performance-react-btn" onclick="preparePerformanceReactivation('${test.id}')">Preparar reactivación</button>`:''}${observation}<button type="button" class="primary performance-save-test" onclick="savePerformanceTest('${test.id}')">Guardar evaluación</button></div>`}
window.openPerformanceTask=id=>{const task=state.performanceTasks.find(t=>t.id===id);if(!task)return;$('#performanceTaskSelect').value=id;renderPerformanceDetail();$('#performanceDetailPanel').scrollIntoView({behavior:'smooth',block:'start'})};
function renderPerformanceDetail(){const id=$('#performanceTaskSelect')?.value,task=state.performanceTasks.find(t=>t.id===id),box=$('#performanceDetail');if(!box)return;if(!task){box.innerHTML='<div class="state-card state-pending"><strong>Seleccione una tarea</strong><span>El ERP mostrará las cepas y reactivaciones requeridas.</span></div>';return}const p=state.mediaPrep.find(x=>x.id===task.prepId),tests=performanceTestsForTask(task);box.innerHTML=`<div class="performance-task-summary"><div><span>Tarea</span><b>${esc(task.code)}</b></div><div><span>Lote preparado</span><b>${esc(p?.lotCode||task.lotCode)}</b></div><div><span>Medio</span><b>${esc(task.medium)}</b></div><div><span>Frasco</span><b>${esc(task.bottleCode)}</b></div><div><span>Estado</span>${pill(performanceTaskStatus(task))}</div></div><div class="performance-test-list">${tests.map(performanceTestCard).join('')}</div>`}
window.savePerformanceTest=async id=>{const test=state.performanceTests.find(t=>t.id===id),card=document.querySelector(`[data-test-id="${id}"]`);if(!test||!card)return;const resolvedStrain=resolvedPerformanceStrain(test);const upd={...test,strainId:resolvedStrain?.id||test.strainId,reactivationId:card.querySelector('[data-field="reactivationId"]')?.value||'',gasObserved:card.querySelector('[data-field="gasObserved"]')?.value||'',turbidityObserved:card.querySelector('[data-field="turbidityObserved"]')?.value||'',manualConformity:card.querySelector('[data-field="manualConformity"]')?.value||''};if(!upd.strainId){toast('El perfil del medio no tiene cepa configurada');return}if(!upd.reactivationId){toast('Seleccione una reactivación APTA');return}upd.result=performanceTestResult(upd);if(upd.result==='PENDIENTE'){toast('Complete la observación requerida');return}await saveLocal('performanceTests',upd,{render:false});const existingLink=state.performanceLinks.find(l=>l.testId===upd.id);await saveLocal('performanceLinks',{id:existingLink?.id||crypto.randomUUID(),taskId:upd.taskId,testId:upd.id,prepId:upd.prepId,reactivationId:upd.reactivationId,strainId:upd.strainId,testType:upd.testType,linkedAt:nowISO(),linkedBy:activeUser()},{render:false});await audit('performanceTest',upd.id,'EVALUACIÓN DE RENDIMIENTO REGISTRADA',{prepId:upd.prepId,summary:`${performanceTestLabel(upd.testType)} · ${upd.result}`});const sourcePrep=state.mediaPrep.find(p=>p.id===upd.prepId);if(sourcePrep?.sourceProductLotId)await productTrace(sourcePrep.sourceProductLotId,'PRUEBA DE RENDIMIENTO',`${sourcePrep.lotCode} · ${performanceTestLabel(upd.testType)} · ${upd.result}`);await loadLocal();await finalizePerformanceTask(upd.taskId);await loadLocal();renderPerformanceDetail();toast(`${performanceTestLabel(upd.testType)}: ${upd.result}`)};
window.preparePerformanceReactivation=id=>{const test=state.performanceTests.find(t=>t.id===id),strain=resolvedPerformanceStrain(test),task=state.performanceTasks.find(t=>t.id===test?.taskId);if(!test||!strain||!task)return;localStorage.setItem('microbio_performance_pending_test',id);document.querySelector('[data-view="strains"]')?.click();const opts={performanceOnly:true,qualificationMediumPrepId:task.prepId},prepared=eligibleStrainPreps(strain.id,today(),opts)[0]||eligibleStrainPreps(strain.id,today())[0];if(!prepared){document.querySelector('[data-strain-tab="strain-prep"]')?.click();const pf=$('#strainPrepForm');pf.elements.prepDate.value=today();renderStrainCatalogOptions();pf.elements.strainId.value=strain.id;renderStrainMediumOptions();if([...pf.elements.mediumPrepId.options].some(o=>o.value===task.prepId))pf.elements.mediumPrepId.value=task.prepId;updateStrainPrepCalculated();pf.scrollIntoView({behavior:'smooth',block:'start'});toast(`Primero prepare ${strain.name}. El AN ${task.lotCode} está habilitado solo para completar su calificación.`);return}document.querySelector('[data-strain-tab="strain-react"]')?.click();const f=$('#strainReactForm');f.elements.date.value=today();renderReactivationStrainOptions();f.elements.strainId.value=strain.id;renderReactivationMediumOptions();if([...f.elements.mediumPrepId.options].some(o=>o.value===task.prepId))f.elements.mediumPrepId.value=task.prepId;if([...f.elements.use.options].some(o=>o.value==='Prueba de rendimiento'))f.elements.use.value='Prueba de rendimiento';updateReactivationCalculated();f.scrollIntoView({behavior:'smooth',block:'start'});toast(`Reactivación para ${strain.name} · ${performanceTestLabel(test.testType)} · vinculada a ${task.lotCode}`)};
async function autoLinkPendingPerformanceReactivation(r){const pendingId=localStorage.getItem('microbio_performance_pending_test');if(!pendingId)return;const test=state.performanceTests.find(t=>t.id===pendingId);const resolved=resolvedPerformanceStrain(test);if(test&&r.result==='APTO'&&r.strainId===(resolved?.id||test.strainId)){await saveLocal('performanceTests',{...test,reactivationId:r.id},{render:false});localStorage.removeItem('microbio_performance_pending_test');await loadLocal();toast(`Reactivación ${r.reactivationCode} vinculada a ${performanceTestLabel(test.testType)}`)}}

const MONITORING_FREQUENCIES=Object.freeze([{days:7,label:'Cada 7 días'},{days:15,label:'Cada 15 días'},{days:30,label:'Cada 30 días'}]);
function monitoringFrequencyLabel(days){return MONITORING_FREQUENCIES.find(x=>x.days===Number(days))?.label||`${Number(days)||'—'} días`}
function monitoringFrequencyNormalize(point){const days=Number(point?.frequencyDays||0);const allowed=MONITORING_FREQUENCIES.some(x=>x.days===days)?days:(days<=7?7:days<=15?15:30);return {...point,frequencyDays:allowed,frequency:monitoringFrequencyLabel(allowed)}}
function monitoringHistory(pointId){return (state.microbiologicalControls||[]).filter(c=>plannerControlPointId(c)===pointId).map(c=>({...c,_date:plannerControlDate(c)})).filter(c=>c._date).sort((a,b)=>b._date.localeCompare(a._date)||String(b.controlTime||'').localeCompare(String(a.controlTime||'')))}
function consecutiveCompliantControls(history){let n=0;for(const c of history){if(c.result==='CUMPLE')n++;else break}return n}
function daySpanNewestToOldest(rows){if(rows.length<2)return 0;return Math.max(0,Math.abs(plannerDayDiff(rows[rows.length-1]._date,rows[0]._date)||0))}
function monitoringRiskScore(point,history){let score=point?.criticality==='CRÍTICA'?45:point?.criticality==='ALTA'?30:15;const recent=history.slice(0,6);for(const c of recent){if(c.result==='NO CUMPLE')score+=20;else if(c.result==='ALERTA')score+=10}if(recent.length>=4&&recent.every(c=>c.result==='CUMPLE'))score-=10;return Math.max(0,Math.min(100,score))}
function monitoringRiskLevel(score){return score>=60?'ALTO':score>=30?'MEDIO':'BAJO'}
function monitoringFrequencyAnalysis(point){
  const p=monitoringFrequencyNormalize(point),history=monitoringHistory(p.id),current=Number(p.frequencyDays),lastDecision=latestFrequencyDecision(p.id),decisionDate=String(lastDecision?.decidedAt||'').slice(0,10),analysisHistory=decisionDate?history.filter(c=>c._date>decisionDate):history,recent=analysisHistory.slice(0,6),latest=analysisHistory[0]||null;
  const nonConforming6=recent.filter(c=>c.result==='NO CUMPLE').length,alerts6=recent.filter(c=>c.result==='ALERTA').length,streak=consecutiveCompliantControls(analysisHistory),streakRows=analysisHistory.slice(0,streak),stableDays=daySpanNewestToOldest(streakRows),riskScore=monitoringRiskScore(p,history),riskLevel=monitoringRiskLevel(riskScore);
  let recommended=current,reason='Mantener frecuencia actual: no hay evidencia suficiente para cambiarla.',direction='MANTENER',priority='NORMAL';
  if(latest?.result==='NO CUMPLE'||nonConforming6>=1){recommended=current===30?15:7;direction=recommended<current?'AUMENTAR_CONTROL':'MANTENER';priority='ALTA';reason=direction==='AUMENTAR_CONTROL'?`Se detectó ${nonConforming6||1} resultado(s) NO CUMPLE reciente(s). Se recomienda aumentar temporalmente la vigilancia.`:'Ya se encuentra en la máxima frecuencia disponible (7 días).';}
  else if(latest?.result==='ALERTA'||alerts6>=2){recommended=current===30?15:current===15?7:7;direction=recommended<current?'AUMENTAR_CONTROL':'MANTENER';priority='ALTA';reason=direction==='AUMENTAR_CONTROL'?`Se detectó señal de ALERTA (${alerts6||1} en los últimos controles). Se recomienda aumentar la vigilancia.`:'Ya se encuentra en la máxima frecuencia disponible (7 días).';}
  else if(current<30&&streak>=6&&stableDays>=180){recommended=current===7?15:30;direction='AMPLIAR';priority='BAJA';reason=`Historial estable: ${streak} controles CUMPLE consecutivos durante ${stableDays} días. El ERP propone ampliar un nivel, sujeto a aprobación de Calidad.`;}
  else if(current===30&&streak>=6&&stableDays>=180){reason=`Historial estable (${streak} controles CUMPLE consecutivos). Se mantiene el máximo permitido de 30 días.`;}
  else if(!history.length){reason='Sin historial suficiente. Mantener la frecuencia configurada hasta disponer de resultados.';}
  else if(streak){reason=`${streak} control(es) CUMPLE consecutivo(s); todavía no se cumplen 6 meses de estabilidad para ampliar la frecuencia.`;}
  return {point:p,currentDays:current,recommendedDays:recommended,direction,priority,reason,historyCount:history.length,analysisCount:analysisHistory.length,streak,stableDays,alerts6,nonConforming6,riskScore,riskLevel,lastResult:history[0]?.result||'SIN HISTORIAL',lastDate:history[0]?._date||'',lastDecision};
}
function latestFrequencyDecision(pointId){return [...(state.monitoringFrequencyDecisions||[])].filter(x=>x.pointId===pointId).sort((a,b)=>String(b.decidedAt||'').localeCompare(String(a.decidedAt||'')))[0]||null}
function renderFrequencyIntelligence(){
  const host=$('#frequencyIntelligenceRows');if(!host)return;const analyses=(state.catalogMonitoringPoints||[]).filter(p=>p.active!==false).map(monitoringFrequencyAnalysis);
  const changes=analyses.filter(a=>a.recommendedDays!==a.currentDays),tighten=changes.filter(a=>a.recommendedDays<a.currentDays).length,expand=changes.filter(a=>a.recommendedDays>a.currentDays).length,stable=analyses.length-changes.length;
  if($('#freqKpiRecommendations'))$('#freqKpiRecommendations').textContent=changes.length;if($('#freqKpiTighten'))$('#freqKpiTighten').textContent=tighten;if($('#freqKpiExpand'))$('#freqKpiExpand').textContent=expand;if($('#freqKpiStable'))$('#freqKpiStable').textContent=stable;
  host.innerHTML=analyses.map(a=>{const p=a.point,last=latestFrequencyDecision(p.id),change=a.recommendedDays!==a.currentDays;const action=change?`<button class="primary mini" type="button" onclick="approveFrequencyRecommendation('${p.id}',${a.recommendedDays})">Aprobar ${a.recommendedDays} días</button><button class="mini" type="button" onclick="keepCurrentFrequency('${p.id}',${a.recommendedDays})">Mantener ${a.currentDays} días</button>`:'<span class="hint">Sin cambio propuesto</span>';return `<tr><td><b>${esc(p.code)}</b><small class="cycle-summary">${esc(p.name)}</small></td><td>${pill(p.criticality||'NORMAL')}</td><td><b>${a.currentDays} días</b></td><td><b>${a.recommendedDays} días</b><small class="cycle-summary">${esc(a.direction)}</small></td><td>${pill(a.riskLevel)}<small class="cycle-summary">Índice ${a.riskScore}/100</small></td><td>${a.historyCount}<small class="cycle-summary">Racha CUMPLE: ${a.streak} · Estabilidad: ${a.stableDays} días</small></td><td>${esc(a.lastResult)}<small class="cycle-summary">${plannerDateLabel(a.lastDate)}</small></td><td class="freq-reason">${esc(a.reason)}${last?`<small class="cycle-summary">Última decisión: ${esc(last.decision)} · ${plannerDateLabel(String(last.decidedAt||'').slice(0,10))}</small>`:''}</td><td><div class="freq-actions">${action}</div></td></tr>`}).join('')||'<tr><td colspan="9">Sin puntos activos.</td></tr>';
}
window.approveFrequencyRecommendation=async(pointId,recommendedDays)=>{const p=state.catalogMonitoringPoints.find(x=>x.id===pointId);if(!p)return;const a=monitoringFrequencyAnalysis(p);if(Number(recommendedDays)!==a.recommendedDays||a.recommendedDays===a.currentDays){toast('La recomendación ya no está vigente. Se recalculará.');renderFrequencyIntelligence();return}if(!activeUser()){toast('Seleccione un usuario activo');return}const upd={...p,frequencyDays:a.recommendedDays,frequency:monitoringFrequencyLabel(a.recommendedDays)};await saveLocal('catalogMonitoringPoints',upd,{render:false});const decision={id:crypto.randomUUID(),pointId:p.id,pointCode:p.code,pointName:p.name,decision:'APROBADA',previousDays:a.currentDays,recommendedDays:a.recommendedDays,appliedDays:a.recommendedDays,reason:a.reason,riskScore:a.riskScore,riskLevel:a.riskLevel,historyCount:a.historyCount,compliantStreak:a.streak,stableDays:a.stableDays,decidedAt:nowISO(),decidedBy:activeUser()};await saveLocal('monitoringFrequencyDecisions',decision,{render:false});await audit('catalogMonitoringPoint',p.id,'FRECUENCIA INTELIGENTE APROBADA',{summary:`${p.code} · ${a.currentDays} → ${a.recommendedDays} días · ${a.reason}`});await loadLocal();renderMonitoringCatalog();renderPlanner();renderFrequencyIntelligence();toast(`${p.name}: frecuencia aprobada a ${a.recommendedDays} días.`)};
window.keepCurrentFrequency=async(pointId,recommendedDays)=>{const p=state.catalogMonitoringPoints.find(x=>x.id===pointId);if(!p)return;if(!activeUser()){toast('Seleccione un usuario activo');return}const a=monitoringFrequencyAnalysis(p);const decision={id:crypto.randomUUID(),pointId:p.id,pointCode:p.code,pointName:p.name,decision:'MANTENER FRECUENCIA',previousDays:a.currentDays,recommendedDays:Number(recommendedDays)||a.recommendedDays,appliedDays:a.currentDays,reason:a.reason,riskScore:a.riskScore,riskLevel:a.riskLevel,historyCount:a.historyCount,compliantStreak:a.streak,stableDays:a.stableDays,decidedAt:nowISO(),decidedBy:activeUser()};await saveLocal('monitoringFrequencyDecisions',decision,{render:false});await audit('catalogMonitoringPoint',p.id,'RECOMENDACIÓN DE FRECUENCIA NO APLICADA',{summary:`${p.code} · se mantienen ${a.currentDays} días · recomendación ${decision.recommendedDays} días`});await loadLocal();renderFrequencyIntelligence();toast(`${p.name}: se mantiene en ${a.currentDays} días.`)};
async function migrateMonitoringFrequenciesV220(){let changed=0;for(const raw of (state.catalogMonitoringPoints||[])){const normalized=monitoringFrequencyNormalize(raw);if(Number(raw.frequencyDays)!==normalized.frequencyDays||raw.frequency!==normalized.frequency){await saveLocal('catalogMonitoringPoints',normalized,{queue:false,render:false});changed++}}if(changed)await audit('catalogMonitoringPoint','frequency-v220','MIGRACIÓN DE FRECUENCIAS V2.2.0',{summary:`${changed} punto(s) normalizados a 7, 15 o 30 días.`});return changed}
function monitoringTypeClass(v){return ({Ambiente:'mc-ambient',Superficie:'mc-surface',Agua:'mc-water'})[v]||''}
function renderMonitoringCatalog(){
 const rows=$('#monitoringPointRows'); if(!rows)return;
 const points=[...state.catalogMonitoringPoints].sort((a,b)=>a.name.localeCompare(b.name,'es'));
 $('#mcKpiTotal').textContent=points.length;
 $('#mcKpiActive').textContent=points.filter(x=>x.active!==false).length;
 $('#mcKpiCritical').textContent=points.filter(x=>x.active!==false&&x.criticality==='CRÍTICA').length;
 $('#mcKpiWeekly').textContent=points.filter(x=>x.active!==false&&Number(x.frequencyDays)===7).length;
 rows.innerHTML=points.map(x=>`<tr class="${x.active===false?'row-muted':''}"><td><b>${esc(x.code)}</b></td><td><b>${esc(x.name)}</b></td><td><span class="mc-type ${monitoringTypeClass(x.type)}">${esc(x.type)}</span></td><td>${pill(x.criticality||'NORMAL')}</td><td>${esc(monitoringFrequencyLabel(x.frequencyDays))}<small class="cycle-summary">${esc(x.frequencyDays)} días</small></td><td><b>${esc(x.medium)}</b></td><td>${esc(x.microorganism)}</td><td>${esc(x.method)}${x.exposureMinutes?`<small class="cycle-summary">${x.exposureMinutes} min · Ø ${x.plateDiameterMm} mm</small>`:''}${x.swabAreaCm2?`<small class="cycle-summary">Área ${x.swabAreaCm2} cm²</small>`:''}</td><td>${(()=>{const c=monitoringCriterion(x.id);return c?esc(criterionBandLabel(c.version)):esc(`${x.limitTarget} / ${x.limitMax} ${x.unit}`)})()}</td><td>${pill(x.active===false?'INACTIVO':'ACTIVO')}</td><td><button class="mini" onclick="editMonitoringPoint('${x.id}')">Editar</button> <button class="mini ${x.active===false?'':'danger-outline'}" onclick="toggleMonitoringPoint('${x.id}')">${x.active===false?'Reactivar':'Dar de baja'}</button></td></tr>`).join('')||'<tr><td colspan="11">Sin puntos configurados.</td></tr>';
}
function plannerValidDate(value){
  if(!value)return '';
  const raw=String(value).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return '';
  const d=new Date(raw+'T12:00:00');
  return Number.isNaN(d.getTime())?'':raw;
}
function plannerControlPointId(c){return c?.pointId||c?.monitoringPointId||c?.areaPointId||c?.catalogMonitoringPointId||''}
function plannerControlDate(c){return plannerValidDate(c?.controlDate||c?.date||c?.sampleDate||c?.performedAt||c?.createdAt)}
function plannerLastControl(point){
  if(!point)return null;
  const matches=(state.microbiologicalControls||[]).filter(c=>c&&plannerControlPointId(c)===point.id).map(c=>({control:c,date:plannerControlDate(c)})).filter(x=>x.date).sort((a,b)=>b.date.localeCompare(a.date));
  return matches[0]||null;
}
function plannerDayDiff(from,to){
  const a=plannerValidDate(from),b=plannerValidDate(to);if(!a||!b)return null;
  const ms=new Date(b+'T12:00:00')-new Date(a+'T12:00:00');return Math.round(ms/86400000);
}
function plannerItem(point){
  try{
    const frequencyDays=Number(point?.frequencyDays||0);
    const criterion=point?.id?monitoringCriterion(point.id):null;
    const missing=[];
    if(!frequencyDays||frequencyDays<1)missing.push('frecuencia');
    if(!String(point?.method||'').trim())missing.push('método');
    if(!String(point?.medium||'').trim())missing.push('medio');
    if(!String(point?.microorganism||'').trim())missing.push('microorganismo');
    if(!criterion)missing.push('criterio');
    const last=plannerLastControl(point);
    const pendingPointId=localStorage.getItem('microbio_pending_monitoring_point')||'';
    const pendingSource=localStorage.getItem('microbio_pending_monitoring_source')||'';
    if(missing.length)return {point,status:'CONFIG',label:'CONFIGURACIÓN REQUERIDA',lastDate:last?.date||'',nextDate:'',days:null,missing};
    if(pendingPointId===point.id&&pendingSource==='SMART_PLANNER')return {point,status:'PROCESSING',label:'EN PROCESO',lastDate:last?.date||'',nextDate:last?addScheduledDays(last.date,frequencyDays):'',days:null,missing:[]};
    if(!last)return {point,status:'FIRST',label:'PRIMER CONTROL REQUERIDO',lastDate:'',nextDate:'',days:null,missing:[]};
    const nextDate=addScheduledDays(last.date,frequencyDays);
    const days=plannerDayDiff(today(),nextDate);
    if(days===null)return {point,status:'FIRST',label:'PRIMER CONTROL REQUERIDO',lastDate:'',nextDate:'',days:null,missing:[]};
    if(days<0)return {point,status:'OVERDUE',label:'VENCIDO',lastDate:last.date,nextDate,days,missing:[]};
    if(days===0)return {point,status:'TODAY',label:'PENDIENTE HOY',lastDate:last.date,nextDate,days,missing:[]};
    if(days<=3)return {point,status:'UPCOMING',label:'PRÓXIMO',lastDate:last.date,nextDate,days,missing:[]};
    return {point,status:'ON_TIME',label:'EN TIEMPO',lastDate:last.date,nextDate,days,missing:[]};
  }catch(err){console.warn('Planner point skipped safely',point?.id,err);return {point,status:'CONFIG',label:'CONFIGURACIÓN REQUERIDA',lastDate:'',nextDate:'',days:null,missing:['dato inválido']}}
}
function plannerPriority(item){
  const critical=item.point?.criticality==='CRÍTICA'?0:item.point?.criticality==='ALTA'?1:2;
  const base={CONFIG:0,PROCESSING:5,FIRST:10,OVERDUE:20,TODAY:30,UPCOMING:40,ON_TIME:50}[item.status]??90;
  return base+critical;
}
function plannerStatusClass(status){return ({CONFIG:'planner-config',PROCESSING:'planner-processing',FIRST:'planner-first',OVERDUE:'planner-overdue',TODAY:'planner-today',UPCOMING:'planner-upcoming',ON_TIME:'planner-ontime'})[status]||''}
function plannerDateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'})}catch{return v}}
function plannerQueueGroup(item){
  // Cola operativa: primero trabajo vencido, luego próximo y finalmente vigente.
  // Los estados sin fecha válida quedan al final para no desplazar tareas programadas.
  return ({OVERDUE:0,PROCESSING:0,TODAY:1,UPCOMING:1,ON_TIME:2,FIRST:3,CONFIG:4})[item?.status]??5;
}
function plannerCriticalityRank(item){return item?.point?.criticality==='CRÍTICA'?0:item?.point?.criticality==='ALTA'?1:2}
function plannerItems(){
  return (state.catalogMonitoringPoints||[])
    .filter(p=>p&&p.active!==false)
    .map(plannerItem)
    .sort((a,b)=>
      plannerQueueGroup(a)-plannerQueueGroup(b) ||
      (a.nextDate||'9999-12-31').localeCompare(b.nextDate||'9999-12-31') ||
      plannerCriticalityRank(a)-plannerCriticalityRank(b) ||
      String(a.point?.code||'').localeCompare(String(b.point?.code||''),'es',{numeric:true,sensitivity:'base'}) ||
      String(a.point?.name||'').localeCompare(String(b.point?.name||''),'es',{sensitivity:'base'})
    );
}
function renderPlanner(){
  const host=$('#plannerCards');if(!host)return;
  const all=plannerItems();
  const counts={FIRST:0,OVERDUE:0,TODAY:0,UPCOMING:0,ON_TIME:0};for(const i of all)if(counts[i.status]!==undefined)counts[i.status]++;
  if($('#plannerKpiFirst'))$('#plannerKpiFirst').textContent=counts.FIRST;
  if($('#plannerKpiOverdue'))$('#plannerKpiOverdue').textContent=counts.OVERDUE;
  if($('#plannerKpiToday'))$('#plannerKpiToday').textContent=counts.TODAY;
  if($('#plannerKpiUpcoming'))$('#plannerKpiUpcoming').textContent=counts.UPCOMING;
  if($('#plannerKpiOnTime'))$('#plannerKpiOnTime').textContent=counts.ON_TIME;
  const q=String($('#plannerSearch')?.value||'').trim().toLowerCase(),type=$('#plannerTypeFilter')?.value||'',crit=$('#plannerCriticalityFilter')?.value||'',status=$('#plannerStatusFilter')?.value||'';
  const rows=all.filter(i=>{const p=i.point||{};const hay=[p.code,p.name,p.method,p.medium,p.microorganism].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!type||p.type===type)&&(!crit||p.criticality===crit)&&(!status||i.status===status)});
  host.innerHTML=rows.map(i=>{const p=i.point||{};const detail=i.status==='CONFIG'?`Falta: ${esc(i.missing.join(', '))}`:i.status==='PROCESSING'?'Control abierto desde el Planificador. Complete el Paso 3 o cancele para devolverlo a VENCIDO.':i.status==='FIRST'?'No existe historial válido para este punto.':i.days<0?`${Math.abs(i.days)} día(s) vencido`:i.days===0?'Corresponde realizarlo hoy':`Faltan ${i.days} día(s)`;const canStart=i.status==='OVERDUE';const processing=i.status==='PROCESSING';return `<article class="planner-card ${plannerStatusClass(i.status)}"><div class="planner-card-head"><div><small>${esc(p.code||'')}</small><h4>${esc(p.name||'Punto sin nombre')}</h4></div><span class="planner-state">${esc(i.label)}</span></div><div class="planner-meta"><span>${esc(p.type||'—')}</span><span>${esc(p.criticality||'NORMAL')}</span><span>${esc(p.frequency||'—')} · ${esc(p.frequencyDays||'—')} días</span></div><div class="planner-dates"><div><small>Último</small><b>${plannerDateLabel(i.lastDate)}</b></div><div><small>Próximo</small><b>${plannerDateLabel(i.nextDate)}</b></div></div><p>${detail}</p><div class="planner-actions"><button class="planner-start-btn" type="button" onclick="plannerStartControl('${esc(p.id||'')}')" ${canStart?'':'disabled'} title="${canStart?'Abrir Nuevo control con los datos del punto precargados':processing?'Este control ya está EN PROCESO':'Se habilita automáticamente cuando el control está vencido'}">${processing?'EN PROCESO':'Registrar control'}</button><button class="mini" type="button" onclick="plannerShowHistory('${esc(p.id||'')}')">Historial</button></div></article>`}).join('')||'<div class="empty-success">No hay puntos que coincidan con los filtros.</div>';
  renderPlannerWeek(all);
}
function renderPlannerWeek(all=plannerItems()){
  const host=$('#plannerWeek');if(!host)return;const start=today();const days=[];for(let n=0;n<7;n++){const date=addDays(start,n);days.push({date,items:all.filter(i=>i.nextDate===date)});}host.innerHTML=days.map(d=>`<div class="planner-day"><b>${new Date(d.date+'T12:00:00').toLocaleDateString('es-EC',{weekday:'short',day:'2-digit',month:'2-digit'})}</b>${d.items.length?d.items.map(i=>`<span>${esc(i.point?.name||'')} · ${esc(i.point?.type||'')}</span>`).join(''):'<small>Sin controles programados</small>'}</div>`).join('');
}
window.plannerStartControl=id=>{const p=state.catalogMonitoringPoints.find(x=>x.id===id);if(!p)return;const item=plannerItem(p);if(item.status!=='OVERDUE'){toast(item.status==='PROCESSING'?'Este control ya está EN PROCESO':'El botón Registrar control se habilita cuando el punto está VENCIDO');return}localStorage.setItem('microbio_pending_monitoring_point',id);localStorage.setItem('microbio_pending_monitoring_source','SMART_PLANNER');renderPlanner();activateMicroTab('newcontrol');prepareMicroControl(id);setTimeout(()=>{$('#microControlForm')?.scrollIntoView({behavior:'smooth',block:'start'});$('#microObservedColonies')?.focus();},80);toast(`${p.name} · EN PROCESO. Datos precargados; complete la observación real y registre el control.`);};
window.plannerShowHistory=id=>{const p=state.catalogMonitoringPoints.find(x=>x.id===id);if(!p)return;const history=(state.microbiologicalControls||[]).filter(c=>c&&plannerControlPointId(c)===id).map(c=>({...c,_date:plannerControlDate(c)})).filter(c=>c._date).sort((a,b)=>b._date.localeCompare(a._date)).slice(0,10);$('#lotModalContent').innerHTML=`<h2>${esc(p.name)}</h2><p>${esc(p.code)} · ${esc(p.type)}</p>${history.length?`<div class="timeline">${history.map(c=>`<div class="timeline-item"><b>${plannerDateLabel(c._date)}</b><span>${esc(c.result||c.status||'Control registrado')}</span><small>${esc(c.responsible||c.analyst||c.createdBy||'—')}</small></div>`).join('')}</div>`:'<p class="hint">Este punto todavía no tiene controles válidos registrados.</p>'}`;$('#lotModal').classList.add('open');$('#lotModal').setAttribute('aria-hidden','false')};
function activateMicroTab(name){
  const valid=['catalog','planner','newcontrol','results','plates','consolidated','frequency'].includes(name)?name:'catalog';
  $$('.micro-tab[data-micro-tab]').forEach(b=>b.classList.toggle('active',b.dataset.microTab===valid));
  $$('.micro-pane').forEach(p=>p.classList.remove('active'));
  $(`#micro-pane-${valid}`)?.classList.add('active');
  if(valid==='planner')renderPlanner();if(valid==='frequency')renderFrequencyIntelligence();if(valid==='newcontrol')prepareMicroControl(localStorage.getItem('microbio_pending_monitoring_point')||$('#microControlPointSelect')?.value||'');if(valid==='results')renderMicroResults();if(valid==='plates')renderPlateInventory();if(valid==='consolidated')renderMicroConsolidated();
}
function bindMicroPlanner(){
  const freqSel=$('#monitoringPointForm')?.elements?.frequency;if(freqSel){freqSel.onchange=()=>{const f=$('#monitoringPointForm');const days=Number(freqSel.value||0);if(f?.elements?.frequencyDays)f.elements.frequencyDays.value=days||'';};}
  $$('.micro-tab[data-micro-tab]').forEach(b=>{b.onclick=()=>activateMicroTab(b.dataset.microTab)});
  ['plannerSearch','plannerTypeFilter','plannerCriticalityFilter','plannerStatusFilter'].forEach(id=>{const el=$('#'+id);if(el){el.oninput=renderPlanner;el.onchange=renderPlanner;}});
  ['microResultSearch','microResultDateFrom','microResultDateTo','microResultTypeFilter','microResultStatusFilter'].forEach(id=>{const el=$('#'+id);if(el){el.oninput=renderMicroResults;el.onchange=renderMicroResults;}});
  const clear=$('#microResultClearFilters');if(clear)clear.onclick=()=>{['microResultSearch','microResultDateFrom','microResultDateTo','microResultTypeFilter','microResultStatusFilter'].forEach(id=>{const el=$('#'+id);if(el)el.value=''});renderMicroResults()};
  const exp=$('#microResultExportExcel');if(exp)exp.onclick=exportMicroResultsExcel;
  ['plateInventorySearch','plateInventoryMedium','plateInventoryStatus'].forEach(id=>{const el=$('#'+id);if(el){el.oninput=renderPlateInventory;el.onchange=renderPlateInventory;}});
  ['consolidatedSearch','consolidatedMedium','consolidatedStatus'].forEach(id=>{const el=$('#'+id);if(el){el.oninput=renderMicroConsolidated;el.onchange=renderMicroConsolidated;}});
  const conClear=$('#consolidatedClear');if(conClear)conClear.onclick=()=>{['consolidatedSearch','consolidatedMedium','consolidatedStatus'].forEach(id=>{const el=$('#'+id);if(el)el.value=''});renderMicroConsolidated()};
  const conExport=$('#consolidatedExport');if(conExport)conExport.onclick=exportMicroConsolidatedExcel;
}

// ===== V2.0.0-F · Inventario de cajas · Paso 5 =====
function microNowTime(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function nextMicroControlCode(){const y=String(new Date().getFullYear());const used=(state.microbiologicalControls||[]).filter(x=>String(x.controlCode||'').startsWith(`MC-${y}-`)).map(x=>Number(String(x.controlCode||'').split('-').pop())||0);return `MC-${y}-${String(Math.max(0,...used)+1).padStart(6,'0')}`}
function microCriterionForPoint(point,date=today()){const c=monitoringCriterion(point?.id,date);if(c)return {rule:c.rule,version:c.version,snapshot:criterionSnapshot('CONTROL_MICROBIOLOGICO',`POINT:${point.id}`,date)};return null}
function microControlCalculation(point){
  if(!point)return {ready:false,value:null,formula:'Seleccione un punto'};
  const colonies=Number($('#microObservedColonies')?.value);
  if(!Number.isFinite(colonies)||colonies<0)return {ready:false,value:null,formula:'Ingrese colonias observadas'};
  if(point.type==='Superficie'){
    const area=Number(point.swabAreaCm2||0);if(area<=0)return {ready:false,value:null,formula:'Área hisopada no configurada'};
    return {ready:true,value:colonies*(100/area),formula:`${colonies} colonias × (100 ÷ ${area} cm²)`};
  }
  if(point.type==='Ambiente'){
    const t=Number(point.exposureMinutes||0),d=Number(point.plateDiameterMm||0);if(t<=0||d<=0)return {ready:false,value:null,formula:'Exposición/diámetro no configurados'};
    const r=d/20;const plateArea=Math.PI*r*r;const value=(colonies*10000*5)/(plateArea*t);return {ready:true,value,formula:`Sedimentación: (${colonies} × 10000 × 5) ÷ (${plateArea.toFixed(2)} cm² × ${t} min)`};
  }
  if(point.type==='Agua'){
    const vol=Number($('#microObservedVolume')?.value);if(!Number.isFinite(vol)||vol<=0)return {ready:false,value:null,formula:'Ingrese volumen analizado'};
    return {ready:true,value:colonies/vol,formula:`${colonies} colonias ÷ ${vol} mL`};
  }
  return {ready:true,value:colonies,formula:`${colonies} colonias`};
}
function renderMicroControlPointOptions(){const sel=$('#microControlPointSelect');if(!sel)return;const prev=sel.value;const rows=(state.catalogMonitoringPoints||[]).filter(p=>p&&p.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));sel.innerHTML='<option value="">Seleccione punto</option>'+rows.map(p=>`<option value="${esc(p.id)}">${esc(p.code)} · ${esc(p.name)} · ${esc(p.type)}</option>`).join('');if(rows.some(p=>p.id===prev))sel.value=prev;}
function prepareMicroControl(pointId=''){
  const f=$('#microControlForm');if(!f)return;renderMicroControlPointOptions();
  if(pointId&&state.catalogMonitoringPoints.some(p=>p.id===pointId&&p.active!==false))$('#microControlPointSelect').value=pointId;
  $('#microControlCode').value=nextMicroControlCode();$('#microControlDate').value=today();$('#microControlDate').max=today();$('#microControlTime').value=microNowTime();$('#microControlResponsible').value=activeUser()||'—';
  updateMicroControlCalculated();
}
function updateMicroControlCalculated(){
  const id=$('#microControlPointSelect')?.value||'',p=state.catalogMonitoringPoints.find(x=>x.id===id);const set=(id,v)=>{const el=$(id);if(el)el.value=v??'—'};
  set('#microControlType',p?.type);set('#microControlCriticality',p?.criticality);set('#microControlFrequency',p?`${p.frequency||'—'} · ${p.frequencyDays||'—'} días`:'—');set('#microControlMedium',p?.medium);set('#microControlMicroorganism',p?.microorganism);set('#microControlMethod',p?.method);set('#microControlExposure',p?.exposureMinutes||0);set('#microControlDiameter',p?.plateDiameterMm||0);set('#microControlSwabArea',p?.swabAreaCm2||0);set('#microControlUnit',p?.unit||'—');
  const date=$('#microControlDate')?.value||today(),crit=p?microCriterionForPoint(p,date):null,card=$('#microCriterionCard');
  if(card){if(!p)card.innerHTML='<b>Seleccione un punto</b><span>El Motor de Criterios mostrará la versión vigente y su fuente.</span>';else if(!crit)card.innerHTML='<b>CONFIGURACIÓN REQUERIDA</b><span>No existe criterio vigente para este punto. Configure Administración → Motor de Reglas.</span>';else card.innerHTML=`<b>${esc(crit.rule.code)} · versión ${esc(crit.version.version)}</b><span>${esc(criterionBandLabel(crit.version))}<br>${esc(crit.version.sourceType||'')} · ${esc(crit.version.sourceReference||'sin fuente')}</span>`;}
  const host=$('#microMethodInputs');if(host){if(!p)host.innerHTML='';else{let extra='';if(p.type==='Agua')extra='<label>Volumen analizado (mL)<input id="microObservedVolume" type="number" min="0.01" step="0.01" required></label><label>Resistividad (MΩ·cm)<input id="microObservedResistivity" type="number" min="0" step="0.01"></label>';host.innerHTML=`<div class="smart-observation-grid"><label>Colonias observadas<input id="microObservedColonies" type="number" min="0" step="1" required></label>${extra}<div class="smart-calculation"><span>Resultado calculado</span><b id="microObservedResult">—</b><small id="microObservedFormula">Complete la observación.</small></div></div>`;host.querySelectorAll('input').forEach(el=>el.addEventListener('input',updateMicroControlPreview));}}
  renderMicroPlateOptions();
  updateMicroControlPreview();
}
function updateMicroControlPreview(){
  const p=state.catalogMonitoringPoints.find(x=>x.id===$('#microControlPointSelect')?.value),calc=microControlCalculation(p),crit=p?microCriterionForPoint(p,$('#microControlDate')?.value||today()):null;
  if($('#microObservedResult'))$('#microObservedResult').textContent=calc.ready?`${Number(calc.value).toFixed(2)} ${p?.unit||''}`:'—';if($('#microObservedFormula'))$('#microObservedFormula').textContent=calc.formula;
  const card=$('#microControlResultCard');if(!card)return;if(!p){card.className='wide state-card state-pending';card.innerHTML='<strong>PENDIENTE</strong><span>Seleccione un punto.</span>';return}if(!crit){card.className='wide state-card state-rejected';card.innerHTML='<strong>CONFIGURACIÓN REQUERIDA</strong><span>No existe criterio vigente para evaluar este control.</span>';return}if(!calc.ready){card.className='wide state-card state-pending';card.innerHTML=`<strong>PENDIENTE</strong><span>${esc(calc.formula)}</span>`;return}const ev=evaluateCriterionValue(crit.snapshot,calc.value),label=ev.status==='CONFORME'?'CUMPLE':ev.status==='ALERTA'?'ALERTA':ev.status==='ACCION_REQUERIDA'?'NO CUMPLE':'SIN EVALUAR';card.className=`wide state-card ${ev.status==='CONFORME'?'state-approved':ev.status==='ALERTA'?'state-pending':'state-rejected'}`;card.innerHTML=`<strong>${label}</strong><span>${Number(calc.value).toFixed(2)} ${esc(p.unit||'')} · ${esc(ev.reason||criterionBandLabel(crit.version))}</span>`;
}

function plateEventsForPrep(prepId){return (state.microPlateEvents||[]).filter(e=>e&&e.prepId===prepId)}
function plateOccupiedNumbers(prepId){return new Set(plateEventsForPrep(prepId).filter(e=>['USO','BAJA'].includes(e.type)).map(e=>Number(e.plateNumber)).filter(Number.isInteger))}
function plateInventoryForPrep(prep,date=today()){
  const prepared=Math.max(0,Number(prep?.quantity||0)),events=plateEventsForPrep(prep?.id),used=events.filter(e=>e.type==='USO').length,bajas=events.filter(e=>e.type==='BAJA').length,rawAvailable=Math.max(0,prepared-used-bajas),expired=!!prep?.expiryDate&&date>prep.expiryDate,closed=isClosed(prep),released=latestRelease(prep?.id)?.decision==='LIBERADO'||prep?.status==='LIBERADO';
  let status='NO LIBERADO';if(closed)status='BAJA';else if(rawAvailable<=0)status=bajas>0?'BAJA':'AGOTADO';else if(expired)status='VENCIDO';else if(released)status='DISPONIBLE';
  return {prepared,used,bajas,rawAvailable,available:status==='DISPONIBLE'?rawAvailable:0,expired,closed,released,status};
}
// V2.0.0-K · Auto cierre inteligente de lotes con cajas Petri.
// Solo cierra automáticamente cuando TODAS las cajas fueron consumidas (USO) y no existen bajas.
// Si el saldo llega a cero por bajas, el cierre sigue siendo manual para conservar el motivo real.
async function autoCloseExhaustedPlateLot(prepId,eventDate=today()){
  const prep=state.mediaPrep.find(p=>p.id===prepId);
  if(!prep||prep.type!=='Agar'||String(prep.unit||'Caja Petri')!=='Caja Petri'||isClosed(prep))return false;
  const inv=plateInventoryForPrep(prep,eventDate||today());
  if(inv.prepared<1||inv.rawAvailable!==0||inv.used!==inv.prepared||inv.bajas!==0)return false;
  if(!['LIBERADO','BLOQUEADO'].includes(String(prep.status||'')))return false;
  const closedAt=nowISO(),closureDate=eventDate||closedAt.slice(0,10);
  await saveLocal('mediaPrep',{...prep,status:'CERRADO',closureType:'AGOTADO',closureReason:'Cierre automático por consumo total de cajas Petri.',closureDate,closureAt:closedAt,closureResponsible:activeUser(),autoClosed:true,autoCloseSource:'PLATE_STOCK_ZERO'},{render:false});
  await audit('mediaPrep',prep.id,'LOTE CERRADO AUTOMÁTICAMENTE',{summary:`${prep.lotCode} · Agotado / consumido completamente · saldo 0 · ${closureDate}`});
  return true;
}
async function reconcileExhaustedPlateLots(){
  let changed=0;
  for(const prep of (state.mediaPrep||[])){
    if(!prep||prep.type!=='Agar'||isClosed(prep))continue;
    const events=plateEventsForPrep(prep.id).filter(e=>e.type==='USO').sort((a,b)=>String(b.eventDate||'').localeCompare(String(a.eventDate||''))||String(b.eventAt||'').localeCompare(String(a.eventAt||'')));
    if(await autoCloseExhaustedPlateLot(prep.id,events[0]?.eventDate||today()))changed++;
  }
  return changed;
}
function plateCode(prep,n){return `${prep?.lotCode||'LOTE'} · Caja ${String(n).padStart(3,'0')}`}
function plateUnoccupiedOptionsForPrep(prep,date=today(),{requireReleased=true,allowExpired=false}={}){
  if(!prep||prep.type!=='Agar'||date<(prep.date||''))return[];const inv=plateInventoryForPrep(prep,date);if(inv.closed||(!allowExpired&&inv.expired)||(requireReleased&&!inv.released))return[];const occupied=plateOccupiedNumbers(prep.id),rows=[];for(let n=1;n<=inv.prepared;n++)if(!occupied.has(n))rows.push({prep,plateNumber:n,plateCode:plateCode(prep,n)});return rows;
}
function plateAvailableOptions(medium,date=today()){
  const ref=validityReferenceDate(date),rows=[];(state.mediaPrep||[]).filter(p=>p&&p.type==='Agar'&&String(p.medium||'').toUpperCase()===String(medium||'').toUpperCase()).forEach(prep=>rows.push(...plateUnoccupiedOptionsForPrep(prep,ref,{requireReleased:true,allowExpired:false})));
  return rows.sort((a,b)=>String(a.prep.expiryDate||'9999-12-31').localeCompare(String(b.prep.expiryDate||'9999-12-31'))||String(a.prep.date||'').localeCompare(String(b.prep.date||''))||a.plateNumber-b.plateNumber);
}
function strainPlateOptions(prep,date=today(),mode='REACTIVATION'){
  if(!prep)return[];const ref=validityReferenceDate(date),eligible=eligibleNutrientAgarPreps(date,mode==='STRAIN_PREP'?'STRAIN_PREP':'REACTIVATION').some(x=>x.id===prep.id);if(!eligible)return[];const qualificationAllowed=mode==='STRAIN_PREP'&&!plateInventoryForPrep(prep,ref).released;return plateUnoccupiedOptionsForPrep(prep,ref,{requireReleased:!qualificationAllowed,allowExpired:false});
}
function renderStrainPlateOptions(){
  const pf=$('#strainPrepForm'),ps=$('#strainPrepPlateSelect');if(pf&&ps){const prep=state.mediaPrep.find(p=>p.id===pf.elements.mediumPrepId.value),date=pf.elements.prepDate.value||today(),prev=ps.value,opts=strainPlateOptions(prep,date,'STRAIN_PREP');ps.innerHTML='<option value="">Seleccione una caja AN disponible</option>'+opts.map(o=>`<option value="${o.plateNumber}">${esc(o.plateCode)} · vence ${esc(o.prep.expiryDate||'—')}</option>`).join('');if(opts.some(o=>String(o.plateNumber)===prev))ps.value=prev;if(!opts.length&&prep)ps.innerHTML='<option value="">Sin cajas AN vigentes disponibles</option>'}
  const rf=$('#strainReactForm'),rs=$('#reactPlateSelect');if(rf&&rs){const prep=state.mediaPrep.find(p=>p.id===rf.elements.mediumPrepId.value),date=rf.elements.date.value||today(),prev=rs.value,opts=strainPlateOptions(prep,date,'REACTIVATION');rs.innerHTML='<option value="">Seleccione una caja AN disponible</option>'+opts.map(o=>`<option value="${o.plateNumber}">${esc(o.plateCode)} · vence ${esc(o.prep.expiryDate||'—')}</option>`).join('');if(opts.some(o=>String(o.plateNumber)===prev))rs.value=prev;if(!opts.length&&prep)rs.innerHTML='<option value="">Sin cajas AN liberadas, vigentes y disponibles</option>'}
}
function selectedStrainPlate(mode='REACTIVATION'){
  const f=mode==='STRAIN_PREP'?$('#strainPrepForm'):$('#strainReactForm'),sel=mode==='STRAIN_PREP'?$('#strainPrepPlateSelect'):$('#reactPlateSelect');if(!f||!sel)return null;const prep=state.mediaPrep.find(p=>p.id===f.elements.mediumPrepId.value),n=Number(sel.value);if(!prep||!Number.isInteger(n))return null;const date=mode==='STRAIN_PREP'?strainPrepDocumentDate():(f.elements.date.value||today());if(!strainPlateOptions(prep,date,mode).some(o=>o.plateNumber===n))return null;return {prep,plateNumber:n,plateCode:plateCode(prep,n)};
}
function openMediaPreparationFor(medium,date=today()){
  const target=String(medium||'').trim();
  if(!target){toast('No se pudo determinar el medio a preparar');return}
  document.querySelector('[data-view="media"]')?.click();
  document.querySelector('[data-tab="prep"]')?.click();
  const f=$('#prepForm'),sel=$('#prepMediumSelect');
  if(f?.elements?.date)f.elements.date.value=date||today();
  if(sel){
    const exact=[...sel.options].find(o=>String(o.value||'').toUpperCase()===target.toUpperCase());
    if(exact)sel.value=exact.value;
    else sel.value='';
  }
  renderBottleOptions();updatePrepCalculated();
  f?.scrollIntoView({behavior:'smooth',block:'start'});
  toast(`Preparación nueva · ${target}`);
}
window.openMediaPreparationFor=openMediaPreparationFor;

function renderMicroPlateOptions(){
  const sel=$('#microControlPlateSelect');if(!sel)return;const p=state.catalogMonitoringPoints.find(x=>x.id===$('#microControlPointSelect')?.value),date=$('#microControlDate')?.value||today(),prev=sel.value,opts=p?plateAvailableOptions(p.medium,date):[];
  sel.innerHTML='<option value="">Seleccione una caja disponible</option>'+opts.map(o=>`<option value="${esc(o.prep.id)}|${o.plateNumber}">${esc(o.plateCode)} · vence ${esc(o.prep.expiryDate||'—')}</option>`).join('');
  if(opts.some(o=>`${o.prep.id}|${o.plateNumber}`===prev))sel.value=prev;
  let action=$('#microNoPlateAction');
  if(!action){action=document.createElement('div');action.id='microNoPlateAction';action.className='no-stock-action';sel.closest('label')?.insertAdjacentElement('afterend',action)}
  if(!opts.length&&p){
    sel.innerHTML='<option value="">Sin cajas liberadas, vigentes y disponibles del medio requerido</option>';
    action.innerHTML=`<div><b>Sin cajas disponibles de ${esc(p.medium)}</b><span>Prepare un nuevo lote para continuar con este control.</span></div><button type="button" class="prepare-stock-btn" onclick="openMediaPreparationFor('${esc(String(p.medium||'').replace(/'/g,"\\'"))}','${esc(date)}')">Preparar ${esc(p.medium)}</button>`;
    action.hidden=false;
  }else if(action){action.hidden=true;action.innerHTML=''}
}
function selectedMicroPlate(){const raw=$('#microControlPlateSelect')?.value||'';if(!raw.includes('|'))return null;const [prepId,n]=raw.split('|'),plateNumber=Number(n),prep=state.mediaPrep.find(p=>p.id===prepId);if(!prep||!Number.isInteger(plateNumber))return null;return {prep,plateNumber,plateCode:plateCode(prep,plateNumber)}}
function plateInventoryRows(){
  const q=($('#plateInventorySearch')?.value||'').trim().toLowerCase(),medium=$('#plateInventoryMedium')?.value||'',status=$('#plateInventoryStatus')?.value||'';
  return (state.mediaPrep||[]).filter(p=>p&&p.type==='Agar').map(prep=>({prep,inv:plateInventoryForPrep(prep)})).filter(x=>{const hay=[x.prep.lotCode,x.prep.medium,x.prep.bottleCode].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!medium||x.prep.medium===medium)&&(!status||x.inv.status===status)}).sort((a,b)=>String(a.prep.expiryDate||'').localeCompare(String(b.prep.expiryDate||''))||String(b.prep.date||'').localeCompare(String(a.prep.date||'')));
}
function renderPlateInventory(){
  const host=$('#plateInventoryRows');if(!host)return;const all=(state.mediaPrep||[]).filter(p=>p&&p.type==='Agar').map(prep=>({prep,inv:plateInventoryForPrep(prep)})),rows=plateInventoryRows();
  const prepared=all.reduce((n,x)=>n+x.inv.prepared,0),used=all.reduce((n,x)=>n+x.inv.used,0),available=all.reduce((n,x)=>n+x.inv.available,0),expiredPending=all.reduce((n,x)=>n+(x.inv.status==='VENCIDO'?x.inv.rawAvailable:0),0),expiring=all.reduce((n,x)=>{const d=daysRemaining(x.prep.expiryDate);return n+((x.inv.status==='DISPONIBLE'&&d!==null&&d>=0&&d<=3)?x.inv.rawAvailable:0)},0);
  if($('#plateKpiPrepared'))$('#plateKpiPrepared').textContent=prepared;if($('#plateKpiUsed'))$('#plateKpiUsed').textContent=used;if($('#plateKpiAvailable'))$('#plateKpiAvailable').textContent=available;if($('#plateKpiExpiring'))$('#plateKpiExpiring').textContent=expiring;if($('#plateKpiUnavailable'))$('#plateKpiUnavailable').textContent=expiredPending;
  const alert=$('#plateExpiryAlert');if(alert){alert.hidden=expiredPending===0;alert.innerHTML=expiredPending?`⚠️ ${expiredPending} caja(s) vencida(s) requieren baja. No pueden seleccionarse para uso. <button class="mini" type="button" onclick="writeoffAllExpiredPlates()">Dar de baja vencidas</button>`:''}
  host.innerHTML=rows.map(({prep,inv})=>`<tr><td><b>${esc(prep.lotCode||'—')}</b><small class="cycle-summary">${esc(prep.date||'')}</small></td><td>${esc(prep.medium||'—')}</td><td>${inv.prepared}</td><td>${inv.used}</td><td>${inv.bajas}</td><td><b>${inv.rawAvailable}</b>${inv.status!=='DISPONIBLE'&&inv.rawAvailable?'<small class="cycle-summary">no utilizable</small>':''}</td><td>${esc(prep.expiryDate||'—')}<small class="cycle-summary">${esc(daysRemainingLabel(prep.expiryDate))}</small></td><td>${pill(inv.status)}</td><td><button class="mini" type="button" onclick="showPlateLot('${esc(prep.id)}')">Ver cajas</button>${['DISPONIBLE','VENCIDO'].includes(inv.status)&&inv.rawAvailable>0?` <button class="mini" type="button" onclick="openPlateWriteoff('${esc(prep.id)}')">${inv.status==='VENCIDO'?'Dar de baja vencidas':'Dar de baja'}</button>`:''}${inv.rawAvailable<=0?` <button class="mini prepare-stock-btn" type="button" onclick="openMediaPreparationFor('${esc(String(prep.medium||'').replace(/'/g,"\\'"))}')">Preparar nuevo</button>`:''}</td></tr>`).join('')||'<tr><td colspan="9">Sin lotes de cajas Petri.</td></tr>';
}
window.showPlateLot=id=>{const prep=state.mediaPrep.find(p=>p.id===id);if(!prep)return;const inv=plateInventoryForPrep(prep),events=plateEventsForPrep(id).sort((a,b)=>Number(a.plateNumber)-Number(b.plateNumber)),by=new Map(events.map(e=>[Number(e.plateNumber),e]));const boxes=[];for(let n=1;n<=inv.prepared;n++){const e=by.get(n),label=e?.type==='USO'?'UTILIZADA':e?.type==='BAJA'?'BAJA':inv.expired?'VENCIDA':inv.released?'DISPONIBLE':'PENDIENTE LIBERACIÓN';const usage=e?.usageContext==='ACTIVACION_CEPA'?'Activación de cepa':e?.usageContext==='REACTIVACION_CEPA'?'Reactivación de cepa':e?.controlCode?`Control ${esc(e.controlCode)}`:'';boxes.push(`<div class="timeline-item"><b>${esc(plateCode(prep,n))} · ${esc(label)}</b><span>${usage||e?.reason?esc(usage||e.reason):'Sin movimiento'}</span><small>${e?.eventDate?esc(plannerDateLabel(e.eventDate)):''} ${e?.responsible?'· '+esc(e.responsible):''}</small></div>`)}$('#lotModalContent').innerHTML=`<h2>${esc(prep.lotCode)} · ${esc(prep.medium)}</h2><p>Preparadas ${inv.prepared} · utilizadas ${inv.used} · bajas ${inv.bajas} · saldo físico ${inv.rawAvailable}</p><div class="timeline">${boxes.join('')}</div>`;$('#lotModal').classList.add('open');$('#lotModal').setAttribute('aria-hidden','false')};
window.openPlateWriteoff=async id=>{const prep=state.mediaPrep.find(p=>p.id===id);if(!prep)return;const inv=plateInventoryForPrep(prep),options=plateUnoccupiedOptionsForPrep(prep,today(),{requireReleased:false,allowExpired:true});if(!options.length){toast('No hay cajas pendientes para dar de baja');return}if(inv.status==='VENCIDO'){if(!confirm(`El lote ${prep.lotCode} está VENCIDO. ¿Dar de baja las ${options.length} caja(s) restantes por motivo Vencido?`))return;for(const o of options)await saveLocal('microPlateEvents',{id:crypto.randomUUID(),prepId:prep.id,plateNumber:o.plateNumber,plateCode:o.plateCode,type:'BAJA',quantity:1,eventDate:today(),eventAt:nowISO(),responsible:activeUser(),reason:'Vencido'},{render:false});await audit('mediaPrep',prep.id,'CAJAS PETRI VENCIDAS DADAS DE BAJA',{summary:`${prep.lotCode} · ${options.length} caja(s) · Vencido`});await loadLocal();renderPlateInventory();toast(`${options.length} caja(s) vencida(s) dadas de baja`);return}const raw=prompt(`Número de caja a dar de baja de ${prep.lotCode}. Disponibles: ${options.map(o=>o.plateNumber).join(', ')}`,String(options[0].plateNumber));if(raw===null)return;const n=Number(raw);if(!options.some(o=>o.plateNumber===n)){toast('Ese número de caja no está disponible');return}const reason=prompt('Motivo de baja de la caja:','');if(reason===null||!reason.trim()){toast('Debe registrar el motivo');return}await saveLocal('microPlateEvents',{id:crypto.randomUUID(),prepId:prep.id,plateNumber:n,plateCode:plateCode(prep,n),type:'BAJA',quantity:1,eventDate:today(),eventAt:nowISO(),responsible:activeUser(),reason:reason.trim()},{render:false});await audit('mediaPrep',prep.id,'CAJA PETRI DADA DE BAJA',{summary:`${plateCode(prep,n)} · ${reason.trim()}`});await loadLocal();renderPlateInventory();toast(`${plateCode(prep,n)} dada de baja`)};
window.writeoffAllExpiredPlates=async()=>{const expired=(state.mediaPrep||[]).filter(p=>p?.type==='Agar'&&plateInventoryForPrep(p).status==='VENCIDO');const total=expired.reduce((n,p)=>n+plateUnoccupiedOptionsForPrep(p,today(),{requireReleased:false,allowExpired:true}).length,0);if(!total){toast('No hay cajas vencidas pendientes de baja');return}if(!confirm(`Se darán de baja ${total} caja(s) vencida(s) de AN/PCA/PDA y otros agares. ¿Continuar?`))return;for(const prep of expired){const opts=plateUnoccupiedOptionsForPrep(prep,today(),{requireReleased:false,allowExpired:true});for(const o of opts)await saveLocal('microPlateEvents',{id:crypto.randomUUID(),prepId:prep.id,plateNumber:o.plateNumber,plateCode:o.plateCode,type:'BAJA',quantity:1,eventDate:today(),eventAt:nowISO(),responsible:activeUser(),reason:'Vencido'},{render:false});if(opts.length)await audit('mediaPrep',prep.id,'CAJAS PETRI VENCIDAS DADAS DE BAJA',{summary:`${prep.lotCode} · ${opts.length} caja(s) · Vencido`})}await loadLocal();renderPlateInventory();renderStrainPlateOptions();renderMicroPlateOptions();toast(`${total} caja(s) vencida(s) dadas de baja`)};


// ===== V2.0.0-G · Consolidado integral · Paso 6 =====
function consolidatedUsageCounts(prep){
  const events=plateEventsForPrep(prep.id),controls=events.filter(e=>e.type==='USO'&&(e.controlId||e.controlCode)).length,activations=events.filter(e=>e.type==='USO'&&e.usageContext==='ACTIVACION_CEPA').length,reactivations=events.filter(e=>e.type==='USO'&&e.usageContext==='REACTIVACION_CEPA').length,bajas=events.filter(e=>e.type==='BAJA').length;
  return {controls,activations,reactivations,bajas,events};
}
function consolidatedRowsFiltered(){
  const q=String($('#consolidatedSearch')?.value||'').trim().toLowerCase(),medium=$('#consolidatedMedium')?.value||'',status=$('#consolidatedStatus')?.value||'';
  return (state.mediaPrep||[]).filter(p=>p&&p.type==='Agar').map(prep=>{const inv=plateInventoryForPrep(prep),usage=consolidatedUsageCounts(prep),release=latestRelease(prep.id);return {prep,inv,usage,release}}).filter(x=>{const hay=[x.prep.lotCode,x.prep.medium,x.prep.bottleCode,...x.usage.events.map(e=>[e.plateCode,e.controlCode,e.reactivationCode,e.strainPrepCode,e.reason].join(' '))].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!medium||x.prep.medium===medium)&&(!status||x.inv.status===status)}).sort((a,b)=>String(b.prep.date||'').localeCompare(String(a.prep.date||''))||String(a.prep.lotCode||'').localeCompare(String(b.prep.lotCode||''),'es'));
}
function consolidatedReleaseLabel(x){if(x.release?.decision==='LIBERADO'||x.prep.status==='LIBERADO')return `Liberado${x.release?.date?' · '+plannerDateLabel(x.release.date):''}`;if(x.release?.decision)return x.release.decision;return 'Pendiente'}
function renderMicroConsolidated(){
  const host=$('#consolidatedRows');if(!host)return;const all=(state.mediaPrep||[]).filter(p=>p&&p.type==='Agar').map(prep=>({prep,inv:plateInventoryForPrep(prep),usage:consolidatedUsageCounts(prep)})),rows=consolidatedRowsFiltered();
  const totalPrepared=all.reduce((n,x)=>n+x.inv.prepared,0),controls=all.reduce((n,x)=>n+x.usage.controls,0),strains=all.reduce((n,x)=>n+x.usage.activations+x.usage.reactivations,0),available=all.reduce((n,x)=>n+x.inv.available,0),unavailable=all.reduce((n,x)=>n+(x.inv.status==='VENCIDO'?x.inv.rawAvailable:0)+x.inv.bajas,0);
  [['conKpiLots',all.length],['conKpiPrepared',totalPrepared],['conKpiControls',controls],['conKpiStrains',strains],['conKpiAvailable',available],['conKpiUnavailable',unavailable]].forEach(([id,v])=>{const el=$('#'+id);if(el)el.textContent=v});
  host.innerHTML=rows.map(x=>`<tr><td><b>${esc(x.prep.lotCode||'—')}</b><small class="cycle-summary">${esc(x.prep.bottleCode||'')}</small></td><td>${esc(x.prep.medium||'—')}</td><td>${esc(plannerDateLabel(x.prep.date)||x.prep.date||'—')}</td><td>${esc(consolidatedReleaseLabel(x))}</td><td>${x.inv.prepared}</td><td>${x.usage.controls}</td><td>${x.usage.activations}</td><td>${x.usage.reactivations}</td><td>${x.inv.bajas}</td><td><b>${x.inv.rawAvailable}</b></td><td>${esc(x.prep.expiryDate||'—')}<small class="cycle-summary">${esc(daysRemainingLabel(x.prep.expiryDate))}</small></td><td>${pill(x.inv.status)}</td><td><button class="mini" type="button" onclick="showPlateLot('${esc(x.prep.id)}')">Ver trazabilidad</button>${x.inv.rawAvailable<=0?` <button class="mini prepare-stock-btn" type="button" onclick="openMediaPreparationFor('${esc(String(x.prep.medium||'').replace(/'/g,"\\'"))}')">Preparar nuevo</button>`:''}</td></tr>`).join('')||'<tr><td colspan="13">Sin registros para los filtros seleccionados.</td></tr>';
  if($('#consolidatedSummary'))$('#consolidatedSummary').textContent=`Mostrando ${rows.length} de ${all.length} lote(s) de agar. Consolidado calculado desde los registros originales.`;
  const evHost=$('#consolidatedEventRows');if(evHost){const prepById=new Map((state.mediaPrep||[]).map(p=>[p.id,p]));const events=(state.microPlateEvents||[]).filter(e=>e&&['USO','BAJA'].includes(e.type)).sort((a,b)=>String(b.eventAt||b.eventDate||'').localeCompare(String(a.eventAt||a.eventDate||''))).slice(0,50);evHost.innerHTML=events.map(e=>{const p=prepById.get(e.prepId)||{},process=e.type==='BAJA'?`Baja${e.reason?' · '+e.reason:''}`:e.usageContext==='ACTIVACION_CEPA'?`Activación · ${e.strainPrepCode||'cepa'}`:e.usageContext==='REACTIVACION_CEPA'?`Reactivación · ${e.reactivationCode||'cepa'}`:e.controlCode?`Control · ${e.controlCode}`:'Uso';return `<tr><td>${esc(e.eventDate||'—')}</td><td><b>${esc(e.plateCode||plateCode(p,e.plateNumber))}</b></td><td>${esc(p.medium||'—')}<small class="cycle-summary">${esc(p.lotCode||'')}</small></td><td>${pill(e.type==='BAJA'?'BAJA':'UTILIZADA')}</td><td>${esc(process)}</td><td>${esc(e.responsible||'—')}</td></tr>`}).join('')||'<tr><td colspan="6">Sin movimientos de cajas.</td></tr>'}
}
function exportMicroConsolidatedExcel(){
  const rows=consolidatedRowsFiltered();if(!rows.length){toast('No hay registros para exportar');return}const escX=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const body=rows.map(x=>`<tr><td>${escX(x.prep.lotCode)}</td><td>${escX(x.prep.medium)}</td><td>${escX(x.prep.date)}</td><td>${escX(consolidatedReleaseLabel(x))}</td><td>${x.inv.prepared}</td><td>${x.usage.controls}</td><td>${x.usage.activations}</td><td>${x.usage.reactivations}</td><td>${x.inv.bajas}</td><td>${x.inv.rawAvailable}</td><td>${escX(x.prep.expiryDate)}</td><td>${escX(x.inv.status)}</td></tr>`).join('');
  const html=`<html><head><meta charset="utf-8"></head><body><h2>MICROBIOLOGÍA ERP · CONSOLIDADO DE CAJAS</h2><p>Generado: ${today()}</p><table border="1"><thead><tr><th>Lote</th><th>Medio</th><th>Preparación</th><th>Liberación</th><th>Preparadas</th><th>Usos control</th><th>Activaciones</th><th>Reactivaciones</th><th>Bajas</th><th>Saldo físico</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
  const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`MICROBIOLOGIA_CONSOLIDADO_${today()}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${rows.length} lote(s) exportados a Excel`);
}

function microResultPoint(c){return state.catalogMonitoringPoints.find(p=>p.id===c.pointId)||c.pointSnapshot||{}}
function microResultStatusClass(v){return v==='CUMPLE'?'ok':v==='ALERTA'?'warn':v==='NO CUMPLE'?'bad':'warn'}
function microResultPill(v){const s=String(v||'SIN EVALUAR');return `<span class="pill ${microResultStatusClass(s)}">${esc(s)}</span>`}
function microResultNumber(v){const n=Number(v);return Number.isFinite(n)?(Number.isInteger(n)?String(n):n.toFixed(2)):'—'}
function microResultObservation(c,p){if(p.type==='Agua')return `${microResultNumber(c.colonies)} colonias · ${microResultNumber(c.volumeAnalyzedMl)} mL`;return `${microResultNumber(c.colonies)} colonias`}
function microResultRowsFiltered(){
  const q=String($('#microResultSearch')?.value||'').trim().toLowerCase(),from=$('#microResultDateFrom')?.value||'',to=$('#microResultDateTo')?.value||'',type=$('#microResultTypeFilter')?.value||'',status=$('#microResultStatusFilter')?.value||'';
  return [...(state.microbiologicalControls||[])].filter(c=>{const p=microResultPoint(c),d=plannerControlDate(c)||'';const hay=[c.controlCode,p.code,p.name,p.medium,p.microorganism,c.responsible,c.result].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!from||d>=from)&&(!to||d<=to)&&(!type||p.type===type)&&(!status||c.result===status)}).sort((a,b)=>(plannerControlDate(b)||'').localeCompare(plannerControlDate(a)||'')||String(b.controlTime||'').localeCompare(String(a.controlTime||''))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}
function renderMicroResults(){
  const host=$('#microResultRows');if(!host)return;const all=state.microbiologicalControls||[],rows=microResultRowsFiltered();
  const pass=all.filter(c=>c.result==='CUMPLE').length,alert=all.filter(c=>c.result==='ALERTA').length,fail=all.filter(c=>c.result==='NO CUMPLE').length,evaluated=pass+alert+fail;
  if($('#microResultKpiTotal'))$('#microResultKpiTotal').textContent=all.length;if($('#microResultKpiPass'))$('#microResultKpiPass').textContent=pass;if($('#microResultKpiAlert'))$('#microResultKpiAlert').textContent=alert;if($('#microResultKpiFail'))$('#microResultKpiFail').textContent=fail;if($('#microResultKpiCompliance'))$('#microResultKpiCompliance').textContent=evaluated?`${((pass/evaluated)*100).toFixed(1)}%`:'0%';
  host.innerHTML=rows.map(c=>{const p=microResultPoint(c),d=plannerControlDate(c);return `<tr><td><b>${esc(c.controlCode||'—')}</b></td><td>${esc(plannerDateLabel(d))}<small class="cycle-summary">${esc(c.controlTime||'—')}</small></td><td><b>${esc(p.name||'—')}</b><small class="cycle-summary">${esc(p.code||'')}</small></td><td>${esc(p.type||'—')}</td><td>${esc(p.medium||'—')}</td><td>${esc(p.microorganism||'—')}</td><td>${esc(microResultObservation(c,p))}</td><td>${esc(c.plateCode||'SIN ASIGNACIÓN HISTÓRICA')}</td><td><b>${esc(microResultNumber(c.resultValue))}</b><small class="cycle-summary">${esc(c.resultUnit||p.unit||'')}</small></td><td>${microResultPill(c.result)}</td><td>${esc(c.responsible||'—')}</td><td><button class="mini" type="button" onclick="showMicroResult('${esc(c.id)}')">Ver</button></td></tr>`}).join('')||'<tr><td colspan="12">No existen resultados que coincidan con los filtros.</td></tr>';
  if($('#microResultSummary'))$('#microResultSummary').textContent=`Mostrando ${rows.length} de ${all.length} control(es). Los filtros no modifican los registros históricos.`;
}
window.showMicroResult=id=>{const c=state.microbiologicalControls.find(x=>x.id===id);if(!c)return;const p=microResultPoint(c),crit=c.criterionSnapshot||{},d=plannerControlDate(c);const source=crit.sourceReference||crit.source||'—';const version=crit.version?`v${crit.version}`:'—';$('#lotModalContent').innerHTML=`<h2>${esc(c.controlCode||'Resultado')}</h2><div class="trace-card"><div><span>Fecha / hora</span><b>${esc(plannerDateLabel(d))} · ${esc(c.controlTime||'—')}</b></div><div><span>Área / punto</span><b>${esc(p.code||'')} · ${esc(p.name||'—')}</b></div><div><span>Tipo</span><b>${esc(p.type||'—')}</b></div><div><span>Medio</span><b>${esc(p.medium||'—')}</b></div><div><span>Microorganismo</span><b>${esc(p.microorganism||'—')}</b></div><div><span>Observación</span><b>${esc(microResultObservation(c,p))}</b></div><div><span>Caja preparada</span><b>${esc(c.plateCode||'SIN ASIGNACIÓN HISTÓRICA')}</b></div><div><span>Resultado</span><b>${esc(microResultNumber(c.resultValue))} ${esc(c.resultUnit||p.unit||'')}</b></div><div><span>Estado</span>${microResultPill(c.result)}</div><div><span>Responsable</span><b>${esc(c.responsible||'—')}</b></div></div><h3>Cálculo automático</h3><p>${esc(c.calculationFormula||'—')}</p><h3>Criterio congelado</h3><p><b>${esc(version)}</b> · ${esc(criterionBandLabel(crit))}<br>${esc(source)}</p>${c.notes?`<h3>Observaciones</h3><p>${esc(c.notes)}</p>`:''}`;$('#lotModal').classList.add('open');$('#lotModal').setAttribute('aria-hidden','false')};
function excelEscape(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function exportMicroResultsExcel(){
  const rows=microResultRowsFiltered();if(!rows.length){toast('No hay resultados para exportar');return}
  const headers=['Código','Fecha','Hora','Área / punto','Código punto','Tipo','Criticidad','Medio','Microorganismo','Método','Colonias observadas','Área hisopada cm²','Volumen analizado mL','Caja preparada','Lote preparado','Resultado','Unidad','Estado','Responsable','Criterio','Versión criterio','Fuente criterio','Fórmula','Observaciones'];
  const data=rows.map(c=>{const p=microResultPoint(c),crit=c.criterionSnapshot||{};return [c.controlCode,plannerControlDate(c),c.controlTime,p.name,p.code,p.type,p.criticality,p.medium,p.microorganism,p.method,c.colonies,p.swabAreaCm2||'',c.volumeAnalyzedMl??'',c.plateCode||'SIN ASIGNACIÓN HISTÓRICA',c.plateLotCode||'',c.resultValue,c.resultUnit||p.unit,c.result,c.responsible,criterionBandLabel(crit),crit.version||'',crit.sourceReference||crit.source||'',c.calculationFormula,c.notes||'']});
  const headerHtml='<tr>'+headers.map(x=>`<th>${excelEscape(x)}</th>`).join('')+'</tr>';const rowHtml=data.map(a=>'<tr>'+a.map(x=>`<td>${excelEscape(x)}</td>`).join('')+'</tr>').join('');
  const html=`<html><head><meta charset="UTF-8"></head><body><table border="1"><tr><th colspan="${headers.length}">MICROBIOLOGÍA ERP V2.0.0-F · Resultados de Control Microbiológico</th></tr>${headerHtml}${rowHtml}</table></body></html>`;
  const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`MICROBIOLOGIA_RESULTADOS_${today()}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${rows.length} resultado(s) exportados a Excel`);
}

function renderMicrobiology(){renderMonitoringCatalog();renderPlanner();renderMicroControlPointOptions();renderMicroResults();renderPlateInventory();renderMicroConsolidated();renderFrequencyIntelligence()}

window.editMonitoringPoint=id=>{const raw=state.catalogMonitoringPoints.find(y=>y.id===id),f=$('#monitoringPointForm');if(!raw||!f)return;const x=monitoringFrequencyNormalize(raw);for(const k of ['id','code','name','type','criticality','frequency','frequencyDays','medium','microorganism','method','exposureMinutes','plateDiameterMm','swabAreaCm2','limitTarget','limitMax','unit','criteriaSource'])if(f.elements[k])f.elements[k].value=x[k]??'';if(f.elements.frequencyDays)f.elements.frequencyDays.value=x.frequencyDays;f.scrollIntoView({behavior:'smooth',block:'start'})};
window.toggleMonitoringPoint=async id=>{const x=state.catalogMonitoringPoints.find(y=>y.id===id);if(!x)return;const next=x.active===false;if(!confirm(`${next?'Reactivar':'Dar de baja'} el punto ${x.name}? El historial futuro conservará la referencia a este catálogo.`))return;await saveLocal('catalogMonitoringPoints',{...x,active:next,statusChangedAt:nowISO(),statusChangedBy:activeUser()},{render:false});await audit('catalogMonitoringPoint',x.id,next?'PUNTO DE MONITOREO REACTIVADO':'PUNTO DE MONITOREO DADO DE BAJA',{summary:`${x.code} · ${x.name}`});await loadLocal();toast(next?'Punto reactivado':'Punto dado de baja')};


function renderCriteriaEngine(){
  const rows=$('#criteriaRuleRows');if(rows){rows.innerHTML=[...state.criteriaRules].sort((a,b)=>(a.domain+a.code).localeCompare(b.domain+b.code)).map(r=>{const v=criterionCurrentVersion(r);return `<tr><td><b>${esc(r.code)}</b><small class="cycle-summary">${esc(r.domain)}</small></td><td>${esc(r.name)}</td><td>${esc(r.scopeKey)}</td><td>${v?`v${esc(v.version)} · ${esc(v.effectiveFrom||'—')}`:'—'}</td><td>${esc(criterionBandLabel(v))}</td><td>${esc(v?.sourceReference||'—')}</td><td>${pill(r.status||'ACTIVO')}</td><td><button class="mini" onclick="newCriterionVersion('${r.id}')">Nueva versión</button> <button class="mini" onclick="showCriterionHistory('${r.id}')">Historial</button></td></tr>`}).join('')||'<tr><td colspan="8">Sin criterios.</td></tr>';}
  const mrows=$('#microorganismMasterRows');if(mrows)mrows.innerHTML=[...state.catalogMicroorganisms].sort((a,b)=>a.name.localeCompare(b.name)).map(m=>`<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.referenceCode||'—')}</td><td>${esc(m.shortCode||'—')}</td><td>${esc((m.uses||[]).join(' · '))}</td><td>${pill(m.active===false?'INACTIVO':'ACTIVO')}</td><td><button class="mini" onclick="editMicroorganismMaster('${m.id}')">Editar</button></td></tr>`).join('')||'<tr><td colspan="6">Sin microorganismos.</td></tr>';
}
window.newCriterionVersion=id=>{const r=state.criteriaRules.find(x=>x.id===id),v=criterionCurrentVersion(r),f=$('#criterionForm');if(!r||!f)return;f.elements.ruleId.value=r.id;f.elements.code.value=r.code;f.elements.name.value=r.name;f.elements.domain.value=r.domain;f.elements.scopeKey.value=r.scopeKey;f.elements.target.value=v?.target??'';f.elements.alert.value=v?.alert??'';f.elements.action.value=v?.action??'';f.elements.min.value=v?.min??'';f.elements.max.value=v?.max??'';f.elements.unit.value=v?.unit||'';f.elements.sourceType.value=v?.sourceType||'PROCEDIMIENTO_INTERNO';f.elements.sourceReference.value=v?.sourceReference||'';f.elements.effectiveFrom.value=today();f.elements.notes.value='';$('#criterionFormMode').textContent=`Nueva versión de ${r.code} · la versión anterior no se modifica`;f.scrollIntoView({behavior:'smooth',block:'start'})};
window.showCriterionHistory=id=>{const r=state.criteriaRules.find(x=>x.id===id);if(!r)return;const versions=state.criteriaVersions.filter(v=>v.ruleId===id).sort((a,b)=>Number(b.version)-Number(a.version));$('#lotModalContent').innerHTML=`<h2>${esc(r.code)} · ${esc(r.name)}</h2><p>${esc(r.domain)} · ${esc(r.scopeKey)}</p><div class="timeline">${versions.map(v=>`<div class="timeline-item"><b>Versión ${esc(v.version)} · ${esc(v.status||'VIGENTE')}</b><span>Vigente desde ${esc(v.effectiveFrom||'—')}${v.effectiveTo?' hasta '+esc(v.effectiveTo):''}</span><small>${esc(criterionBandLabel(v))}<br>${esc(v.sourceType||'')} · ${esc(v.sourceReference||'')}${v.notes?'<br>'+esc(v.notes):''}</small></div>`).join('')}</div>`;$('#lotModal').classList.add('open');$('#lotModal').setAttribute('aria-hidden','false')};
window.editMicroorganismMaster=id=>{const x=state.catalogMicroorganisms.find(y=>y.id===id),f=$('#microorganismMasterForm');if(!x||!f)return;f.elements.id.value=x.id;f.elements.name.value=x.name||'';f.elements.referenceCode.value=x.referenceCode||'';f.elements.shortCode.value=x.shortCode||'';f.elements.uses.value=(x.uses||[]).join(', ');f.scrollIntoView({behavior:'smooth'})};

function renderConfig(){const c=systemConfig(),f=$('#systemConfigForm');if(!f)return;f.elements.sterilityDays.value=0;f.elements.macroscopicDays.value=c.macroscopicDays??0;f.elements.performanceDays.value=c.performanceDays??2;f.elements.alertDays.value=c.alertDays??2;renderHistoricalBanner()}
function renderHistoricalBanner(){/* V2.0.0-H1B: sin modo especial; fecha del documento siempre activa */}

// V2.3.0-A · Motor de Control de Calidad Q1/Q2/Q3
function qcDateObj(v){return new Date(String(v).slice(0,10)+'T12:00:00')}
function qcWeekday(v){return qcDateObj(v).getDay()}
function qcAllowedDate(v,allowed){return allowed.includes(qcWeekday(v))}
function qcAdvanceToAllowed(v,allowed){let d=v;for(let i=0;i<10&&!qcAllowedDate(d,allowed);i++)d=addDays(d,1);return d}
function qcNextFromActual(type,lastDate){const cfg=COLIFORM_QC_CONFIG[type.toLowerCase()];if(!cfg)return '';return qcAdvanceToAllowed(addDays(lastDate,cfg.frequencyDays),cfg.allowedDays)}
function qcGenerateNextFromAnchor(type,ref=today()){
  const cfg=COLIFORM_QC_CONFIG[type.toLowerCase()];if(!cfg)return ref;
  let d=qcAdvanceToAllowed(COLIFORM_QC_CONFIG.anchor,cfg.allowedDays),guard=0;
  while(d<ref&&guard++<1000)d=qcAdvanceToAllowed(addDays(d,cfg.frequencyDays),cfg.allowedDays);
  return d;
}
function qcQ3RecordIncludes(x,medium){if(x?.type!=='Q3')return false;const selected=Array.isArray(x.selectedMedia)?x.selectedMedia:null;if(!selected||!selected.length)return true;return selected.includes(medium)}
function qcControlsOf(type,medium=''){return (state.coliformQCControls||[]).filter(x=>x.type===type&&(!medium||type!=='Q3'||qcQ3RecordIncludes(x,medium))).sort((a,b)=>(b.actualDate||'').localeCompare(a.actualDate||''))}
function qcNextDue(type){if(type==='Q3'){const nextFor=medium=>{const last=qcControlsOf('Q3',medium)[0];return last?qcNextFromActual('Q3',last.actualDate):qcGenerateNextFromAnchor('Q3',today())};return [nextFor('A1'),nextFor('LMX')].sort()[0]}const last=qcControlsOf(type)[0];return last?qcNextFromActual(type,last.actualDate):qcGenerateNextFromAnchor(type,today())}
function qcDayDiff(a,b){return Math.round((qcDateObj(b)-qcDateObj(a))/86400000)}
function qcPhaseQ1(date){const days=Math.floor((qcDateObj(date)-qcDateObj(COLIFORM_QC_CONFIG.anchor))/86400000);return (Math.floor(Math.max(0,days)/15)%2===0)?'POSITIVE':'NEGATIVE'}
function qcPhaseQ2(date){return Number(String(date).slice(8,10))<=15?'POSITIVE':'NEGATIVE'}
function qcPhase(type,date){return type==='Q1'?qcPhaseQ1(date):type==='Q2'?qcPhaseQ2(date):'BLANK'}
function qcPhaseLabel(phase){return phase==='POSITIVE'?'POSITIVO':phase==='NEGATIVE'?'NEGATIVO':'BLANCO'}
function qcActivity(type,phase){if(type==='Q3')return 'Control de esterilidad de medios';const p=phase==='POSITIVE'?COLIFORM_QC_CONFIG.positive:COLIFORM_QC_CONFIG.negative;return type==='Q1'?p.activityQ1:p.activityQ2}
function qcStrainFor(type,phase){if(type==='Q3')return null;return strainById((phase==='POSITIVE'?COLIFORM_QC_CONFIG.positive:COLIFORM_QC_CONFIG.negative).strainId)}
function qcTotalStrainFor(type,phase){if(type==='Q3')return null;return strainById((phase==='POSITIVE'?COLIFORM_QC_CONFIG.positive:COLIFORM_QC_CONFIG.negativeTotal).strainId)}
function qcWeekBounds(date){const d=qcDateObj(date),day=d.getDay(),delta=(day+6)%7,m=new Date(d);m.setDate(m.getDate()-delta);const s=new Date(m);s.setDate(s.getDate()+6);return {start:m.toISOString().slice(0,10),end:s.toISOString().slice(0,10)}}
function qcEligibleReactivationsForStrain(strainId,date){if(!strainId)return [];const w=qcWeekBounds(date);return (state.strainReactivations||[]).filter(r=>r.strainId===strainId&&r.result==='APTO'&&r.date>=w.start&&r.date<=date&&r.date<=w.end).sort((a,b)=>(b.date||'').localeCompare(a.date||''))}
function qcEligibleReactivations(type,phase,date){const strain=qcStrainFor(type,phase);return strain?qcEligibleReactivationsForStrain(strain.id,date):[]}
function qcEligibleTotalReactivations(type,phase,date){const strain=qcTotalStrainFor(type,phase);return strain?qcEligibleReactivationsForStrain(strain.id,date):[]}
function qcReactivationStatus(r,ref=today()){if(!r)return 'NO DISPONIBLE';const w=qcWeekBounds(r.date);return ref>w.end?'BAJA AUTOMÁTICA · FIN DE SEMANA':ref<r.date?'PROGRAMADA':'VIGENTE ESTA SEMANA'}
function qcA1Lots(date){return (state.mediaPrep||[]).filter(p=>/^A-1 medium/i.test(p.medium||'')&&p.status==='LIBERADO'&&!isClosed(p)&&(!p.expiryDate||p.expiryDate>=date)&&(!p.date||p.date<=date)).sort((a,b)=>(a.expiryDate||'9999-12-31').localeCompare(b.expiryDate||'9999-12-31'))}
function qcLMXLots(date){return (state.mediaPrep||[]).filter(p=>/LMX|Fluorocult/i.test(p.medium||'')&&p.status==='LIBERADO'&&!isClosed(p)&&(!p.expiryDate||p.expiryDate>=date)&&(!p.date||p.date<=date)).sort((a,b)=>(a.expiryDate||'9999-12-31').localeCompare(b.expiryDate||'9999-12-31'))}
function qcDependency(type,date){const phase=qcPhase(type,date),a1=qcA1Lots(date),lmx=qcLMXLots(date),reacts=qcEligibleReactivations(type,phase,date),reactsTotal=qcEligibleTotalReactivations(type,phase,date),strain=qcStrainFor(type,phase),strainTotal=qcTotalStrainFor(type,phase);const samePositive=phase==='POSITIVE'&&strain?.id===strainTotal?.id;return {phase,a1,lmx,reacts,reactsTotal,strain,strainTotal,samePositive,ready:type==='Q3'?(a1.length>0||lmx.length>0):(a1.length>0&&lmx.length>0&&reacts.length>0&&(samePositive||reactsTotal.length>0))} }
function qcPlanItem(type){const due=qcNextDue(type),dep=qcDependency(type,due),days=qcDayDiff(today(),due);let status=days<0?'VENCIDO':days===0?'HOY':days<=3?'PRÓXIMO':'PROGRAMADO';return {type,due,days,status,...dep,activity:qcActivity(type,dep.phase)}}
function qcStatusPill(status){const c=status==='VENCIDO'?'bad':status==='HOY'?'warn':status==='PRÓXIMO'?'warn':'ok';return `<span class="pill ${c}">${esc(status)}</span>`}
function qcDepCard(ok,title,detail){return `<div class="qc-dep ${ok?'ok':'bad'}"><b>${ok?'✓':'!'} ${esc(title)}</b><span>${esc(detail)}</span></div>`}
function renderColiformQC(){
  const host=$('#qcPlannerCards');if(!host)return;const items=['Q1','Q2','Q3'].map(qcPlanItem).sort((a,b)=>a.due.localeCompare(b.due)||a.type.localeCompare(b.type));
  $('#qcKpiDue').textContent=items.filter(x=>x.days<=0).length;$('#qcKpiReady').textContent=items.filter(x=>x.ready).length;$('#qcKpiA1').textContent=qcA1Lots(today()).length;$('#qcKpiReact').textContent=(state.strainReactivations||[]).filter(r=>r.result==='APTO'&&qcReactivationStatus(r)==='VIGENTE ESTA SEMANA').length;
  host.innerHTML=items.map(i=>{const a1=i.a1[0],lmx=i.lmx[0],react=i.reacts[0],reactTotal=i.reactsTotal[0],strain=i.strain,strainTotal=i.strainTotal;return `<article class="qc-plan-card ${i.status==='VENCIDO'?'overdue':''}"><div class="qc-plan-head"><div><span class="qc-code">${i.type}</span><h3>${esc(i.activity)}</h3></div>${qcStatusPill(i.status)}</div><div class="qc-plan-date"><span>Próximo control unificado</span><b>${plannerDateLabel(i.due)}</b><small>${i.days<0?`${Math.abs(i.days)} día(s) vencido`:i.days===0?'Corresponde hoy':`en ${i.days} día(s)`}</small></div><div class="qc-plan-meta"><span>${pill(qcPhaseLabel(i.phase))}</span>${strain?`<span>🦠 Fecales: ${esc(strain.name)}</span>`:'<span>⚪ Sin cepa · blanco</span>'}${strainTotal&&!i.samePositive?`<span>🦠 Totales: ${esc(strainTotal.name)}</span>`:i.samePositive?'<span>♻ E. coli compartida A-1 + LMX</span>':''}</div><div class="qc-deps">${qcDepCard(!!a1,'A-1 Medium · fecales',a1?`${a1.lotCode} · vence ${plannerDateLabel(a1.expiryDate)}`:'No existe lote LIBERADO y vigente para la fecha')}${qcDepCard(!!lmx,'Fluorocult LMX · totales',lmx?`${lmx.lotCode} · vence ${plannerDateLabel(lmx.expiryDate)}`:'No existe lote LMX LIBERADO y vigente para la fecha')}${i.type==='Q3'?'':qcDepCard(!!react,i.samePositive?'E. coli semanal compartida':'Reactivación A-1',react?`${react.reactivationCode} · ${react.workLot||''} · ${qcReactivationStatus(react,i.due)}`:`Se requiere ${strain?.name||'cepa'} APTA esta semana`)}${i.type==='Q3'||i.samePositive?'':qcDepCard(!!reactTotal,'Reactivación LMX',reactTotal?`${reactTotal.reactivationCode} · ${reactTotal.workLot||''} · ${qcReactivationStatus(reactTotal,i.due)}`:`Se requiere ${strainTotal?.name||'cepa'} APTA esta semana`)}</div><div class="qc-actions"><button class="primary" onclick="openQCExecution('${i.type}')" ${(i.ready&&i.days<=0)?'':'disabled'}>Registrar ${i.type}</button>${i.type!=='Q3'&&!react&&i.days<=0?`<button onclick="prepareQCReactivation('${i.type}','fecal')">Reactivar ${i.samePositive?'E. coli':'A-1'}</button>`:''}${i.type!=='Q3'&&!i.samePositive&&!reactTotal&&i.days<=0?`<button onclick="prepareQCReactivation('${i.type}','total')">Reactivar LMX</button>`:''}${i.days>0?`<small>Disponible al llegar la fecha programada.</small>`:''}</div></article>`}).join('');
  renderQCHistory();renderQCReactivationTrace();
}
window.prepareQCReactivation=(type,target='fecal')=>{const due=qcNextDue(type),phase=qcPhase(type,due),strain=target==='total'?qcTotalStrainFor(type,phase):qcStrainFor(type,phase);if(!strain)return;document.querySelector('[data-view="strains"]')?.click();document.querySelector('[data-strain-tab="strain-react"]')?.click();const f=$('#strainReactForm');f.elements.date.value=today();renderReactivationStrainOptions();f.elements.strainId.value=strain.id;renderReactivationMediumOptions();if([...f.elements.use.options].some(o=>o.value==='Control de calidad'))f.elements.use.value='Control de calidad';updateReactivationCalculated();f.scrollIntoView({behavior:'smooth',block:'start'});toast(`Reactivación requerida para ${type} · ${target==='total'?'LMX totales':'A-1 fecales'} · ${strain.name}. Vigencia QC: hasta el final de esta semana.`)};
function qcCriteria(type,phase){const p=phase==='POSITIVE'?COLIFORM_QC_CONFIG.positive:COLIFORM_QC_CONFIG.negative,total=phase==='POSITIVE'?COLIFORM_QC_CONFIG.positive:COLIFORM_QC_CONFIG.negativeTotal;return {gas:type==='Q3'?'NO':p.expectedGas,growth:type==='Q3'?'NO':p.expectedGrowth,lmxGrowth:type==='Q3'?'NO':total.expectedLMXGrowth,lmxColor:type==='Q3'?'NO':total.expectedLMXColor,lmxFluorescence:type==='Q3'?'NO':total.expectedLMXFluorescence,nmp:type==='Q2'?(phase==='POSITIVE'?COLIFORM_QC_CONFIG.q2PositiveNmp:COLIFORM_QC_CONFIG.q2NegativeNmp):null}}
function qcTimeDuration(start,end){if(!start||!end)return null;const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);let a=sh*60+sm,b=eh*60+em;if(b<a)b+=1440;return Math.round(((b-a)/60)*100)/100}
function qcAddHours(time,hours){if(!time)return '';const [hh,mm]=time.split(':').map(Number);if(!Number.isFinite(hh)||!Number.isFinite(mm))return '';let mins=hh*60+mm+Math.round(hours*60);mins=((mins%1440)+1440)%1440;return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`}
function qcSetSmartDefaults({keepStart=true}={}){const f=$('#coliformQCForm');if(!f)return;if(!String(f.elements.temp35?.value||''))f.elements.temp35.value='35.0';if(!String(f.elements.temp44?.value||''))f.elements.temp44.value='44.5';const s35=f.elements.start35?.value||'';if(s35){f.elements.end35.value=qcAddHours(s35,3);f.elements.start44.value=f.elements.end35.value;f.elements.end44.value=qcAddHours(f.elements.start44.value,21)}else if(!keepStart){f.elements.end35.value='';f.elements.start44.value='';f.elements.end44.value=''}updateQCExecutionPreview()}
function qcCascadeTimesFrom(field){const f=$('#coliformQCForm');if(!f)return;if(field==='start35'){if(f.elements.start35.value){f.elements.end35.value=qcAddHours(f.elements.start35.value,3);f.elements.start44.value=f.elements.end35.value;f.elements.end44.value=qcAddHours(f.elements.start44.value,21)}}else if(field==='end35'){if(f.elements.end35.value){f.elements.start44.value=f.elements.end35.value;f.elements.end44.value=qcAddHours(f.elements.start44.value,21)}}else if(field==='start44'){if(f.elements.start44.value)f.elements.end44.value=qcAddHours(f.elements.start44.value,21)}updateQCExecutionPreview()}
function qcMPNFromForm(f,prefix=''){const cap=n=>prefix?prefix+n.charAt(0).toUpperCase()+n.slice(1):n;const raw=[f.elements[cap('pos10')]?.value,f.elements[cap('pos1')]?.value,f.elements[cap('pos01')]?.value];if(raw.some(v=>v===undefined||v===null||String(v)===''))return null;const [a,b,c]=raw.map(Number);if([a,b,c].some(v=>!Number.isInteger(v)||v<0||v>5))return null;return MPN_9221_IV[`${a}-${b}-${c}`]||null}
function qcObservedValue(f,name,type){const fallback={gas:'gasFallback',growth:'growthFallback',lmxGrowth:'lmxGrowthFallback',lmxColor:'lmxColorFallback',lmxFluorescence:'lmxFluorescenceFallback'};return String(f.elements[type==='Q2'?name:fallback[name]]?.value||'')}
function qcTubePattern(f,prefix=''){const cap=n=>prefix?prefix+n.charAt(0).toUpperCase()+n.slice(1):n;return [f.elements[cap('pos10')]?.value,f.elements[cap('pos1')]?.value,f.elements[cap('pos01')]?.value].map(v=>String(v||'—')).join(' · ')}
function qcQ3SelectedMedia(f){if(f?.dataset?.type!=='Q3')return ['A1','LMX'];const out=[];if(f.elements.q3MediumA1?.checked)out.push('A1');if(f.elements.q3MediumLMX?.checked)out.push('LMX');return out}
function qcApplyQ3MediumSelection({autoFromAvailability=false}={}){
  const f=$('#coliformQCForm');if(!f)return;
  const isQ3=f.dataset.type==='Q3',box=$('#qcQ3MediumSelector');
  if(box)box.hidden=!isQ3;
  if(!isQ3){
    if(f.elements.a1PrepId){f.elements.a1PrepId.disabled=false;f.elements.a1PrepId.required=true}
    if(f.elements.lmxPrepId){f.elements.lmxPrepId.disabled=false;f.elements.lmxPrepId.required=true}
    $$('.qc-q3-a1-field,.qc-q3-lmx-field').forEach(x=>x.hidden=false);
    return;
  }
  if(autoFromAvailability){
    const date=f.elements.actualDate?.value||today(),dep=qcDependency('Q3',date);
    if(f.elements.q3MediumA1)f.elements.q3MediumA1.checked=dep.a1.length>0;
    if(f.elements.q3MediumLMX)f.elements.q3MediumLMX.checked=dep.lmx.length>0;
  }
  const selected=qcQ3SelectedMedia(f),a1On=selected.includes('A1'),lmxOn=selected.includes('LMX');
  if(f.elements.a1PrepId){f.elements.a1PrepId.disabled=!a1On;f.elements.a1PrepId.required=a1On}
  if(f.elements.lmxPrepId){f.elements.lmxPrepId.disabled=!lmxOn;f.elements.lmxPrepId.required=lmxOn}
  for(const n of ['gasFallback','growthFallback'])if(f.elements[n]){f.elements[n].disabled=!a1On;f.elements[n].required=a1On;if(!a1On)f.elements[n].value=''}
  for(const n of ['lmxGrowthFallback','lmxColorFallback','lmxFluorescenceFallback'])if(f.elements[n]){f.elements[n].disabled=!lmxOn;f.elements[n].required=lmxOn;if(!lmxOn)f.elements[n].value=''}
  $$('.qc-q3-a1-field').forEach(x=>x.hidden=!a1On);$$('.qc-q3-lmx-field').forEach(x=>x.hidden=!lmxOn);
  const a1Wrap=$('#qcA1PrepWrap'),lmxWrap=$('#qcLMXPrepWrap');if(a1Wrap)a1Wrap.hidden=!a1On;if(lmxWrap)lmxWrap.hidden=!lmxOn;
}
function qcExecutionResult(f,type,phase){const c=qcCriteria(type,phase),t35=Number(f.elements.temp35.value),h35=qcTimeDuration(f.elements.start35.value,f.elements.end35.value),t44=Number(f.elements.temp44.value),h44=qcTimeDuration(f.elements.start44.value,f.elements.end44.value);const checks=[t35>=34.5&&t35<=35.5,h35!==null&&h35>=2.5&&h35<=3.5,t44>=44&&t44<=45,h44!==null&&h44>=19&&h44<=23];const selected=type==='Q3'?qcQ3SelectedMedia(f):['A1','LMX'];if(selected.includes('A1'))checks.push(qcObservedValue(f,'gas',type)===c.gas,qcObservedValue(f,'growth',type)===c.growth);if(selected.includes('LMX'))checks.push(qcObservedValue(f,'lmxGrowth',type)===c.lmxGrowth,qcObservedValue(f,'lmxColor',type)===c.lmxColor,qcObservedValue(f,'lmxFluorescence',type)===c.lmxFluorescence);if(type==='Q2'){const a1=qcMPNFromForm(f),lmx=qcMPNFromForm(f,'lmx');const ok=n=>!!n&&(phase==='POSITIVE'?Number.isFinite(n.num)&&n.num>=1.8&&n.num<=20:(n.text==='<1,8'||(Number.isFinite(n.num)&&n.num<=1.8)));checks.push(ok(a1),ok(lmx))}return selected.length>0&&checks.every(Boolean)?'APTO':'NO APTO'}
function updateQCExecutionPreview(){const f=$('#coliformQCForm');if(!f||!f.dataset.type)return;updateQCSampleCodePreview();const type=f.dataset.type,phase=f.dataset.phase,c=qcCriteria(type,phase),h35=qcTimeDuration(f.elements.start35.value,f.elements.end35.value),h44=qcTimeDuration(f.elements.start44.value,f.elements.end44.value),a1Mpn=type==='Q2'?qcMPNFromForm(f):null,lmxMpn=type==='Q2'?qcMPNFromForm(f,'lmx'):null;$('#qcHours35').value=h35===null?'':`${h35} h`;$('#qcHours44').value=h44===null?'':`${h44} h`;if($('#qcMpnResult'))$('#qcMpnResult').value=type==='Q2'?(a1Mpn?.text||'Combinación pendiente'):'N/A';if($('#qcLmxMpnResult'))$('#qcLmxMpnResult').value=type==='Q2'?(lmxMpn?.text||'Combinación pendiente'):'N/A';if($('#qcA1Pattern'))$('#qcA1Pattern').textContent=type==='Q2'?qcTubePattern(f):'—';if($('#qcLmxPattern'))$('#qcLmxPattern').textContent=type==='Q2'?qcTubePattern(f,'lmx'):'—';if($('#qcA1PhaseBadge'))$('#qcA1PhaseBadge').textContent=`${qcPhaseLabel(phase)} · patrón A‑1 independiente`;if($('#qcLmxPhaseBadge'))$('#qcLmxPhaseBadge').textContent=`${qcPhaseLabel(phase)} · patrón LMX independiente`;const selected=type==='Q3'?qcQ3SelectedMedia(f):['A1','LMX'];const base=['temp35','start35','end35','temp44','start44','end44'].every(n=>String(f.elements[n]?.value||'')!=='');const obsNames=[];if(selected.includes('A1'))obsNames.push('gas','growth');if(selected.includes('LMX'))obsNames.push('lmxGrowth','lmxColor','lmxFluorescence');const observations=obsNames.every(n=>qcObservedValue(f,n,type)!=='');const tubes=type!=='Q2'||['pos10','pos1','pos01','lmxPos10','lmxPos1','lmxPos01'].every(n=>String(f.elements[n]?.value||'')!=='');const complete=selected.length>0&&base&&observations&&tubes;const r=complete?qcExecutionResult(f,type,phase):'PENDIENTE';$('#qcExecResult').textContent=r;$('#qcExecResult').className=r==='APTO'?'qc-result-ok':r==='NO APTO'?'qc-result-bad':'qc-result-pending';const a1Criteria=selected.includes('A1')?`A‑1: gas <b>${c.gas}</b>, crecimiento <b>${c.growth}</b>`:'A‑1: <b>NO SELECCIONADO</b>';const lmxCriteria=selected.includes('LMX')?`LMX: crecimiento <b>${c.lmxGrowth}</b>, azul-verde <b>${c.lmxColor}</b>, fluorescencia <b>${c.lmxFluorescence}</b>`:'LMX: <b>NO SELECCIONADO</b>';$('#qcCriteriaSummary').innerHTML=`35 °C: <b>34,5–35,5 °C / 3 h</b> · 44,5 °C: <b>44,0–45,0 °C / 21 h</b> · ${a1Criteria} · ${lmxCriteria}${c.nmp?` · NMP por medio: <b>${phase==='POSITIVE'?'1,8–20 NMP/100 mL':'≤1,8 NMP/100 mL'}</b>`:''}`}
function qcPopulateExecutionDependencies(type,date,{historical=false}={}){const f=$('#coliformQCForm');if(!f)return;const phase=qcPhase(type,date),dep=qcDependency(type,date);f.dataset.type=type;f.dataset.phase=phase;f.dataset.mode=historical?'HISTORICAL':'OPERATIVE';const a1Options=dep.a1.map(p=>`<option value="${p.id}">${esc(p.lotCode)} · ${esc(p.medium)} · vence ${plannerDateLabel(p.expiryDate)}</option>`).join('');f.elements.a1PrepId.innerHTML=a1Options||'<option value="">Sin A-1 LIBERADO/vigente para esta fecha</option>';const lmxOptions=dep.lmx.map(p=>`<option value="${p.id}">${esc(p.lotCode)} · ${esc(p.medium)} · vence ${plannerDateLabel(p.expiryDate)}</option>`).join('');f.elements.lmxPrepId.innerHTML=lmxOptions||'<option value="">Sin LMX LIBERADO/vigente para esta fecha</option>';if(type==='Q3'){f.elements.reactivationId.innerHTML='<option value="">NO APLICA · BLANCO</option>';f.elements.reactivationId.disabled=true;f.elements.reactivationIdTotal.innerHTML='<option value="">NO APLICA · BLANCO</option>';f.elements.reactivationIdTotal.disabled=true}else{f.elements.reactivationId.innerHTML=dep.reacts.map(r=>`<option value="${r.id}">${esc(r.reactivationCode)} · ${esc(r.workLot||'')} · ${esc(r.date)}</option>`).join('')||'<option value="">Sin reactivación APTA para esta fecha</option>';f.elements.reactivationId.disabled=false;if(dep.samePositive){f.elements.reactivationIdTotal.innerHTML=dep.reacts.map(r=>`<option value="${r.id}">${esc(r.reactivationCode)} · E. coli compartida A-1 + LMX</option>`).join('')||'<option value="">Sin E. coli APTA esta semana</option>';f.elements.reactivationIdTotal.disabled=true}else{f.elements.reactivationIdTotal.innerHTML=dep.reactsTotal.map(r=>`<option value="${r.id}">${esc(r.reactivationCode)} · ${esc(r.workLot||'')} · ${esc(r.date)}</option>`).join('')||'<option value="">Sin Salmonella APTA para esta fecha</option>';f.elements.reactivationIdTotal.disabled=false}}$('#qcExecTitle').textContent=`${historical?'Histórico · ':''}${type} · ${qcActivity(type,phase)}`;$('#qcExecPhase').textContent=qcPhaseLabel(phase);$('#qcQ2Fields').hidden=type!=='Q2';$('#qcQ1Q3Observations').hidden=type==='Q2';qcPopulateSampleTypes();for(const n of ['matrix','sampleCode','pos10','pos1','pos01','lmxPos10','lmxPos1','lmxPos01'])if(f.elements[n])f.elements[n].required=type==='Q2';for(const n of ['gas','growth','lmxGrowth','lmxColor','lmxFluorescence'])if(f.elements[n])f.elements[n].required=type==='Q2';for(const n of ['gasFallback','growthFallback','lmxGrowthFallback','lmxColorFallback','lmxFluorescenceFallback'])if(f.elements[n])f.elements[n].required=type!=='Q2';qcApplyQ3MediumSelection({autoFromAvailability:type==='Q3'});updateQCSampleCodePreview();return dep}
window.openQCExecution=type=>{const due=qcNextDue(type),dep=qcDependency(type,due);if(!dep.ready){toast(type==='Q3'?'No se puede iniciar Q3: no existe ningún medio A-1/LMX LIBERADO y vigente para la fecha.':'No se puede iniciar: falta A-1/LMX vigente o una reactivación semanal requerida.');return}const f=$('#coliformQCForm');f.reset();f.elements.temp35.value='35.0';f.elements.temp44.value='44.5';f.dataset.mode='OPERATIVE';$('#qcHistoricalSelector').hidden=true;f.elements.actualDate.max='';f.elements.actualDate.value=today();qcPopulateExecutionDependencies(type,today(),{historical:false});$('#qcExecutionPanel').hidden=false;updateQCExecutionPreview();$('#qcExecutionPanel').scrollIntoView({behavior:'smooth',block:'start'})};
window.openQCHistoricalEntry=()=>{const f=$('#coliformQCForm');f.reset();f.elements.temp35.value='35.0';f.elements.temp44.value='44.5';f.dataset.mode='HISTORICAL';$('#qcHistoricalSelector').hidden=false;f.elements.historicalType.value='Q1';f.elements.actualDate.max=today();const seed=(state.coliformQCControls||[]).map(x=>x.actualDate).filter(Boolean).sort().at(-1)||COLIFORM_QC_CONFIG.anchor;f.elements.actualDate.value=seed>today()?today():seed;qcPopulateExecutionDependencies('Q1',f.elements.actualDate.value,{historical:true});$('#qcExecutionPanel').hidden=false;updateQCExecutionPreview();$('#qcExecutionPanel').scrollIntoView({behavior:'smooth',block:'start'});toast('Modo de primera carga activado. Puede registrar el histórico poco a poco.')};
function refreshQCHistoricalEntry(){const f=$('#coliformQCForm');if(!f||f.dataset.mode!=='HISTORICAL')return;const type=f.elements.historicalType?.value||'Q1',date=f.elements.actualDate.value;if(!date)return;qcPopulateExecutionDependencies(type,date,{historical:true});updateQCExecutionPreview()}
window.closeQCExecution=()=>{$('#qcExecutionPanel').hidden=true;const f=$('#coliformQCForm');if(f){f.dataset.mode='';f.elements.actualDate.max=''}$('#qcHistoricalSelector').hidden=true};
function nextQCCode(type,date){const y=String(date).slice(0,4),n=(state.coliformQCControls||[]).filter(x=>x.type===type&&String(x.actualDate||'').startsWith(y)).length+1;return `${type}-${y}-${String(n).padStart(3,'0')}`}
async function saveColiformQC(){const f=$('#coliformQCForm'),historical=f.dataset.mode==='HISTORICAL',type=historical?(f.elements.historicalType?.value||'Q1'):f.dataset.type;if(!type)return;if(!activeUser()){toast('Seleccione un usuario activo');return}const date=f.elements.actualDate.value;if(!date){toast('Ingrese la fecha real del control');return}if(historical&&date>today()){toast('La primera carga histórica no permite fechas futuras.');return}const allowed=qcAllowedDate(date,COLIFORM_QC_CONFIG[type.toLowerCase()].allowedDays);if(!historical&&!allowed){toast(`${type} no puede registrarse ese día según la regla operativa configurada.`);return}const phase=qcPhase(type,date);f.dataset.type=type;f.dataset.phase=phase;const dep=qcDependency(type,date),selectedMedia=type==='Q3'?qcQ3SelectedMedia(f):['A1','LMX'];if(type==='Q3'&&!selectedMedia.length){toast('Seleccione al menos un medio para el control Q3.');return}const a1=selectedMedia.includes('A1')?state.mediaPrep.find(p=>p.id===f.elements.a1PrepId.value):null,lmx=selectedMedia.includes('LMX')?state.mediaPrep.find(p=>p.id===f.elements.lmxPrepId.value):null,react=state.strainReactivations.find(r=>r.id===f.elements.reactivationId.value),reactTotal=dep.samePositive?react:state.strainReactivations.find(r=>r.id===f.elements.reactivationIdTotal.value);if(selectedMedia.includes('A1')&&(!a1||!dep.a1.some(p=>p.id===a1.id))){toast(`No existe A-1 Medium LIBERADO y vigente para ${plannerDateLabel(date)}.`);return}if(selectedMedia.includes('LMX')&&(!lmx||!dep.lmx.some(p=>p.id===lmx.id))){toast(`No existe Fluorocult LMX LIBERADO y vigente para ${plannerDateLabel(date)}.`);return}if(type!=='Q3'&&(!react||!qcEligibleReactivations(type,phase,date).some(r=>r.id===react.id))){toast(`Falta una reactivación APTA de ${qcStrainFor(type,phase)?.name||'la cepa requerida'} para la semana de esa fecha.`);return}if(type!=='Q3'&&!dep.samePositive&&(!reactTotal||!qcEligibleTotalReactivations(type,phase,date).some(r=>r.id===reactTotal.id))){toast(`Falta una reactivación APTA de ${qcTotalStrainFor(type,phase)?.name||'la cepa LMX requerida'} para la semana de esa fecha.`);return}const required=['temp35','start35','end35','temp44','start44','end44'];const observedRequired=[];if(selectedMedia.includes('A1'))observedRequired.push('gas','growth');if(selectedMedia.includes('LMX'))observedRequired.push('lmxGrowth','lmxColor','lmxFluorescence');if(required.some(n=>!String(f.elements[n]?.value||'').trim())||observedRequired.some(n=>!qcObservedValue(f,n,type).trim())||(type==='Q2'&&['matrix','pos10','pos1','pos01','lmxPos10','lmxPos1','lmxPos01'].some(n=>!String(f.elements[n]?.value??'').trim()))){toast(type==='Q3'?'Complete los datos observados de los medios seleccionados.':'Complete todos los datos observados de A-1 y LMX.');return}const sampleCode=type==='Q2'?qcNextSampleCode(f.elements.matrix.value,date):'';if(type==='Q2'&&!sampleCode){toast('No se pudo generar el código automático de la muestra fortificada.');return}const h35=qcTimeDuration(f.elements.start35.value,f.elements.end35.value),h44=qcTimeDuration(f.elements.start44.value,f.elements.end44.value),mpn=type==='Q2'?qcMPNFromForm(f):null,lmxMpn=type==='Q2'?qcMPNFromForm(f,'lmx'):null;const result=qcExecutionResult(f,type,phase),c=qcCriteria(type,phase),rec=await saveLocal('coliformQCControls',{id:crypto.randomUUID(),code:nextQCCode(type,date),type,actualDate:date,scheduledDate:historical?date:qcNextDue(type),entryMode:historical?'HISTORICAL_INITIAL_LOAD':'OPERATIVE',legacyDayException:historical&&!allowed,phase:qcPhaseLabel(phase),activity:qcActivity(type,phase),strainId:qcStrainFor(type,phase)?.id||'',strainName:qcStrainFor(type,phase)?.name||'N/A',selectedMedia,a1PrepId:a1?.id||'',a1LotCode:a1?.lotCode||'',a1Expiry:a1?.expiryDate||'',lmxPrepId:lmx?.id||'',lmxLotCode:lmx?.lotCode||'',lmxExpiry:lmx?.expiryDate||'',reactivationId:react?.id||'',reactivationCode:react?.reactivationCode||'',reactivationIdTotal:reactTotal?.id||'',reactivationCodeTotal:reactTotal?.reactivationCode||'',matrix:type==='Q2'?f.elements.matrix.value.trim():'',sampleCode,temp35:Number(f.elements.temp35.value),start35:f.elements.start35.value,end35:f.elements.end35.value,hours35:h35,temp44:Number(f.elements.temp44.value),start44:f.elements.start44.value,end44:f.elements.end44.value,hours44:h44,pos10:type==='Q2'?Number(f.elements.pos10.value):null,pos1:type==='Q2'?Number(f.elements.pos1.value):null,pos01:type==='Q2'?Number(f.elements.pos01.value):null,nmp:type==='Q2'?mpn?.num??null:null,nmpText:type==='Q2'?mpn?.text||'':null,lmxPos10:type==='Q2'?Number(f.elements.lmxPos10.value):null,lmxPos1:type==='Q2'?Number(f.elements.lmxPos1.value):null,lmxPos01:type==='Q2'?Number(f.elements.lmxPos01.value):null,lmxNmp:type==='Q2'?lmxMpn?.num??null:null,lmxNmpText:type==='Q2'?lmxMpn?.text||'':null,controlLabel:type==='Q3'?'Esterilidad-BLANCO':type==='Q1'?(phase==='POSITIVE'?'Esterilidad-Presencia':'Esterilidad-Ausencia'):(phase==='POSITIVE'?'Control positivo':'Control negativo'),gasObserved:selectedMedia.includes('A1')?qcObservedValue(f,'gas',type):'',growthObserved:selectedMedia.includes('A1')?qcObservedValue(f,'growth',type):'',lmxGrowthObserved:selectedMedia.includes('LMX')?qcObservedValue(f,'lmxGrowth',type):'',lmxColorObserved:selectedMedia.includes('LMX')?qcObservedValue(f,'lmxColor',type):'',lmxFluorescenceObserved:selectedMedia.includes('LMX')?qcObservedValue(f,'lmxFluorescence',type):'',expectedGas:c.gas,expectedGrowth:c.growth,expectedLMXGrowth:c.lmxGrowth,expectedLMXColor:c.lmxColor,expectedLMXFluorescence:c.lmxFluorescence,criteriaSnapshot:{temp35Min:34.5,temp35Max:35.5,hours35Min:2.5,hours35Max:3.5,temp44Min:44,temp44Max:45,hours44Min:19,hours44Max:23,nmpRule:type==='Q2'?(phase==='POSITIVE'?'RANGO 1.8-20':'MAX 1.8'):'NO APLICA',expectedGas:c.gas,expectedGrowth:c.growth,expectedLMXGrowth:c.lmxGrowth,expectedLMXColor:c.lmxColor,expectedLMXFluorescence:c.lmxFluorescence,source:'QC-COL-001 · CONFIG_QC v4.0 · A-1 + LMX unificado'},result,responsible:activeUser(),notes:f.elements.notes.value.trim()},{render:false});if(result==='NO APTO')await saveLocal('coliformQCActions',{id:crypto.randomUUID(),controlId:rec.id,controlCode:rec.code,type,openedAt:nowISO(),status:'ABIERTA',reason:`${type} NO APTO${historical?' · HISTÓRICO':''}`,responsible:activeUser()},{render:false});await audit('coliformQCControl',rec.id,historical?'CONTROL QC HISTÓRICO REGISTRADO':'CONTROL QC REGISTRADO',{summary:`${rec.code} · ${rec.phase} · ${result} · A-1 ${rec.a1LotCode||'NO SELECCIONADO'} · LMX ${rec.lmxLotCode||'NO SELECCIONADO'}${rec.legacyDayException?' · EXCEPCIÓN DE DÍA HISTÓRICA':''}`});await loadLocal();if(historical){f.reset();f.elements.temp35.value='35.0';f.elements.temp44.value='44.5';f.dataset.mode='HISTORICAL';$('#qcHistoricalSelector').hidden=false;f.elements.historicalType.value=type;f.elements.actualDate.max=today();f.elements.actualDate.value=date;qcPopulateExecutionDependencies(type,date,{historical:true});updateQCExecutionPreview();toast(`${rec.code} histórico guardado: ${result}. Puede continuar ingresando el siguiente.`)}else{$('#qcExecutionPanel').hidden=true;toast(`${rec.code} guardado: ${result}. Próxima fecha recalculada desde la fecha real.`)}}
function renderQCHistory(){const h=$('#qcHistoryRows');if(!h)return;h.innerHTML=[...(state.coliformQCControls||[])].sort((a,b)=>(b.actualDate||'').localeCompare(a.actualDate||'')).map(x=>`<tr><td><b>${esc(x.code)}</b>${x.entryMode==='HISTORICAL_INITIAL_LOAD'?`<small class="cycle-summary">HISTÓRICO${x.legacyDayException?' · excepción día':''}</small>`:''}</td><td>${plannerDateLabel(x.actualDate)}</td><td>${pill(x.type)}</td><td>${esc(x.activity)}${x.matrix?`<small class="cycle-summary">${esc(x.matrix)} · ${esc(x.sampleCode||'')}</small>`:''}</td><td>${pill(x.phase)}</td><td>${esc(x.strainName||'N/A')}${x.reactivationCodeTotal&&x.reactivationCodeTotal!==x.reactivationCode?`<small class="cycle-summary">LMX: ${esc(strainById(x.phase==='NEGATIVO'?'strain-sal-14028':'strain-ec-25922')?.name||'')}</small>`:''}</td><td>${esc(x.a1LotCode||(x.type==='Q3'?'NO CONTROLADO':'—'))}<small class="cycle-summary">LMX: ${esc(x.lmxLotCode||(x.type==='Q3'?'NO CONTROLADO':'—'))}</small></td><td>${esc(x.reactivationCode||'—')}${x.reactivationCodeTotal?`<small class="cycle-summary">LMX: ${esc(x.reactivationCodeTotal)}</small>`:''}</td><td>${x.temp35} °C / ${x.hours35} h</td><td>${x.temp44} °C / ${x.hours44} h</td><td>A‑1: ${esc(x.nmpText||(x.nmp??'N/A'))}${x.type==='Q2'?`<small class="cycle-summary">LMX: ${esc(x.lmxNmpText||(x.lmxNmp??x.nmpText??x.nmp??'N/A'))}</small>`:''}</td><td>A-1: ${esc(x.gasObserved||(x.type==='Q3'?'NO CONTROLADO':'—'))} / ${esc(x.growthObserved||(x.type==='Q3'?'NO CONTROLADO':'—'))}<small class="cycle-summary">LMX: crec ${esc(x.lmxGrowthObserved||(x.type==='Q3'?'NO CONTROLADO':'—'))} · color ${esc(x.lmxColorObserved||(x.type==='Q3'?'NO CONTROLADO':'—'))} · fluor ${esc(x.lmxFluorescenceObserved||(x.type==='Q3'?'NO CONTROLADO':'—'))}</small></td><td>${pill(x.result)}</td><td>${esc(x.responsible||'—')}</td></tr>`).join('')||'<tr><td colspan="14">Sin controles Q1/Q2/Q3 registrados todavía.</td></tr>'}
function renderQCReactivationTrace(){const h=$('#qcReactivationRows');if(!h)return;h.innerHTML=[...(state.strainReactivations||[])].filter(r=>r.result==='APTO'&&['strain-ec-25922','strain-ent-29212','strain-sal-14028'].includes(r.strainId)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,30).map(r=>{const used=(state.coliformQCControls||[]).filter(c=>c.reactivationId===r.id);return `<tr><td><b>${esc(r.reactivationCode)}</b></td><td>${plannerDateLabel(r.date)}</td><td>${esc(strainById(r.strainId)?.name||r.strainName)}</td><td>${esc(r.workLot||'—')}</td><td>${pill(qcReactivationStatus(r))}</td><td>${used.map(u=>u.code).join(', ')||'Sin uso QC aún'}</td><td>${plannerDateLabel(qcWeekBounds(r.date).end)}</td></tr>`}).join('')||'<tr><td colspan="7">No existen reactivaciones APTAS de E. coli / E. faecalis / Salmonella.</td></tr>'}


// V2.4.0-C · Flujo de muestras: registro primario → ingreso oficial → análisis → duplicado -R → PKI
function sampleById(id){return state.sampleIntakes.find(x=>x.id===id)}
function analysisBySampleId(id){return state.sampleAnalyses.find(x=>x.sampleId===id)}
function duplicateForSample(s){return s?.duplicateId?sampleById(s.duplicateId):state.sampleIntakes.find(x=>x.parentSampleId===s?.id)}
function originalForSample(s){return s?.parentSampleId?sampleById(s.parentSampleId):s}
function sampleIsOfficial(s){return !!s&&(s.officialStatus==='INGRESADA'||(!('officialStatus' in s)&&!!(s.analysisDatePlanned||s.company||s.receivedBy||s.analystPlanned)))}
function sampleMpnText(a){if(!a)return '—';return a.mpnText||((a.mpn??'')!==''?String(a.mpn):'—')}
function sampleMpnNumeric(a){if(!a)return null;if(Number.isFinite(Number(a.finalResult))&&Number(a.finalResult)>0)return Number(a.finalResult);if(Number.isFinite(Number(a.mpn))&&Number(a.mpn)>0)return Number(a.mpn);const t=String(a.mpnText||'').replace(',','.').replace(/[<>]/g,'');const n=Number(t);return Number.isFinite(n)&&n>0?n:null}
function calcSampleMPN(f){const vals=['pos10','pos1','pos01'].map(n=>Number(f.elements[n]?.value));if(vals.some(v=>!Number.isInteger(v)||v<0||v>5))return null;return MPN_9221_IV[vals.join('-')]||null}
function sampleAnalysisFinalized(s){const a=analysisBySampleId(s?.id);return !!a&&(a.status==='FINALIZADO'||!!a.finalizedAt)}
function sampleAnalysisResultsComplete(s){const a=analysisBySampleId(s?.id);return !!a&&sampleParameters(s).every(p=>!!sampleParamResult(a,p))}
function sampleStatus(s){if(sampleAnalysisFinalized(s))return 'ANÁLISIS FINALIZADO';if(sampleAnalysisResultsComplete(s))return 'RESULTADOS GUARDADOS · PENDIENTE CIERRE';if(analysisBySampleId(s?.id))return 'BORRADOR · PENDIENTE CIERRE';return sampleIsOfficial(s)?'PENDIENTE ANÁLISIS':'PENDIENTE INGRESO OFICIAL'}
function duplicateEvalFor(originalId,param=''){return state.duplicateEvaluations.find(x=>x.originalSampleId===originalId&&(!param||x.parameter===param||(!x.parameter&&param==='Coliformes fecales')))}
function nextDuplicateCode(code){return String(code||'').endsWith('-R')?String(code):`${code}-R`}
function addHoursTime(time,hours){if(!time)return '';const [hh,mm]=time.split(':').map(Number);if(!Number.isFinite(hh)||!Number.isFinite(mm))return '';const mins=(hh*60+mm+Math.round(Number(hours)*60))%(24*60);return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`}
function sampleHistoryValues(field){return [...new Set(state.sampleIntakes.map(s=>String(s?.[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))}
function sampleParameters(s){const raw=Array.isArray(s?.parameters)?s.parameters.filter(Boolean):[s?.parameter||'Coliformes fecales'];return [...new Set(raw.length?raw:['Coliformes fecales'])]}
function sampleParameterLabelList(s){return sampleParameters(s).join(' · ')}
function sampleParamKey(p){return p==='Coliformes fecales'?'fecales':p==='Coliformes totales'?'totales':'ecoli'}
function sampleParamResult(a,p){if(!a)return null;if(a.results&&a.results[p])return a.results[p];const legacyParam=a.parameter||'Coliformes fecales';if(legacyParam===p||(!a.results&&p===legacyParam))return {pos10:a.pos10,pos1:a.pos1,pos01:a.pos01,mpn:a.mpn,mpnText:a.mpnText,factor:a.factor,finalResult:a.finalResult};return null}
function sampleAnalysisComplete(s){return sampleAnalysisFinalized(s)}
function sampleMpnTextFor(a,p){const r=sampleParamResult(a,p);if(!r)return '—';return r.mpnText||((r.mpn??'')!==''?String(r.mpn):'—')}
function sampleMpnNumericFor(a,p){const r=sampleParamResult(a,p);if(!r)return null;if(r.finalResult!==null&&r.finalResult!==undefined&&Number.isFinite(Number(r.finalResult)))return Number(r.finalResult);if(r.mpn!==null&&r.mpn!==undefined&&Number.isFinite(Number(r.mpn)))return Number(r.mpn)*(Number(r.factor)||1);const t=String(r.mpnText||'').replace(',','.').replace(/[^0-9.]/g,'');const n=Number(t);return Number.isFinite(n)?n:null}
function calcSampleMPNValues(pos10,pos1,pos01){const vals=[pos10,pos1,pos01].map(Number);if(vals.some(v=>!Number.isInteger(v)||v<0||v>5))return null;return MPN_9221_IV[vals.join('-')]||null}
function parameterResultCard(p,sampleType=''){const k=sampleParamKey(p),note=p==='Coliformes fecales'?'A-1 Medium':p==='Coliformes totales'?'Fluorocult LMX · coliformes totales':'Fluorocult LMX · E. coli';if(String(sampleType).trim().toLowerCase()==='agua de consumo'){const options='<option value="">Seleccione</option>'+Array.from({length:11},(_,i)=>`<option>${i}</option>`).join('');return `<div class="sample-result-card drinking-water-card" data-param="${esc(p)}"><div class="sample-result-head"><div><b>${esc(p)}</b><span>${esc(note)} · Agua de consumo · 10 tubos × 10 mL</span></div><div class="sample-mpn-badge">NMP/100 mL <strong id="sampleMpnPreview_${k}">—</strong></div></div><div class="sample-drinking-grid"><label>Tubos positivos / 10<select name="${k}_positive10x10">${options}</select></label><div class="sample-readonly-box"><span>Tubos negativos / 10</span><strong id="sampleNegativesPreview_${k}">10</strong></div><div class="sample-readonly-box"><span>IC 95 % inferior</span><strong id="sampleLowerPreview_${k}">—</strong></div><div class="sample-readonly-box"><span>IC 95 % superior</span><strong id="sampleUpperPreview_${k}">3,4</strong></div><div class="sample-final-result"><span>Resultado final</span><strong id="sampleFinalPreview_${k}">—</strong><small>NMP/100 mL · sin factor de dilución</small></div></div></div>`}const options='<option value="">Seleccione</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option>';return `<div class="sample-result-card" data-param="${esc(p)}"><div class="sample-result-head"><div><b>${esc(p)}</b><span>${esc(note)} · Tabla NMP 9221 IV independiente</span></div><div class="sample-mpn-badge">NMP/100 mL <strong id="sampleMpnPreview_${k}">—</strong></div></div><div class="sample-tubes-grid"><label>10 mL<select name="${k}_pos10">${options}</select></label><label>1 mL<select name="${k}_pos1">${options}</select></label><label>0,1 mL<select name="${k}_pos01">${options}</select></label><label>Factor de dilución<input type="number" name="${k}_factor" min="1" step="1" value="1"></label><div class="sample-final-result"><span>Resultado final</span><strong id="sampleFinalPreview_${k}">—</strong><small>NMP/100 mL</small></div></div></div>`}
function fillSampleHistoryDatalist(id,field){const el=$(id);if(el)el.innerHTML=sampleHistoryValues(field).map(v=>`<option value="${esc(v)}"></option>`).join('')}
function renderSampleModule(){
  const intakeBody=$('#sampleIntakeTableBody'),analysisBody=$('#sampleAnalysisTableBody'),dupBody=$('#sampleDuplicateTableBody');if(!intakeBody||!analysisBody||!dupBody)return;
  const samples=[...state.sampleIntakes].sort((a,b)=>String(b.receiptDate||b.createdAt).localeCompare(String(a.receiptDate||a.createdAt))||String(b.code).localeCompare(String(a.code)));
  const intakeForm=$('#sampleIntakeForm');if(intakeForm){if(!intakeForm.elements.receiptDate.value)intakeForm.elements.receiptDate.value=today();if(!intakeForm.elements.storageTemperature.value)intakeForm.elements.storageTemperature.value='<10°C';if(![...intakeForm.querySelectorAll('input[name="parameters"]')].some(x=>x.checked))intakeForm.querySelector('input[name="parameters"][value="Coliformes fecales"]').checked=true}
  fillSampleHistoryDatalist('#sampleCompanyHistory','company');fillSampleHistoryDatalist('#sampleBranchHistory','branch');fillSampleHistoryDatalist('#sampleDescriptionHistory','description');
  const officialForm=$('#sampleOfficialForm');if(officialForm){const editId=officialForm.elements.editId?.value||'',pendingOfficial=samples.filter(s=>!s.parentSampleId&&!sampleIsOfficial(s)),editing=editId?sampleById(editId):null,options=editing&&!pendingOfficial.some(x=>x.id===editing.id)?[editing,...pendingOfficial]:pendingOfficial;const cur=officialForm.elements.sampleId.value;officialForm.elements.sampleId.innerHTML='<option value="">Seleccione muestra pendiente</option>'+options.map(s=>`<option value="${s.id}">${esc(s.code)} · ${esc(s.sampleType||'—')} · ${esc(sampleParameterLabelList(s))} · ${esc(s.receiptDate||'—')}${sampleIsOfficial(s)?' · INGRESADA':''}</option>`).join('');if(cur&&options.some(s=>s.id===cur))officialForm.elements.sampleId.value=cur;else if(editing)officialForm.elements.sampleId.value=editing.id;const personnel='<option value="">Seleccione</option>'+state.catalogPersonnel.map(p=>`<option value="${esc(p.code)}">${esc(p.code)}${p.name&&p.name!==p.code?' · '+esc(p.name):''}</option>`).join('');const analyst=officialForm.elements.analystPlanned,analystCur=analyst.value;analyst.innerHTML=personnel;if(analystCur&&state.catalogPersonnel.some(p=>p.code===analystCur))analyst.value=analystCur;if(!officialForm.elements.analysisDatePlanned.value){const selected=sampleById(officialForm.elements.sampleId.value);officialForm.elements.analysisDatePlanned.value=selected?.receiptDate||''}}
  $('#sampleKpiTotal').textContent=samples.length;$('#sampleKpiPending').textContent=samples.filter(s=>sampleIsOfficial(s)&&!sampleAnalysisFinalized(s)).length;$('#sampleKpiAnalyzed').textContent=samples.filter(sampleAnalysisFinalized).length;$('#sampleKpiDuplicates').textContent=samples.filter(s=>s.parentSampleId).length;
  intakeBody.innerHTML=samples.length?samples.map(s=>{const a=analysisBySampleId(s.id),dup=!s.parentSampleId?duplicateForSample(s):null,official=sampleIsOfficial(s),finalized=sampleAnalysisFinalized(s);return `<tr><td><b>${esc(s.code)}</b>${s.parentSampleId?'<br><small>Duplicado</small>':''}</td><td>${esc(s.sampleType||'—')}</td><td>${sampleParameters(s).map(p=>`<span class="pill">${esc(p)}</span>`).join(' ')}</td><td>${esc(s.receiptDate||'—')} ${esc(s.receiptTime||'')}<br><small>Recibido: ${esc(s.receivedBy||'—')} · ${esc(s.storageTemperature||'—')}</small></td><td>${official?`<span class="pill ok">INGRESADA${s.company?' · '+esc(s.company):''}</span>`:s.parentSampleId?'<span class="pill warn">HEREDADO PENDIENTE</span>':`<button class="small secondary official-sample-btn" data-id="${s.id}">📥 Ingreso oficial</button>`}</td><td><span class="pill ${finalized?'ok':official?'warn':''}">${sampleStatus(s)}</span></td><td>${!s.parentSampleId?dup?`<span class="pill ok">${esc(dup.code)}</span>`:`<button class="small secondary create-duplicate-btn" data-id="${s.id}" ${official?'':'disabled title="Primero realice el ingreso oficial"'}>🔁 Generar duplicado</button>`:'—'}</td><td>${finalized?`<button class="small secondary view-sample-analysis-btn" data-id="${s.id}">🔒 Ver análisis</button>`:`<button class="small secondary edit-sample-intake-btn" data-id="${s.id}">✏️ Editar</button>${!s.parentSampleId&&official?` <button class="small secondary edit-sample-official-btn" data-id="${s.id}">✏️ Editar ingreso</button>`:''}`} <button class="small secondary sample-trace-btn" data-id="${s.id}">📋 Trazabilidad</button></td></tr>`}).join(''):`<tr><td colspan="8" class="muted">No hay muestras registradas.</td></tr>`;
  const pending=samples.filter(s=>sampleIsOfficial(s)&&!sampleAnalysisFinalized(s));
  analysisBody.innerHTML=pending.length?pending.map(s=>`<tr><td><b>${esc(s.code)}</b><br><small>${esc(sampleParameterLabelList(s))}</small></td><td>${esc(s.sampleType||'—')}</td><td>${esc(s.company||'—')}</td><td>${esc(s.branch||'—')}</td><td>${esc(s.description||'—')}</td><td>${esc(s.analysisDatePlanned||s.receiptDate||'—')} ${esc(s.analysisTimePlanned||'')}</td><td>${s.parentSampleId?'<span class="pill warn">DUPLICADO</span>':'<span class="pill">ORIGINAL</span>'}</td><td><button class="small secondary edit-sample-official-btn" data-id="${s.id}">✏️ Editar</button> <button class="small start-sample-analysis-btn" data-id="${s.id}">${analysisBySampleId(s.id)?'🧪 Continuar análisis':'🧪 Ingresar análisis'}</button></td></tr>`).join(''):`<tr><td colspan="8" class="muted">No hay análisis pendientes. Las muestras deben pasar primero por Ingreso oficial.</td></tr>`;
  const pairs=[];samples.filter(s=>!s.parentSampleId&&duplicateForSample(s)).forEach(o=>{const d=duplicateForSample(o);sampleParameters(o).forEach(p=>pairs.push({o,d,p}))});
  dupBody.innerHTML=pairs.length?pairs.map(({o,d,p})=>{const a1=analysisBySampleId(o.id),a2=analysisBySampleId(d.id),r1=sampleParamResult(a1,p),r2=sampleParamResult(a2,p),ev=duplicateEvalFor(o.id,p);return `<tr><td><b>${esc(o.code)}</b></td><td>${esc(d.code)}</td><td><span class="pill">${esc(p)}</span></td><td>${sampleMpnTextFor(a1,p)}</td><td>${sampleMpnTextFor(a2,p)}</td><td>${ev?Number(ev.pki).toFixed(3):'—'}</td><td>${ev?`<span class="pill ${ev.complies?'ok':'bad'}">${esc(ev.classification)} · ${ev.complies?'CUMPLE':'NO CUMPLE'}</span>`:(r1&&r2&&sampleAnalysisFinalized(o)&&sampleAnalysisFinalized(d)?`<button class="small evaluate-duplicate-btn" data-id="${o.id}" data-param="${esc(p)}">Evaluar PKI</button>`:'<span class="pill warn">Pendiente de cierre de ambos análisis</span>')}</td></tr>`}).join(''):`<tr><td colspan="7" class="muted">Aún no hay pares original / duplicado.</td></tr>`;
  bindSampleDynamicButtons();renderSampleConsolidated();
}
function bindSampleDynamicButtons(){
  $$('.official-sample-btn').forEach(b=>b.onclick=()=>openOfficialSample(b.dataset.id));
  $$('.create-duplicate-btn').forEach(b=>b.onclick=()=>createSampleDuplicate(b.dataset.id));
  $$('.start-sample-analysis-btn').forEach(b=>b.onclick=()=>openSampleAnalysis(b.dataset.id));
  $$('.evaluate-duplicate-btn').forEach(b=>b.onclick=()=>evaluateDuplicate(b.dataset.id,b.dataset.param));
  $$('.edit-sample-intake-btn').forEach(b=>b.onclick=()=>editSampleIntake(b.dataset.id));
  $$('.edit-sample-official-btn').forEach(b=>b.onclick=()=>editOfficialSample(b.dataset.id));
  $$('.view-sample-analysis-btn').forEach(b=>b.onclick=()=>openSampleAnalysis(b.dataset.id));
}
function resetSampleIntakeEdit(){const f=$('#sampleIntakeForm');if(!f)return;f.reset();f.elements.editId.value='';f.elements.storageTemperature.value='<10°C';f.elements.receiptDate.value=today();f.querySelectorAll('input[name="parameters"]').forEach(x=>x.checked=x.value==='Coliformes fecales');$('#sampleIntakeSubmitBtn').textContent='Guardar registro de muestra';$('#sampleIntakeCancelEdit').hidden=true;$('#sampleIntakeEditMode').textContent=''}
function editSampleIntake(id){const s=sampleById(id),f=$('#sampleIntakeForm');if(!s||!f)return;f.elements.editId.value=s.id;for(const n of ['code','sampleType','receiptDate','sampleTime','sampler','receiptTime','receivedBy','storageTemperature','observations'])if(f.elements[n])f.elements[n].value=s[n]??'';const pars=sampleParameters(s);f.querySelectorAll('input[name="parameters"]').forEach(x=>x.checked=pars.includes(x.value));$('#sampleIntakeSubmitBtn').textContent='Guardar corrección del registro';$('#sampleIntakeCancelEdit').hidden=false;$('#sampleIntakeEditMode').textContent=`Editando ${s.code} · solo datos de registro/recepción`;f.scrollIntoView({behavior:'smooth',block:'center'})}
function resetOfficialSampleEdit(){const f=$('#sampleOfficialForm');if(!f)return;f.reset();f.elements.editId.value='';f.elements.analysisDatePlanned.value='';$('#sampleOfficialSubmitBtn').textContent='Ingresar oficialmente y enviar a análisis';$('#sampleOfficialCancelEdit').hidden=true;$('#sampleOfficialEditMode').textContent='';renderSampleModule()}
function openOfficialSample(id){const s=sampleById(id),f=$('#sampleOfficialForm');if(!s||!f||sampleIsOfficial(s))return;f.elements.editId.value='';f.elements.sampleId.value=s.id;f.elements.analysisDatePlanned.value=s.receiptDate||'';$('#sampleOfficialSubmitBtn').textContent='Ingresar oficialmente y enviar a análisis';$('#sampleOfficialCancelEdit').hidden=true;$('#sampleOfficialEditMode').textContent='';f.scrollIntoView({behavior:'smooth',block:'center'});toast(`${s.code} seleccionada para ingreso oficial.`)}
function editOfficialSample(id){const s=sampleById(id),f=$('#sampleOfficialForm');if(!s||!f||s.parentSampleId)return;f.elements.editId.value=s.id;renderSampleModule();f.elements.sampleId.value=s.id;for(const n of ['analysisDatePlanned','analysisTimePlanned','analystPlanned','company','branch','description'])if(f.elements[n])f.elements[n].value=s[n]??'';$('#sampleOfficialSubmitBtn').textContent='Guardar corrección del ingreso oficial';$('#sampleOfficialCancelEdit').hidden=false;$('#sampleOfficialEditMode').textContent=`Editando ingreso oficial de ${s.code}`;f.scrollIntoView({behavior:'smooth',block:'center'})}
async function createSampleDuplicate(id){
  const s=sampleById(id);if(!s||s.parentSampleId)return;if(!sampleIsOfficial(s)){toast('Primero realice el ingreso oficial de la muestra.');return}if(duplicateForSample(s)){toast('La muestra ya tiene duplicado.');return}
  const code=nextDuplicateCode(s.code);if(state.sampleIntakes.some(x=>String(x.code).toUpperCase()===code.toUpperCase())){toast(`Ya existe ${code}.`);return}
  const d=await saveLocal('sampleIntakes',{id:crypto.randomUUID(),code,parentSampleId:s.id,isDuplicate:true,sampleType:s.sampleType,parameter:s.parameter,parameters:sampleParameters(s),receiptDate:s.receiptDate,sampleTime:s.sampleTime,sampler:s.sampler,receiptTime:s.receiptTime,storageTemperature:s.storageTemperature,receivedBy:s.receivedBy,analysisDatePlanned:s.analysisDatePlanned,analysisTimePlanned:s.analysisTimePlanned,analystPlanned:s.analystPlanned,company:s.company,branch:s.branch||'',description:s.description,officialStatus:'INGRESADA',officialAt:nowISO(),officialInheritedFrom:s.id,observations:`Duplicado generado automáticamente de ${s.code}`},{render:false});
  await saveLocal('sampleIntakes',{...s,duplicateId:d.id},{render:false});await audit('sampleIntake',s.id,'DUPLICADO GENERADO',{sampleId:s.id,originalSampleId:s.id,duplicateSampleId:d.id,duplicateId:d.id,summary:`${s.code} → ${d.code}`});await loadLocal();toast(`Duplicado ${d.code} generado y enviado a análisis.`)
}
function sampleSetAnalysisLocked(f,locked){
  if(!f)return;f.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=!!locked);
  const save=$('#sampleAnalysisSaveDraft'),finish=$('#sampleAnalysisFinalizeBtn');if(save)save.hidden=!!locked;if(finish)finish.hidden=!!locked;
  const badge=$('#sampleAnalysisLockState');if(badge){badge.hidden=false;badge.className=`sample-analysis-lock ${locked?'locked':'draft'}`;badge.textContent=locked?'🔒 ANÁLISIS FINALIZADO · SOLO LECTURA':'🟡 BORRADOR · PENDIENTE DE CIERRE'}
}
function sampleAnalysisValidation(f,s){
  const missing=[],invalid=[],results={};
  const required=[['analysisDate','Fecha de análisis'],['temp35','Temperatura 35 °C'],['start35','Hora inicial 35 °C'],['end35','Hora final 35 °C'],['temp44','Temperatura 44,5 °C'],['start44','Hora inicial 44,5 °C'],['end44','Hora final 44,5 °C']];
  for(const [name,label] of required)if(!String(f.elements[name]?.value??'').trim())missing.push(label);
  if(!activeUser())missing.push('Analista / usuario activo');
  for(const p of sampleParameters(s)){
    const k=sampleParamKey(p);
    if(isDrinkingWaterSample(s)){
      const raw=String(f.elements[`${k}_positive10x10`]?.value??'').trim();if(raw===''){missing.push(`${p}: tubos positivos / 10`);continue}
      const positives=Number(raw),m=calcDrinkingMPNValues(positives);if(!m){invalid.push(`${p}: positivos deben estar entre 0 y 10`);continue}
      results[p]={scheme:'10x10_10mL',positive10x10:positives,negative10x10:10-positives,mpn:m.num,mpnText:m.text,confidenceLower:m.lower,confidenceUpper:m.upper,factor:1,finalResult:m.num};
    }else{
      const names=[['pos10','10 mL'],['pos1','1 mL'],['pos01','0,1 mL']];let incomplete=false;
      for(const [suffix,label] of names)if(String(f.elements[`${k}_${suffix}`]?.value??'').trim()===''){missing.push(`${p}: tubos ${label}`);incomplete=true}
      const factorRaw=String(f.elements[`${k}_factor`]?.value??'').trim();if(factorRaw===''){missing.push(`${p}: factor de dilución`);incomplete=true}
      if(incomplete)continue;
      const m=calcSampleMPNValues(f.elements[`${k}_pos10`].value,f.elements[`${k}_pos1`].value,f.elements[`${k}_pos01`].value),factor=Number(factorRaw);
      if(!m){invalid.push(`${p}: combinación de tubos no válida`);continue}if(!Number.isFinite(factor)||factor<=0){invalid.push(`${p}: factor de dilución no válido`);continue}
      results[p]={scheme:'5x3_dilutions',pos10:Number(f.elements[`${k}_pos10`].value),pos1:Number(f.elements[`${k}_pos1`].value),pos01:Number(f.elements[`${k}_pos01`].value),mpn:m.num,mpnText:m.text,factor,finalResult:m.num===null?null:m.num*factor};
    }
  }
  return {ok:!missing.length&&!invalid.length,missing,invalid,results}
}
function sampleShowValidation(v){const box=$('#sampleAnalysisValidation');if(!box)return;if(v.ok){box.className='sample-analysis-validation ok';box.innerHTML='<b>✅ Validación completa</b><span>Todos los parámetros, condiciones, fecha, NMP y analista están completos. Puede finalizar el análisis.</span>';return}box.className='sample-analysis-validation bad';box.innerHTML=`<b>⚠️ No se puede finalizar todavía</b>${v.missing.length?`<span><strong>Falta:</strong> ${v.missing.map(esc).join(' · ')}</span>`:''}${v.invalid.length?`<span><strong>Revisar:</strong> ${v.invalid.map(esc).join(' · ')}</span>`:''}`}
function openSampleAnalysis(id){
  const s=sampleById(id);if(!s)return;if(!sampleIsOfficial(s)){toast('La muestra aún no tiene ingreso oficial.');return}const f=$('#sampleAnalysisForm');f.dataset.sampleId=id;$('#sampleAnalysisCode').textContent=s.code;$('#sampleAnalysisOrigin').textContent=s.parentSampleId?`Duplicado de ${originalForSample(s)?.code||'—'}`:`Muestra original · Analista previsto ${s.analystPlanned||'—'}`;const ctx=$('#sampleAnalysisContext');if(ctx)ctx.innerHTML=`<b>${esc(s.company||'—')}${s.branch?' · '+esc(s.branch):''}</b><span>${esc(s.description||'Sin descripción')} · ${esc(sampleParameterLabelList(s))} · Recibido por ${esc(s.receivedBy||'—')} · ${esc(s.storageTemperature||'—')}</span>`;f.elements.analysisDate.value=s.analysisDatePlanned||today();f.elements.start35.value=s.analysisTimePlanned||'';f.elements.end35.value=addHoursTime(f.elements.start35.value,3);f.elements.temp35.value='35.0';f.elements.start44.value=f.elements.end35.value;f.elements.end44.value=addHoursTime(f.elements.start44.value,21);f.elements.temp44.value='44.5';const existing=analysisBySampleId(s.id);f.elements.analysisDate.value=existing?.analysisDate||f.elements.analysisDate.value;f.elements.temp35.value=existing?.temp35??f.elements.temp35.value;f.elements.start35.value=existing?.start35||f.elements.start35.value;f.elements.end35.value=existing?.end35||f.elements.end35.value;f.elements.temp44.value=existing?.temp44??f.elements.temp44.value;f.elements.start44.value=existing?.start44||f.elements.start44.value;f.elements.end44.value=existing?.end44||f.elements.end44.value;f.elements.notes.value=existing?.notes||'';const holder=$('#sampleParameterResults');holder.innerHTML=sampleParameters(s).map(p=>parameterResultCard(p,s.sampleType)).join('');for(const p of sampleParameters(s)){const r=sampleParamResult(existing,p);if(!r)continue;const k=sampleParamKey(p);if(isDrinkingWaterSample(s)){if(f.elements[`${k}_positive10x10`])f.elements[`${k}_positive10x10`].value=String(r.positive10x10??r.pos10??'')}else{for(const [suffix,val] of [['pos10',r.pos10],['pos1',r.pos1],['pos01',r.pos01],['factor',r.factor??1]])if(f.elements[`${k}_${suffix}`]&&val!==undefined&&val!==null)f.elements[`${k}_${suffix}`].value=String(val)}}updateSampleAnalysisPreview();sampleSetAnalysisLocked(f,sampleAnalysisFinalized(s));const validation=$('#sampleAnalysisValidation');if(validation){if(sampleAnalysisFinalized(s)){validation.className='sample-analysis-validation ok';validation.innerHTML=`<b>🔒 Análisis finalizado</b><span>Cerrado por ${esc(existing?.finalizedBy||existing?.analyst||'—')} · ${esc(String(existing?.finalizedAt||'').replace('T',' ').slice(0,16)||'—')}. Los datos están protegidos contra modificaciones accidentales.</span>`}else sampleShowValidation(sampleAnalysisValidation(f,s))}$('#sampleAnalysisPanel').hidden=false;$('#sampleAnalysisPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateSampleAnalysisPreview(){const f=$('#sampleAnalysisForm');if(!f)return;const s=sampleById(f.dataset.sampleId);if(!s)return;for(const p of sampleParameters(s)){const k=sampleParamKey(p),drinking=isDrinkingWaterSample(s);let m=null,finalText='—';if(drinking){const raw=String(f.elements[`${k}_positive10x10`]?.value??'').trim(),positives=raw===''?NaN:Number(raw);m=Number.isInteger(positives)?calcDrinkingMPNValues(positives):null;const neg=$(`#sampleNegativesPreview_${k}`),low=$(`#sampleLowerPreview_${k}`),up=$(`#sampleUpperPreview_${k}`);if(neg)neg.textContent=Number.isInteger(positives)?String(10-positives):'—';if(low)low.textContent=m?.lower||'—';if(up)up.textContent=m?.upper||'—';finalText=m?.text||'—'}else{m=calcSampleMPNValues(f.elements[`${k}_pos10`]?.value,f.elements[`${k}_pos1`]?.value,f.elements[`${k}_pos01`]?.value);const factor=Math.max(1,Number(f.elements[`${k}_factor`]?.value)||1),base=m?.num??null;finalText=base===null?(m?.text||'—'):String(Math.round(base*factor*100)/100).replace('.',',')}const mp=$(`#sampleMpnPreview_${k}`),fin=$(`#sampleFinalPreview_${k}`);if(mp)mp.textContent=m?.text||'—';if(fin)fin.textContent=finalText}if(!sampleAnalysisFinalized(s))sampleShowValidation(sampleAnalysisValidation(f,s))}
async function saveSampleAnalysis(e){e.preventDefault();const f=e.currentTarget,s=sampleById(f.dataset.sampleId);if(!s){toast('Seleccione una muestra pendiente.');return}if(sampleAnalysisFinalized(s)){toast('El análisis está FINALIZADO y protegido.');return}const v=sampleAnalysisValidation(f,s),existing=analysisBySampleId(s.id),mergedResults={...(existing?.results||{}),...v.results};const a=await saveLocal('sampleAnalyses',{...(existing||{}),id:existing?.id||crypto.randomUUID(),sampleId:s.id,sampleCode:s.code,parameters:sampleParameters(s),results:mergedResults,analysisDate:f.elements.analysisDate.value,temp35:String(f.elements.temp35.value).trim()===''?null:Number(f.elements.temp35.value),start35:f.elements.start35.value,end35:f.elements.end35.value,temp44:String(f.elements.temp44.value).trim()===''?null:Number(f.elements.temp44.value),start44:f.elements.start44.value,end44:f.elements.end44.value,analyst:activeUser()||existing?.analyst||'',analystPlanned:s.analystPlanned||'',notes:f.elements.notes.value.trim(),status:'BORRADOR',draftSavedAt:nowISO(),draftSavedBy:activeUser()||existing?.draftSavedBy||''},{render:false});await audit('sampleAnalysis',a.id,'BORRADOR DE ANÁLISIS GUARDADO',{sampleId:s.id,summary:`${s.code} · ${Object.keys(v.results).length}/${sampleParameters(s).length} parámetro(s) completos`,changes:existing?auditChanges(existing,a,[['analysisDate','Fecha análisis'],['temp35','Temperatura 35 °C'],['start35','Inicio 35 °C'],['end35','Fin 35 °C'],['temp44','Temperatura 44,5 °C'],['start44','Inicio 44,5 °C'],['end44','Fin 44,5 °C'],['notes','Observaciones']]):[]});await loadLocal();openSampleAnalysis(s.id);toast(`Borrador ${s.code} guardado. ${v.ok?'Listo para finalizar.':'Revise los campos pendientes antes de finalizar.'}`)}
async function finalizeSampleAnalysis(){const f=$('#sampleAnalysisForm'),s=sampleById(f?.dataset.sampleId);if(!f||!s)return;if(sampleAnalysisFinalized(s)){toast('El análisis ya está FINALIZADO.');return}const v=sampleAnalysisValidation(f,s);sampleShowValidation(v);if(!v.ok){toast('No se puede finalizar: revise los campos indicados.');return}const existing=analysisBySampleId(s.id),a=await saveLocal('sampleAnalyses',{...(existing||{}),id:existing?.id||crypto.randomUUID(),sampleId:s.id,sampleCode:s.code,parameters:sampleParameters(s),results:v.results,analysisDate:f.elements.analysisDate.value,temp35:Number(f.elements.temp35.value),start35:f.elements.start35.value,end35:f.elements.end35.value,temp44:Number(f.elements.temp44.value),start44:f.elements.start44.value,end44:f.elements.end44.value,analyst:activeUser(),analystPlanned:s.analystPlanned||'',notes:f.elements.notes.value.trim(),status:'FINALIZADO',finalizedAt:nowISO(),finalizedBy:activeUser(),locked:true},{render:false});await audit('sampleAnalysis',a.id,'ANÁLISIS FINALIZADO Y BLOQUEADO',{sampleId:s.id,summary:`${s.code} · ${sampleParameterLabelList(s)} · cierre ${activeUser()}`});$('#sampleAnalysisPanel').hidden=true;await loadLocal();toast(`🔒 ${s.code}: ANÁLISIS FINALIZADO y protegido.`)}
async function evaluateDuplicate(originalId,param){const o=sampleById(originalId),d=duplicateForSample(o),a1=analysisBySampleId(o?.id),a2=analysisBySampleId(d?.id);if(!o||!d||!a1||!a2){toast('Se requieren los dos resultados antes de evaluar.');return}if(!sampleAnalysisFinalized(o)||!sampleAnalysisFinalized(d)){toast('Primero finalice y cierre los análisis original y duplicado.');return}if(duplicateEvalFor(o.id,param)){toast(`El duplicado de ${param} ya fue evaluado.`);return}const v1=sampleMpnNumericFor(a1,param),v2=sampleMpnNumericFor(a2,param);if(!v1||!v2){toast('El PKI requiere dos resultados numéricos mayores que cero.');return}const log1=Math.log10(v1),log2=Math.log10(v2),pki=Math.abs(log1-log2),classification=pki<0.15?'Excelente':pki<0.30?'Aceptable':'Rechazado',complies=pki<0.30;const ev=await saveLocal('duplicateEvaluations',{id:crypto.randomUUID(),originalSampleId:o.id,originalCode:o.code,duplicateSampleId:d.id,duplicateCode:d.code,parameter:param,value1:v1,value2:v2,log1,log2,pki,classification,complies,criterion:'PKI < 0.30',evaluatedAt:nowISO(),responsible:activeUser()},{render:false});await audit('duplicateEvaluation',ev.id,'DUPLICADO EVALUADO POR PARÁMETRO',{originalSampleId:o.id,duplicateSampleId:d.id,sampleId:o.id,summary:`${o.code}/${d.code} · ${param} · PKI ${pki.toFixed(3)} · ${classification}`});await loadLocal();toast(`${param}: PKI ${pki.toFixed(3)} · ${classification} · ${complies?'CUMPLE':'NO CUMPLE'}`)}

function sampleConsolidatedFilterState(){
  const month=$('#sampleConsolidatedMonth')?.value||'',year=$('#sampleConsolidatedYear')?.value||'',type=$('#sampleConsolidatedType')?.value||'',company=$('#sampleConsolidatedCompany')?.value||'';
  return {month,year,type,company}
}
function sampleConsolidatedRows(){
  const f=sampleConsolidatedFilterState(),out=[];for(const s of state.sampleIntakes){const d=String(s.receiptDate||s.analysisDatePlanned||'');if(f.year&&d.slice(0,4)!==f.year)continue;if(f.month&&d.slice(5,7)!==f.month)continue;if(f.type&&s.sampleType!==f.type)continue;if(f.company&&s.company!==f.company)continue;for(const parameter of sampleParameters(s))out.push({s,parameter})}return out.sort((a,b)=>String(b.s.receiptDate||'').localeCompare(String(a.s.receiptDate||''))||String(b.s.code||'').localeCompare(String(a.s.code||''))||a.parameter.localeCompare(b.parameter,'es'))
}
function sampleResultDisplayParam(a,p){const n=sampleMpnNumericFor(a,p);if(n===null)return sampleMpnTextFor(a,p);return String(Math.round(n*100)/100).replace('.',',')}
function sampleUnder18Param(a,p){const r=sampleParamResult(a,p);if(!r)return false;const t=String(r.mpnText||'').replace(/\s/g,'').replace(',','.');if(t.startsWith('<')){const n=Number(t.slice(1));return Number.isFinite(n)&&n<=1.8}const n=sampleMpnNumericFor(a,p);return n!==null&&n<1.8}
function sampleBarHtml(label,count,total,kind=''){const pct=total?Math.round(count/total*100):0;return `<div class="sample-bar-row"><span>${esc(label)}</span><div class="sample-bar-track"><div class="sample-bar-fill ${kind}" style="width:${pct}%"></div></div><b>${count}</b></div>`}
function setupSampleConsolidatedFilters(){const month=$('#sampleConsolidatedMonth'),year=$('#sampleConsolidatedYear'),company=$('#sampleConsolidatedCompany');if(!month||!year||!company)return;if(!month.dataset.ready){month.innerHTML='<option value="">Todos</option>'+Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][i]}</option>`).join('');month.dataset.ready='1'}const years=[...new Set(state.sampleIntakes.map(s=>String(s.receiptDate||'').slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));const ycur=year.value;year.innerHTML='<option value="">Todos</option>'+years.map(y=>`<option>${esc(y)}</option>`).join('');if(ycur&&years.includes(ycur))year.value=ycur;const companies=sampleHistoryValues('company');const ccur=company.value;company.innerHTML='<option value="">Todas</option>'+companies.map(c=>`<option>${esc(c)}</option>`).join('');if(ccur&&companies.includes(ccur))company.value=ccur}
function renderSampleConsolidated(){
  const body=$('#sampleConsolidatedTableBody');if(!body)return;setupSampleConsolidatedFilters();const rows=sampleConsolidatedRows(),sampleIds=[...new Set(rows.map(x=>x.s.id))],samples=sampleIds.map(sampleById).filter(Boolean),originals=samples.filter(s=>!s.parentSampleId),dups=samples.filter(s=>s.parentSampleId),resultRows=rows.filter(({s,parameter})=>!!sampleParamResult(analysisBySampleId(s.id),parameter)),pendingRows=rows.filter(({s,parameter})=>sampleIsOfficial(s)&&!sampleParamResult(analysisBySampleId(s.id),parameter));
  const evals=[];for(const o of originals)for(const p of sampleParameters(o)){const ev=duplicateEvalFor(o.id,p);if(ev)evals.push(ev)}const compliant=evals.filter(e=>e.complies),excellent=evals.filter(e=>e.classification==='Excelente').length,acceptable=evals.filter(e=>e.classification==='Aceptable').length,rejected=evals.filter(e=>e.classification==='Rechazado').length;const nums=resultRows.map(({s,parameter})=>sampleMpnNumericFor(analysisBySampleId(s.id),parameter)).filter(n=>n!==null&&Number.isFinite(n)),avg=nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null,max=nums.length?Math.max(...nums):null;
  $('#sampleDashOriginals').textContent=originals.length;$('#sampleDashAnalyzed').textContent=resultRows.length;$('#sampleDashPending').textContent=pendingRows.length;$('#sampleDashDuplicates').textContent=dups.length;$('#sampleDashDupEvaluated').textContent=evals.length;$('#sampleDashCompliance').textContent=evals.length?`${Math.round(compliant.length/evals.length*100)}%`:'—';$('#sampleDashUnder18').textContent=resultRows.filter(({s,parameter})=>sampleUnder18Param(analysisBySampleId(s.id),parameter)).length;$('#sampleDashOver200').textContent=resultRows.filter(({s,parameter})=>(sampleMpnNumericFor(analysisBySampleId(s.id),parameter)||0)>200).length;$('#sampleDashAverage').textContent=avg===null?'—':String(Math.round(avg*100)/100).replace('.',',');$('#sampleDashMax').textContent=max===null?'—':String(Math.round(max*100)/100).replace('.',',');
  const status=$('#sampleDashStatusBars');if(status)status.innerHTML=sampleBarHtml('Resultados listos',resultRows.length,rows.length)+sampleBarHtml('Pendientes',pendingRows.length,rows.length,'warn')+sampleBarHtml('Sin ingreso oficial',rows.filter(({s})=>!sampleIsOfficial(s)).length,rows.length,'bad');const dupbars=$('#sampleDashDuplicateBars');if(dupbars)dupbars.innerHTML=sampleBarHtml('Excelente',excellent,evals.length)+sampleBarHtml('Aceptable',acceptable,evals.length,'warn')+sampleBarHtml('Rechazado',rejected,evals.length,'bad');
  body.innerHTML=rows.length?rows.map(({s,parameter})=>{const a=analysisBySampleId(s.id),r=sampleParamResult(a,parameter),o=originalForSample(s),ev=o?duplicateEvalFor(o.id,parameter):null;return `<tr><td><b>${esc(s.code)}</b></td><td>${s.parentSampleId?'DUPLICADO':'ORIGINAL'}</td><td>${esc(s.sampleType||'—')}</td><td><span class="pill">${esc(parameter)}</span></td><td>${esc(s.company||'—')}</td><td>${esc(s.branch||'—')}</td><td>${esc(s.description||'—')}</td><td>${esc(s.receiptDate||'—')} ${esc(s.receiptTime||'')}</td><td>${r?esc(a.analysisDate||'—'):'—'}</td><td>${r?esc(a.analyst||a.analystPlanned||'—'):esc(s.analystPlanned||'—')}</td><td>${r?esc(r.scheme==='10x10_10mL'?'10 tubos × 10 mL':'5-5-5 · 10/1/0,1 mL'):'—'}</td><td>${r?esc(r.scheme==='10x10_10mL'?`${r.positive10x10}/10 positivos`:r.pos10):'—'}</td><td>${r?esc(r.scheme==='10x10_10mL'?'—':r.pos1):'—'}</td><td>${r?esc(r.scheme==='10x10_10mL'?'—':r.pos01):'—'}</td><td>${r?esc(sampleMpnTextFor(a,parameter)):'—'}</td><td>${r?esc(r.factor??1):'—'}</td><td><b>${r?esc(sampleResultDisplayParam(a,parameter)):'—'}</b></td><td>${ev?`<span class="pill ${ev.complies?'ok':'bad'}">${Number(ev.pki).toFixed(3)} · ${esc(ev.classification)}</span>`:((s.parentSampleId||duplicateForSample(s))?'<span class="pill warn">Pendiente PKI</span>':'—')}</td><td><span class="pill ${sampleAnalysisFinalized(s)?'ok':r?'warn':sampleIsOfficial(s)?'warn':''}">${sampleAnalysisFinalized(s)?'FINALIZADO':r?'BORRADOR':'PENDIENTE'}</span></td></tr>`}).join(''):`<tr><td colspan="19" class="muted">No hay registros para el filtro seleccionado.</td></tr>`
}
function exportSampleConsolidatedExcel(parameterFilter=''){
  const rows=sampleConsolidatedRows().filter(x=>!parameterFilter||x.parameter===parameterFilter);
  if(!rows.length){toast('No hay registros para exportar.');return}
  const f=sampleConsolidatedFilterState(),escHtml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const reportRows=rows.map(({s,parameter})=>{
    const a=analysisBySampleId(s.id),r=sampleParamResult(a,parameter),o=originalForSample(s),ev=o?duplicateEvalFor(o.id,parameter):null,drinking=r?.scheme==='10x10_10mL';
    return {
      code:s.code||'',origin:s.parentSampleId?'DUPLICADO':'ORIGINAL',sampleType:s.sampleType||'',parameter,company:s.company||'',branch:s.branch||'',description:s.description||'',receiptDate:s.receiptDate||'',receiptTime:s.receiptTime||'',receivedBy:s.receivedBy||'',storageTemperature:s.storageTemperature||'',plannedDate:s.analysisDatePlanned||'',plannedTime:s.analysisTimePlanned||'',plannedAnalyst:s.analystPlanned||'',analysisDate:r?a?.analysisDate||'':'',analyst:r?a?.analyst||'':'',temp35:a?.temp35??'',start35:a?.start35||'',end35:a?.end35||'',temp44:a?.temp44??'',start44:a?.start44||'',end44:a?.end44||'',scheme:r?(drinking?'10 tubos × 10 mL':'5-5-5 · 10/1/0,1 mL'):'',positive10:drinking?r?.positive10x10??'':r?.pos10??'',negative10:drinking?r?.negative10x10??'':'',pos1:drinking?'':r?.pos1??'',pos01:drinking?'':r?.pos01??'',mpnBase:r?.mpnText||'',ciLower:drinking?r?.confidenceLower||'':'',ciUpper:drinking?r?.confidenceUpper||'':'',factor:r?.factor??'',finalResult:r?sampleResultDisplayParam(a,parameter):'',pki:ev?Number(ev.pki).toFixed(3):'',classification:ev?.classification||'',compliance:ev?(ev.complies?'CUMPLE':'NO CUMPLE'):'',notes:a?.notes||'',status:sampleAnalysisFinalized(s)?'FINALIZADO':r?'BORRADOR · PENDIENTE CIERRE':sampleIsOfficial(s)?'PENDIENTE':'PENDIENTE INGRESO',finalizedBy:a?.finalizedBy||'',finalizedAt:a?.finalizedAt?String(a.finalizedAt).replace('T',' ').slice(0,16):''
    }
  });
  const headers=['Código','Origen','Tipo de muestra','Parámetro','Empresa','Sucursal','Descripción','Fecha recepción','Hora recepción','Recibido por','Temperatura almacenamiento','Fecha prevista','Hora prevista','Analista previsto','Fecha análisis','Analista real','Temp. 35 °C','Inicio 35 °C','Fin 35 °C','Temp. 44,5 °C','Inicio 44,5 °C','Fin 44,5 °C','Esquema NMP','Positivos 10 mL / positivos de 10','Negativos de 10','Tubos 1 mL','Tubos 0,1 mL','NMP base','IC 95 % inferior','IC 95 % superior','Factor','Resultado final NMP/100 mL','PKI','Clasificación','Cumplimiento','Observaciones del análisis','Estado','Cerrado por','Fecha/hora cierre'];
  const keys=['code','origin','sampleType','parameter','company','branch','description','receiptDate','receiptTime','receivedBy','storageTemperature','plannedDate','plannedTime','plannedAnalyst','analysisDate','analyst','temp35','start35','end35','temp44','start44','end44','scheme','positive10','negative10','pos1','pos01','mpnBase','ciLower','ciUpper','factor','finalResult','pki','classification','compliance','notes','status','finalizedBy','finalizedAt'];
  const originals=new Set(reportRows.filter(x=>x.origin==='ORIGINAL').map(x=>x.code)).size,duplicates=new Set(reportRows.filter(x=>x.origin==='DUPLICADO').map(x=>x.code)).size,finalized=reportRows.filter(x=>x.status==='FINALIZADO').length,evaluated=reportRows.filter(x=>x.pki!=='').length,compliant=reportRows.filter(x=>x.compliance==='CUMPLE').length,compliancePct=evaluated?Math.round(compliant/evaluated*1000)/10:0;
  const title=parameterFilter?`MICROBIOLOGÍA ERP · ${parameterFilter.toUpperCase()}`:'MICROBIOLOGÍA ERP · CONSOLIDADO MICROBIOLÓGICO COMPLETO';
  const monthNames={'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
  const filterText=`Período: ${f.month?(monthNames[f.month]||f.month):'Todos los meses'} ${f.year||'Todos los años'} · Tipo: ${f.type||'Todos'} · Empresa: ${f.company||'Todas'}`;
  const generated=new Date().toLocaleString('es-EC');
  const groupRow=`<tr class="groups"><th colspan="16">IDENTIFICACIÓN Y RECEPCIÓN</th><th colspan="6">CONDICIONES DE ANÁLISIS</th><th colspan="10">RESULTADO NMP</th><th colspan="3">DUPLICADO / PKI</th><th colspan="4">CIERRE Y TRAZABILIDAD</th></tr>`;
  const dataRows=reportRows.map((row,i)=>`<tr class="${i%2?'alt':''}">${keys.map((k,idx)=>{const v=row[k];let cls='';if(k==='status')cls=row.status==='FINALIZADO'?'state-ok':'state-warn';if(k==='compliance')cls=row.compliance==='CUMPLE'?'state-ok':row.compliance==='NO CUMPLE'?'state-bad':'';if(k==='classification')cls=row.classification==='Excelente'?'state-ok':row.classification==='Aceptable'?'state-warn':row.classification==='Rechazado'?'state-bad':'';return `<td class="${cls}"${[7,11,14].includes(idx)?' style="mso-number-format:\\@"':''}>${escHtml(v)}</td>`}).join('')}</tr>`).join('');
  const html=`<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Resultados</x:Name><x:WorksheetOptions><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>7</x:SplitHorizontal><x:TopRowBottomPane>7</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane><x:ProtectContents>False</x:ProtectContents></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><style>
  body{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#1f2937}.title{background:#173f36;color:white;font-size:18pt;font-weight:700;height:34px}.subtitle{background:#e8f1ee;font-size:11pt;font-weight:700}.meta{background:#f5f7f6;color:#374151}.kpi-label{background:#eef4f2;font-weight:700;text-align:center}.kpi-value{background:#ffffff;font-size:14pt;font-weight:700;text-align:center}.groups th{background:#315f53;color:white;font-weight:700;text-align:center;border:1px solid #d1d5db}.headers th{background:#dcebe6;color:#173f36;font-weight:700;border:1px solid #aabbb5;text-align:center;vertical-align:middle;white-space:normal}td{border:1px solid #d7ddda;padding:4px;vertical-align:top;white-space:normal}.alt td{background:#f9fbfa}.state-ok{background:#dcfce7!important;color:#166534;font-weight:700}.state-warn{background:#fef3c7!important;color:#92400e;font-weight:700}.state-bad{background:#fee2e2!important;color:#991b1b;font-weight:700}.foot{font-size:9pt;color:#6b7280;font-style:italic;background:#f8faf9}</style></head><body><table border="0" cellspacing="0" cellpadding="4">
  <tr><th colspan="${headers.length}" class="title">${escHtml(title)}</th></tr>
  <tr><td colspan="${headers.length}" class="subtitle">Reporte profesional de resultados microbiológicos · ${escHtml(VERSION)}</td></tr>
  <tr><td colspan="${headers.length}" class="meta"><b>Filtros:</b> ${escHtml(filterText)}</td></tr>
  <tr><td colspan="${headers.length}" class="meta"><b>Generado:</b> ${escHtml(generated)} · <b>Usuario:</b> ${escHtml(activeUser()||'—')}</td></tr>
  <tr>${[['Muestras originales',originals],['Duplicados',duplicates],['Filas finalizadas',finalized],['PKI evaluados',evaluated],['Cumplimiento duplicados',`${compliancePct}%`]].map(([l,v])=>`<td colspan="${Math.max(1,Math.floor(headers.length/5))}" class="kpi-label">${escHtml(l)}<br><span class="kpi-value">${escHtml(v)}</span></td>`).join('')}<td colspan="${headers.length-(Math.max(1,Math.floor(headers.length/5))*5)}"></td></tr>
  ${groupRow}
  <tr class="headers">${headers.map(h=>`<th>${escHtml(h)}</th>`).join('')}</tr>
  ${dataRows}
  <tr><td colspan="${headers.length}" class="foot">Documento generado automáticamente por MICROBIOLOGÍA ERP. Los resultados FINALIZADOS corresponden a análisis cerrados y protegidos en el sistema; la trazabilidad completa permanece disponible en el módulo de Auditoría.</td></tr>
  </table></body></html>`;
  const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;const tag=parameterFilter?sampleParamKey(parameterFilter).toUpperCase():'COMPLETO';a.download=`MICROBIOLOGIA_REPORTE_${tag}_${today()}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${rows.length} resultado(s) exportados en reporte Excel profesional`)
}
function bindSampleModule(){
  const intake=$('#sampleIntakeForm'),official=$('#sampleOfficialForm'),analysis=$('#sampleAnalysisForm');if(!intake||intake.dataset.bound)return;intake.dataset.bound='1';
  intake.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,editId=f.elements.editId.value,old=editId?sampleById(editId):null,code=f.elements.code.value.trim();if(!code){toast('Ingrese el código de muestra.');return}if(state.sampleIntakes.some(x=>x.id!==editId&&String(x.code).toUpperCase()===code.toUpperCase())){toast('Ese código ya existe.');return}const parameters=[...f.querySelectorAll('input[name="parameters"]:checked')].map(x=>x.value);if(!parameters.length){toast('Seleccione al menos un parámetro.');return}const payload={...(old||{}),id:old?.id||crypto.randomUUID(),code,sampleType:f.elements.sampleType.value,parameter:parameters[0],parameters,receiptDate:f.elements.receiptDate.value,sampleTime:f.elements.sampleTime.value,sampler:f.elements.sampler.value,receiptTime:f.elements.receiptTime.value,receivedBy:f.elements.receivedBy.value,storageTemperature:f.elements.storageTemperature.value,observations:f.elements.observations.value.trim(),officialStatus:old?.officialStatus||'PENDIENTE',isDuplicate:old?.isDuplicate||false,parentSampleId:old?.parentSampleId||'',duplicateId:old?.duplicateId||''};const saved=await saveLocal('sampleIntakes',payload,{render:false});if(old&&!old.parentSampleId){const dup=duplicateForSample(old);if(dup){const newDupCode=nextDuplicateCode(code);if(!state.sampleIntakes.some(x=>x.id!==dup.id&&String(x.code).toUpperCase()===newDupCode.toUpperCase()))await saveLocal('sampleIntakes',{...dup,code:newDupCode,sampleType:saved.sampleType,parameter:saved.parameter,parameters:sampleParameters(saved),receiptDate:saved.receiptDate,sampleTime:saved.sampleTime,sampler:saved.sampler,receiptTime:saved.receiptTime,receivedBy:saved.receivedBy,storageTemperature:saved.storageTemperature},{render:false})}}await audit('sampleIntake',saved.id,old?'REGISTRO DE MUESTRA CORREGIDO':'MUESTRA REGISTRADA',{sampleId:saved.id,summary:`${saved.code} · ${saved.sampleType} · toma ${saved.sampler} · recibido ${saved.receivedBy}`,changes:old?auditChanges(old,saved,[['code','Código'],['sampleType','Tipo de muestra'],['parameters','Parámetros'],['receiptDate','Fecha de ingreso'],['sampleTime','Hora de toma'],['sampler','Iniciales de toma'],['receiptTime','Hora de recepción'],['receivedBy','Recibido por'],['storageTemperature','Temperatura almacenamiento'],['observations','Observaciones']]):[]});resetSampleIntakeEdit();await loadLocal();toast(old?`${saved.code} corregida correctamente.`:`${saved.code} registrada. Pendiente de ingreso oficial.`)});
  official?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,editId=f.elements.editId.value,s=sampleById(editId||f.elements.sampleId.value);if(!s){toast('Seleccione una muestra.');return}if(sampleIsOfficial(s)&&!editId){toast('La muestra ya tiene ingreso oficial. Use Editar ingreso oficial.');return}const wasOfficial=sampleIsOfficial(s),updated=await saveLocal('sampleIntakes',{...s,analysisDatePlanned:f.elements.analysisDatePlanned.value,analysisTimePlanned:f.elements.analysisTimePlanned.value,analystPlanned:f.elements.analystPlanned.value,company:f.elements.company.value.trim(),branch:f.elements.branch.value.trim(),description:f.elements.description.value.trim(),officialStatus:'INGRESADA',officialAt:s.officialAt||nowISO(),officialBy:s.officialBy||activeUser(),officialUpdatedAt:editId?nowISO():s.officialUpdatedAt||''},{render:false});const dup=!s.parentSampleId?duplicateForSample(s):null;if(dup)await saveLocal('sampleIntakes',{...dup,analysisDatePlanned:updated.analysisDatePlanned,analysisTimePlanned:updated.analysisTimePlanned,analystPlanned:updated.analystPlanned,company:updated.company,branch:updated.branch,description:updated.description},{render:false});await audit('sampleIntake',updated.id,wasOfficial?'INGRESO OFICIAL CORREGIDO':'INGRESO OFICIAL DE MUESTRA',{sampleId:updated.id,summary:`${updated.code} · ${updated.company}${updated.branch?' / '+updated.branch:''} · ${updated.analysisDatePlanned} ${updated.analysisTimePlanned} · analista ${updated.analystPlanned}`,changes:wasOfficial?auditChanges(s,updated,[['analysisDatePlanned','Fecha prevista'],['analysisTimePlanned','Hora prevista'],['analystPlanned','Analista previsto'],['company','Empresa'],['branch','Sucursal'],['description','Descripción']]):[]});f.reset();f.elements.editId.value='';await loadLocal();toast(wasOfficial?`${updated.code}: ingreso oficial corregido.`:`${updated.code} ingresada oficialmente y enviada a análisis.`)});
  if(official){const autofill=()=>{const company=official.elements.company.value.trim().toLowerCase(),branch=official.elements.branch.value.trim().toLowerCase();const matches=[...state.sampleIntakes].filter(x=>x.company&&String(x.company).trim().toLowerCase()===company&&(!branch||String(x.branch||'').trim().toLowerCase()===branch)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));const last=matches[0];if(!last)return;if(!official.elements.branch.value&&last.branch)official.elements.branch.value=last.branch;if(!official.elements.description.value&&last.description)official.elements.description.value=last.description};official.elements.company.addEventListener('change',autofill);official.elements.branch.addEventListener('change',autofill);official.elements.sampleId.addEventListener('change',()=>{if(official.elements.editId.value)return;const s=sampleById(official.elements.sampleId.value);official.elements.analysisDatePlanned.value=s?.receiptDate||''})}
  $('#sampleIntakeCancelEdit')?.addEventListener('click',resetSampleIntakeEdit);$('#sampleOfficialCancelEdit')?.addEventListener('click',resetOfficialSampleEdit);document.addEventListener('click',e=>{const b=e.target.closest?.('.sample-trace-btn');if(b)showSampleTrace(b.dataset.id)});$('#closeSampleTraceModal')?.addEventListener('click',()=>{$('#sampleTraceModal')?.classList.remove('open');$('#sampleTraceModal')?.setAttribute('aria-hidden','true')});$('#sampleTraceModal')?.addEventListener('click',e=>{if(e.target?.id==='sampleTraceModal'){$('#sampleTraceModal').classList.remove('open');$('#sampleTraceModal').setAttribute('aria-hidden','true')}});
  analysis.addEventListener('submit',saveSampleAnalysis);$('#sampleAnalysisFinalizeBtn')?.addEventListener('click',finalizeSampleAnalysis);analysis.addEventListener('input',e=>{if(/_(pos10|pos1|pos01|factor|positive10x10)$/.test(e.target.name||''))updateSampleAnalysisPreview()});$('#closeSampleAnalysis').onclick=()=>{$('#sampleAnalysisPanel').hidden=true};
  $('#sampleConsolidatedApply')?.addEventListener('click',renderSampleConsolidated);$('#sampleConsolidatedReset')?.addEventListener('click',()=>{for(const id of ['sampleConsolidatedMonth','sampleConsolidatedYear','sampleConsolidatedType','sampleConsolidatedCompany'])if($('#'+id))$('#'+id).value='';renderSampleConsolidated()});$$('.sample-export-param').forEach(b=>b.addEventListener('click',()=>exportSampleConsolidatedExcel(b.dataset.param||'')));
}



// ===== V3.1.0-A · CONTROL DE EQUIPOS · AUTOCLAVES =====
const DEFAULT_EQUIPMENT_CATALOG=[
 {id:'eq-autoclave-sterilization',code:'AUT-EST',name:'Autoclave de Esterilización',equipmentType:'AUTOCLAVE',useType:'ESTERILIZACION',status:'ACTIVO',attestFrequencyLoads:60,attestAlertLoads:5,sterikonFrequencyMonths:2,sterikonAlertDays:7,tempMin:121,tempMax:134,minCycleMinutes:15,cleaningFrequencyDays:7,cycleOptions:['Medios preparados','Materiales']},
 {id:'eq-autoclave-decontamination',code:'AUT-DES',name:'Autoclave de Descontaminación',equipmentType:'AUTOCLAVE',useType:'DESCONTAMINACION',status:'ACTIVO',attestFrequencyLoads:30,attestAlertLoads:5,sterikonFrequencyMonths:2,sterikonAlertDays:7,tempMin:121,tempMax:134,minCycleMinutes:15,cleaningFrequencyDays:7,cycleOptions:['Descontaminación']}
];
function equipmentById(id){return state.equipmentCatalog.find(x=>x.id===id)}
function equipmentControlsFor(id){return state.equipmentControls.filter(x=>x.equipmentId===id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')))}
function equipmentLastAttest(id){return equipmentControlsFor(id).find(x=>x.attestPerformed==='SI'&&x.attestResult)}
function equipmentLoadsSinceAttest(id){
  const eq=equipmentById(id),freq=Number(eq?.attestFrequencyLoads||0);
  const rows=[...state.equipmentControls].filter(x=>x.equipmentId===id).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  let count=0;
  for(const r of rows){
    count+=Number(r.loads||0);
    if(freq>0&&r.attestPerformed==='SI'&&r.attestResult&&count>=freq)count=0;
  }
  return count;
}
function addMonthsEquipment(dateStr,months){if(!dateStr)return '';const d=new Date(dateStr+'T12:00:00');d.setMonth(d.getMonth()+Number(months||0));return d.toISOString().slice(0,10)}
function equipmentLastSterikon(id){return equipmentControlsFor(id).find(x=>x.sterikonPerformed==='SI'&&x.sterikonResult)}
function equipmentAttestState(eq){
  const loads=equipmentLoadsSinceAttest(eq.id),freq=Number(eq.attestFrequencyLoads||0),alert=Number(eq.attestAlertLoads||0);
  if(!freq)return {status:'SIN CONFIGURAR',loads,remaining:null};
  const remaining=freq-loads;
  if(remaining<=0)return {status:'VENCIDO',loads,remaining};
  if(remaining<=alert)return {status:'PRÓXIMO',loads,remaining};
  return {status:'OK',loads,remaining};
}
function equipmentSterikonState(eq){
  const last=equipmentLastSterikon(eq.id),freq=Number(eq.sterikonFrequencyMonths||0);
  if(!last)return {status:'PENDIENTE INICIAL',lastDate:'',nextDate:'',days:null};
  const next=addMonthsEquipment(last.date,freq),days=daysBetween(today(),next);
  if(days<0)return {status:'VENCIDO',lastDate:last.date,nextDate:next,days};
  if(days<=Number(eq.sterikonAlertDays||7))return {status:'PRÓXIMO',lastDate:last.date,nextDate:next,days};
  return {status:'OK',lastDate:last.date,nextDate:next,days};
}
const CLEANING_MASTER_PLAN=[
{id:'area-floor-micro',name:'Piso · Área Microbiología',kind:'AREA',frequency:'DAILY_WORKDAY',frequencyLabel:'Diaria',record:'PG0418',agent:'Agente definido en procedimiento',extraordinary:true},
{id:'area-surfaces-micro',name:'Superficies de trabajo · Microbiología',kind:'AREA',frequency:'DAILY_WORKDAY',frequencyLabel:'Inicio / fin de jornada',record:'PG0418',agent:'Alcohol 70% / hipoclorito según procedimiento',extraordinary:true},
{id:'eq-autoclave-sterilization',name:'Autoclave de Esterilización',kind:'EQUIPO',frequency:'WEEKLY',frequencyLabel:'Semanal',record:'PG0419',agent:'Alcohol 70%',extraordinary:true},
{id:'eq-autoclave-decontamination',name:'Autoclave de Descontaminación',kind:'EQUIPO',frequency:'WEEKLY',frequencyLabel:'Semanal',record:'PG0419',agent:'Alcohol 70%',extraordinary:true},
{id:'clean-incubator',name:'Incubadora',kind:'EQUIPO',frequency:'MONTHLY',frequencyLabel:'Mensual + extraordinaria si aplica',record:'PG0420',agent:'Paño húmedo + papel desechable + agente desinfectante',extraordinary:true},
{id:'clean-sterilizer',name:'Esterilizador',kind:'EQUIPO',frequency:'MONTHLY',frequencyLabel:'Mensual + extraordinaria si aplica',record:'PG0420',agent:'Paño húmedo + papel desechable + agente desinfectante',extraordinary:true},
{id:'clean-fridge-ei61',name:'Nevera EI-61',kind:'EQUIPO',frequency:'MONTHLY',frequencyLabel:'Mensual + extraordinaria si aplica',record:'PG0420',agent:'Paño húmedo + papel desechable + agente desinfectante',extraordinary:true},
{id:'clean-fridge-ei344',name:'Nevera 2 EI-344',kind:'EQUIPO',frequency:'MONTHLY',frequencyLabel:'Mensual + extraordinaria si aplica',record:'PG0420',agent:'Paño húmedo + papel desechable + agente desinfectante',extraordinary:true},
{id:'clean-freezer',name:'Congelador',kind:'EQUIPO',frequency:'MONTHLY',frequencyLabel:'Mensual + extraordinaria si aplica',record:'PG0420',agent:'Paño húmedo + papel desechable + agente desinfectante',extraordinary:true},
{id:'clean-laminar',name:'Cabina de flujo laminar',kind:'EQUIPO',frequency:'EACH_USE',frequencyLabel:'Inicio y final de jornada / antes y después del uso',record:'PG0422',agent:'Alcohol 70 %',extraordinary:true},
{id:'clean-balance',name:'Balanza',kind:'EQUIPO',frequency:'EACH_USE',frequencyLabel:'Cada uso',record:'PG0420',agent:'Paño húmedo + agente desinfectante',extraordinary:true},
{id:'clean-turbidimeter',name:'Turbidímetro / Densitómetro',kind:'EQUIPO',frequency:'EACH_USE',frequencyLabel:'Cada uso',record:'PG0420',agent:'Paño húmedo + agente desinfectante',extraordinary:true},
{id:'clean-phmeter',name:'pHmetro',kind:'EQUIPO',frequency:'EACH_USE',frequencyLabel:'Cada uso',record:'PG0420',agent:'Paño húmedo + agente desinfectante',extraordinary:true}
];
function cleaningPlanById(id){return CLEANING_MASTER_PLAN.find(x=>x.id===id)}
function cleaningIsExtraordinaryRecord(r){
  return ['EXTRAORDINARIA_DERRAME','EXTRAORDINARIA_CONTAMINACION','EXTRAORDINARIA_EVENTO','POST_INCIDENTE'].includes(String(r?.cleaningType||'').toUpperCase());
}
function cleaningLast(id){
  return [...state.equipmentCleaning]
    .filter(x=>(x.planId||x.equipmentId)===id && !cleaningIsExtraordinaryRecord(x))
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0]
}
function cleanAddDays(d,n){const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}
function cleanAddMonths(d,n){const x=new Date(d+'T12:00:00');x.setMonth(x.getMonth()+n);return x.toISOString().slice(0,10)}
function cleaningIsHoliday(d){return state.environmentHolidays.some(h=>h.date===d)}
function cleaningNextWorkday(d){let x=d;for(let i=0;i<10;i++){x=cleanAddDays(x,1);const day=new Date(x+'T12:00:00').getDay();if(day!==0&&day!==6&&!cleaningIsHoliday(x))return x}return x}
function cleanDateObj(d){return new Date(d+'T12:00:00')}
function cleanISO(d){return d.toISOString().slice(0,10)}
function cleanMondayOfWeek(dateStr){const d=cleanDateObj(dateStr),day=d.getDay()||7;d.setDate(d.getDate()-day+1);return cleanISO(d)}
function cleanLastWorkdayOnOrBefore(dateStr){let d=dateStr;for(let i=0;i<10;i++){const day=cleanDateObj(d).getDay();if(day!==0&&day!==6&&!cleaningIsHoliday(d))return d;d=cleanAddDays(d,-1)}return d}
function cleanPrevWorkday(dateStr){return cleanLastWorkdayOnOrBefore(cleanAddDays(dateStr,-1))}
function cleanMonthEnd(dateStr){const d=cleanDateObj(dateStr);return cleanISO(new Date(d.getFullYear(),d.getMonth()+1,0,12))}
function cleanWindowState(lastDate,frequency,now){
  let start='',deadline='';
  if(frequency==='WEEKLY'){
    start=cleanAddDays(cleanMondayOfWeek(lastDate),7);
    deadline=cleanLastWorkdayOnOrBefore(cleanAddDays(start,4));
  }else if(frequency==='FORTNIGHTLY'){
    start=cleanAddDays(cleanMondayOfWeek(lastDate),14);
    deadline=cleanLastWorkdayOnOrBefore(cleanAddDays(start,4));
  }else{
    const due=cleanAddMonths(lastDate,1);
    const d=cleanDateObj(due);start=cleanISO(new Date(d.getFullYear(),d.getMonth(),1,12));
    deadline=cleanLastWorkdayOnOrBefore(cleanMonthEnd(due));
  }
  const finalAlert=cleanPrevWorkday(deadline);
  if(now<start)return {status:'AL DÍA',start,deadline,finalAlert,next:`${start} → ${deadline}`};
  if(now>deadline)return {status:'VENCIDA',start,deadline,finalAlert,next:`Venció ${deadline}`};
  if(now===deadline)return {status:'VENCE HOY',start,deadline,finalAlert,next:`Último día ${deadline}`};
  if(now>=finalAlert)return {status:'ALERTA FINAL',start,deadline,finalAlert,next:`Máximo ${deadline}`};
  return {status:'VENTANA ABIERTA',start,deadline,finalAlert,next:`Realizar ${start} → ${deadline}`};
}
function cleaningPlanState(p){const last=cleaningLast(p.id),now=today();if(p.id==='clean-laminar'){const r=laminarRoutineRecordsFor(now),a=r.some(x=>x.laminarMoment==='INICIO_JORNADA'),b=r.some(x=>x.laminarMoment==='FINAL_JORNADA');if(a&&!b){const av=laminarCloseAvailability(now);return {status:av.allowed?'PENDIENTE FINAL':'ESPERA FINAL',last:last?.date||'',next:av.allowed?'Registrar final de jornada / después del uso':`Final disponible desde ${av.availableAt} · faltan ${Math.ceil(av.remaining/60)} h aprox.`}}return {status:a&&b?'AL DÍA':'PENDIENTE INICIO',last:last?.date||'',next:a&&b?'Inicio y final registrados hoy':'Registrar inicio de jornada / antes del uso'}}if(p.frequency==='EACH_USE')return {status:last?'AL DÍA':'CADA USO',last:last?.date||'',next:'Registrar cada uso'};if(p.frequency==='DAILY_WORKDAY'){const day=new Date(now+'T12:00:00').getDay(),required=day!==0&&day!==6&&!cleaningIsHoliday(now);if(last?.date===now)return {status:'AL DÍA',last:last.date,next:cleaningNextWorkday(now)};return {status:required?'PENDIENTE':'NO PROGRAMADO',last:last?.date||'',next:required?now:cleaningNextWorkday(now)}}if(!last)return {status:'PENDIENTE INICIAL',last:'',next:'Registrar para iniciar ciclo'};const w=cleanWindowState(last.date,p.frequency,now);return {...w,last:last.date}}
function cleaningPill(s){const c=['AL DÍA','NO PROGRAMADO'].includes(s)?'ok':['PENDIENTE','PENDIENTE INICIAL','PENDIENTE INICIO','PENDIENTE FINAL','VENCIDA','VENCE HOY'].includes(s)?'bad':['ESPERA FINAL'].includes(s)?'warn':'warn';return `<span class="pill ${c}">${esc(s)}</span>`}


const AREA_CLEANING_PRODUCTS=['Alcohol 70 %','Hipoclorito al 0,5 %','Amonio cuaternario solución'];
function areaIsoWeekKey(dateStr){
  const d=new Date(dateStr+'T12:00:00'),t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  const week=Math.ceil((((t-yearStart)/86400000)+1)/7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}
function areaWeeklyProductFor(dateStr){
  const key=areaIsoWeekKey(dateStr);
  let h=2166136261;
  for(const ch of key){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  let idx=(h>>>0)%AREA_CLEANING_PRODUCTS.length;
  // Evita repetir exactamente el producto de la semana anterior.
  const d=new Date(dateStr+'T12:00:00');d.setDate(d.getDate()-7);
  const prevKey=areaIsoWeekKey(d.toISOString().slice(0,10));
  let hp=2166136261;for(const ch of prevKey){hp^=ch.charCodeAt(0);hp=Math.imul(hp,16777619)}
  const prevIdx=(hp>>>0)%AREA_CLEANING_PRODUCTS.length;
  if(idx===prevIdx)idx=(idx+1)%AREA_CLEANING_PRODUCTS.length;
  return {product:AREA_CLEANING_PRODUCTS[idx],weekKey:key};
}
function currentCleanTime(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function laminarRoutineRecordsFor(date){
  return state.equipmentCleaning.filter(r=>(r.planId||r.equipmentId)==='clean-laminar'&&r.date===date&&!cleaningIsExtraordinaryRecord(r));
}
const LAMINAR_MIN_CLOSE_MINUTES=180;
function cleanMinutesFromHHMM(v){const m=String(v||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null}
function cleanHHMMFromMinutes(total){total=((total%1440)+1440)%1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function laminarStartRecord(date){return laminarRoutineRecordsFor(date).find(r=>r.laminarMoment==='INICIO_JORNADA')||null}
function laminarCloseAvailability(date){
  const start=laminarStartRecord(date);if(!start)return {allowed:false,remaining:LAMINAR_MIN_CLOSE_MINUTES,availableAt:''};
  const startMin=cleanMinutesFromHHMM(start.laminarTime);if(startMin===null)return {allowed:true,remaining:0,availableAt:''};
  const available=startMin+LAMINAR_MIN_CLOSE_MINUTES, availableAt=cleanHHMMFromMinutes(available);
  if(date!==today())return {allowed:true,remaining:0,availableAt};
  const nowMin=new Date().getHours()*60+new Date().getMinutes(),remaining=Math.max(0,available-nowMin);
  return {allowed:remaining===0,remaining,availableAt};
}
function cleaningRecordDisplayName(r){
  const id=r.planId||r.equipmentId||'';
  if(id==='area-daily-combined')return 'Limpieza de áreas · Microbiología';
  return cleaningPlanById(id)?.name||equipmentById(r.equipmentId)?.name||r.elementName||r.equipmentName||'Registro de limpieza';
}
function cleaningRecordDetail(r){
  if((r.planId||r.equipmentId)==='clean-laminar'){
    const m=r.laminarMoment==='INICIO_JORNADA'?'Inicio de jornada':r.laminarMoment==='FINAL_JORNADA'?'Final de jornada':'Cabina';
    return `${m}${r.laminarTime?' · '+r.laminarTime:''}${r.uvMinutes?' · UV '+r.uvMinutes+' min':''}`;
  }
  if((r.planId||r.equipmentId)==='area-daily-combined'){const parts=[];if(r.shiftStart)parts.push('Inicio');if(r.shiftEnd)parts.push('Final');return parts.join(' + ')||'Área'}
  return r.recordCode||cleaningPlanById(r.planId||r.equipmentId)?.record||'—';
}
function cleaningPriorityRank(status){return ({'VENCIDA':0,'VENCE HOY':1,'ALERTA FINAL':2,'PENDIENTE FINAL':3,'PENDIENTE':4,'VENTANA ABIERTA':5,'PENDIENTE INICIAL':6,'PENDIENTE INICIO':7,'ESPERA FINAL':8,'CADA USO':9,'AL DÍA':20,'NO PROGRAMADO':30})[status]??15}
function updateLaminarCleaningFields(){
  const f=$('#equipmentCleaningForm'),box=$('#laminarCleaningFields');if(!f||!box)return;
  const isLaminar=f.elements.equipmentId?.value==='clean-laminar';
  box.hidden=!isLaminar;
  const submitBtn=f.querySelector('button[type="submit"]');
  if(!isLaminar){if(f.elements.uvApplied)f.elements.uvApplied.required=false;if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Guardar limpieza'}return;}
  const date=f.elements.date?.value||today(), records=laminarRoutineRecordsFor(date);
  const hasStart=records.some(r=>r.laminarMoment==='INICIO_JORNADA'),hasEnd=records.some(r=>r.laminarMoment==='FINAL_JORNADA');
  const moment=f.elements.laminarMoment, display=$('#laminarCleaningMomentDisplay'), hint=$('#laminarCleaningMomentHint'), note=$('#laminarAutoNote');
  if(!hasStart){
    if(moment)moment.value='INICIO_JORNADA';
    if(display)display.value='Inicio de jornada / antes del uso';
    if(hint)hint.textContent='Paso 1 de 2 · registre el inicio. Después de guardar, el sistema mostrará únicamente el final.';
    if(note)note.textContent='Paso 1: inicio de jornada / antes del uso. Fecha, hora, usuario, Alcohol 70 % y 15 min de UV se completan automáticamente.';
    if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Guardar inicio de jornada'}
  }else if(!hasEnd){
    const av=laminarCloseAvailability(date);
    if(moment)moment.value='FINAL_JORNADA';
    if(display)display.value='Final de jornada / después del uso';
    if(hint)hint.textContent=av.allowed?'Paso 2 de 2 · el inicio ya está registrado. El cierre de jornada está habilitado.':`Paso 2 de 2 · inicio registrado. El cierre se habilita desde ${av.availableAt} (mínimo 3 horas después).`;
    if(note)note.textContent=av.allowed?'Ya transcurrieron al menos 3 horas desde el inicio. Puede registrar el final de jornada.':`Inicio guardado. Final todavía bloqueado: disponible desde ${av.availableAt}. Puede cerrar esta pantalla y volver más tarde.`;
    if(submitBtn){submitBtn.disabled=!av.allowed;submitBtn.textContent=av.allowed?'Guardar final de jornada':`Final disponible ${av.availableAt}`}
  }else{
    if(moment)moment.value='FINAL_JORNADA';
    if(display)display.value='Jornada completada';
    if(hint)hint.textContent='Inicio y final de jornada ya fueron registrados para esta fecha.';
    if(note)note.textContent='PG0422 completo para la fecha seleccionada. Para un evento no rutinario utilice Limpieza extraordinaria.';
    if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Jornada ya completada'}
  }
  if(f.elements.laminarTime)f.elements.laminarTime.value=currentCleanTime();
  if(f.elements.uvMinutes)f.elements.uvMinutes.value='15';
  if(f.elements.uvApplied){f.elements.uvApplied.required=true;if(!f.elements.uvApplied.value)f.elements.uvApplied.value='SI'}
}
function updateEquipmentCleaningWeeklyAgent(){
  const f=$('#equipmentCleaningForm');if(!f)return;
  const date=f.elements.date?.value||today(),weekly=areaWeeklyProductFor(date),isLaminar=f.elements.equipmentId?.value==='clean-laminar';
  if(f.elements.agent)f.elements.agent.value=isLaminar?'Alcohol 70 %':weekly.product;
  if($('#cleaningWeeklyAgentWeek'))$('#cleaningWeeklyAgentWeek').textContent=isLaminar
    ?'Cabina de flujo laminar: Alcohol 70 % fijo según EI/LAB-PSI/17; no depende de la rotación semanal de áreas.'
    :`${weekly.weekKey} · mismo producto automático usado en Limpieza de Áreas durante toda la semana`;
  updateLaminarCleaningFields();
}
function areaCleaningRecord(date){
  return [...state.equipmentCleaning].filter(r=>r.planId==='area-daily-combined'&&r.date===date)
    .sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null;
}
function areaCleaningProducts(r){
  if(!r)return [];
  if(Array.isArray(r.products)&&r.products.length)return r.products;
  return r.weeklyProduct?[r.weeklyProduct]:[];
}
function areaCleaningIsComplete(r){
  return !!(r && r.shiftStart && r.shiftEnd && r.surface && r.floor && areaCleaningProducts(r).length);
}
function renderAreaCleaningQuick(){
  if(!$('#areaCleaningQuickForm'))return;
  const todayDate=today(), month=todayDate.slice(0,7), dates=envMonthDates(todayDate),
    scheduled=dates.filter(d=>envScheduled(d)), completed=scheduled.filter(d=>areaCleaningIsComplete(areaCleaningRecord(d))),
    pending=scheduled.filter(d=>d<=todayDate&&!areaCleaningIsComplete(areaCleaningRecord(d)));

  $('#areaCleanKpiScheduled').textContent=scheduled.length;
  $('#areaCleanKpiComplete').textContent=completed.length;
  $('#areaCleanKpiPending').textContent=pending.length;
  $('#areaCleanKpiCompliance').textContent=scheduled.length?Math.round(completed.length/scheduled.length*100)+' %':'—';

  $('#areaCleaningMonthlyRows').innerHTML=dates.map(d=>{
    const scheduledDay=envScheduled(d),r=areaCleaningRecord(d),future=d>todayDate;
    if(!scheduledDay)return `<tr><td>${esc(d)}</td><td>${esc(envDayName(d))}</td><td colspan="7"><span class="pill neutral">NO PROGRAMADO</span></td></tr>`;
    const products=r?areaCleaningProducts(r).join(' · '):'—';
    return `<tr>
      <td>${esc(d)}</td><td>${esc(envDayName(d))}</td>
      <td>${r?.shiftStart?'✅':'—'}</td>
      <td>${r?.shiftEnd?'✅':'—'}</td>
      <td>${esc(products)}</td>
      <td>${r?.surface?'✅':'—'}</td>
      <td>${r?.floor?'✅':'—'}</td>
      <td>${esc(r?.performedBy||'—')}</td>
      <td>${future?'—':r?`<button type="button" onclick="editAreaCleaningQuick('${d}')">✏️ Editar</button>`:`<button type="button" onclick="prefillAreaCleaningQuick('${d}')">Registrar</button>`}</td>
    </tr>`;
  }).join('');

  const f=$('#areaCleaningQuickForm');
  if(!f.elements.date.value)f.elements.date.value=todayDate;
  f.elements.responsible.value=activeUser();
  const weekly=areaWeeklyProductFor(f.elements.date.value);
  if($('#areaWeeklyProduct'))$('#areaWeeklyProduct').textContent=weekly.product;
  if($('#areaWeeklyProductWeek'))$('#areaWeeklyProductWeek').textContent=`${weekly.weekKey} · fijo durante toda la semana · selección automática trazable`;
  updateAreaCleaningQuickStatus();
}
function updateAreaCleaningQuickStatus(){
  const f=$('#areaCleaningQuickForm'),box=$('#areaCleaningQuickStatus');if(!f||!box)return;
  const moments=Number(f.elements.shiftStart.checked)+Number(f.elements.shiftEnd.checked),
    areas=Number(f.elements.surface.checked)+Number(f.elements.floor.checked),
    weekly=areaWeeklyProductFor(f.elements.date.value||today());
  if($('#areaWeeklyProduct'))$('#areaWeeklyProduct').textContent=weekly.product;
  if($('#areaWeeklyProductWeek'))$('#areaWeeklyProductWeek').textContent=`${weekly.weekKey} · fijo durante toda la semana · selección automática trazable`;
  if(moments&&areas){
    box.className='span-2 notice success';
    box.innerHTML=`<b>LISTO PARA GUARDAR</b> · ${moments} momento(s) · ${areas} área(s) · producto automático: <b>${esc(weekly.product)}</b>.`;
  }else{
    box.className='span-2 notice';
    box.textContent='Seleccione al menos un momento de limpieza y un área. El producto se asigna automáticamente.';
  }
}
window.prefillAreaCleaningQuick=date=>{
  openCleaningSubtab('areas');
  const f=$('#areaCleaningQuickForm');f.reset();f.elements.date.value=date;f.elements.responsible.value=activeUser();updateAreaCleaningQuickStatus();f.scrollIntoView({behavior:'smooth',block:'start'});
};
window.editAreaCleaningQuick=date=>{
  const r=areaCleaningRecord(date);if(!r)return;openCleaningSubtab('areas');
  const f=$('#areaCleaningQuickForm');f.reset();f.elements.date.value=date;f.elements.responsible.value=r.performedBy||activeUser();
  f.elements.shiftStart.checked=!!r.shiftStart;f.elements.shiftEnd.checked=!!r.shiftEnd;
  f.elements.surface.checked=!!r.surface;f.elements.floor.checked=!!r.floor;f.elements.notes.value=r.notes||'';
  f.dataset.editId=r.id;updateAreaCleaningQuickStatus();f.scrollIntoView({behavior:'smooth',block:'start'});
};
function bindAreaCleaningQuick(){
  const f=$('#areaCleaningQuickForm');if(!f||f.dataset.bound)return;f.dataset.bound='1';
  f.addEventListener('change',updateAreaCleaningQuickStatus);
  f.elements.date?.addEventListener('input',updateAreaCleaningQuickStatus);
  f.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(f),date=fd.get('date');
    if(!envScheduled(date))return toast('La fecha seleccionada no está programada: fin de semana o feriado.');
    const weekly=areaWeeklyProductFor(date),products=[weekly.product];
    const shiftStart=f.elements.shiftStart.checked,shiftEnd=f.elements.shiftEnd.checked,surface=f.elements.surface.checked,floor=f.elements.floor.checked;
    if(!(shiftStart||shiftEnd))return toast('Seleccione Inicio de jornada y/o Final de jornada.');
    if(!(surface||floor))return toast('Seleccione Superficies y/o Pisos.');
    const previous=f.dataset.editId?(state.equipmentCleaning.find(x=>x.id===f.dataset.editId)):areaCleaningRecord(date);
    const rec={...previous,id:previous?.id||crypto.randomUUID(),planId:'area-daily-combined',elementName:'Limpieza de áreas · Microbiología',recordCode:'PG0418',frequency:'DAILY_WORKDAY',date,shiftStart,shiftEnd,products,weeklyProduct:weekly.product,weeklyProductKey:weekly.weekKey,productAssignmentMode:'WEEKLY_AUTO',surface,floor,notes:String(fd.get('notes')||''),cleaningType:'RUTINARIA',agent:weekly.product,performedBy:activeUser(),verifiedBy:activeUser(),createdAt:previous?.createdAt||nowISO(),updatedAt:nowISO()};
    await saveLocal('equipmentCleaning',rec,{render:false});
    await equipmentTrace('area-daily-combined',previous?'LIMPIEZA DE ÁREA CORREGIDA':'LIMPIEZA DE ÁREA REGISTRADA',`${date} · ${weekly.weekKey} · producto automático ${weekly.product} · ${shiftStart?'Inicio ':''}${shiftEnd?'Final ':''}· ${surface?'Superficies ':''}${floor?'Pisos':''}`);
    f.reset();delete f.dataset.editId;f.elements.date.value=today();f.elements.responsible.value=activeUser();
    await loadLocal();openCleaningSubtab('areas');renderAreaCleaningQuick();toast('Limpieza de área guardada.');
  });
  $('#areaCleaningQuickClear')?.addEventListener('click',()=>{f.reset();delete f.dataset.editId;f.elements.date.value=today();f.elements.responsible.value=activeUser();updateAreaCleaningQuickStatus()});
}
function renderCleaningMasterPlan(){
  if(!$('#cleaningPlanRows'))return;
  const rows=CLEANING_MASTER_PLAN.map(p=>[p,cleaningPlanState(p)]).sort((a,b)=>cleaningPriorityRank(a[1].status)-cleaningPriorityRank(b[1].status)||String(a[0].name).localeCompare(String(b[0].name)));
  $('#cleanKpiTotal').textContent=rows.filter(([p])=>p.frequency!=='EACH_USE').length;
  $('#cleanKpiPending').textContent=rows.filter(([,s])=>['PENDIENTE','PENDIENTE INICIAL','PENDIENTE INICIO','PENDIENTE FINAL','VENCIDA','VENCE HOY'].includes(s.status)).length;
  $('#cleanKpiUpcoming').textContent=rows.filter(([,s])=>['VENTANA ABIERTA','ALERTA FINAL','ESPERA FINAL'].includes(s.status)).length;
  $('#cleanKpiOk').textContent=rows.filter(([,s])=>s.status==='AL DÍA').length;
  const priorityRows=rows.filter(([,s])=>cleaningPriorityRank(s.status)<=5).slice(0,6);
  if($('#cleanPriorityCount'))$('#cleanPriorityCount').textContent=`${priorityRows.length} PRIORIDAD${priorityRows.length===1?'':'ES'}`;
  if($('#cleaningPriorityCards'))$('#cleaningPriorityCards').innerHTML=priorityRows.length?priorityRows.map(([p,s],i)=>`<article class="cleaning-priority-card priority-${Math.min(cleaningPriorityRank(s.status),5)}"><div class="priority-number">${i+1}</div><div class="priority-main"><strong>${esc(p.name)}</strong><small>${esc(p.frequencyLabel)} · ${esc(p.record)}</small><span>${cleaningPill(s.status)} ${esc(s.next||'')}</span></div><button type="button" onclick="openCleaningPlan('${p.id}')">Registrar ahora</button></article>`).join(''):'<div class="notice ok">No hay actividades urgentes. El plan se encuentra al día.</div>';
  $('#cleaningPlanRows').innerHTML=rows.map(([p,s])=>`<tr>
    <td><strong>${esc(p.name)}</strong></td><td>${esc(p.kind)}</td><td>${esc(p.frequencyLabel)}</td><td>${esc(p.record)}</td>
    <td>${esc(s.last||'—')}</td><td>${esc(s.next||'—')}</td><td>${cleaningPill(s.status)}</td>
    <td><button type="button" onclick="openCleaningPlan('${p.id}')">Registrar</button>${p.extraordinary?` <button type="button" onclick="openExtraordinaryCleaning('${p.id}')">Extraordinaria</button>`:''}</td>
  </tr>`).join('');
  const cards=kind=>rows.filter(([p])=>p.kind===kind).map(([p,s])=>`<article class="equipment-status-card">
    <h4>${esc(p.name)}</h4>
    <div><span>${esc(p.frequencyLabel)}</span>${cleaningPill(s.status)}<small>${s.last?'Última rutinaria '+esc(s.last):'Sin registro rutinario previo'} · ${esc(p.record)}</small>${s.next?`<small><strong>Ventana:</strong> ${esc(s.next)}</small>`:''}</div>
    <button type="button" onclick="openCleaningPlan('${p.id}')">Registrar limpieza</button>
    ${p.extraordinary?`<button type="button" onclick="openExtraordinaryCleaning('${p.id}')">Limpieza extraordinaria</button>`:''}
  </article>`).join('');
  $('#cleaningAreaCards')&&($('#cleaningAreaCards').innerHTML=cards('AREA'));
  $('#cleaningEquipmentCards').innerHTML=cards('EQUIPO');
  renderAreaCleaningQuick();
  const hist=[...state.equipmentCleaning].sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||''))).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(cleaningRecordDisplayName(r))}</td><td>${esc(cleaningRecordDetail(r))}</td><td>${esc(r.cleaningType||'—')}</td><td>${esc(r.agent||'—')}</td><td>${esc(r.performedBy||'—')}</td><td>${esc(r.verifiedBy||'—')}</td></tr>`).join('');
  $('#equipmentCleaningRowsMaster').innerHTML=hist||'<tr><td colspan="7">Sin limpiezas registradas.</td></tr>';
}

window.openExtraordinaryCleaning=id=>{
  const p=cleaningPlanById(id),f=$('#equipmentCleaningForm');if(!p||!f)return;
  openCleaningSubtab('equipment');
  const sel=$('#cleaningEquipmentSelect');if(sel)sel.value=id;
  if(f.elements.agent)f.elements.agent.value=p.agent||'';
  if(f.elements.date)f.elements.date.value=today();
  if(f.elements.cleaningType)f.elements.cleaningType.value='EXTRAORDINARIA_EVENTO';updateEquipmentCleaningWeeklyAgent();
  if(f.elements.notes)f.elements.notes.value='';
  f.scrollIntoView({behavior:'smooth',block:'start'});
};
window.openCleaningPlan=id=>{
  const p=cleaningPlanById(id),f=$('#equipmentCleaningForm');if(!p||!f)return;
  if(p.kind==='EQUIPO')openCleaningSubtab('equipment');
  const sel=$('#cleaningEquipmentSelect');if(sel)sel.value=id;
  if(f.elements.agent)f.elements.agent.value=p.agent||'';
  if(f.elements.date)f.elements.date.value=today();
  if(f.elements.cleaningType)f.elements.cleaningType.value='RUTINARIA';updateEquipmentCleaningWeeklyAgent();
  f.scrollIntoView({behavior:'smooth',block:'start'});
};
function openCleaningSubtab(name){
  const valid=['plan','areas','equipment','history'];if(!valid.includes(name))name='plan';
  document.querySelectorAll('[data-cleaning-subtab]').forEach(b=>{
    const active=b.dataset.cleaningSubtab===name;
    b.classList.toggle('active',active);
    b.setAttribute('aria-selected',active?'true':'false');
  });
  document.querySelectorAll('.cleaning-pane').forEach(p=>{
    const active=p.id===`cleaning-pane-${name}`;
    p.hidden=!active;
    p.style.display=active?'block':'none';
  });
  renderCleaningMasterPlan();
}
window.openCleaningSubtab=openCleaningSubtab;
function bindCleaningSubtabs(){
  document.querySelectorAll('[data-cleaning-subtab]').forEach(b=>{
    b.onclick=()=>openCleaningSubtab(b.dataset.cleaningSubtab);
  });
  openCleaningSubtab('plan');
}
function equipmentLastCleaning(id){return [...state.equipmentCleaning].filter(x=>x.equipmentId===id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0]}
function equipmentCleaningState(eq){
  const plan=cleaningPlanById(eq.id);
  if(plan){
    const s=cleaningPlanState(plan);
    return {
      status:s.status,
      nextDate:s.next||'',
      lastDate:s.last||'',
      frequencyLabel:plan.frequencyLabel,
      source:'CLEANING_MASTER_PLAN'
    };
  }
  const last=equipmentLastCleaning(eq.id),freq=Number(eq.cleaningFrequencyDays||0);
  if(!freq)return {status:'SIN FRECUENCIA',nextDate:'',frequencyLabel:'Sin frecuencia',source:'EQUIPMENT_CATALOG'};
  if(!last)return {status:'PENDIENTE INICIAL',nextDate:'Registrar para iniciar ciclo',frequencyLabel:`Cada ${freq} días`,source:'EQUIPMENT_CATALOG'};
  const next=addDays(last.date,freq),days=daysBetween(today(),next);
  return {status:days<0?'VENCIDA':days<=7?'PRÓXIMA':'AL DÍA',nextDate:next,lastDate:last.date,days,frequencyLabel:`Cada ${freq} días`,source:'EQUIPMENT_CATALOG'};
}
function equipmentPill(s){const c=/VENCID|NO CUMPLE|POSITIVO/.test(s)?'bad':/PRÓXIM|PENDIENTE/.test(s)?'warn':'ok';return `<span class="pill ${c}">${esc(s)}</span>`}
async function equipmentTrace(equipmentId,action,detail){
  const eq=equipmentById(equipmentId);
  await saveLocal('equipmentTrace',{id:crypto.randomUUID(),equipmentId,equipmentCode:eq?.code||'',equipmentName:eq?.name||'',action,detail:String(detail||''),eventAt:nowISO(),user:activeUser(),deviceId},{render:false});
}
async function seedEquipmentCatalog(){
  if(state.equipmentCatalog.length)return;
  for(const eq of DEFAULT_EQUIPMENT_CATALOG)await saveLocal('equipmentCatalog',eq,{queue:false,render:false});
  await loadLocal();
}
async function migrateAutoclaveCleaningFrequencyV342G(){
  let changed=0;
  for(const id of ['eq-autoclave-sterilization','eq-autoclave-decontamination']){
    const eq=state.equipmentCatalog.find(x=>x.id===id);
    if(eq && Number(eq.cleaningFrequencyDays)!==7){
      await saveLocal('equipmentCatalog',{...eq,cleaningFrequencyDays:7},{queue:false,render:false});
      changed++;
    }
  }
  if(changed){
    await audit('equipmentCatalog','V342G-CLEANING-FREQUENCY','MIGRACIÓN DE FRECUENCIA DE LIMPIEZA',{summary:`${changed} autoclave(s) normalizado(s) a limpieza SEMANAL desde el Plan Maestro.`});
    await loadLocal();
  }
  return changed;
}
function equipmentControlEvaluation(eq,fd){
  const temp=Number(fd.temperature),mins=Number(fd.cycleMinutes);
  const issues=[];
  if(!(temp>=Number(eq.tempMin)&&temp<=Number(eq.tempMax)))issues.push(`Temperatura fuera de ${eq.tempMin}–${eq.tempMax} °C`);
  if(mins<Number(eq.minCycleMinutes||0))issues.push(`Tiempo menor a ${eq.minCycleMinutes} min`);
  if(fd.indicatorTape!=='CUMPLE')issues.push('Cinta indicadora NO CUMPLE');
  if(fd.attestPerformed==='SI'&&fd.attestResult!=='NEGATIVO')issues.push('Attest no conforme o incompleto');
  if(fd.sterikonPerformed==='SI'&&fd.sterikonResult!=='CUMPLE')issues.push('Sterikon Plus no conforme o incompleto');
  return {result:issues.length?'NO CUMPLE':'CUMPLE',issues};
}

function equipmentProductLots(kind){
  const matcher=kind==='ATTEST'
    ? c=>/ATTEST/i.test(String(c?.name||''))
    : c=>/STERIKON/i.test(String(c?.name||''));
  const productIds=new Set(state.productCatalog.filter(matcher).map(c=>c.id));
  return state.productLots.filter(l=>productIds.has(l.productId)&&productIntegrationEligibleLot(l))
    .sort((a,b)=>String(productEffectiveExpiry(a)||'9999').localeCompare(String(productEffectiveExpiry(b)||'9999')));
}
function equipmentLotOption(lot){
  const cat=productCatalogById(lot.productId),exp=productEffectiveExpiry(lot);
  return `${lot.internalCode} · lote ${lot.manufacturerLot||'—'} · disp. ${productAvailable(lot)} ${cat?.unit||''} · vence ${exp||'—'}`;
}
function populateEquipmentBiologicalLots(){
  const attSel=$('#attestLotSelect'),sterSel=$('#sterikonLotSelect');
  if(attSel){const current=attSel.value,lots=equipmentProductLots('ATTEST');attSel.innerHTML='<option value="">Seleccione lote vigente de Trazabilidad</option>'+lots.map(l=>`<option value="${l.id}">${esc(equipmentLotOption(l))}</option>`).join('');if(lots.some(l=>l.id===current))attSel.value=current;$('#attestLotHelp').textContent=lots.length?`${lots.length} lote(s) APTO y vigente(s) disponible(s).`:'No hay lote APTO y vigente de Attest 3M en Trazabilidad.'}
  if(sterSel){const current=sterSel.value,lots=equipmentProductLots('STERIKON');sterSel.innerHTML='<option value="">Seleccione lote vigente de Trazabilidad</option>'+lots.map(l=>`<option value="${l.id}">${esc(equipmentLotOption(l))}</option>`).join('');if(lots.some(l=>l.id===current))sterSel.value=current;$('#sterikonLotHelp').textContent=lots.length?`${lots.length} lote(s) APTO y vigente(s) disponible(s).`:'No hay lote APTO y vigente de Sterikon Plus en Trazabilidad.'}
}

function equipmentCounterAfterRecord(record){
  const eq=equipmentById(record.equipmentId),freq=Number(eq?.attestFrequencyLoads||0);
  const rows=[...state.equipmentControls].filter(x=>x.equipmentId===record.equipmentId)
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  let counter=0;
  for(const r of rows){
    counter+=Number(r.loads||0);
    if(freq>0&&r.attestPerformed==='SI'&&r.attestResult&&counter>=freq)counter=0;
    if(r.id===record.id)return counter;
  }
  return Number(record.attestCounterAfter||0);
}
function equipmentProjectedAttest(eq,fd){
  const current=equipmentLoadsSinceAttest(eq.id),add=Math.max(0,Number(fd?.loads||0)),freq=Number(eq.attestFrequencyLoads||0);
  const raw=current+add,scheduledReset=fd?.attestPerformed==='SI'&&freq>0&&raw>=freq;
  const projected=scheduledReset?0:raw;
  const remaining=Math.max(0,freq-projected);
  return {current,raw,projected,remaining,scheduledReset};
}
function durationMinutesFromTimes(start,end){
  if(!start||!end)return null;
  const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
  let mins=(eh*60+em)-(sh*60+sm);if(mins<0)mins+=1440;return mins;
}
function updateAutoclaveTimeDuration(){
  const f=$('#autoclaveControlForm');if(!f)return;
  const mins=durationMinutesFromTimes(f.elements.startTime?.value,f.elements.endTime?.value);
  if(mins!==null&&mins>0)f.elements.cycleMinutes.value=mins;
}


const DEFAULT_ENVIRONMENT_CONFIG={
  id:'environment-microbiology-default',
  area:'Microbiología',
  instrumentCode:'EI/347',
  temperatureMin:15,
  temperatureMax:25,
  humidityMax:80,
  temperatureRules:[
    {min:15,max:24.9,delta:-0.20,label:'15.0–24.9 °C: valor leído - 0.20 °C'},
    {min:25,max:null,delta:0,label:'≥25.0 °C: sin corrección'}
  ],
  humidityRules:[
    {min:20,max:39.9,delta:-2.1,label:'20.0–39.9 %HR: valor leído - 2.1 %'},
    {min:40,max:79.9,delta:-1.0,label:'40.0–79.9 %HR: valor leído - 1.0 %'}
  ],
  source:'PSI-MC1602-07',
  updatedAt:'',
  updatedBy:''
};
function envConfig(){const list=Array.isArray(state.environmentConfig)?state.environmentConfig:[];return list.find(x=>x.id===DEFAULT_ENVIRONMENT_CONFIG.id)||DEFAULT_ENVIRONMENT_CONFIG}
async function seedEnvironmentConfig(){
  if(!Array.isArray(state.environmentConfig))state.environmentConfig=[];
  if(state.environmentConfig.some(x=>x.id===DEFAULT_ENVIRONMENT_CONFIG.id))return;
  await saveLocal('environmentConfig',{...DEFAULT_ENVIRONMENT_CONFIG,updatedAt:nowISO(),updatedBy:'SYSTEM'},{queue:false,render:false});
  await loadLocal();
}
function envRuleDelta(value,rules){
  const n=Number(value);if(!Number.isFinite(n))return 0;
  const r=(rules||[]).find(x=>n>=Number(x.min)&&((x.max===null||x.max===undefined||x.max==='')||n<=Number(x.max)));
  return r?Number(r.delta||0):0;
}
function envCorrectValues(tempRaw,humidityRaw){
  const cfg=envConfig(),t=Number(tempRaw),h=Number(humidityRaw);
  const tempDelta=envRuleDelta(t,cfg.temperatureRules),humidityDelta=envRuleDelta(h,cfg.humidityRules);
  const temperatureCorrected=Number.isFinite(t)?Number((t+tempDelta).toFixed(2)):null;
  const humidityCorrected=Number.isFinite(h)?Number((h+humidityDelta).toFixed(2)):null;
  const tempOk=temperatureCorrected!==null&&temperatureCorrected>=Number(cfg.temperatureMin)&&temperatureCorrected<=Number(cfg.temperatureMax);
  const humOk=humidityCorrected!==null&&humidityCorrected<Number(cfg.humidityMax);
  return {temperatureCorrected,humidityCorrected,tempDelta,humidityDelta,tempOk,humOk,compliance:tempOk&&humOk?'CUMPLE':'NO CUMPLE'};
}
function envCorrectionSummary(cfg=envConfig()){
  const tr=(cfg.temperatureRules||[]).map(r=>r.label||`${r.min}–${r.max??'∞'}: ${r.delta>=0?'+':''}${r.delta}`).join(' · ');
  const hr=(cfg.humidityRules||[]).map(r=>r.label||`${r.min}–${r.max??'∞'}: ${r.delta>=0?'+':''}${r.delta}`).join(' · ');
  return `Termohigrómetro ${cfg.instrumentCode||'—'} · Temperatura: ${tr} · Humedad: ${hr}`;
}
function envApplyFormCorrection(){
  const f=$('#environmentForm');if(!f)return;
  const calc=envCorrectValues(f.elements.temperatureRaw?.value,f.elements.humidityRaw?.value);
  if(f.elements.temperatureCorrected)f.elements.temperatureCorrected.value=calc.temperatureCorrected??'';
  if(f.elements.humidityCorrected)f.elements.humidityCorrected.value=calc.humidityCorrected??'';
  if(f.elements.compliance)f.elements.compliance.value=(f.elements.temperatureRaw?.value!==''&&f.elements.humidityRaw?.value!=='')?calc.compliance:'';
}
async function envEditCorrectionLocked(){
  const pwd=prompt('Contraseña requerida para modificar la limitación/corrección:','');
  if(pwd!=='FT'){if(pwd!==null)toast('Contraseña incorrecta.');return}
  const old=envConfig();
  const t1=prompt('Corrección de temperatura para 15.0–24.9 °C (°C):',String(old.temperatureRules?.[0]?.delta??-0.2));if(t1===null)return;
  const h1=prompt('Corrección de humedad para 20.0–39.9 %HR:',String(old.humidityRules?.[0]?.delta??-2.1));if(h1===null)return;
  const h2=prompt('Corrección de humedad para 40.0–79.9 %HR:',String(old.humidityRules?.[1]?.delta??-1.0));if(h2===null)return;
  const vals=[Number(t1),Number(h1),Number(h2)];if(vals.some(v=>!Number.isFinite(v))){toast('Las correcciones deben ser valores numéricos.');return}
  const rec={...old,
    temperatureRules:[
      {...old.temperatureRules?.[0],min:15,max:24.9,delta:vals[0],label:`15.0–24.9 °C: valor leído ${vals[0]>=0?'+':'-'} ${Math.abs(vals[0]).toFixed(2)} °C`},
      {...old.temperatureRules?.[1],min:25,max:null,delta:0,label:'≥25.0 °C: sin corrección'}
    ],
    humidityRules:[
      {...old.humidityRules?.[0],min:20,max:39.9,delta:vals[1],label:`20.0–39.9 %HR: valor leído ${vals[1]>=0?'+':'-'} ${Math.abs(vals[1])} %`},
      {...old.humidityRules?.[1],min:40,max:79.9,delta:vals[2],label:`40.0–79.9 %HR: valor leído ${vals[2]>=0?'+':'-'} ${Math.abs(vals[2])} %`}
    ],
    updatedAt:nowISO(),updatedBy:activeUser()
  };
  await saveLocal('environmentConfig',rec,{render:false});
  await environmentTrace(envLocalToday(),'LIMITACIÓN / CORRECCIÓN MODIFICADA',
    `Temperatura: ${old.temperatureRules?.[0]?.delta??'—'} → ${vals[0]} · Humedad 20–39.9: ${old.humidityRules?.[0]?.delta??'—'} → ${vals[1]} · Humedad 40–79.9: ${old.humidityRules?.[1]?.delta??'—'} → ${vals[2]} · autorizado con clave FT`);
  await loadLocal();toast('Limitación/corrección actualizada y auditada.');
}
function envLocalToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function envLocalTime(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function envDateObj(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12,0,0)}
function envDayName(s){return ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][envDateObj(s).getDay()]}
function envHoliday(date){return state.environmentHolidays.find(h=>h.date===date)}
function envIsWeekend(date){const d=envDateObj(date).getDay();return d===0||d===6}
function envScheduled(date){return !envIsWeekend(date)&&!envHoliday(date)}
let environmentWorkingDate='';
function envRecord(date){return state.environmentalConditions.filter(r=>r.date===date).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null}
function envMonthDates(reference=envLocalToday()){
  const [y,m]=reference.split('-').map(Number),last=new Date(y,m,0).getDate(),arr=[];
  for(let d=1;d<=last;d++)arr.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  return arr;
}
function envProgramStatus(date){
  if(envIsWeekend(date))return {program:'NO PROGRAMADO',reason:'Fin de semana'};
  const h=envHoliday(date);if(h)return {program:'NO PROGRAMADO',reason:`Feriado: ${h.name}`};
  const r=envRecord(date);if(r)return {program:'PROGRAMADO',reason:'REGISTRADO'};
  if(date<envLocalToday())return {program:'PROGRAMADO',reason:'PENDIENTE'};
  if(date===envLocalToday())return {program:'PROGRAMADO',reason:'HOY · PENDIENTE'};
  return {program:'PROGRAMADO',reason:'PRÓXIMO'};
}
async function environmentTrace(controlDate,action,detail){
  await saveLocal('environmentTrace',{id:crypto.randomUUID(),controlDate,action,detail:String(detail||''),eventAt:nowISO(),user:activeUser(),deviceId},{render:false});
}
function envDifferenceSummary(oldRec,newRec){
  if(!oldRec)return `Temp. leída ${newRec.temperatureRaw} °C → corregida ${newRec.temperatureCorrected} °C · HR leída ${newRec.humidityRaw}% → corregida ${newRec.humidityCorrected}% · ${newRec.compliance}`;
  const fields=[['temperatureRaw','Temperatura leída'],['temperatureCorrected','Temperatura corregida'],['humidityRaw','Humedad leída'],['humidityCorrected','Humedad corregida'],['compliance','Cumplimiento'],['notes','Observaciones'],['time','Hora']],changes=[];
  for(const [k,label] of fields){if(String(oldRec[k]??'')!==String(newRec[k]??''))changes.push(`${label}: ${oldRec[k]??'—'} → ${newRec[k]??'—'}`)}
  return changes.join(' · ')||'Sin cambios detectados';
}
window.editEnvironmentRecord=date=>{environmentWorkingDate=date;
  const r=envRecord(date),f=$('#environmentForm');if(!r||!f)return;
  for(const [k,v] of Object.entries(r))if(f.elements[k])f.elements[k].value=v??'';
  if(f.elements.temperatureRaw&&r.temperatureRaw===undefined)f.elements.temperatureRaw.value=r.temperature??'';
  if(f.elements.humidityRaw&&r.humidityRaw===undefined)f.elements.humidityRaw.value=r.humidity??'';
  envApplyFormCorrection();
  document.querySelector('[data-equipment-tab="environment"]')?.click();
  f.scrollIntoView({behavior:'smooth',block:'center'});
};
window.deleteEnvironmentHoliday=async id=>{
  const h=state.environmentHolidays.find(x=>x.id===id);if(!h)return;
  if(!(await requireQualityDeleteAuthorization(`feriado ${h.date} · ${h.name}`)))return;
  if(!confirm(`Eliminar feriado ${h.date} · ${h.name}?`))return;
  const all=await idbAll('records'),row=all.find(x=>x.domain==='environmentHolidays'&&x.data?.id===id&&!x.deleted);
  if(row)await idbPut('records',{...row,deleted:true,data:{...row.data,deleted:true,deletedAt:nowISO(),deletedBy:activeUser()}});
  await centralAuditEvent({
    action:'DELETE',
    module:'Control de equipos y áreas',
    domain:'environmentHolidays',
    entityId:h.id,
    recordLabel:`${h.date} · ${h.name}`,
    before:h,
    after:{...h,deleted:true},
    details:{summary:`Feriado eliminado · ${h.date} · ${h.name}`,reason:'Eliminación autorizada por Calidad'}
  });
  await environmentTrace(h.date,'FERIADO ELIMINADO',h.name);
  await loadLocal();
  openConditionPane('ambient');
  toast('Feriado eliminado.');
};
function renderEnvironmentModule(){
  if(!$('#equipment-tab-environment'))return;
  if(!Array.isArray(state.environmentConfig))state.environmentConfig=[];
  const todayDate=envLocalToday(),month=envMonthDates(todayDate),scheduled=month.filter(envScheduled),records=scheduled.map(envRecord).filter(Boolean),pending=scheduled.filter(d=>d<=todayDate&&!envRecord(d)),limited=records.filter(r=>r.compliance==='NO CUMPLE');
  const todayScheduled=envScheduled(todayDate),todayRec=envRecord(todayDate);
  $('#envKpiToday').textContent=!todayScheduled?'NO PROGRAMADO':todayRec?'REGISTRADO':'PENDIENTE';
  $('#envKpiPending').textContent=pending.length;$('#envKpiRecorded').textContent=records.length;$('#envKpiLimited').textContent=limited.length;
  const h=envHoliday(todayDate);
  $('#environmentTodayCard').innerHTML=!todayScheduled
    ? `<b>Hoy no corresponde registro.</b><br>${envIsWeekend(todayDate)?'Fin de semana':`Feriado: ${esc(h?.name||'')}`}.`
    : todayRec
      ? `<b>Registro de hoy completado.</b><br>Temp. ${esc(todayRec.temperatureRaw??todayRec.temperature)} → ${esc(todayRec.temperatureCorrected??envCorrectValues(todayRec.temperatureRaw??todayRec.temperature,todayRec.humidityRaw??todayRec.humidity).temperatureCorrected)} °C · HR ${esc(todayRec.humidityRaw??todayRec.humidity)} → ${esc(todayRec.humidityCorrected??envCorrectValues(todayRec.temperatureRaw??todayRec.temperature,todayRec.humidityRaw??todayRec.humidity).humidityCorrected)} % · <b>${esc(todayRec.compliance||'—')}</b>.`
      : `<b>Registro de hoy pendiente.</b><br>Ingrese únicamente temperatura y humedad leídas; el ERP aplicará la corrección vigente y evaluará automáticamente.`;
  $('#environmentCalendarRows').innerHTML=month.map(d=>{const ps=envProgramStatus(d),r=envRecord(d),isNo=ps.program==='NO PROGRAMADO';return `<tr><td>${esc(d)}</td><td>${esc(envDayName(d))}</td><td>${isNo?'<span class="pill neutral">NO PROGRAMADO</span>':'<span class="pill ok">PROGRAMADO</span>'}</td><td>${ps.reason.includes('PENDIENTE')?'<span class="pill warn">'+esc(ps.reason)+'</span>':ps.reason==='REGISTRADO'?'<span class="pill ok">REGISTRADO</span>':esc(ps.reason)}</td><td>${r?esc(r.temperatureRaw)+' °C':'—'}</td><td>${r?esc(r.temperatureCorrected)+' °C':'—'}</td><td>${r?esc(r.humidityRaw)+' %':'—'}</td><td>${r?esc(r.humidityCorrected)+' %':'—'}</td><td>${r?(r.compliance==='CUMPLE'?'<span class="pill ok">CUMPLE</span>':'<span class="pill bad">NO CUMPLE</span>'):'—'}</td><td>${r?`<button onclick="editEnvironmentRecord('${d}')">✏️ Editar</button>`:(!isNo&&d<=todayDate?`<button onclick="prefillEnvironmentDate('${d}')">Registrar</button>`:'—')}</td></tr>`}).join('');
  $('#holidayRows').innerHTML=[...state.environmentHolidays].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(h=>`<tr><td>${esc(h.date)}</td><td>${esc(h.name)}</td><td><button onclick="deleteEnvironmentHoliday('${h.id}')">Eliminar</button></td></tr>`).join('')||'<tr><td colspan="3">Sin feriados configurados.</td></tr>';
  $('#environmentTraceRows').innerHTML=[...state.environmentTrace].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,500).map(t=>`<tr><td>${esc(new Date(t.eventAt).toLocaleString())}</td><td>${esc(t.controlDate)}</td><td><b>${esc(t.action)}</b></td><td>${esc(t.user)}</td><td>${esc(t.detail)}</td></tr>`).join('')||'<tr><td colspan="5">Sin eventos.</td></tr>';
  const cfg=envConfig();if($('#environmentCorrectionDisplay'))$('#environmentCorrectionDisplay').textContent=envCorrectionSummary(cfg);if($('#environmentAcceptanceDisplay'))$('#environmentAcceptanceDisplay').value=`Temperatura ${cfg.temperatureMin}–${cfg.temperatureMax} °C · Humedad <${cfg.humidityMax} %`;
  const f=$('#environmentForm');if(f){if(!f.elements.id.value){const workDate=environmentWorkingDate||f.elements.date.value||todayDate;environmentWorkingDate=workDate;f.elements.date.value=workDate;f.elements.time.value=f.elements.time.value||envLocalTime();f.elements.area.value='Microbiología';f.elements.analyst.value=activeUser()}const allowed=envScheduled(f.elements.date.value);for(const el of [...f.elements])if(el.name&&!['date'].includes(el.name)&&el.type!=='hidden')el.disabled=!allowed;if(!allowed)f.querySelector('button[type="submit"]').disabled=true;else f.querySelector('button[type="submit"]').disabled=false;envApplyFormCorrection()}
}
window.prefillEnvironmentDate=date=>{openConditionPane('ambient');environmentWorkingDate=date;const f=$('#environmentForm');f.reset();f.elements.id.value='';f.elements.date.value=date;f.elements.time.value=envLocalTime();f.elements.area.value='Microbiología';f.elements.analyst.value=activeUser();renderEnvironmentModule();f.scrollIntoView({behavior:'smooth',block:'center'})};
function bindEnvironmentModule(){
  if(!$('#equipment-tab-environment')||$('#equipment-tab-environment').dataset.bound)return;$('#equipment-tab-environment').dataset.bound='1';
  $('#environmentForm')?.addEventListener('input',e=>{if(e.target.name==='temperatureRaw'||e.target.name==='humidityRaw')envApplyFormCorrection()});
  $('#environmentForm')?.addEventListener('change',e=>{if(e.target.name==='date'){environmentWorkingDate=e.target.value;renderEnvironmentModule();}}); 
  $('#environmentEditCorrection')?.addEventListener('click',envEditCorrectionLocked);
  $('#environmentForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));environmentWorkingDate=fd.date;if(!envScheduled(fd.date)){toast('La fecha seleccionada no requiere registro: fin de semana o feriado.');return}const calc=envCorrectValues(fd.temperatureRaw,fd.humidityRaw);const previous=fd.id?state.environmentalConditions.find(r=>r.id===fd.id):envRecord(fd.date),cfg=envConfig();const rec={...previous,...fd,id:fd.id||previous?.id||crypto.randomUUID(),temperatureRaw:Number(fd.temperatureRaw),humidityRaw:Number(fd.humidityRaw),temperatureCorrected:calc.temperatureCorrected,humidityCorrected:calc.humidityCorrected,temperatureDelta:calc.tempDelta,humidityDelta:calc.humidityDelta,compliance:calc.compliance,acceptanceSnapshot:{temperatureMin:cfg.temperatureMin,temperatureMax:cfg.temperatureMax,humidityMax:cfg.humidityMax},correctionSnapshot:{instrumentCode:cfg.instrumentCode,temperatureRules:cfg.temperatureRules,humidityRules:cfg.humidityRules,configUpdatedAt:cfg.updatedAt,configUpdatedBy:cfg.updatedBy},area:'Microbiología',analyst:activeUser(),createdAt:previous?.createdAt||nowISO(),updatedAt:nowISO()};await saveLocal('environmentalConditions',rec,{render:false});await environmentTrace(rec.date,previous?'REGISTRO AMBIENTAL CORREGIDO':'CONDICIONES AMBIENTALES REGISTRADAS',envDifferenceSummary(previous,rec));f.reset();f.elements.id.value='';await loadLocal();openConditionPane('ambient');environmentWorkingDate='';f.elements.date.value=envLocalToday();renderEnvironmentModule();renderEnvironmentModule();toast(`Condiciones ambientales guardadas: ${rec.compliance}.`)});
  $('#environmentCancel')?.addEventListener('click',()=>{const f=$('#environmentForm');environmentWorkingDate='';f.reset();f.elements.id.value='';f.elements.date.value=envLocalToday();renderEnvironmentModule()});
  $('#holidayForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));if(state.environmentHolidays.some(h=>h.date===fd.date)){toast('Ya existe un feriado registrado para esa fecha.');return}const rec={...fd,id:crypto.randomUUID(),createdAt:nowISO(),createdBy:activeUser()};await saveLocal('environmentHolidays',rec,{render:false});await environmentTrace(fd.date,'FERIADO AGREGADO',fd.name);f.reset();await loadLocal();openConditionPane('ambient');toast('Feriado agregado al calendario.')});
  $('#environmentExportBtn')?.addEventListener('click',()=>{const rows=[['Fecha','Hora','Área','Temp. leída °C','Corrección temp. °C','Temp. corregida °C','HR leída %','Corrección HR %','HR corregida %','Cumplimiento','Observaciones','Analista'],...state.environmentalConditions.sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(r=>[r.date,r.time,r.area,r.temperatureRaw,r.temperatureDelta,r.temperatureCorrected,r.humidityRaw,r.humidityDelta,r.humidityCorrected,r.compliance,r.notes,r.analyst])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`condiciones_ambientales_microbiologia_${envLocalToday()}.csv`;a.click();URL.revokeObjectURL(a.href)});
}



// ===== V3.3.0-A · CONTROL DE CONDICIONES · NEVERA EI-61 =====
const DEFAULT_REFRIGERATOR_CONFIG={id:'refrigerator-ei61',name:'Nevera de agares y caldos preparados',equipmentCode:'EI-61',temperatureMin:2,temperatureMax:8,correctionDelta:0,updatedAt:'',updatedBy:''};
function refrigeratorConfig(){return (state.refrigeratorConfig||[]).find(x=>x.id===DEFAULT_REFRIGERATOR_CONFIG.id)||DEFAULT_REFRIGERATOR_CONFIG}
async function seedRefrigeratorConfig(){if(!(state.refrigeratorConfig||[]).some(x=>x.id===DEFAULT_REFRIGERATOR_CONFIG.id)){await saveLocal('refrigeratorConfig',{...DEFAULT_REFRIGERATOR_CONFIG,updatedAt:nowISO(),updatedBy:'SYSTEM'},{queue:false,render:false});await loadLocal()}}
const refrigeratorRecord=d=>(state.refrigeratorReadings||[]).find(x=>x.date===d&&!x.deleted);
function refrigeratorCalc(raw){const cfg=refrigeratorConfig(),r=Number(raw),c=Number.isFinite(r)?Number((r+Number(cfg.correctionDelta||0)).toFixed(2)):null;return {corrected:c,result:c!==null&&c>=cfg.temperatureMin&&c<=cfg.temperatureMax?'CUMPLE':'NO CUMPLE'}}
async function refrigeratorTrace(date,action,detail){await saveLocal('refrigeratorTrace',{id:crypto.randomUUID(),controlDate:date,action,detail,user:activeUser(),eventAt:nowISO()},{render:false})}
function refrigeratorChart(){const svg=$('#refrigeratorTrendChart');if(!svg)return;const month=envMonthDates(envLocalToday()),data=month.map(d=>refrigeratorRecord(d)).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));const W=1100,H=330,p={l:60,r:30,t:25,b:55},minY=0,maxY=10,x=i=>p.l+(data.length<=1?(W-p.l-p.r)/2:i*(W-p.l-p.r)/(data.length-1)),y=v=>p.t+(maxY-v)*(H-p.t-p.b)/(maxY-minY);let z=`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`;for(let v=0;v<=10;v+=2)z+=`<line x1="${p.l}" y1="${y(v)}" x2="${W-p.r}" y2="${y(v)}" stroke="#e7ecef"/><text x="${p.l-10}" y="${y(v)+4}" text-anchor="end" font-size="13" fill="#64748b">${v}</text>`;z+=`<line x1="${p.l}" y1="${y(2)}" x2="${W-p.r}" y2="${y(2)}" stroke="#b7791f" stroke-dasharray="7 5"/><line x1="${p.l}" y1="${y(8)}" x2="${W-p.r}" y2="${y(8)}" stroke="#b7791f" stroke-dasharray="7 5"/>`;if(data.length){const pts=data.map((r,i)=>`${x(i)},${y(Number(r.temperatureCorrected))}`).join(' ');z+=`<polyline points="${pts}" fill="none" stroke="#176b5b" stroke-width="3"/>`;data.forEach((r,i)=>{z+=`<circle cx="${x(i)}" cy="${y(Number(r.temperatureCorrected))}" r="5" fill="${r.result==='CUMPLE'?'#176b5b':'#b42318'}"><title>${r.date}: ${r.temperatureCorrected} °C · ${r.result}</title></circle>`;if(i%Math.max(1,Math.ceil(data.length/12))===0)z+=`<text x="${x(i)}" y="${H-25}" text-anchor="middle" font-size="12" fill="#64748b">${r.date.slice(8,10)}</text>`})}else z+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="18" fill="#64748b">Sin registros para graficar este mes</text>`;z+=`<text x="18" y="${H/2}" transform="rotate(-90 18 ${H/2})" text-anchor="middle" font-size="13" fill="#475569">Temperatura corregida (°C)</text>`;svg.innerHTML=z}
function renderRefrigeratorModule(){if(!$('#refrigeratorForm'))return;const td=envLocalToday(),month=envMonthDates(td),scheduled=month.filter(envScheduled),records=scheduled.map(refrigeratorRecord).filter(Boolean),pending=scheduled.filter(d=>d<=td&&!refrigeratorRecord(d)),outside=records.filter(r=>r.result==='NO CUMPLE');$('#fridgeKpiToday').textContent=!envScheduled(td)?'NO PROGRAMADO':refrigeratorRecord(td)?refrigeratorRecord(td).result:'PENDIENTE';$('#fridgeKpiPending').textContent=pending.length;$('#fridgeKpiRecorded').textContent=records.length;$('#fridgeKpiOutside').textContent=outside.length;const cfg=refrigeratorConfig();$('#refrigeratorCriterion').value=`${cfg.temperatureMin}–${cfg.temperatureMax} °C · ${cfg.equipmentCode}`;$('#refrigeratorCorrectionDisplay').textContent=`Corrección vigente: ${Number(cfg.correctionDelta)>=0?'+':''}${Number(cfg.correctionDelta||0).toFixed(2)} °C · modificable únicamente con FT.`;$('#refrigeratorCalendarRows').innerHTML=month.map(d=>{const scheduled=envScheduled(d),r=refrigeratorRecord(d);return `<tr><td>${d}</td><td>${envDayName(d)}</td><td>${scheduled?'<span class="pill ok">PROGRAMADO</span>':'<span class="pill neutral">NO PROGRAMADO</span>'}</td><td>${r?'<span class="pill '+(r.result==='CUMPLE'?'ok':'bad')+'">'+r.result+'</span>':scheduled&&d<=td?'<span class="pill warn">PENDIENTE</span>':'—'}</td><td>${r?r.temperatureRaw+' °C':'—'}</td><td>${r?r.temperatureCorrected+' °C':'—'}</td><td>${r?esc(r.analyst):'—'}</td><td>${r?`<button onclick="editRefrigeratorRecord('${d}')">✏️ Editar</button>`:scheduled&&d<=td?`<button onclick="prefillRefrigeratorDate('${d}')">Registrar</button>`:'—'}</td></tr>`}).join('');$('#refrigeratorTraceRows').innerHTML=[...(state.refrigeratorTrace||[])].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,300).map(t=>`<tr><td>${new Date(t.eventAt).toLocaleString()}</td><td>${t.controlDate}</td><td><b>${esc(t.action)}</b></td><td>${esc(t.user)}</td><td>${esc(t.detail)}</td></tr>`).join('')||'<tr><td colspan="5">Sin eventos.</td></tr>';const f=$('#refrigeratorForm');if(!f.elements.id.value){if(!f.elements.date.value)f.elements.date.value=td;f.elements.time.value=f.elements.time.value||envLocalTime();f.elements.analyst.value=activeUser()}const c=refrigeratorCalc(f.elements.temperatureRaw.value);f.elements.temperatureCorrected.value=c.corrected??'';f.elements.result.value=f.elements.temperatureRaw.value?c.result:'';refrigeratorChart()}
window.prefillRefrigeratorDate=d=>{openConditionPane('refrigerator');const f=$('#refrigeratorForm');f.reset();f.elements.id.value='';f.elements.date.value=d;f.elements.time.value=envLocalTime();f.elements.analyst.value=activeUser();renderRefrigeratorModule();f.scrollIntoView({behavior:'smooth',block:'center'})};
window.editRefrigeratorRecord=d=>{const r=refrigeratorRecord(d),f=$('#refrigeratorForm');if(!r)return;openConditionPane('refrigerator');Object.entries(r).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v??''});renderRefrigeratorModule();f.scrollIntoView({behavior:'smooth',block:'center'})};
let activeConditionPane='ambient';
function openConditionPane(name){
  if(!['ambient','refrigerator','refrigerator2'].includes(name))name='ambient';
  activeConditionPane=name;
  const ambient=$('#condition-ambient'),fridge=$('#condition-refrigerator'),fridge2=$('#condition-refrigerator2');
  if(ambient){ambient.classList.toggle('active',name==='ambient');ambient.style.display=name==='ambient'?'block':'none'}
  if(fridge){fridge.classList.toggle('active',name==='refrigerator');fridge.style.display=name==='refrigerator'?'block':'none'}
  if(fridge2){fridge2.classList.toggle('active',name==='refrigerator2');fridge2.style.display=name==='refrigerator2'?'block':'none'}
  $$('.condition-subtab[data-condition]').forEach(x=>{const on=x.dataset.condition===name;x.classList.toggle('active',on);x.setAttribute('aria-selected',on?'true':'false')});
  if(name==='ambient')renderEnvironmentModule();else if(name==='refrigerator')renderRefrigeratorModule();else renderRefrigerator2Module();
}
window.openConditionPane=openConditionPane;
function bindRefrigeratorModule(){
  const pane=$('#conditionsHub');if(!pane||pane.dataset.fridgeBound)return;pane.dataset.fridgeBound='1';
  $$('.condition-subtab[data-condition]').forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopPropagation();openConditionPane(b.dataset.condition)}});
  $('#refrigeratorForm')?.addEventListener('input',e=>{if(e.target.name==='temperatureRaw'){const c=refrigeratorCalc(e.target.value),f=e.currentTarget;f.elements.temperatureCorrected.value=c.corrected??'';f.elements.result.value=e.target.value?c.result:''}});
  $('#refrigeratorForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));if(!envScheduled(fd.date))return toast('La fecha no está programada: fin de semana o feriado.');const calc=refrigeratorCalc(fd.temperatureRaw),prev=fd.id?(state.refrigeratorReadings||[]).find(x=>x.id===fd.id):refrigeratorRecord(fd.date),cfg=refrigeratorConfig(),rec={...prev,...fd,id:fd.id||prev?.id||crypto.randomUUID(),temperatureRaw:Number(fd.temperatureRaw),temperatureCorrected:calc.corrected,correctionDelta:Number(cfg.correctionDelta||0),result:calc.result,analyst:activeUser(),equipmentCode:'EI-61',createdAt:prev?.createdAt||nowISO(),updatedAt:nowISO()};await saveLocal('refrigeratorReadings',rec,{render:false});await refrigeratorTrace(fd.date,prev?'REGISTRO NEVERA CORREGIDO':'CONTROL NEVERA REGISTRADO',`${rec.temperatureRaw} °C → ${rec.temperatureCorrected} °C · ${rec.result}`);f.reset();f.elements.id.value='';await loadLocal();openConditionPane('refrigerator');renderRefrigeratorModule();toast(`Nevera EI-61 guardada: ${rec.result}.`)});
  $('#refrigeratorEditCorrection')?.addEventListener('click',async()=>{const pwd=prompt('Contraseña para modificar la corrección / limitación de la Nevera EI-61:');if(pwd!=='FT')return toast('Contraseña incorrecta.');const cfg=refrigeratorConfig(),v=prompt('Corrección a aplicar a la lectura (°C). Ej.: -0.2, 0, +0.3',String(cfg.correctionDelta||0));if(v===null)return;const n=Number(v);if(!Number.isFinite(n))return toast('Corrección no válida.');await saveLocal('refrigeratorConfig',{...cfg,correctionDelta:n,updatedAt:nowISO(),updatedBy:activeUser()},{render:false});await refrigeratorTrace(envLocalToday(),'CORRECCIÓN NEVERA MODIFICADA',`${cfg.correctionDelta||0} °C → ${n} °C · autorizado FT`);await loadLocal();openConditionPane('refrigerator');toast('Corrección de Nevera EI-61 actualizada y trazada.')});
  $('#refrigeratorCancel')?.addEventListener('click',()=>{const f=$('#refrigeratorForm');f.reset();f.elements.id.value='';openConditionPane('refrigerator')});
  $('#refrigeratorExportBtn')?.addEventListener('click',()=>{const rows=[['Fecha','Hora','Equipo','Temperatura leída °C','Corrección °C','Temperatura corregida °C','Resultado','Analista','Observaciones'],...(state.refrigeratorReadings||[]).sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,r.time,r.equipmentCode,r.temperatureRaw,r.correctionDelta,r.temperatureCorrected,r.result,r.analyst,r.notes])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`nevera_EI61_${envLocalToday()}.csv`;a.click();URL.revokeObjectURL(a.href)});
  openConditionPane(activeConditionPane);
}


// ===== V3.3.0-B · CONTROL DE CONDICIONES · NEVERA 2 =====
const DEFAULT_REFRIGERATOR2_CONFIG={
  id:'refrigerator2-ei344',
  name:'Nevera 2',
  equipmentCode:'EI-344',
  temperatureMin:10,
  temperatureMax:25,
  correctionDelta:0,
  updatedAt:'',
  updatedBy:''
};
function refrigerator2Config(){return (state.refrigerator2Config||[]).find(x=>x.id===DEFAULT_REFRIGERATOR2_CONFIG.id)||DEFAULT_REFRIGERATOR2_CONFIG}
async function seedRefrigerator2Config(){if(!(state.refrigerator2Config||[]).some(x=>x.id===DEFAULT_REFRIGERATOR2_CONFIG.id)){await saveLocal('refrigerator2Config',{...DEFAULT_REFRIGERATOR2_CONFIG,updatedAt:nowISO(),updatedBy:'SYSTEM'},{queue:false,render:false});await loadLocal()}}
const refrigerator2Record=d=>(state.refrigerator2Readings||[]).find(x=>x.date===d&&!x.deleted);
function refrigerator2Calc(raw){
  const cfg=refrigerator2Config(),r=Number(raw),c=Number.isFinite(r)?Number((r+Number(cfg.correctionDelta||0)).toFixed(2)):null;
  return {corrected:c,result:c!==null&&c>=Number(cfg.temperatureMin)&&c<=Number(cfg.temperatureMax)?'CUMPLE':'NO CUMPLE'};
}
async function refrigerator2Trace(date,action,detail){await saveLocal('refrigerator2Trace',{id:crypto.randomUUID(),controlDate:date,action,detail,user:activeUser(),eventAt:nowISO()},{render:false})}
function refrigerator2Chart(){
  const svg=$('#refrigerator2TrendChart');if(!svg)return;
  const cfg=refrigerator2Config(),month=envMonthDates(envLocalToday()),data=month.map(d=>refrigerator2Record(d)).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  const W=1100,H=330,p={l:60,r:30,t:25,b:55},margin=Math.max(2,(Number(cfg.temperatureMax)-Number(cfg.temperatureMin))*.25),minY=Math.floor(Number(cfg.temperatureMin)-margin),maxY=Math.ceil(Number(cfg.temperatureMax)+margin);
  const x=i=>p.l+(data.length<=1?(W-p.l-p.r)/2:i*(W-p.l-p.r)/(data.length-1)),y=v=>p.t+(maxY-v)*(H-p.t-p.b)/(maxY-minY||1);
  let z=`<rect x="0" y="0" width="${W}" height="${H}" fill="white"/>`;
  const step=Math.max(1,Math.ceil((maxY-minY)/7));
  for(let v=minY;v<=maxY;v+=step)z+=`<line x1="${p.l}" y1="${y(v)}" x2="${W-p.r}" y2="${y(v)}" stroke="#e7ecef"/><text x="${p.l-10}" y="${y(v)+4}" text-anchor="end" font-size="13" fill="#64748b">${v}</text>`;
  z+=`<line x1="${p.l}" y1="${y(cfg.temperatureMin)}" x2="${W-p.r}" y2="${y(cfg.temperatureMin)}" stroke="#b7791f" stroke-dasharray="7 5"/><line x1="${p.l}" y1="${y(cfg.temperatureMax)}" x2="${W-p.r}" y2="${y(cfg.temperatureMax)}" stroke="#b7791f" stroke-dasharray="7 5"/>`;
  if(data.length){
    const pts=data.map((r,i)=>`${x(i)},${y(Number(r.temperatureCorrected))}`).join(' ');
    z+=`<polyline points="${pts}" fill="none" stroke="#176b5b" stroke-width="3"/>`;
    data.forEach((r,i)=>{z+=`<circle cx="${x(i)}" cy="${y(Number(r.temperatureCorrected))}" r="5" fill="${r.result==='CUMPLE'?'#176b5b':'#b42318'}"><title>${r.date}: ${r.temperatureCorrected} °C · ${r.result}</title></circle>`;if(i%Math.max(1,Math.ceil(data.length/12))===0)z+=`<text x="${x(i)}" y="${H-25}" text-anchor="middle" font-size="12" fill="#64748b">${r.date.slice(8,10)}</text>`})
  }else z+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="18" fill="#64748b">Sin registros para graficar este mes</text>`;
  z+=`<text x="18" y="${H/2}" transform="rotate(-90 18 ${H/2})" text-anchor="middle" font-size="13" fill="#475569">Temperatura corregida (°C)</text>`;
  svg.innerHTML=z;
}
function renderRefrigerator2Module(){
  if(!$('#refrigerator2Form'))return;
  const td=envLocalToday(),month=envMonthDates(td),scheduled=month.filter(envScheduled),records=scheduled.map(refrigerator2Record).filter(Boolean),pending=scheduled.filter(d=>d<=td&&!refrigerator2Record(d)),outside=records.filter(r=>r.result==='NO CUMPLE'),cfg=refrigerator2Config();
  $('#fridge2KpiToday').textContent=!envScheduled(td)?'NO PROGRAMADO':refrigerator2Record(td)?refrigerator2Record(td).result:'PENDIENTE';
  $('#fridge2KpiPending').textContent=pending.length;
  $('#fridge2KpiRecorded').textContent=records.length;
  $('#fridge2KpiOutside').textContent=outside.length;
  $('#refrigerator2EquipmentDisplay').value=`${cfg.name} · ${cfg.equipmentCode}`;
  $('#refrigerator2Criterion').value=`${cfg.temperatureMin}–${cfg.temperatureMax} °C · ${cfg.equipmentCode}`;
  $('#refrigerator2CorrectionDisplay').textContent=`Código ${cfg.equipmentCode} · rango ${cfg.temperatureMin}–${cfg.temperatureMax} °C · corrección ${Number(cfg.correctionDelta)>=0?'+':''}${Number(cfg.correctionDelta||0).toFixed(2)} °C · modificable únicamente con FT.`;
  $('#refrigerator2CalendarRows').innerHTML=month.map(d=>{const scheduled=envScheduled(d),r=refrigerator2Record(d);return `<tr><td>${d}</td><td>${envDayName(d)}</td><td>${scheduled?'<span class="pill ok">PROGRAMADO</span>':'<span class="pill neutral">NO PROGRAMADO</span>'}</td><td>${r?'<span class="pill '+(r.result==='CUMPLE'?'ok':'bad')+'">'+r.result+'</span>':scheduled&&d<=td?'<span class="pill warn">PENDIENTE</span>':'—'}</td><td>${r?r.temperatureRaw+' °C':'—'}</td><td>${r?r.temperatureCorrected+' °C':'—'}</td><td>${r?esc(r.analyst):'—'}</td><td>${r?`<button onclick="editRefrigerator2Record('${d}')">✏️ Editar</button>`:scheduled&&d<=td?`<button onclick="prefillRefrigerator2Date('${d}')">Registrar</button>`:'—'}</td></tr>`}).join('');
  $('#refrigerator2TraceRows').innerHTML=[...(state.refrigerator2Trace||[])].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,300).map(t=>`<tr><td>${new Date(t.eventAt).toLocaleString()}</td><td>${t.controlDate}</td><td><b>${esc(t.action)}</b></td><td>${esc(t.user)}</td><td>${esc(t.detail)}</td></tr>`).join('')||'<tr><td colspan="5">Sin eventos.</td></tr>';
  const f=$('#refrigerator2Form');if(!f.elements.id.value){if(!f.elements.date.value)f.elements.date.value=td;f.elements.time.value=f.elements.time.value||envLocalTime();f.elements.analyst.value=activeUser()}
  const c=refrigerator2Calc(f.elements.temperatureRaw.value);f.elements.temperatureCorrected.value=c.corrected??'';f.elements.result.value=f.elements.temperatureRaw.value?c.result:'';
  refrigerator2Chart();
}
window.prefillRefrigerator2Date=d=>{openConditionPane('refrigerator2');const f=$('#refrigerator2Form');f.reset();f.elements.id.value='';f.elements.date.value=d;f.elements.time.value=envLocalTime();f.elements.analyst.value=activeUser();renderRefrigerator2Module();f.scrollIntoView({behavior:'smooth',block:'center'})};
window.editRefrigerator2Record=d=>{const r=refrigerator2Record(d),f=$('#refrigerator2Form');if(!r)return;openConditionPane('refrigerator2');Object.entries(r).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v??''});renderRefrigerator2Module();f.scrollIntoView({behavior:'smooth',block:'center'})};
function bindRefrigerator2Module(){
  const pane=$('#conditionsHub');if(!pane||pane.dataset.fridge2Bound)return;pane.dataset.fridge2Bound='1';
  $('#refrigerator2Form')?.addEventListener('input',e=>{if(e.target.name==='temperatureRaw'){const c=refrigerator2Calc(e.target.value),f=e.currentTarget;f.elements.temperatureCorrected.value=c.corrected??'';f.elements.result.value=e.target.value?c.result:''}});
  $('#refrigerator2Form')?.addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));if(!envScheduled(fd.date))return toast('La fecha no está programada: fin de semana o feriado.');
    const calc=refrigerator2Calc(fd.temperatureRaw),prev=fd.id?(state.refrigerator2Readings||[]).find(x=>x.id===fd.id):refrigerator2Record(fd.date),cfg=refrigerator2Config(),
      rec={...prev,...fd,id:fd.id||prev?.id||crypto.randomUUID(),temperatureRaw:Number(fd.temperatureRaw),temperatureCorrected:calc.corrected,correctionDelta:Number(cfg.correctionDelta||0),temperatureMin:Number(cfg.temperatureMin),temperatureMax:Number(cfg.temperatureMax),result:calc.result,analyst:activeUser(),equipmentCode:cfg.equipmentCode,createdAt:prev?.createdAt||nowISO(),updatedAt:nowISO()};
    await saveLocal('refrigerator2Readings',rec,{render:false});
    await refrigerator2Trace(fd.date,prev?'REGISTRO NEVERA 2 CORREGIDO':'CONTROL NEVERA 2 REGISTRADO',`${rec.temperatureRaw} °C → ${rec.temperatureCorrected} °C · rango ${rec.temperatureMin}–${rec.temperatureMax} °C · ${rec.result}`);
    f.reset();f.elements.id.value='';await loadLocal();openConditionPane('refrigerator2');renderRefrigerator2Module();toast(`Nevera 2 · ${cfg.equipmentCode} guardada: ${rec.result}.`);
  });
  $('#refrigerator2EditConfig')?.addEventListener('click',async()=>{
    const pwd=prompt('Contraseña para modificar código, rango o corrección de Nevera 2:');if(pwd!=='FT')return toast('Contraseña incorrecta.');
    const cfg=refrigerator2Config(),code=prompt('Código del equipo:',cfg.equipmentCode);if(code===null)return;
    const min=prompt('Límite inferior de temperatura (°C):',String(cfg.temperatureMin));if(min===null)return;
    const max=prompt('Límite superior de temperatura (°C):',String(cfg.temperatureMax));if(max===null)return;
    const delta=prompt('Corrección / factor a aplicar a la lectura (°C). Ej.: -0.2, 0, +0.3',String(cfg.correctionDelta||0));if(delta===null)return;
    const mn=Number(min),mx=Number(max),d=Number(delta);if(!Number.isFinite(mn)||!Number.isFinite(mx)||mn>=mx||!Number.isFinite(d))return toast('Configuración no válida.');
    const rec={...cfg,equipmentCode:String(code).trim()||cfg.equipmentCode,temperatureMin:mn,temperatureMax:mx,correctionDelta:d,updatedAt:nowISO(),updatedBy:activeUser()};
    await saveLocal('refrigerator2Config',rec,{render:false});
    await refrigerator2Trace(envLocalToday(),'CONFIGURACIÓN NEVERA 2 MODIFICADA',`Código ${cfg.equipmentCode} → ${rec.equipmentCode} · rango ${cfg.temperatureMin}–${cfg.temperatureMax} → ${mn}–${mx} °C · corrección ${cfg.correctionDelta||0} → ${d} °C · autorizado FT`);
    await loadLocal();openConditionPane('refrigerator2');toast('Configuración de Nevera 2 actualizada y trazada.');
  });
  $('#refrigerator2Cancel')?.addEventListener('click',()=>{const f=$('#refrigerator2Form');f.reset();f.elements.id.value='';openConditionPane('refrigerator2')});
  $('#refrigerator2ExportBtn')?.addEventListener('click',()=>{const rows=[['Fecha','Hora','Equipo','Rango mínimo °C','Rango máximo °C','Temperatura leída °C','Corrección °C','Temperatura corregida °C','Resultado','Analista','Observaciones'],...(state.refrigerator2Readings||[]).sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,r.time,r.equipmentCode,r.temperatureMin,r.temperatureMax,r.temperatureRaw,r.correctionDelta,r.temperatureCorrected,r.result,r.analyst,r.notes])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`nevera2_${refrigerator2Config().equipmentCode}_${envLocalToday()}.csv`;a.click();URL.revokeObjectURL(a.href)});
}

// ===== V3.2.0-A · CARTA DE CONTROL DE INCUBADORA =====
const DEFAULT_INCUBATOR_CONFIG={
  id:'incubator-ei365',
  name:'Incubadora de Microbiología',
  equipmentCode:'EI/365',
  referenceThermometer:'PF/09',
  target:35.0,
  lowerLimit:34.5,
  upperLimit:35.5,
  schedule:'WORKDAYS',
  active:true,
  updatedAt:'',
  updatedBy:''
};
function incubatorConfig(){const a=Array.isArray(state.incubatorConfig)?state.incubatorConfig:[];return a.find(x=>x.id===DEFAULT_INCUBATOR_CONFIG.id)||DEFAULT_INCUBATOR_CONFIG}
async function seedIncubatorConfig(){
  if(!Array.isArray(state.incubatorConfig))state.incubatorConfig=[];
  if(state.incubatorConfig.some(x=>x.id===DEFAULT_INCUBATOR_CONFIG.id))return;
  await saveLocal('incubatorConfig',{...DEFAULT_INCUBATOR_CONFIG,updatedAt:nowISO(),updatedBy:'SYSTEM'},{queue:false,render:false});
  await loadLocal();
}
async function migrateIncubatorScheduleWorkdays(){
  const cfg=incubatorConfig();
  if(cfg.schedule==='DAILY'){
    await saveLocal('incubatorConfig',{...cfg,schedule:'WORKDAYS',updatedAt:nowISO(),updatedBy:'SYSTEM',scheduleMigration:'V3.2.0-A1'},{queue:false,render:false});
    await incubatorTrace('PROGRAMACIÓN ACTUALIZADA','Carta de incubadora: lunes a viernes; sábados, domingos y feriados quedan NO PROGRAMADOS.');
    await loadLocal();
  }
}
function incubatorDateObj(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12,0,0)}
function incubatorDayName(s){return ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][incubatorDateObj(s).getDay()]}
function incubatorScheduled(date){
  const cfg=incubatorConfig();
  if(typeof envHoliday==='function'&&envHoliday(date))return false;
  if(cfg.schedule==='DAILY')return true;
  const dow=incubatorDateObj(date).getDay();
  return dow!==0&&dow!==6;
}
function incubatorNonProgrammedReason(date){
  if(typeof envHoliday==='function'&&envHoliday(date))return 'FERIADO';
  const dow=incubatorDateObj(date).getDay();
  if(dow===0||dow===6)return 'FIN DE SEMANA';
  return '';
}
function incubatorReading(date){return [...state.incubatorReadings].filter(r=>r.date===date).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null}
function incubatorEvaluate(temp){
  const cfg=incubatorConfig(),n=Number(temp);
  if(!Number.isFinite(n))return {result:'PENDIENTE'};
  return {result:n>=Number(cfg.lowerLimit)&&n<=Number(cfg.upperLimit)?'CUMPLE':'FUERA DE CONTROL'};
}
function incubatorMonthDates(monthValue){
  const value=monthValue||envLocalToday().slice(0,7),[y,m]=value.split('-').map(Number),last=new Date(y,m,0).getDate(),out=[];
  for(let d=1;d<=last;d++)out.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  return out;
}
async function incubatorTrace(action,detail){
  await saveLocal('incubatorTrace',{id:crypto.randomUUID(),action,detail:String(detail||''),eventAt:nowISO(),user:activeUser(),deviceId},{render:false});
}
function incubatorStats(records){
  const nums=records.filter(r=>r.status!=='NO_UTILIZADO').map(r=>Number(r.temperature)).filter(Number.isFinite);
  if(!nums.length)return {avg:null,min:null,max:null,out:0};
  const cfg=incubatorConfig();
  return {avg:nums.reduce((a,b)=>a+b,0)/nums.length,min:Math.min(...nums),max:Math.max(...nums),out:nums.filter(x=>x<cfg.lowerLimit||x>cfg.upperLimit).length};
}
function incubatorChartSvg(monthValue){
  const cfg=incubatorConfig(),dates=incubatorMonthDates(monthValue),w=1100,h=360,p={l:70,r:30,t:28,b:58},monthTemps=dates.map(incubatorReading).filter(r=>r&&r.status!=='NO_UTILIZADO').map(r=>Number(r.temperature)).filter(Number.isFinite);
  const yMin=Math.min(Number(cfg.lowerLimit)-0.5,...monthTemps);
  const yMax=Math.max(Number(cfg.upperLimit)+0.5,...monthTemps);
  const ymin=Number.isFinite(yMin)?yMin:34,ymax=Number.isFinite(yMax)?yMax:36;
  const x=i=>p.l+(dates.length<=1?0:i*(w-p.l-p.r)/(dates.length-1));
  const y=v=>p.t+(ymax-v)*(h-p.t-p.b)/(ymax-ymin||1);
  let s=`<rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="white"/>`;
  const ticks=[];for(let v=Math.floor(ymin*2)/2;v<=Math.ceil(ymax*2)/2+0.001;v+=0.5)ticks.push(Number(v.toFixed(1)));
  for(const v of ticks){s+=`<line x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}" class="inc-grid"/><text x="${p.l-12}" y="${y(v)+4}" text-anchor="end" class="inc-axis">${v.toFixed(1)}</text>`}
  for(const [v,cls,label] of [[cfg.lowerLimit,'inc-limit','LÍM INF'],[cfg.target,'inc-center','OBJETIVO'],[cfg.upperLimit,'inc-limit','LÍM SUP']]){
    s+=`<line x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}" class="${cls}"/><text x="${w-p.r-4}" y="${y(v)-6}" text-anchor="end" class="inc-label">${label} ${Number(v).toFixed(1)} °C</text>`;
  }
  const pts=[];
  dates.forEach((d,i)=>{const r=incubatorReading(d);if(r&&r.status!=='NO_UTILIZADO'&&Number.isFinite(Number(r.temperature)))pts.push({x:x(i),y:y(Number(r.temperature)),d,r})});
  if(pts.length>1)s+=`<polyline points="${pts.map(q=>`${q.x},${q.y}`).join(' ')}" class="inc-data-line"/>`;
  for(const q of pts){const bad=q.r.result==='FUERA DE CONTROL';s+=`<circle cx="${q.x}" cy="${q.y}" r="5" class="${bad?'inc-point-bad':'inc-point'}"><title>${q.d}: ${q.r.temperature} °C · ${q.r.result}</title></circle>`}
  dates.forEach((d,i)=>{const day=Number(d.slice(-2));if(day===1||day%2===0||day===dates.length)s+=`<text x="${x(i)}" y="${h-28}" text-anchor="middle" class="inc-axis">${day}</text>`});
  s+=`<text x="${(p.l+w-p.r)/2}" y="${h-8}" text-anchor="middle" class="inc-axis-title">Día del mes</text><text transform="translate(18 ${(p.t+h-p.b)/2}) rotate(-90)" text-anchor="middle" class="inc-axis-title">Temperatura (°C)</text>`;
  if(!pts.length)s+=`<text x="${w/2}" y="${h/2}" text-anchor="middle" class="inc-empty">Sin registros en este mes</text>`;
  return s;
}
function updateIncubatorReadingPreview(){
  const f=$('#incubatorReadingForm');if(!f)return;const temp=f.elements.temperature.value,ev=incubatorEvaluate(temp),cfg=incubatorConfig(),box=$('#incubatorReadingPreview');
  f.elements.result.value=temp===''?'':ev.result;
  if(temp===''){box.className='span-2 state-card state-pending';box.innerHTML='<strong>PENDIENTE</strong><span>Ingrese la temperatura.</span>';return}
  box.className='span-2 state-card '+(ev.result==='CUMPLE'?'state-ok':'state-pending');
  box.innerHTML=`<strong>${ev.result}</strong><span>${Number(temp).toFixed(1)} °C · criterio ${cfg.lowerLimit.toFixed(1)}–${cfg.upperLimit.toFixed(1)} °C · objetivo ${cfg.target.toFixed(1)} °C.</span>`;
}
function updateIncubatorVerificationDifference(){
  const f=$('#incubatorVerificationForm');if(!f)return;const a=Number(f.elements.equipmentTemperature.value),b=Number(f.elements.referenceTemperature.value);
  f.elements.difference.value=Number.isFinite(a)&&Number.isFinite(b)?(a-b).toFixed(2):'';
}
function renderIncubatorModule(){
  if(!$('#equipment-tab-incubator'))return;
  if(!Array.isArray(state.incubatorConfig))state.incubatorConfig=[];
  const cfg=incubatorConfig(),month=$('#incubatorMonth')?.value||envLocalToday().slice(0,7),dates=incubatorMonthDates(month),records=dates.map(incubatorReading).filter(Boolean),stats=incubatorStats(records),todayRec=incubatorReading(envLocalToday());
  if($('#incubatorMonth')&&!$('#incubatorMonth').value)$('#incubatorMonth').value=month;
  $('#incKpiToday').textContent=todayRec?(todayRec.status==='NO_UTILIZADO'?'NO UTILIZADO':todayRec.result):(incubatorScheduled(envLocalToday())?'PENDIENTE':'NO PROGRAMADO');
  $('#incKpiAverage').textContent=stats.avg===null?'—':stats.avg.toFixed(2)+' °C';
  $('#incKpiMin').textContent=stats.min===null?'—':stats.min.toFixed(1)+' °C';
  $('#incKpiMax').textContent=stats.max===null?'—':stats.max.toFixed(1)+' °C';
  $('#incKpiOut').textContent=stats.out;
  $('#incubatorEquipmentTitle').textContent=`${cfg.name} · ${cfg.equipmentCode}`;
  $('#incubatorCriteriaText').textContent=`Objetivo ${cfg.target.toFixed(1)} °C · límites ${cfg.lowerLimit.toFixed(1)}–${cfg.upperLimit.toFixed(1)} °C · ${cfg.schedule==='DAILY'?'todos los días, excluye feriados':'lunes a viernes, excluye feriados'}`;
  $('#incubatorChart').innerHTML=incubatorChartSvg(month);
  $('#incubatorReadingRows').innerHTML=dates.map(d=>{const r=incubatorReading(d),scheduled=incubatorScheduled(d),reason=incubatorNonProgrammedReason(d),pastOrToday=d<=envLocalToday();if(!scheduled)return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>—</td><td>—</td><td><span class="pill neutral">NO PROGRAMADO · ${esc(reason)}</span></td><td>—</td><td>—</td></tr>`;if(r?.status==='NO_UTILIZADO')return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>${esc(r.time||'—')}</td><td>—</td><td><span class="pill neutral">NO UTILIZADO</span></td><td>${esc(r.analyst||'—')}</td><td><button onclick="prefillIncubatorReading('${d}')">Registrar uso</button></td></tr>`;if(r)return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>${esc(r.time||'—')}</td><td>${esc(r.temperature)} °C</td><td>${r.result==='CUMPLE'?'<span class="pill ok">CUMPLE</span>':'<span class="pill bad">FUERA DE CONTROL</span>'}</td><td>${esc(r.analyst||'—')}</td><td><button onclick="editIncubatorReading('${d}')">✏️ Editar</button></td></tr>`;return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>—</td><td>—</td><td>${pastOrToday?'<span class="pill warn">PENDIENTE</span>':'—'}</td><td>—</td><td>${pastOrToday?`<button onclick="prefillIncubatorReading('${d}')">Registrar</button> <button onclick="markIncubatorNotUsed('${d}')">✓ No se utilizó</button>`:'—'}</td></tr>`}).join('');
  $('#incubatorVerificationRows').innerHTML=[...state.incubatorVerifications].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(v=>`<tr><td>${esc(v.date)}</td><td>${esc(v.equipmentCode)}</td><td>${esc(v.referenceCode)}</td><td>${esc(v.equipmentTemperature)} °C</td><td>${esc(v.referenceTemperature)} °C</td><td>${esc(v.difference)} °C</td><td>${esc(v.analyst)}</td></tr>`).join('')||'<tr><td colspan="7">Sin verificaciones registradas.</td></tr>';
  $('#incubatorTraceRows').innerHTML=[...state.incubatorTrace].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,300).map(t=>`<tr><td>${esc(new Date(t.eventAt).toLocaleString())}</td><td><b>${esc(t.action)}</b></td><td>${esc(t.user)}</td><td>${esc(t.detail)}</td></tr>`).join('')||'<tr><td colspan="4">Sin eventos.</td></tr>';
  const rf=$('#incubatorReadingForm');if(rf&&!rf.elements.id.value){rf.elements.date.value=rf.elements.date.value||envLocalToday();rf.elements.time.value=rf.elements.time.value||envLocalTime();rf.elements.equipmentCode.value=cfg.equipmentCode;rf.elements.analyst.value=activeUser()}
  const vf=$('#incubatorVerificationForm');if(vf){vf.elements.date.value=vf.elements.date.value||envLocalToday();vf.elements.equipmentCode.value=cfg.equipmentCode;vf.elements.referenceCode.value=vf.elements.referenceCode.value||cfg.referenceThermometer;vf.elements.analyst.value=activeUser()}
  updateIncubatorReadingPreview();updateIncubatorVerificationDifference();
}
window.markIncubatorNotUsed=async date=>{
  if(!incubatorScheduled(date)){toast('Ese día no está programado para control.');return}
  if(date>envLocalToday()){toast('No puede justificar una fecha futura.');return}
  const existing=incubatorReading(date);
  if(existing&&existing.status!=='NO_UTILIZADO'){toast('Ya existe una lectura registrada para esa fecha.');return}
  if(!confirm(`Marcar ${date} como NO UTILIZADO? Quedará justificado y trazable.`))return;
  const rec={...(existing||{}),id:existing?.id||crypto.randomUUID(),date,time:envLocalTime(),equipmentCode:incubatorConfig().equipmentCode,status:'NO_UTILIZADO',result:'NO UTILIZADO',temperature:null,analyst:activeUser(),notes:'Incubadora no utilizada / no se realizaron ensayos que requirieran registro.',createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO()};
  await saveLocal('incubatorReadings',rec,{render:false});
  await incubatorTrace(existing?'NO USO CONFIRMADO':'DÍA JUSTIFICADO · NO UTILIZADO',`${date} ${rec.time} · incubadora no utilizada · no afecta cumplimiento de la carta`);
  await loadLocal();toast('Día marcado como NO UTILIZADO.');
};
window.prefillIncubatorReading=date=>{openControlChart('incubator');const f=$('#incubatorReadingForm');f.reset();f.elements.id.value='';f.elements.date.value=date;f.elements.time.value=envLocalTime();f.elements.equipmentCode.value=incubatorConfig().equipmentCode;f.elements.analyst.value=activeUser();updateIncubatorReadingPreview();f.scrollIntoView({behavior:'smooth',block:'center'})};
window.editIncubatorReading=date=>{const r=incubatorReading(date),f=$('#incubatorReadingForm');if(!r||!f)return;if(r.status==='NO_UTILIZADO'){prefillIncubatorReading(date);return}for(const [k,v] of Object.entries(r))if(f.elements[k])f.elements[k].value=v??'';openControlChart('incubator');updateIncubatorReadingPreview();f.scrollIntoView({behavior:'smooth',block:'center'})};
async function editIncubatorConfigLocked(){
  const pwd=prompt('Contraseña de configuración:','');if(pwd!=='FT'){if(pwd!==null)toast('Contraseña incorrecta.');return}
  const old=incubatorConfig(),target=prompt('Temperatura objetivo (°C):',String(old.target));if(target===null)return;
  const low=prompt('Límite inferior (°C):',String(old.lowerLimit));if(low===null)return;
  const high=prompt('Límite superior (°C):',String(old.upperLimit));if(high===null)return;
  const schedule=prompt('Programación: WORKDAYS o DAILY',old.schedule);if(schedule===null)return;
  const vals=[Number(target),Number(low),Number(high)];if(vals.some(v=>!Number.isFinite(v))||vals[1]>=vals[2]||!['WORKDAYS','DAILY'].includes(String(schedule).toUpperCase())){toast('Configuración inválida.');return}
  const rec={...old,target:vals[0],lowerLimit:vals[1],upperLimit:vals[2],schedule:String(schedule).toUpperCase(),updatedAt:nowISO(),updatedBy:activeUser()};
  await saveLocal('incubatorConfig',rec,{render:false});await incubatorTrace('CONFIGURACIÓN MODIFICADA',`Objetivo ${old.target}→${rec.target} · límite inf. ${old.lowerLimit}→${rec.lowerLimit} · límite sup. ${old.upperLimit}→${rec.upperLimit} · programación ${old.schedule}→${rec.schedule}`);await loadLocal();toast('Configuración de incubadora actualizada.');
}
function bindIncubatorModule(){
  if(!$('#equipment-tab-incubator')||$('#equipment-tab-incubator').dataset.bound)return;$('#equipment-tab-incubator').dataset.bound='1';
  $('#incubatorMonth')?.addEventListener('change',renderIncubatorModule);
  $('#incubatorReadingForm')?.addEventListener('input',e=>{if(e.target.name==='temperature')updateIncubatorReadingPreview()});
  $('#incubatorReadingForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));if(!incubatorScheduled(fd.date)){toast('La fecha seleccionada no está programada para control.');return}const previous=fd.id?state.incubatorReadings.find(x=>x.id===fd.id):incubatorReading(fd.date),ev=incubatorEvaluate(fd.temperature),cfg=incubatorConfig();const replacingNoUse=previous?.status==='NO_UTILIZADO';const rec={...previous,...fd,id:fd.id||previous?.id||crypto.randomUUID(),temperature:Number(fd.temperature),status:'REGISTRADO',result:ev.result,analyst:activeUser(),criteriaSnapshot:{target:cfg.target,lowerLimit:cfg.lowerLimit,upperLimit:cfg.upperLimit,equipmentCode:cfg.equipmentCode},createdAt:previous?.createdAt||nowISO(),updatedAt:nowISO()};await saveLocal('incubatorReadings',rec,{render:false});await incubatorTrace(replacingNoUse?'NO USO REEMPLAZADO POR LECTURA':(previous?'LECTURA CORREGIDA':'LECTURA REGISTRADA'),`${rec.date} ${rec.time} · ${rec.temperature} °C · ${rec.result}${previous&&!replacingNoUse?` · antes ${previous.temperature} °C`:''}`);f.reset();f.elements.id.value='';await loadLocal();toast(`Temperatura guardada: ${rec.result}.`)});
  $('#incubatorReadingCancel')?.addEventListener('click',()=>{const f=$('#incubatorReadingForm');f.reset();f.elements.id.value='';renderIncubatorModule()});
  $('#incubatorVerificationForm')?.addEventListener('input',e=>{if(['equipmentTemperature','referenceTemperature'].includes(e.target.name))updateIncubatorVerificationDifference()});
  $('#incubatorVerificationForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),diff=Number(fd.equipmentTemperature)-Number(fd.referenceTemperature);const rec={...fd,id:crypto.randomUUID(),equipmentTemperature:Number(fd.equipmentTemperature),referenceTemperature:Number(fd.referenceTemperature),difference:Number(diff.toFixed(2)),analyst:activeUser(),createdAt:nowISO()};await saveLocal('incubatorVerifications',rec,{render:false});await incubatorTrace('VERIFICACIÓN CON PATRÓN',`${rec.date} · ${rec.equipmentCode} ${rec.equipmentTemperature} °C · ${rec.referenceCode} ${rec.referenceTemperature} °C · diferencia ${rec.difference} °C`);f.reset();await loadLocal();toast('Verificación registrada.')});
  $('#incubatorEditConfig')?.addEventListener('click',editIncubatorConfigLocked);
  $('#incubatorExportBtn')?.addEventListener('click',()=>{const month=$('#incubatorMonth')?.value||envLocalToday().slice(0,7),rows=[['Fecha','Hora','Equipo','Estado','Temperatura °C','Resultado','Analista','Observaciones'],...incubatorMonthDates(month).map(incubatorReading).filter(Boolean).map(r=>[r.date,r.time,r.equipmentCode,r.status||'REGISTRADO',r.temperature??'',r.result,r.analyst,r.notes])],csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`carta_control_incubadora_${month}.csv`;a.click();URL.revokeObjectURL(a.href)});
}


// ===== V3.2.0-B · CARTA DE CONTROL BAÑO DE MARÍA =====
const DEFAULT_WATER_BATH_CONFIG={
  id:'water-bath-microbiology',
  name:'Baño de María',
  equipmentCode:'POR DEFINIR',
  referenceThermometer:'PF/09',
  target:44.5,
  lowerLimit:44.0,
  upperLimit:45.0,
  schedule:'WORKDAYS',
  active:true,
  updatedAt:'',
  updatedBy:''
};
function waterBathConfig(){const a=Array.isArray(state.waterBathConfig)?state.waterBathConfig:[];return a.find(x=>x.id===DEFAULT_WATER_BATH_CONFIG.id)||DEFAULT_WATER_BATH_CONFIG}
async function seedWaterBathConfig(){
  if(!Array.isArray(state.waterBathConfig))state.waterBathConfig=[];
  if(state.waterBathConfig.some(x=>x.id===DEFAULT_WATER_BATH_CONFIG.id))return;
  await saveLocal('waterBathConfig',{...DEFAULT_WATER_BATH_CONFIG,updatedAt:nowISO(),updatedBy:'SYSTEM'},{queue:false,render:false});
  await loadLocal();
}
function waterBathScheduled(date){
  const cfg=waterBathConfig();
  if(typeof envHoliday==='function'&&envHoliday(date))return false;
  if(cfg.schedule==='DAILY')return true;
  const dow=incubatorDateObj(date).getDay();
  return dow!==0&&dow!==6;
}
function waterBathNonProgrammedReason(date){
  if(typeof envHoliday==='function'&&envHoliday(date))return 'FERIADO';
  const dow=incubatorDateObj(date).getDay();
  if(dow===0||dow===6)return 'FIN DE SEMANA';
  return '';
}
function waterBathReading(date){return [...state.waterBathReadings].filter(r=>r.date===date).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null}
function waterBathEvaluate(temp){
  const cfg=waterBathConfig(),n=Number(temp);
  if(!Number.isFinite(n))return {result:'PENDIENTE'};
  return {result:n>=Number(cfg.lowerLimit)&&n<=Number(cfg.upperLimit)?'CUMPLE':'FUERA DE CONTROL'};
}
async function waterBathTrace(action,detail){
  await saveLocal('waterBathTrace',{id:crypto.randomUUID(),action,detail:String(detail||''),eventAt:nowISO(),user:activeUser(),deviceId},{render:false});
}
function waterBathStats(records){
  const nums=records.filter(r=>r.status!=='NO_UTILIZADO').map(r=>Number(r.temperature)).filter(Number.isFinite);
  if(!nums.length)return {avg:null,min:null,max:null,out:0};
  const cfg=waterBathConfig();
  return {avg:nums.reduce((a,b)=>a+b,0)/nums.length,min:Math.min(...nums),max:Math.max(...nums),out:nums.filter(x=>x<cfg.lowerLimit||x>cfg.upperLimit).length};
}
function waterBathChartSvg(monthValue){
  const cfg=waterBathConfig(),dates=incubatorMonthDates(monthValue),w=1100,h=360,p={l:70,r:30,t:28,b:58},
    monthTemps=dates.map(waterBathReading).filter(r=>r&&r.status!=='NO_UTILIZADO').map(r=>Number(r.temperature)).filter(Number.isFinite);
  const yMin=Math.min(Number(cfg.lowerLimit)-0.5,...monthTemps);
  const yMax=Math.max(Number(cfg.upperLimit)+0.5,...monthTemps);
  const ymin=Number.isFinite(yMin)?yMin:43.5,ymax=Number.isFinite(yMax)?yMax:45.5;
  const x=i=>p.l+(dates.length<=1?0:i*(w-p.l-p.r)/(dates.length-1));
  const y=v=>p.t+(ymax-v)*(h-p.t-p.b)/(ymax-ymin||1);
  let s=`<rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="white"/>`;
  const ticks=[];for(let v=Math.floor(ymin*2)/2;v<=Math.ceil(ymax*2)/2+0.001;v+=0.5)ticks.push(Number(v.toFixed(1)));
  for(const v of ticks){s+=`<line x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}" class="inc-grid"/><text x="${p.l-12}" y="${y(v)+4}" text-anchor="end" class="inc-axis">${v.toFixed(1)}</text>`}
  for(const [v,cls,label] of [[cfg.lowerLimit,'inc-limit','LÍM INF'],[cfg.target,'inc-center','OBJETIVO'],[cfg.upperLimit,'inc-limit','LÍM SUP']]){
    s+=`<line x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}" class="${cls}"/><text x="${w-p.r-4}" y="${y(v)-6}" text-anchor="end" class="inc-label">${label} ${Number(v).toFixed(1)} °C</text>`;
  }
  const pts=[];
  dates.forEach((d,i)=>{const r=waterBathReading(d);if(r&&r.status!=='NO_UTILIZADO'&&Number.isFinite(Number(r.temperature)))pts.push({x:x(i),y:y(Number(r.temperature)),d,r})});
  if(pts.length>1)s+=`<polyline points="${pts.map(q=>`${q.x},${q.y}`).join(' ')}" class="inc-data-line"/>`;
  for(const q of pts){const bad=q.r.result==='FUERA DE CONTROL';s+=`<circle cx="${q.x}" cy="${q.y}" r="5" class="${bad?'inc-point-bad':'inc-point'}"><title>${q.d}: ${q.r.temperature} °C · ${q.r.result}</title></circle>`}
  dates.forEach((d,i)=>{const day=Number(d.slice(-2));if(day===1||day%2===0||day===dates.length)s+=`<text x="${x(i)}" y="${h-28}" text-anchor="middle" class="inc-axis">${day}</text>`});
  s+=`<text x="${(p.l+w-p.r)/2}" y="${h-8}" text-anchor="middle" class="inc-axis-title">Día del mes</text><text transform="translate(18 ${(p.t+h-p.b)/2}) rotate(-90)" text-anchor="middle" class="inc-axis-title">Temperatura (°C)</text>`;
  if(!pts.length)s+=`<text x="${w/2}" y="${h/2}" text-anchor="middle" class="inc-empty">Sin registros en este mes</text>`;
  return s;
}
function updateWaterBathReadingPreview(){
  const f=$('#waterBathReadingForm');if(!f)return;const temp=f.elements.temperature.value,ev=waterBathEvaluate(temp),cfg=waterBathConfig(),box=$('#waterBathReadingPreview');
  f.elements.result.value=temp===''?'':ev.result;
  if(temp===''){box.className='span-2 state-card state-pending';box.innerHTML='<strong>PENDIENTE</strong><span>Ingrese la temperatura.</span>';return}
  box.className='span-2 state-card '+(ev.result==='CUMPLE'?'state-ok':'state-pending');
  box.innerHTML=`<strong>${ev.result}</strong><span>${Number(temp).toFixed(1)} °C · criterio ${cfg.lowerLimit.toFixed(1)}–${cfg.upperLimit.toFixed(1)} °C · objetivo ${cfg.target.toFixed(1)} °C.</span>`;
}
function updateWaterBathVerificationDifference(){
  const f=$('#waterBathVerificationForm');if(!f)return;const a=Number(f.elements.equipmentTemperature.value),b=Number(f.elements.referenceTemperature.value);
  f.elements.difference.value=Number.isFinite(a)&&Number.isFinite(b)?(a-b).toFixed(2):'';
}
function renderWaterBathModule(){
  if(!$('#equipment-tab-waterbath'))return;
  if(!Array.isArray(state.waterBathConfig))state.waterBathConfig=[];
  const cfg=waterBathConfig(),month=$('#waterBathMonth')?.value||envLocalToday().slice(0,7),dates=incubatorMonthDates(month),records=dates.map(waterBathReading).filter(Boolean),stats=waterBathStats(records),todayRec=waterBathReading(envLocalToday());
  if($('#waterBathMonth')&&!$('#waterBathMonth').value)$('#waterBathMonth').value=month;
  $('#wbKpiToday').textContent=todayRec?(todayRec.status==='NO_UTILIZADO'?'NO UTILIZADO':todayRec.result):(waterBathScheduled(envLocalToday())?'PENDIENTE':'NO PROGRAMADO');
  $('#wbKpiAverage').textContent=stats.avg===null?'—':stats.avg.toFixed(2)+' °C';
  $('#wbKpiMin').textContent=stats.min===null?'—':stats.min.toFixed(1)+' °C';
  $('#wbKpiMax').textContent=stats.max===null?'—':stats.max.toFixed(1)+' °C';
  $('#wbKpiOut').textContent=stats.out;
  $('#waterBathEquipmentTitle').textContent=`${cfg.name} · ${cfg.equipmentCode}`;
  $('#waterBathCriteriaText').textContent=`Objetivo ${cfg.target.toFixed(1)} °C · límites ${cfg.lowerLimit.toFixed(1)}–${cfg.upperLimit.toFixed(1)} °C · lunes a viernes, excluye feriados`;
  $('#waterBathChart').innerHTML=waterBathChartSvg(month);

  $('#waterBathReadingRows').innerHTML=dates.map(d=>{
    const r=waterBathReading(d),scheduled=waterBathScheduled(d),reason=waterBathNonProgrammedReason(d),pastOrToday=d<=envLocalToday();
    if(!scheduled)return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>—</td><td>—</td><td><span class="pill neutral">NO PROGRAMADO · ${esc(reason)}</span></td><td>—</td><td>—</td></tr>`;
    if(r?.status==='NO_UTILIZADO')return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>${esc(r.time||'—')}</td><td>—</td><td><span class="pill neutral">NO UTILIZADO</span></td><td>${esc(r.analyst||'—')}</td><td><button onclick="prefillWaterBathReading('${d}')">Registrar uso</button></td></tr>`;
    if(r)return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>${esc(r.time||'—')}</td><td>${esc(r.temperature)} °C</td><td>${r.result==='CUMPLE'?'<span class="pill ok">CUMPLE</span>':'<span class="pill bad">FUERA DE CONTROL</span>'}</td><td>${esc(r.analyst||'—')}</td><td><button onclick="editWaterBathReading('${d}')">✏️ Editar</button></td></tr>`;
    return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>—</td><td>—</td><td>${pastOrToday?'<span class="pill warn">PENDIENTE</span>':'—'}</td><td>—</td><td>${pastOrToday?`<button onclick="prefillWaterBathReading('${d}')">Registrar</button> <button onclick="markWaterBathNotUsed('${d}')">✓ No se utilizó</button>`:'—'}</td></tr>`;
  }).join('');

  $('#waterBathVerificationRows').innerHTML=[...state.waterBathVerifications].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(v=>`<tr><td>${esc(v.date)}</td><td>${esc(v.equipmentCode)}</td><td>${esc(v.referenceCode)}</td><td>${esc(v.equipmentTemperature)} °C</td><td>${esc(v.referenceTemperature)} °C</td><td>${esc(v.difference)} °C</td><td>${esc(v.analyst)}</td></tr>`).join('')||'<tr><td colspan="7">Sin verificaciones registradas.</td></tr>';

  $('#waterBathTraceRows').innerHTML=[...state.waterBathTrace].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,300).map(t=>`<tr><td>${esc(new Date(t.eventAt).toLocaleString())}</td><td><b>${esc(t.action)}</b></td><td>${esc(t.user)}</td><td>${esc(t.detail)}</td></tr>`).join('')||'<tr><td colspan="4">Sin eventos.</td></tr>';

  const rf=$('#waterBathReadingForm');if(rf&&!rf.elements.id.value){rf.elements.date.value=rf.elements.date.value||envLocalToday();rf.elements.time.value=rf.elements.time.value||envLocalTime();rf.elements.equipmentCode.value=cfg.equipmentCode;rf.elements.analyst.value=activeUser()}
  const vf=$('#waterBathVerificationForm');if(vf){vf.elements.date.value=vf.elements.date.value||envLocalToday();vf.elements.equipmentCode.value=cfg.equipmentCode;vf.elements.referenceCode.value=vf.elements.referenceCode.value||cfg.referenceThermometer;vf.elements.analyst.value=activeUser()}
  updateWaterBathReadingPreview();updateWaterBathVerificationDifference();
}
window.prefillWaterBathReading=date=>{
  openControlChart('waterbath');
  const f=$('#waterBathReadingForm');f.reset();f.elements.id.value='';f.elements.date.value=date;f.elements.time.value=envLocalTime();f.elements.equipmentCode.value=waterBathConfig().equipmentCode;f.elements.analyst.value=activeUser();updateWaterBathReadingPreview();f.scrollIntoView({behavior:'smooth',block:'center'});
};
window.editWaterBathReading=date=>{
  const r=waterBathReading(date),f=$('#waterBathReadingForm');if(!r||!f)return;if(r.status==='NO_UTILIZADO'){prefillWaterBathReading(date);return}
  for(const [k,v] of Object.entries(r))if(f.elements[k])f.elements[k].value=v??'';
  openControlChart('waterbath');updateWaterBathReadingPreview();f.scrollIntoView({behavior:'smooth',block:'center'});
};
window.markWaterBathNotUsed=async date=>{
  if(!waterBathScheduled(date)){toast('Ese día no está programado para control.');return}
  if(date>envLocalToday()){toast('No puede justificar una fecha futura.');return}
  const existing=waterBathReading(date);
  if(existing&&existing.status!=='NO_UTILIZADO'){toast('Ya existe una lectura registrada para esa fecha.');return}
  if(!confirm(`Marcar ${date} como NO UTILIZADO? Quedará justificado y trazable.`))return;
  const rec={...(existing||{}),id:existing?.id||crypto.randomUUID(),date,time:envLocalTime(),equipmentCode:waterBathConfig().equipmentCode,status:'NO_UTILIZADO',result:'NO UTILIZADO',temperature:null,analyst:activeUser(),notes:'Baño de María no utilizado / no se realizaron ensayos que requirieran su uso.',createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO()};
  await saveLocal('waterBathReadings',rec,{render:false});
  await waterBathTrace(existing?'NO USO CONFIRMADO':'DÍA JUSTIFICADO · NO UTILIZADO',`${date} ${rec.time} · baño de María no utilizado · no afecta cumplimiento de la carta`);
  await loadLocal();toast('Día marcado como NO UTILIZADO.');
};
async function editWaterBathConfigLocked(){
  const pwd=prompt('Contraseña de configuración:','');if(pwd!=='FT'){if(pwd!==null)toast('Contraseña incorrecta.');return}
  const old=waterBathConfig();
  const code=prompt('Código oficial del Baño de María:',old.equipmentCode);if(code===null)return;
  const ref=prompt('Código del termómetro patrón:',old.referenceThermometer);if(ref===null)return;
  const target=prompt('Temperatura objetivo (°C):',String(old.target));if(target===null)return;
  const low=prompt('Límite inferior (°C):',String(old.lowerLimit));if(low===null)return;
  const high=prompt('Límite superior (°C):',String(old.upperLimit));if(high===null)return;
  const vals=[Number(target),Number(low),Number(high)];
  if(vals.some(v=>!Number.isFinite(v))||vals[1]>=vals[2]){toast('Configuración inválida.');return}
  const rec={...old,equipmentCode:String(code).trim()||'POR DEFINIR',referenceThermometer:String(ref).trim()||'POR DEFINIR',target:vals[0],lowerLimit:vals[1],upperLimit:vals[2],schedule:'WORKDAYS',updatedAt:nowISO(),updatedBy:activeUser()};
  await saveLocal('waterBathConfig',rec,{render:false});
  await waterBathTrace('CONFIGURACIÓN MODIFICADA',`Código ${old.equipmentCode}→${rec.equipmentCode} · patrón ${old.referenceThermometer}→${rec.referenceThermometer} · objetivo ${old.target}→${rec.target} · límites ${old.lowerLimit}–${old.upperLimit}→${rec.lowerLimit}–${rec.upperLimit}`);
  await loadLocal();toast('Configuración del Baño de María actualizada.');
}
function bindWaterBathModule(){
  if(!$('#equipment-tab-waterbath')||$('#equipment-tab-waterbath').dataset.bound)return;$('#equipment-tab-waterbath').dataset.bound='1';
  $('#waterBathMonth')?.addEventListener('change',renderWaterBathModule);
  $('#waterBathReadingForm')?.addEventListener('input',e=>{if(e.target.name==='temperature')updateWaterBathReadingPreview()});
  $('#waterBathReadingForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));
    if(!waterBathScheduled(fd.date)){toast('La fecha seleccionada no está programada para control.');return}
    const previous=fd.id?state.waterBathReadings.find(x=>x.id===fd.id):waterBathReading(fd.date),ev=waterBathEvaluate(fd.temperature),cfg=waterBathConfig(),replacingNoUse=previous?.status==='NO_UTILIZADO';
    const rec={...previous,...fd,id:fd.id||previous?.id||crypto.randomUUID(),temperature:Number(fd.temperature),status:'REGISTRADO',result:ev.result,analyst:activeUser(),criteriaSnapshot:{target:cfg.target,lowerLimit:cfg.lowerLimit,upperLimit:cfg.upperLimit,equipmentCode:cfg.equipmentCode},createdAt:previous?.createdAt||nowISO(),updatedAt:nowISO()};
    await saveLocal('waterBathReadings',rec,{render:false});
    await waterBathTrace(replacingNoUse?'NO USO REEMPLAZADO POR LECTURA':(previous?'LECTURA CORREGIDA':'LECTURA REGISTRADA'),`${rec.date} ${rec.time} · ${rec.temperature} °C · ${rec.result}${previous&&!replacingNoUse?` · antes ${previous.temperature} °C`:''}`);
    f.reset();f.elements.id.value='';await loadLocal();toast(`Temperatura guardada: ${rec.result}.`);
  });
  $('#waterBathReadingCancel')?.addEventListener('click',()=>{const f=$('#waterBathReadingForm');f.reset();f.elements.id.value='';renderWaterBathModule()});
  $('#waterBathVerificationForm')?.addEventListener('input',e=>{if(['equipmentTemperature','referenceTemperature'].includes(e.target.name))updateWaterBathVerificationDifference()});
  $('#waterBathVerificationForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),diff=Number(fd.equipmentTemperature)-Number(fd.referenceTemperature);
    const rec={...fd,id:crypto.randomUUID(),equipmentTemperature:Number(fd.equipmentTemperature),referenceTemperature:Number(fd.referenceTemperature),difference:Number(diff.toFixed(2)),analyst:activeUser(),createdAt:nowISO()};
    await saveLocal('waterBathVerifications',rec,{render:false});
    await waterBathTrace('VERIFICACIÓN CON PATRÓN',`${rec.date} · ${rec.equipmentCode} ${rec.equipmentTemperature} °C · ${rec.referenceCode} ${rec.referenceTemperature} °C · diferencia ${rec.difference} °C`);
    f.reset();await loadLocal();toast('Verificación registrada.');
  });
  $('#waterBathEditConfig')?.addEventListener('click',editWaterBathConfigLocked);
  $('#waterBathExportBtn')?.addEventListener('click',()=>{
    const month=$('#waterBathMonth')?.value||envLocalToday().slice(0,7),
      rows=[['Fecha','Hora','Equipo','Estado','Temperatura °C','Resultado','Analista','Observaciones'],...incubatorMonthDates(month).map(waterBathReading).filter(Boolean).map(r=>[r.date,r.time,r.equipmentCode,r.status||'REGISTRADO',r.temperature??'',r.result,r.analyst,r.notes])],
      csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),
      a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`carta_control_bano_maria_${month}.csv`;a.click();URL.revokeObjectURL(a.href);
  });
}


// ===== V3.2.0-C · CARTA DE CONTROL pHMETRO =====
const DEFAULT_PH_METER_CONFIG={
  id:'ph-meter-ei188',
  name:'MEDIDOR DE pH',
  brand:'Orion Star',
  model:'A214',
  equipmentCode:'EI/188',
  schedule:'WORKDAYS',
  buffers:{
    ph7:{target:7.00,lower:6.90,upper:7.10,label:'pH 7,00'},
    ph4:{target:4.00,lower:3.90,upper:4.10,label:'pH 4,00'},
    ph10:{target:10.00,lower:9.90,upper:10.10,label:'pH 10,00'}
  },
  active:true,updatedAt:'',updatedBy:''
};
function phMeterConfig(){const a=Array.isArray(state.phMeterConfig)?state.phMeterConfig:[];return a.find(x=>x.id===DEFAULT_PH_METER_CONFIG.id)||DEFAULT_PH_METER_CONFIG}
async function seedPhMeterConfig(){
  if(!Array.isArray(state.phMeterConfig))state.phMeterConfig=[];
  if(state.phMeterConfig.some(x=>x.id===DEFAULT_PH_METER_CONFIG.id))return;
  await saveLocal('phMeterConfig',{...DEFAULT_PH_METER_CONFIG,updatedAt:nowISO(),updatedBy:'SYSTEM'},{queue:false,render:false});await loadLocal();
}
function phMeterScheduled(date){
  if(typeof envHoliday==='function'&&envHoliday(date))return false;
  const dow=incubatorDateObj(date).getDay();return dow!==0&&dow!==6;
}
function phMeterNonProgrammedReason(date){
  if(typeof envHoliday==='function'&&envHoliday(date))return 'FERIADO';
  const dow=incubatorDateObj(date).getDay();return (dow===0||dow===6)?'FIN DE SEMANA':'';
}
function phMeterReading(date){return [...state.phMeterReadings].filter(r=>r.date===date).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null}
function phMeterEvaluate(values){
  const cfg=phMeterConfig(),details={};let all=true;
  for(const key of ['ph7','ph4','ph10']){
    const n=Number(values[key]),b=cfg.buffers[key],ok=Number.isFinite(n)&&n>=Number(b.lower)&&n<=Number(b.upper);
    details[key]={value:n,ok};if(!ok)all=false;
  }
  return {result:all?'CUMPLE':'FUERA DE CONTROL',details};
}
async function phMeterTrace(action,detail){
  await saveLocal('phMeterTrace',{id:crypto.randomUUID(),action,detail:String(detail||''),eventAt:nowISO(),user:activeUser(),deviceId},{render:false});
}
function phMeterChartSvg(month,key){
  const cfg=phMeterConfig(),b=cfg.buffers[key],dates=incubatorMonthDates(month),w=1100,h=300,p={l:70,r:30,t:26,b:52},
    vals=dates.map(phMeterReading).filter(r=>r&&r.status!=='NO_UTILIZADO').map(r=>Number(r[key])).filter(Number.isFinite);
  const ymin=Math.min(b.lower-0.15,...vals),ymax=Math.max(b.upper+0.15,...vals),x=i=>p.l+i*(w-p.l-p.r)/(dates.length-1||1),y=v=>p.t+(ymax-v)*(h-p.t-p.b)/(ymax-ymin||1);
  let s=`<rect x="0" y="0" width="${w}" height="${h}" rx="16" fill="white"/>`;
  for(let v=Math.floor(ymin*10)/10;v<=Math.ceil(ymax*10)/10+.001;v+=0.1)s+=`<line x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}" class="inc-grid"/><text x="${p.l-10}" y="${y(v)+4}" text-anchor="end" class="inc-axis">${v.toFixed(2)}</text>`;
  for(const [v,cls,label] of [[b.lower,'inc-limit','LÍM INF'],[b.target,'inc-center','OBJETIVO'],[b.upper,'inc-limit','LÍM SUP']])s+=`<line x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}" class="${cls}"/><text x="${w-p.r-4}" y="${y(v)-5}" text-anchor="end" class="inc-label">${label} ${Number(v).toFixed(2)}</text>`;
  const pts=[];dates.forEach((d,i)=>{const r=phMeterReading(d);if(r&&r.status!=='NO_UTILIZADO'&&Number.isFinite(Number(r[key])))pts.push({x:x(i),y:y(Number(r[key])),r,d})});
  if(pts.length>1)s+=`<polyline points="${pts.map(q=>`${q.x},${q.y}`).join(' ')}" class="inc-data-line"/>`;
  pts.forEach(q=>{const ok=Number(q.r[key])>=b.lower&&Number(q.r[key])<=b.upper;s+=`<circle cx="${q.x}" cy="${q.y}" r="5" class="${ok?'inc-point':'inc-point-bad'}"><title>${q.d}: ${Number(q.r[key]).toFixed(2)}</title></circle>`});
  dates.forEach((d,i)=>{const day=Number(d.slice(-2));if(day===1||day%2===0||day===dates.length)s+=`<text x="${x(i)}" y="${h-24}" text-anchor="middle" class="inc-axis">${day}</text>`});
  if(!pts.length)s+=`<text x="${w/2}" y="${h/2}" text-anchor="middle" class="inc-empty">Sin registros en este mes</text>`;
  return s;
}
function updatePhMeterPreview(){
  const f=$('#phMeterReadingForm');if(!f)return;const box=$('#phMeterReadingPreview'),vals={ph7:f.elements.ph7.value,ph4:f.elements.ph4.value,ph10:f.elements.ph10.value};
  if(Object.values(vals).some(v=>v==='')){f.elements.result.value='';box.className='span-2 state-card state-pending';box.innerHTML='<strong>PENDIENTE</strong><span>Complete los tres buffers.</span>';return}
  const ev=phMeterEvaluate(vals),cfg=phMeterConfig();f.elements.result.value=ev.result;box.className='span-2 state-card '+(ev.result==='CUMPLE'?'state-ok':'state-pending');
  box.innerHTML=`<strong>${ev.result}</strong><span>pH 7: ${Number(vals.ph7).toFixed(2)} · pH 4: ${Number(vals.ph4).toFixed(2)} · pH 10: ${Number(vals.ph10).toFixed(2)}</span>`;
}
function renderPhMeterModule(){
  if(!$('#equipment-tab-phmeter'))return;
  const cfg=phMeterConfig(),month=$('#phMeterMonth')?.value||envLocalToday().slice(0,7),dates=incubatorMonthDates(month),records=dates.map(phMeterReading).filter(Boolean),real=records.filter(r=>r.status!=='NO_UTILIZADO'),out=real.filter(r=>r.result==='FUERA DE CONTROL').length,noUse=records.filter(r=>r.status==='NO_UTILIZADO').length,todayRec=phMeterReading(envLocalToday());
  if($('#phMeterMonth')&&!$('#phMeterMonth').value)$('#phMeterMonth').value=month;
  $('#phKpiToday').textContent=todayRec?(todayRec.status==='NO_UTILIZADO'?'NO UTILIZADO':todayRec.result):(phMeterScheduled(envLocalToday())?'PENDIENTE':'NO PROGRAMADO');
  $('#phKpiRegistered').textContent=real.length;$('#phKpiOut').textContent=out;$('#phKpiNoUse').textContent=noUse;
  $('#phMeterEquipmentTitle').textContent=`${cfg.name} · ${cfg.brand} ${cfg.model} · ${cfg.equipmentCode}`;
  $('#phMeterCriteriaText').textContent=`pH 7,00 ±0,10 · pH 4,00 ±0,10 · pH 10,00 ±0,10 · lunes a viernes, excluye feriados`;
  $('#phChart7').innerHTML=phMeterChartSvg(month,'ph7');$('#phChart4').innerHTML=phMeterChartSvg(month,'ph4');$('#phChart10').innerHTML=phMeterChartSvg(month,'ph10');

  $('#phMeterReadingRows').innerHTML=dates.map(d=>{
    const r=phMeterReading(d),scheduled=phMeterScheduled(d),reason=phMeterNonProgrammedReason(d),past=d<=envLocalToday();
    if(!scheduled)return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>—</td><td>—</td><td>—</td><td>—</td><td><span class="pill neutral">NO PROGRAMADO · ${esc(reason)}</span></td><td>—</td><td>—</td></tr>`;
    if(r?.status==='NO_UTILIZADO')return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>${esc(r.time||'—')}</td><td>—</td><td>—</td><td>—</td><td><span class="pill neutral">NO UTILIZADO</span></td><td>${esc(r.analyst||'—')}</td><td><button onclick="prefillPhMeterReading('${d}')">Registrar uso</button></td></tr>`;
    if(r)return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>${esc(r.time||'—')}</td><td>${Number(r.ph7).toFixed(2)}</td><td>${Number(r.ph4).toFixed(2)}</td><td>${Number(r.ph10).toFixed(2)}</td><td>${r.result==='CUMPLE'?'<span class="pill ok">CUMPLE</span>':'<span class="pill bad">FUERA DE CONTROL</span>'}</td><td>${esc(r.analyst||'—')}</td><td><button onclick="editPhMeterReading('${d}')">✏️ Editar</button></td></tr>`;
    return `<tr><td>${esc(d)}</td><td>${esc(incubatorDayName(d))}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>${past?'<span class="pill warn">PENDIENTE</span>':'—'}</td><td>—</td><td>${past?`<button onclick="prefillPhMeterReading('${d}')">Registrar</button> <button onclick="markPhMeterNotUsed('${d}')">✓ No se utilizó</button>`:'—'}</td></tr>`;
  }).join('');

  $('#phMeterAccuracyRows').innerHTML=[...state.phMeterAccuracy].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(incubatorDayName(r.date))}</td><td>${Number(r.ph).toFixed(2)}</td><td>${esc(r.analyst)}</td><td>${esc(r.notes||'')}</td></tr>`).join('')||'<tr><td colspan="5">Sin controles de exactitud registrados.</td></tr>';
  $('#phMeterTraceRows').innerHTML=[...state.phMeterTrace].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,300).map(t=>`<tr><td>${esc(new Date(t.eventAt).toLocaleString())}</td><td><b>${esc(t.action)}</b></td><td>${esc(t.user)}</td><td>${esc(t.detail)}</td></tr>`).join('')||'<tr><td colspan="4">Sin eventos.</td></tr>';

  const f=$('#phMeterReadingForm');if(f&&!f.elements.id.value){f.elements.date.value=f.elements.date.value||envLocalToday();f.elements.time.value=f.elements.time.value||envLocalTime();f.elements.equipmentCode.value=cfg.equipmentCode;f.elements.analyst.value=activeUser()}
  const af=$('#phMeterAccuracyForm');if(af){af.elements.date.value=af.elements.date.value||envLocalToday();af.elements.analyst.value=activeUser()}
  updatePhMeterPreview();
}
window.prefillPhMeterReading=date=>{openControlChart('phmeter');const f=$('#phMeterReadingForm');f.reset();f.elements.id.value='';f.elements.date.value=date;f.elements.time.value=envLocalTime();f.elements.equipmentCode.value=phMeterConfig().equipmentCode;f.elements.analyst.value=activeUser();updatePhMeterPreview();f.scrollIntoView({behavior:'smooth',block:'center'})};
window.editPhMeterReading=date=>{const r=phMeterReading(date),f=$('#phMeterReadingForm');if(!r||!f)return;if(r.status==='NO_UTILIZADO'){prefillPhMeterReading(date);return}for(const [k,v] of Object.entries(r))if(f.elements[k])f.elements[k].value=v??'';openControlChart('phmeter');updatePhMeterPreview();f.scrollIntoView({behavior:'smooth',block:'center'})};
window.markPhMeterNotUsed=async date=>{
  if(!phMeterScheduled(date)||date>envLocalToday())return toast('La fecha no puede marcarse como no utilizada.');
  const existing=phMeterReading(date);if(existing&&existing.status!=='NO_UTILIZADO')return toast('Ya existe un control registrado.');
  if(!confirm(`Marcar ${date} como NO UTILIZADO?`))return;
  const rec={...(existing||{}),id:existing?.id||crypto.randomUUID(),date,time:envLocalTime(),equipmentCode:phMeterConfig().equipmentCode,status:'NO_UTILIZADO',result:'NO UTILIZADO',analyst:activeUser(),notes:'pHmetro no utilizado / no se realizaron ensayos que requirieran su uso.',createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO()};
  await saveLocal('phMeterReadings',rec,{render:false});await phMeterTrace('DÍA JUSTIFICADO · NO UTILIZADO',`${date} ${rec.time} · no afecta las cartas de control`);await loadLocal();toast('Día marcado como NO UTILIZADO.');
};
async function editPhMeterConfigLocked(){
  const pwd=prompt('Contraseña de configuración:','');if(pwd!=='FT'){if(pwd!==null)toast('Contraseña incorrecta.');return}
  const old=phMeterConfig(),code=prompt('Código del pHmetro:',old.equipmentCode);if(code===null)return;
  const brand=prompt('Marca:',old.brand);if(brand===null)return;const model=prompt('Modelo:',old.model);if(model===null)return;
  const rec={...old,equipmentCode:String(code).trim(),brand:String(brand).trim(),model:String(model).trim(),updatedAt:nowISO(),updatedBy:activeUser()};
  await saveLocal('phMeterConfig',rec,{render:false});await phMeterTrace('CONFIGURACIÓN MODIFICADA',`Equipo ${old.equipmentCode}→${rec.equipmentCode} · ${old.brand} ${old.model}→${rec.brand} ${rec.model}`);await loadLocal();toast('Configuración actualizada.');
}
function openControlChart(name){
  document.querySelector('[data-equipment-tab="controlcharts"]')?.click();
  $$('.control-chart-tab').forEach(b=>b.classList.toggle('active',b.dataset.controlChart===name));
  $$('.control-chart-pane').forEach(p=>p.classList.toggle('active',p.id===`equipment-tab-${name}`));
}
window.openControlChart=openControlChart;
function bindControlChartHub(){
  $$('.control-chart-tab[data-control-chart]').forEach(b=>b.addEventListener('click',()=>openControlChart(b.dataset.controlChart)));
}
function bindPhMeterModule(){
  if(!$('#equipment-tab-phmeter')||$('#equipment-tab-phmeter').dataset.bound)return;$('#equipment-tab-phmeter').dataset.bound='1';
  $('#phMeterMonth')?.addEventListener('change',renderPhMeterModule);
  $('#phMeterReadingForm')?.addEventListener('input',updatePhMeterPreview);
  $('#phMeterReadingForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));if(!phMeterScheduled(fd.date))return toast('Fecha no programada.');
    const previous=fd.id?state.phMeterReadings.find(x=>x.id===fd.id):phMeterReading(fd.date),ev=phMeterEvaluate(fd),replacing=previous?.status==='NO_UTILIZADO';
    const rec={...previous,...fd,id:fd.id||previous?.id||crypto.randomUUID(),ph7:Number(fd.ph7),ph4:Number(fd.ph4),ph10:Number(fd.ph10),status:'REGISTRADO',result:ev.result,analyst:activeUser(),criteriaSnapshot:phMeterConfig().buffers,createdAt:previous?.createdAt||nowISO(),updatedAt:nowISO()};
    await saveLocal('phMeterReadings',rec,{render:false});await phMeterTrace(replacing?'NO USO REEMPLAZADO POR CONTROL':(previous?'CONTROL CORREGIDO':'CONTROL REGISTRADO'),`${rec.date} · pH7 ${rec.ph7.toFixed(2)} · pH4 ${rec.ph4.toFixed(2)} · pH10 ${rec.ph10.toFixed(2)} · ${rec.result}`);f.reset();f.elements.id.value='';await loadLocal();toast(`Control guardado: ${rec.result}.`);
  });
  $('#phMeterReadingCancel')?.addEventListener('click',()=>{const f=$('#phMeterReadingForm');f.reset();f.elements.id.value='';renderPhMeterModule()});
  $('#phMeterAccuracyForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),rec={...fd,id:crypto.randomUUID(),ph:Number(fd.ph),analyst:activeUser(),createdAt:nowISO()};await saveLocal('phMeterAccuracy',rec,{render:false});await phMeterTrace('CONTROL DE EXACTITUD',`${rec.date} · pH ${rec.ph.toFixed(2)}`);f.reset();await loadLocal();toast('Control de exactitud guardado.');});
  $('#phMeterEditConfig')?.addEventListener('click',editPhMeterConfigLocked);
  $('#phMeterExportBtn')?.addEventListener('click',()=>{const month=$('#phMeterMonth')?.value||envLocalToday().slice(0,7),rows=[['Fecha','Hora','Estado','pH 7','pH 4','pH 10','Resultado','Analista','Observaciones'],...incubatorMonthDates(month).map(phMeterReading).filter(Boolean).map(r=>[r.date,r.time,r.status||'REGISTRADO',r.ph7??'',r.ph4??'',r.ph10??'',r.result,r.analyst,r.notes])],csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`carta_control_phmetro_${month}.csv`;a.click();URL.revokeObjectURL(a.href)});
}

function renderEquipmentModule(){
  if(!$('#view-equipment'))return;
  const eqs=[...state.equipmentCatalog].filter(e=>e.status!=='BAJA');
  $('#eqKpiActive').textContent=eqs.length;
  const att=eqs.map(e=>equipmentAttestState(e)),ster=eqs.map(e=>equipmentSterikonState(e)),clean=eqs.map(e=>equipmentCleaningState(e));
  $('#eqKpiAttestSoon').textContent=att.filter(x=>x.status==='PRÓXIMO').length;
  $('#eqKpiSterikonSoon').textContent=ster.filter(x=>x.status==='PRÓXIMO').length;
  $('#eqKpiOverdue').textContent=att.filter(x=>x.status==='VENCIDO').length+ster.filter(x=>x.status==='VENCIDO').length;
  $('#eqKpiCleaning').textContent=clean.filter(x=>!['AL DÍA','NO PROGRAMADO'].includes(x.status)).length;
  $('#equipmentStatusCards').innerHTML=eqs.map(eq=>{const a=equipmentAttestState(eq),s=equipmentSterikonState(eq),c=equipmentCleaningState(eq);return `<article class="equipment-status-card"><h4>${esc(eq.name)}</h4><div><span>Attest 3M</span>${equipmentPill(a.status)}<small>${a.loads} / ${eq.attestFrequencyLoads} carga(s) acumuladas · faltan ${Math.max(0,a.remaining??eq.attestFrequencyLoads)}</small></div><div><span>Sterikon Plus</span>${equipmentPill(s.status)}<small>${s.nextDate?'Próximo '+s.nextDate:`Cada ${eq.sterikonFrequencyMonths} mes(es)`}</small></div><div><span>Limpieza</span>${equipmentPill(c.status)}<small>${esc(c.frequencyLabel||'')} · ${c.nextDate?esc(c.nextDate):'Sin registro previo'}</small></div></article>`}).join('');
  const upcoming=[];
  for(const eq of eqs){const a=equipmentAttestState(eq),s=equipmentSterikonState(eq),c=equipmentCleaningState(eq);upcoming.push([eq,'Attest 3M',a.status,a.remaining===null?'—':`${a.remaining} carga(s) restantes`]);upcoming.push([eq,'Sterikon Plus',s.status,s.nextDate||'Sin control previo']);upcoming.push([eq,'Limpieza',c.status,`${c.frequencyLabel||''}${c.nextDate?' · '+c.nextDate:''}`||'Sin registro previo'])}
  $('#equipmentUpcomingRows').innerHTML=upcoming.filter(x=>!['OK','AL DÍA','NO PROGRAMADO'].includes(x[2])).map(([e,t,s,r])=>`<tr><td>${esc(e.name)}</td><td>${esc(t)}</td><td>${equipmentPill(s)}</td><td>${esc(r)}</td><td><button onclick="openEquipmentAction('${e.id}','${t}')">Registrar</button></td></tr>`).join('')||'<tr><td colspan="5">Sin acciones próximas o vencidas.</td></tr>';
  const autoclaves=eqs.filter(e=>e.equipmentType==='AUTOCLAVE'),opts='<option value="">Seleccione...</option>'+autoclaves.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
  if($('#autoclaveEquipmentSelect')){const v=$('#autoclaveEquipmentSelect').value;$('#autoclaveEquipmentSelect').innerHTML=opts;if(autoclaves.some(e=>e.id===v))$('#autoclaveEquipmentSelect').value=v;else if(autoclaves.length===1)$('#autoclaveEquipmentSelect').value=autoclaves[0].id}
  if($('#cleaningEquipmentSelect')){const v=$('#cleaningEquipmentSelect').value;$('#cleaningEquipmentSelect').innerHTML='<option value="">Seleccione...</option>'+CLEANING_MASTER_PLAN.map(e=>`<option value="${e.id}">${esc(e.name)} · ${esc(e.frequencyLabel)}</option>`).join('');if(CLEANING_MASTER_PLAN.some(e=>e.id===v))$('#cleaningEquipmentSelect').value=v}
  const controls=[...state.equipmentControls].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,100);
  $('#autoclaveControlRows').innerHTML=controls.map(r=>{const eq=equipmentById(r.equipmentId),after=equipmentCounterAfterRecord(r),remaining=Math.max(0,Number(eq?.attestFrequencyLoads||0)-after);return `<tr><td>${esc(r.date)}</td><td>${esc(eq?.name||'—')}</td><td>${esc(r.cycleType)}</td><td>${esc(r.startTime||'—')}–${esc(r.endTime||'—')}</td><td>${esc(r.loads)}</td><td>${after}/${eq?.attestFrequencyLoads||'—'} · faltan ${remaining}</td><td>${esc(r.temperature)} °C</td><td>${r.attestPerformed==='SI'?esc(r.attestResult):'—'}</td><td>${r.sterikonPerformed==='SI'?esc(r.sterikonResult):'—'}</td><td>${equipmentPill(r.result)}</td><td>${esc(r.analyst)}</td></tr>`}).join('')||'<tr><td colspan="11">Sin controles registrados.</td></tr>';
  $('#equipmentCleaningRows').innerHTML=[...state.equipmentCleaning].sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||''))).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(cleaningRecordDisplayName(r))}</td><td>${esc(cleaningRecordDetail(r))}</td><td>${esc(r.cleaningType||'—')}</td><td>${esc(r.agent||'—')}</td><td>${esc(r.performedBy||'—')}</td><td>${esc(r.verifiedBy||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Sin limpiezas registradas.</td></tr>';
  renderCleaningMasterPlan();
  $('#equipmentCatalogRows').innerHTML=eqs.map(e=>`<tr><td><b>${esc(e.code)}</b><br>${esc(e.name)}</td><td>${esc(e.useType)}</td><td>Cada ${e.attestFrequencyLoads} cargas</td><td>${e.attestAlertLoads} cargas antes</td><td>Cada ${e.sterikonFrequencyMonths} mes(es)</td><td>${e.tempMin}–${e.tempMax} °C</td><td>${e.minCycleMinutes} min</td><td><button onclick="editEquipmentRule('${e.id}')">⚙️ Configurar</button></td></tr>`).join('');
  $('#equipmentTraceRows').innerHTML=[...state.equipmentTrace].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,500).map(t=>`<tr><td>${esc(new Date(t.eventAt).toLocaleString())}</td><td>${esc(t.equipmentName)}</td><td><b>${esc(t.action)}</b></td><td>${esc(t.user)}</td><td>${esc(t.detail)}</td></tr>`).join('')||'<tr><td colspan="5">Sin eventos.</td></tr>';
  populateEquipmentBiologicalLots();
  if($('#autoclaveAnalyst'))$('#autoclaveAnalyst').value=activeUser();
  if($('#cleaningPerformedBy'))$('#cleaningPerformedBy').value=activeUser();
  if($('#cleaningVerifiedBy'))$('#cleaningVerifiedBy').innerHTML='<option value="">Seleccione</option>'+state.catalogPersonnel.filter(p=>p.code!==activeUser()).map(p=>`<option value="${esc(p.code)}">${esc(p.code)}${p.name?' · '+esc(p.name):''}</option>`).join('');
  updateAutoclaveCycleOptions();updateAutoclavePreview();
}
function updateAutoclaveCycleOptions(){
  const eq=equipmentById($('#autoclaveEquipmentSelect')?.value),sel=$('#autoclaveCycleType');if(!sel)return;
  sel.innerHTML='<option value="">Seleccione...</option>'+((eq?.cycleOptions)||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
}
function updateAutoclavePreview(){
  const f=$('#autoclaveControlForm');if(!f)return;const eq=equipmentById(f.elements.equipmentId.value),box=$('#autoclaveControlPreview');if(!eq){box.className='wide state-card state-pending';box.innerHTML='<strong>PENDIENTE</strong><span>Seleccione el autoclave.</span>';return}
  const fd=Object.fromEntries(new FormData(f)),ev=equipmentControlEvaluation(eq,fd),a=equipmentAttestState(eq),s=equipmentSterikonState(eq),proj=equipmentProjectedAttest(eq,fd);
  const counter=$('#autoclaveLoadCounter');if(counter)counter.innerHTML=`<b>Contador Attest 3M</b><span>Actual: ${proj.current}/${eq.attestFrequencyLoads} · después de este registro: ${proj.projected}/${eq.attestFrequencyLoads} · faltarán ${proj.remaining} carga(s).</span>`;
  box.className='wide state-card '+(ev.result==='CUMPLE'?'state-ok':'state-pending');
  box.innerHTML=`<strong>${ev.result}</strong><span>Attest: ${proj.projected}/${eq.attestFrequencyLoads} después de guardar · faltan ${proj.remaining}${fd.attestPerformed==='SI'&&!proj.scheduledReset?' · Attest anticipado registrado SIN reiniciar contador':''}${proj.scheduledReset?' · Attest programado: nueva secuencia iniciará en 0':''} · Sterikon: ${s.status}${ev.issues.length?' · '+ev.issues.join(' · '):''}</span>`;
}
window.openEquipmentAction=(id,type)=>{
  document.querySelector('[data-view="equipment"]')?.click();
  if(type==='Limpieza'){
    document.querySelector('[data-equipment-tab="cleaning"]')?.click();
    openCleaningSubtab('equipment');
    if($('#cleaningEquipmentSelect'))$('#cleaningEquipmentSelect').value=id;
    updateEquipmentCleaningWeeklyAgent();
    $('#equipmentCleaningForm')?.scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  document.querySelector('[data-equipment-tab="autoclaves"]')?.click();
  if($('#autoclaveEquipmentSelect'))$('#autoclaveEquipmentSelect').value=id;
  updateAutoclaveCycleOptions();
  const f=$('#autoclaveControlForm');
  if(f){
    if(type==='Attest 3M' && f.elements.attestPerformed)f.elements.attestPerformed.value='SI';
    if(type==='Sterikon Plus' && f.elements.sterikonPerformed)f.elements.sterikonPerformed.value='SI';
    updateAutoclavePreview();
    f.scrollIntoView({behavior:'smooth',block:'start'});
  }
};
window.editEquipmentRule=async id=>{const eq=equipmentById(id);if(!eq)return;const af=prompt(`Frecuencia Attest para ${eq.name} (número de cargas):`,String(eq.attestFrequencyLoads));if(af===null)return;const sm=prompt('Frecuencia Sterikon Plus en meses (2 o 3):',String(eq.sterikonFrequencyMonths));if(sm===null)return;const afn=Number(af),smn=Number(sm);if(!Number.isInteger(afn)||afn<1||![2,3].includes(smn)){toast('Valores inválidos. Attest debe ser entero positivo y Sterikon 2 o 3 meses.');return}await saveLocal('equipmentCatalog',{...eq,attestFrequencyLoads:afn,sterikonFrequencyMonths:smn},{render:false});await equipmentTrace(id,'CONFIGURACIÓN ACTUALIZADA',`Attest cada ${afn} cargas · Sterikon cada ${smn} meses`);await loadLocal();toast('Configuración actualizada.')};
function bindEquipmentModule(){
  if(!$('#view-equipment')||$('#view-equipment').dataset.bound)return;$('#view-equipment').dataset.bound='1';
  bindCleaningSubtabs();
  bindAreaCleaningQuick();
  $$('.equipment-tab').forEach(b=>b.onclick=()=>{$$('.equipment-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.equipment-tabpane').forEach(x=>x.classList.remove('active'));$(`#equipment-tab-${b.dataset.equipmentTab}`)?.classList.add('active')});
  $('#autoclaveEquipmentSelect')?.addEventListener('change',()=>{updateAutoclaveCycleOptions();updateAutoclavePreview()});
  $('#autoclaveControlForm')?.addEventListener('input',e=>{if(e.target?.name==='startTime'||e.target?.name==='endTime')updateAutoclaveTimeDuration();updateAutoclavePreview()});
  $('#autoclaveControlForm [name="attestPerformed"]')?.addEventListener('change',updateAutoclavePreview);
  $('#autoclaveControlForm [name="sterikonPerformed"]')?.addEventListener('change',updateAutoclavePreview);
  $('#autoclaveControlForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),eq=equipmentById(fd.equipmentId);if(!eq){toast('Seleccione un autoclave.');return}if(!activeUser()){toast('Seleccione usuario activo.');return}if(fd.attestPerformed==='SI'&&(!fd.attestLotId||!fd.attestResult)){toast('Seleccione un lote vigente de Attest 3M y complete su resultado.');return}if(fd.sterikonPerformed==='SI'&&(!fd.sterikonLotId||!fd.sterikonResult)){toast('Seleccione un lote vigente de Sterikon Plus y complete su resultado.');return}const attestLot=fd.attestLotId?productLotById(fd.attestLotId):null,sterikonLot=fd.sterikonLotId?productLotById(fd.sterikonLotId):null;if(fd.attestPerformed==='SI'&&!productIntegrationEligibleLot(attestLot)){toast('El lote seleccionado de Attest 3M ya no está APTO, vigente o con stock.');return}if(fd.sterikonPerformed==='SI'&&!productIntegrationEligibleLot(sterikonLot)){toast('El lote seleccionado de Sterikon Plus ya no está APTO, vigente o con stock.');return}const ev=equipmentControlEvaluation(eq,fd),before=equipmentLoadsSinceAttest(eq.id),rawAfter=before+Number(fd.loads||0),scheduledReset=fd.attestPerformed==='SI'&&rawAfter>=Number(eq.attestFrequencyLoads||0),after=scheduledReset?0:rawAfter;const rec={...fd,id:crypto.randomUUID(),loads:Number(fd.loads),temperature:Number(fd.temperature),cycleMinutes:Number(fd.cycleMinutes),analyst:activeUser(),attestLot:attestLot?.manufacturerLot||'',attestProductLotCode:attestLot?.internalCode||'',sterikonLot:sterikonLot?.manufacturerLot||'',sterikonProductLotCode:sterikonLot?.internalCode||'',attestCounterBefore:before,attestCounterRawAfter:rawAfter,attestCounterAfter:after,attestScheduledReset:scheduledReset,result:ev.result,issues:ev.issues,createdAt:nowISO()};await saveLocal('equipmentControls',rec,{render:false});if(fd.attestPerformed==='SI')await registerIntegratedProductUse(attestLot.id,1,'Control de equipo',`${eq.code} · Attest 3M · ${fd.date}`,fd.date,'Indicador biológico utilizado en control de autoclave');if(fd.sterikonPerformed==='SI')await registerIntegratedProductUse(sterikonLot.id,1,'Control de equipo',`${eq.code} · Sterikon Plus · ${fd.date}`,fd.date,'Indicador biológico utilizado en control de autoclave');await equipmentTrace(eq.id,'CONTROL DE AUTOCLAVE REGISTRADO',`${fd.date} · ${fd.startTime||'—'}–${fd.endTime||'—'} · ${fd.cycleType} · ${fd.loads} carga(s) · contador Attest ${before}→${after}/${eq.attestFrequencyLoads}${fd.attestPerformed==='SI'&&!scheduledReset?' · Attest anticipado sin reinicio':''}${scheduledReset?' · reinicio programado':''} · ${fd.temperature} °C · ${ev.result}${fd.attestPerformed==='SI'?` · Attest ${fd.attestResult} · lote ${attestLot?.manufacturerLot||'—'}`:''}${fd.sterikonPerformed==='SI'?` · Sterikon ${fd.sterikonResult} · lote ${sterikonLot?.manufacturerLot||'—'}`:''}`);f.reset();f.elements.date.value=today();f.elements.loads.value=1;f.elements.temperature.value=121;f.elements.cycleMinutes.value=15;await loadLocal();toast(`Control guardado: ${ev.result}. Contador Attest: ${after}/${eq.attestFrequencyLoads}.`)});
  $('#equipmentCleaningForm [name="date"]')?.addEventListener('change',updateEquipmentCleaningWeeklyAgent);
  $('#cleaningEquipmentSelect')?.addEventListener('change',updateEquipmentCleaningWeeklyAgent);
  $('#equipmentCleaningForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),plan=cleaningPlanById(fd.equipmentId),eq=equipmentById(fd.equipmentId);
    if(!plan&&!eq)return toast('Seleccione un elemento del plan de limpieza.');
    const weekly=areaWeeklyProductFor(fd.date||today()),isLaminar=fd.equipmentId==='clean-laminar';
    if(isLaminar&&!cleaningIsExtraordinaryRecord(fd)){
      const existing=laminarRoutineRecordsFor(fd.date||today());
      if(existing.some(r=>r.laminarMoment===fd.laminarMoment))return toast(`La cabina ya tiene registrado ${fd.laminarMoment==='INICIO_JORNADA'?'el inicio':'el final'} de jornada para esta fecha.`);
      if(fd.laminarMoment==='FINAL_JORNADA'&&!existing.some(r=>r.laminarMoment==='INICIO_JORNADA'))return toast('Primero debe registrarse el inicio de jornada.');
      if(fd.laminarMoment==='FINAL_JORNADA'){const av=laminarCloseAvailability(fd.date||today());if(!av.allowed)return toast(`El final de jornada se habilita desde ${av.availableAt}. Deben transcurrir al menos 3 horas desde el inicio.`)}
      if(fd.uvApplied!=='SI')return toast('Para cerrar el registro rutinario de cabina debe confirmarse la exposición UV de 15 minutos.');
      fd.agent='Alcohol 70 %';fd.uvMinutes='15';fd.laminarTime=fd.laminarTime||currentCleanTime();
    }else{
      fd.agent=weekly.product;delete fd.laminarMoment;delete fd.laminarTime;delete fd.uvMinutes;delete fd.uvApplied;
    }
    const rec={...fd,id:crypto.randomUUID(),planId:plan?.id||fd.equipmentId,elementName:plan?.name||eq?.name||'',recordCode:plan?.record||'',frequency:plan?.frequency||'',weeklyProduct:isLaminar?'':weekly.product,weeklyProductKey:isLaminar?'':weekly.weekKey,productAssignmentMode:isLaminar?'LAMINAR_FIXED_ALCOHOL_70':'WEEKLY_AUTO_SHARED_WITH_AREAS',performedBy:activeUser(),createdAt:nowISO()};
    await saveLocal('equipmentCleaning',rec,{render:false});
    const extra=cleaningIsExtraordinaryRecord(rec),laminarDetail=isLaminar&&!extra?` · ${fd.laminarMoment==='INICIO_JORNADA'?'Inicio jornada / antes del uso':'Final jornada / después del uso'} · ${fd.laminarTime} · UV ${fd.uvMinutes} min`:'';
    await equipmentTrace(eq?.id||plan?.id||fd.equipmentId,extra?'LIMPIEZA EXTRAORDINARIA REGISTRADA':'LIMPIEZA REGISTRADA',`${fd.date} · ${plan?.name||eq?.name||''} · ${fd.cleaningType} · ${fd.agent}${laminarDetail} · ${plan?.record||''} · verificado por ${fd.verifiedBy}`);
    const savedDate=fd.date||today(), savedLaminar=isLaminar&&!extra;
    f.reset();
    f.elements.date.value=savedDate;
    await loadLocal();
    if(savedLaminar){
      if(f.elements.equipmentId)f.elements.equipmentId.value='clean-laminar';
      if(f.elements.cleaningType)f.elements.cleaningType.value='RUTINARIA';
      if(f.elements.date)f.elements.date.value=savedDate;
      if(f.elements.verifiedBy)f.elements.verifiedBy.value='';
      updateEquipmentCleaningWeeklyAgent();
      const done=laminarRoutineRecordsFor(savedDate).some(r=>r.laminarMoment==='FINAL_JORNADA');
      openCleaningSubtab('plan');
      if(done)toast('Cabina: inicio y final de jornada completos.');
      else{const av=laminarCloseAvailability(savedDate);toast(`Inicio guardado. El formulario se cerró; el final estará disponible desde ${av.availableAt}.`)}
    }else{
      updateEquipmentCleaningWeeklyAgent();
      toast('Limpieza registrada y próxima fecha actualizada.');
    }
  });
  $('#equipmentExportBtn')?.addEventListener('click',()=>{const rows=[['Fecha/hora','Equipo','Evento','Usuario','Detalle'],...state.equipmentTrace.sort((a,b)=>String(a.eventAt).localeCompare(String(b.eventAt))).map(t=>[t.eventAt,t.equipmentName,t.action,t.user,t.detail])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`control_equipos_${today()}.csv`;a.click();URL.revokeObjectURL(a.href)});
  if($('#autoclaveControlForm')?.elements.date)$('#autoclaveControlForm').elements.date.value=today();
  if($('#autoclaveControlForm')?.elements.temperature)$('#autoclaveControlForm').elements.temperature.value=121;
  if($('#autoclaveControlForm')?.elements.cycleMinutes)$('#autoclaveControlForm').elements.cycleMinutes.value=15;
  if($('#equipmentCleaningForm')?.elements.date)$('#equipmentCleaningForm').elements.date.value=today();
  updateEquipmentCleaningWeeklyAgent();
}

// ===== V3.0.0-A · TRAZABILIDAD DE PRODUCTOS DE MICROBIOLOGÍA =====
const productToday=()=>new Date().toISOString().slice(0,10);
const productCatalogById=id=>state.productCatalog.find(x=>x.id===id);
const productLotById=id=>state.productLots.find(x=>x.id===id);
const productDaysBetween=(a,b)=>Math.ceil((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);
function productEffectiveExpiry(lot){
  const cat=productCatalogById(lot.productId); const dates=[];
  if(lot.manufacturerExpiry)dates.push(lot.manufacturerExpiry);
  if(lot.openedDate&&Number(cat?.openShelfDays)>0){const d=new Date(lot.openedDate+'T12:00:00');d.setDate(d.getDate()+Number(cat.openShelfDays));dates.push(d.toISOString().slice(0,10))}
  return dates.sort()[0]||'';
}
function productAvailable(lot){
  const used=state.productUsage.filter(x=>x.lotId===lot.id).reduce((s,x)=>s+Number(x.quantity||0),0);
  const closed=state.productClosures.some(x=>x.lotId===lot.id);
  return closed?0:Math.max(0,Number(lot.quantityReceived||0)-used);
}
function productLotStatus(lot){
  if(state.productClosures.some(x=>x.lotId===lot.id))return 'CERRADO';
  const exp=productEffectiveExpiry(lot);
  if(exp&&exp<productToday())return 'VENCIDO';
  return lot.status||'CUARENTENA';
}
function productStatusPill(s){const c={APTO:'ok',CUARENTENA:'warn',RECHAZADO:'bad',VENCIDO:'bad',CERRADO:'neutral'}[s]||'neutral';return `<span class="pill ${c}">${esc(s)}</span>`}
async function productTrace(lotId,action,detail){
  const lot=productLotById(lotId); const cat=lot?productCatalogById(lot.productId):null;
  await saveLocal('productTrace',{id:crypto.randomUUID(),lotId:lotId||'',productId:lot?.productId||'',lotCode:lot?.internalCode||'',productName:cat?.name||'',action,detail:String(detail||''),eventAt:nowISO(),user:activeUser(),deviceId},{render:false});
}
function nextProductLotCode(){
  const year=new Date().getFullYear(); const nums=state.productLots.map(x=>String(x.internalCode||'')).filter(x=>x.startsWith(`R-${year}-`)).map(x=>Number(x.split('-').pop())).filter(Number.isFinite);
  return `R-${year}-${String((nums.length?Math.max(...nums):0)+1).padStart(3,'0')}`;
}

function productHasCurrentAssignedLot(productId){
  return state.productLots.some(l=>l.productId===productId && !['CERRADO','RECHAZADO'].includes(productLotStatus(l)));
}
function productsPendingReception(){
  return state.productCatalog
    .filter(c=>!productHasCurrentAssignedLot(c.id))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}
function productReceptionDecision(form,cat){
  if(form.containerCondition==='NO_CONFORME'||form.labelCondition==='NO_CONFORME')return {status:'RECHAZADO',reason:'Envase/sello o etiqueta no conforme'};
  if(cat?.requiresCoa==='SI'&&form.coaStatus!=='RECIBIDO')return {status:'CUARENTENA',reason:'CoA requerido pendiente de verificación'};
  if(!form.manufacturerExpiry||!form.storageLocation)return {status:'CUARENTENA',reason:'Información crítica incompleta'};
  return {status:'APTO',reason:'Recepción conforme y documentación requerida completa'};
}

function productIntegrationEligibleLot(lot){
  return !!lot && productLotStatus(lot)==='APTO' && productAvailable(lot)>0 && (!productEffectiveExpiry(lot)||productEffectiveExpiry(lot)>=productToday());
}
async function softDeleteLocalRecord(domain,id,reason='DUPLICADO TÉCNICO'){
  const all=await idbAll('records'),row=all.find(x=>x.domain===domain&&x.data?.id===id&&!x.deleted);if(!row)return false;
  await idbPut('records',{...row,deleted:true,data:{...row.data,deleted:true,deletedAt:nowISO(),deletedBy:activeUser(),deletedReason:reason}});return true;
}
async function dedupeIntegratedBottleMirrors(){
  let removed=0;
  for(const lot of state.productLots){
    const cat=productCatalogById(lot.productId);if(!cat||cat.type!=='Medio de cultivo deshidratado'||!cat.erpMediumName)continue;
    const fam=bottleFamilyForMedium(cat.erpMediumName),code=String(lot.internalCode||'').trim().toUpperCase();
    const matches=state.catalogBottles.filter(b=>String(b.code||'').trim().toUpperCase()===code&&bottleFamilyForMedium(b.mediumFamily||b.medium)===fam);
    if(matches.length<=1)continue;
    const keep=[...matches].sort((a,b)=>{const au=state.mediaPrep.some(p=>p.bottleId===a.id)?1:0,bu=state.mediaPrep.some(p=>p.bottleId===b.id)?1:0;if(au!==bu)return bu-au;const ai=a.productLotId===lot.id?1:0,bi=b.productLotId===lot.id?1:0;return bi-ai})[0];
    if(keep.productLotId!==lot.id)await saveLocal('catalogBottles',{...keep,productLotId:lot.id,productCatalogId:cat.id,source:'PRODUCT_TRACEABILITY'},{render:false});
    for(const dup of matches.filter(x=>x.id!==keep.id)){
      if(state.mediaPrep.some(p=>p.bottleId===dup.id))continue;
      if(await softDeleteLocalRecord('catalogBottles',dup.id,'DUPLICADO CONSOLIDADO POR TRAZABILIDAD DE PRODUCTOS'))removed++;
    }
  }
  return removed;
}
async function syncProductLotToERP(lot){
  const cat=productCatalogById(lot?.productId); if(!lot||!cat||productLotStatus(lot)!=='APTO')return;
  if(cat.type==='Medio de cultivo deshidratado'&&cat.erpMediumName){
    const fam=bottleFamilyForMedium(cat.erpMediumName);
    const candidates=state.catalogBottles.filter(b=>b.productLotId===lot.id||(String(b.code||'').trim().toUpperCase()===String(lot.internalCode||'').trim().toUpperCase()&&bottleFamilyForMedium(b.mediumFamily||b.medium)===fam));
    const existing=candidates.sort((a,b)=>{const au=state.mediaPrep.some(p=>p.bottleId===a.id)?1:0,bu=state.mediaPrep.some(p=>p.bottleId===b.id)?1:0;if(au!==bu)return bu-au;const ai=a.productLotId===lot.id?1:0,bi=b.productLotId===lot.id?1:0;return bi-ai})[0];
    const mirror={
      ...(existing||{}),id:existing?.id||crypto.randomUUID(),
      mediumFamily:fam,medium:fam==='A1'?'A-1 medium':fam,
      code:existing?.code||lot.internalCode,
      expiryDate:lot.manufacturerExpiry,
      qualificationStatus:existing?.qualificationStatus||'NUEVO',
      openedAt:existing?.openedAt||lot.openedDate||'',
      qualifiedAt:existing?.qualifiedAt||'',
      qualifiedByLotId:existing?.qualifiedByLotId||'',
      qualifiedByLotCode:existing?.qualifiedByLotCode||'',
      operationalStatus:productAvailable(lot)>0?'ACTIVO':'BAJA',
      retiredAt:productAvailable(lot)>0?'':(existing?.retiredAt||productToday()),
      retiredReason:productAvailable(lot)>0?'':'AGOTADO EN TRAZABILIDAD DE PRODUCTOS',
      retiredBy:productAvailable(lot)>0?'':activeUser(),
      productLotId:lot.id,productCatalogId:cat.id,source:'PRODUCT_TRACEABILITY'
    };
    await saveLocal('catalogBottles',mirror,{render:false});
    if(!existing)await productTrace(lot.id,'INTEGRACIÓN CON PREPARACIÓN',`Lote habilitado automáticamente como frasco/lote de ${cat.erpMediumName}.`);
  }
  if(cat.type==='Cepa de referencia'&&cat.erpStrainId){
    const strain=state.catalogStrains.find(s=>s.id===cat.erpStrainId);
    if(strain){
      await saveLocal('catalogStrains',{...strain,supplierLot:lot.manufacturerLot,referenceExpiry:lot.manufacturerExpiry,productLotId:lot.id,productCatalogId:cat.id},{render:false});
      await productTrace(lot.id,'INTEGRACIÓN CON CEPAS',`Lote proveedor y caducidad vinculados automáticamente a ${strain.name} (${strain.referenceCode}).`);
    }
  }
}
async function registerIntegratedProductUse(lotId,quantity,destinationType,reference,usageDate,notes=''){
  const lot=productLotById(lotId); if(!lot)return null;
  const qty=Number(quantity||0); if(qty<=0||qty>productAvailable(lot))throw new Error(`Stock insuficiente en ${lot.internalCode}. Disponible: ${productAvailable(lot)}`);
  const use=await saveLocal('productUsage',{id:crypto.randomUUID(),lotId,quantity:qty,destinationType,reference,responsible:activeUser(),usageDate:usageDate||productToday(),notes,automatic:true},{render:false});
  await productTrace(lotId,'CONSUMO AUTOMÁTICO',`${qty} ${productCatalogById(lot.productId)?.unit||''} → ${destinationType} · ${reference}`);
  if(!lot.openedDate){
    await saveLocal('productLots',{...lot,openedDate:usageDate||productToday(),openedBy:activeUser()},{render:false});
    await productTrace(lotId,'PRIMERA APERTURA AUTOMÁTICA',`Apertura registrada por primer uso en ${destinationType}.`);
  }
  const refreshed=productLotById(lotId);
  if(productAvailable(refreshed)<=0){
    const bottle=state.catalogBottles.find(b=>b.productLotId===lotId);
    if(bottle)await saveLocal('catalogBottles',{...bottle,operationalStatus:'BAJA',retiredAt:usageDate||productToday(),retiredReason:'AGOTADO EN TRAZABILIDAD DE PRODUCTOS',retiredBy:activeUser()},{render:false});
  }
  return use;
}
function productLotForStrain(strain){
  if(!strain)return null;
  if(strain.productLotId){const l=productLotById(strain.productLotId);if(productIntegrationEligibleLot(l))return l}
  const cats=state.productCatalog.filter(c=>c.type==='Cepa de referencia'&&c.erpStrainId===strain.id);
  return state.productLots.filter(l=>cats.some(c=>c.id===l.productId)&&productIntegrationEligibleLot(l)).sort((a,b)=>String(a.manufacturerExpiry).localeCompare(String(b.manufacturerExpiry)))[0]||null;
}


const PRODUCT_MANUFACTURER_DEFAULTS=['TM MEDIA','Merck','Sigma Aldrich','Hygicult','NOKELAB','3M'];
const PRODUCT_STORAGE_DEFAULTS=['10 a 25 °C','-15 a -25 °C','2 a 25 °C','2 a 30 °C'];
function productCustomList(key){try{return JSON.parse(localStorage.getItem(key)||'[]').filter(Boolean)}catch{return []}}
function saveProductCustomList(key,values){localStorage.setItem(key,JSON.stringify([...new Set(values.filter(Boolean))]))}
function fillProductControlledSelect(select,defaults,key,current=''){
  if(!select)return;
  const custom=productCustomList(key),values=[...new Set([...defaults,...custom,current].filter(v=>v&&v!=='__NEW__'))];
  select.innerHTML='<option value="">Seleccione</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')+'<option value="__NEW__">➕ Nuevo...</option>';
  if(current&&values.includes(current))select.value=current;
}
function handleProductNewControlledValue(select,key,label){
  if(!select||select.value!=='__NEW__')return;
  const value=prompt(`Nuevo ${label}:`,'');
  if(!value||!value.trim()){select.value='';return}
  const clean=value.trim();
  const list=productCustomList(key);list.push(clean);saveProductCustomList(key,list);
  const defaults=key==='microbio_product_manufacturers'?PRODUCT_MANUFACTURER_DEFAULTS:PRODUCT_STORAGE_DEFAULTS;
  fillProductControlledSelect(select,defaults,key,clean);
}
function canonicalProductStrains(){
  const byRef=new Map();
  for(const s of state.catalogStrains){
    const key=String(s.referenceCode||s.name||'').trim().toUpperCase();
    const current=byRef.get(key);
    const score=x=>/ESCHERICHIA COLI-\d+$/i.test(String(x?.name||''))?0:1;
    if(!current||score(s)>score(current))byRef.set(key,s);
  }
  return [...byRef.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function productPresetData(code){
  const media={
    'MEDIUM:A1':{name:'A-1 medium (simple + concentrado)',type:'Medio de cultivo deshidratado',erpMediumName:'A-1 medium',unit:'g',requiresCoa:'SI',requiresPerformance:'AUTO'},
    'MEDIUM:AN':{name:'AN Agar nutrients',type:'Medio de cultivo deshidratado',erpMediumName:'AN Agar nutrients',unit:'g',requiresCoa:'SI',requiresPerformance:'AUTO'},
    'MEDIUM:BHI':{name:'BHI',type:'Medio de cultivo deshidratado',erpMediumName:'BHI',unit:'g',requiresCoa:'SI',requiresPerformance:'AUTO'},
    'MEDIUM:EMB':{name:'EMB',type:'Medio de cultivo deshidratado',erpMediumName:'EMB',unit:'g',requiresCoa:'SI',requiresPerformance:'AUTO'},
    'MEDIUM:LMX':{name:'LMX Fluorocult',type:'Medio de cultivo deshidratado',erpMediumName:'LMX Fluorocult',unit:'g',requiresCoa:'SI',requiresPerformance:'AUTO'},
    'MEDIUM:PCA':{name:'PCA',type:'Medio de cultivo deshidratado',erpMediumName:'PCA',unit:'g',requiresCoa:'SI',requiresPerformance:'AUTO'},
    'MEDIUM:PDA':{name:'PDA',type:'Medio de cultivo deshidratado',erpMediumName:'PDA',unit:'g',requiresCoa:'SI',requiresPerformance:'AUTO'}
  };
  if(media[code])return media[code];
  if(code==='CONSUMABLE:SWAB')return {name:'Hisopos',type:'Hisopo',erpMediumName:'',erpStrainId:'',unit:'unidad',requiresCoa:'NO',requiresPerformance:'NO'};
  if(code==='CONSUMABLE:PETRI')return {name:'Caja Petri',type:'Caja Petri',erpMediumName:'',erpStrainId:'',unit:'unidad',requiresCoa:'NO',requiresPerformance:'NO'};
  if(code==='CONSUMABLE:ATTEST')return {name:'Attest 3M',type:'Consumible crítico',erpMediumName:'',erpStrainId:'',unit:'unidad',requiresCoa:'SI',requiresPerformance:'NO'};
  if(code==='CONSUMABLE:STERIKON')return {name:'Sterikon Plus',type:'Consumible crítico',erpMediumName:'',erpStrainId:'',unit:'unidad',requiresCoa:'SI',requiresPerformance:'NO'};
  const strainCodes={'STRAIN:ENT':'ENT','STRAIN:EC':'EC','STRAIN:KBL':'KBL','STRAIN:SAL':'SAL'};
  if(strainCodes[code]){
    const short=strainCodes[code];
    const strain=canonicalProductStrains().find(s=>String(s.shortCode||'').replace(/\d+$/,'').toUpperCase()===short)
      ||canonicalProductStrains().find(s=>short==='EC'&&/^ESCHERICHIA COLI$/i.test(String(s.name||'')))
      ||canonicalProductStrains().find(s=>short==='ENT'&&/ENTEROCOCCUS/i.test(String(s.name||'')))
      ||canonicalProductStrains().find(s=>short==='KBL'&&/KLEBSIELLA/i.test(String(s.name||'')))
      ||canonicalProductStrains().find(s=>short==='SAL'&&/SALMONELLA/i.test(String(s.name||'')));
    if(strain)return {name:String(strain.name).replace(/-\d+$/,''),type:'Cepa de referencia',erpMediumName:'',erpStrainId:strain.id,unit:'vial',requiresCoa:'SI',requiresPerformance:'NO'};
  }
  return null;
}
function applyProductPreset(code){
  const f=$('#productCatalogForm');if(!f)return;
  if(code==='MANUAL'){for(const k of ['name','erpMediumName','erpStrainId'])if(f.elements[k])f.elements[k].value='';return}
  const p=productPresetData(code);if(!p)return;
  for(const [k,v] of Object.entries(p))if(f.elements[k])f.elements[k].value=v??'';
}
function renderProductModule(){
  if(!$('#view-products'))return;
  const cats=[...state.productCatalog].sort((a,b)=>String(a.name).localeCompare(String(b.name)));const productForm=$('#productCatalogForm');fillProductControlledSelect($('#productManufacturerSelect'),PRODUCT_MANUFACTURER_DEFAULTS,'microbio_product_manufacturers',productForm?.elements.manufacturer?.value||'');fillProductControlledSelect($('#productStorageSelect'),PRODUCT_STORAGE_DEFAULTS,'microbio_product_storage_ranges',productForm?.elements.storageCondition?.value||'');const mediumMap=$('#productErpMedium'),strainMap=$('#productErpStrain');if(mediumMap){const v=mediumMap.value;const otherMedia=state.catalogMedia.filter(m=>bottleFamilyForMedium(m.name)!=='A1');mediumMap.innerHTML='<option value="">No aplica</option><option value="A-1 medium">A-1 medium (simple + concentrado)</option>'+otherMedia.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');if([...mediumMap.options].some(o=>o.value===v))mediumMap.value=v}if(strainMap){const v=strainMap.value;strainMap.innerHTML='<option value="">No aplica</option>'+canonicalProductStrains().map(s=>`<option value="${s.id}">${esc(String(s.name).replace(/-\d+$/,''))} · ${esc(s.referenceCode)}</option>`).join('');if([...strainMap.options].some(o=>o.value===v))strainMap.value=v}
  $('#productCatalogRows').innerHTML=cats.map(c=>{const linked=c.erpMediumName?`Medio: ${bottleFamilyLabel(c.erpMediumName)}`:(c.erpStrainId?`Cepa: ${state.catalogStrains.find(s=>s.id===c.erpStrainId)?.name||'Vínculo configurado'}`:'—');return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.type)}</td><td>${esc(c.manufacturer||'—')}</td><td>${esc(linked)}</td><td>${esc(c.storageCondition||'—')}</td><td>${c.openShelfDays?esc(c.openShelfDays)+' días':'Requiere definir'}</td><td>${esc(c.minStock||0)} ${esc(c.unit||'')}</td><td><button onclick="editProductCatalog('${c.id}')">✏️ Editar</button></td></tr>`}).join('')||'<tr><td colspan="8">Sin productos configurados.</td></tr>';
  const receptionCats=productsPendingReception();
  const opts='<option value="">Seleccione...</option>'+receptionCats.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(c.manufacturer||'')}</option>`).join('');
  if($('#productLotProduct')){
    const current=$('#productLotProduct').value;
    $('#productLotProduct').innerHTML=opts;
    if([...$('#productLotProduct').options].some(o=>o.value===current))$('#productLotProduct').value=current;
  }
  const lots=[...state.productLots].sort((a,b)=>String(b.receivedDate||'').localeCompare(String(a.receivedDate||'')));
  $('#productLotRows').innerHTML=lots.map(l=>{const c=productCatalogById(l.productId), st=productLotStatus(l), av=productAvailable(l), exp=productEffectiveExpiry(l);return `<tr><td><b>${esc(l.internalCode)}</b></td><td>${esc(c?.name||'—')}</td><td>${esc(l.manufacturerLot)}</td><td>${productStatusPill(st)}</td><td>${av} ${esc(c?.unit||'')}</td><td>${esc(exp||'—')}</td><td>${esc(l.storageLocation||'—')}</td><td>${st==='APTO'&&!l.openedDate?`<button onclick="openProductLot('${l.id}')">🔓 Abrir</button>`:''}<button onclick="showProductTrace('${l.id}')">📋 Trazabilidad</button></td></tr>`}).join('')||'<tr><td colspan="8">Sin lotes registrados.</td></tr>';
  const usable=lots.filter(l=>productLotStatus(l)==='APTO'&&productAvailable(l)>0);
  const lotOpts='<option value="">Seleccione...</option>'+usable.map(l=>{const c=productCatalogById(l.productId);return `<option value="${l.id}">${esc(l.internalCode)} · ${esc(c?.name||'')} · disp. ${productAvailable(l)} ${esc(c?.unit||'')}</option>`}).join('');
  if($('#productUsageLot'))$('#productUsageLot').innerHTML=lotOpts;
  const closable=lots.filter(l=>!state.productClosures.some(x=>x.lotId===l.id));
  if($('#productClosureLot'))$('#productClosureLot').innerHTML='<option value="">Seleccione...</option>'+closable.map(l=>`<option value="${l.id}">${esc(l.internalCode)} · ${esc(productCatalogById(l.productId)?.name||'')}</option>`).join('');
  $('#productUsageRows').innerHTML=[...state.productUsage].sort((a,b)=>String(b.usageDate).localeCompare(String(a.usageDate))).slice(0,100).map(u=>{const l=productLotById(u.lotId),c=l&&productCatalogById(l.productId);return `<tr><td>${esc(u.usageDate)}</td><td>${esc(c?.name||'—')}<br><small>${esc(l?.internalCode||'')}</small></td><td>${esc(u.quantity)} ${esc(c?.unit||'')}</td><td>${esc(u.destinationType)}</td><td>${esc(u.reference)}</td><td>${esc(u.responsible)}</td></tr>`}).join('')||'<tr><td colspan="6">Sin usos registrados.</td></tr>';
  $('#productTraceRows').innerHTML=[...state.productTrace].sort((a,b)=>String(b.eventAt).localeCompare(String(a.eventAt))).slice(0,500).map(t=>`<tr><td>${esc(new Date(t.eventAt).toLocaleString())}</td><td>${esc(t.productName||'—')}<br><small>${esc(t.lotCode||'')}</small></td><td><b>${esc(t.action)}</b></td><td>${esc(t.user||'—')}</td><td>${esc(t.detail||'')}</td></tr>`).join('')||'<tr><td colspan="5">Sin eventos.</td></tr>';
  const active=lots.filter(l=>!['CERRADO','VENCIDO','RECHAZADO'].includes(productLotStatus(l)));
  const soon=lots.filter(l=>{const e=productEffectiveExpiry(l);return e&&productDaysBetween(productToday(),e)>=0&&productDaysBetween(productToday(),e)<=30&&!['CERRADO','RECHAZADO'].includes(productLotStatus(l))});
  $('#prodKpiActive').textContent=active.length; $('#prodKpiSoon').textContent=soon.length;
  $('#prodKpiQuarantine').textContent=lots.filter(l=>productLotStatus(l)==='CUARENTENA').length;
  $('#prodKpiExpired').textContent=lots.filter(l=>productLotStatus(l)==='VENCIDO').length;
  $('#prodKpiCritical').textContent=lots.filter(l=>{const c=productCatalogById(l.productId);return productLotStatus(l)==='APTO'&&productAvailable(l)<=Number(c?.minStock||0)}).length;
  $('#prodKpiCoa').textContent=lots.filter(l=>l.coaStatus==='PENDIENTE').length;
  if($('#productReviewedBy'))$('#productReviewedBy').value=activeUser();
  if($('#productUsageResponsible'))$('#productUsageResponsible').value=activeUser();
  if($('#productClosureResponsible'))$('#productClosureResponsible').value=activeUser();
}
window.editProductCatalog=id=>{const c=productCatalogById(id);if(!c)return;const f=$('#productCatalogForm');Object.entries(c).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v??''});$('#product-tab-catalog').scrollIntoView({behavior:'smooth'})};
window.openProductLot=async id=>{const l=productLotById(id);if(!l||productLotStatus(l)!=='APTO')return;const date=prompt('Fecha de primera apertura (AAAA-MM-DD):',productToday());if(!date)return;await saveLocal('productLots',{...l,openedDate:date,openedBy:activeUser()},{render:false});const linkedBottle=state.catalogBottles.find(b=>b.productLotId===id);if(linkedBottle)await saveLocal('catalogBottles',{...linkedBottle,openedAt:date},{render:false});await productTrace(id,'PRIMERA APERTURA',`Fecha ${date}. Vencimiento efectivo recalculado automáticamente.`);await loadLocal();toast('Apertura registrada.')};
window.showProductTrace=id=>{const events=state.productTrace.filter(x=>x.lotId===id).sort((a,b)=>String(a.eventAt).localeCompare(String(b.eventAt)));alert(events.map(e=>`${new Date(e.eventAt).toLocaleString()} · ${e.action} · ${e.user}\n${e.detail}`).join('\n\n')||'Sin eventos.')};
function bindProductModule(){
  if(!$('#view-products')||$('#view-products').dataset.bound)return; $('#view-products').dataset.bound='1';
  $('#productPresetSelect')?.addEventListener('change',e=>applyProductPreset(e.target.value));
  $('#productManufacturerSelect')?.addEventListener('change',e=>handleProductNewControlledValue(e.target,'microbio_product_manufacturers','fabricante'));
  $('#productStorageSelect')?.addEventListener('change',e=>handleProductNewControlledValue(e.target,'microbio_product_storage_ranges','rango de temperatura'));
  $$('.product-tab').forEach(b=>b.onclick=()=>{$$('.product-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.product-tabpane').forEach(x=>x.classList.remove('active'));$(`#product-tab-${b.dataset.productTab}`).classList.add('active')});
  $('#productCatalogForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f));const old=fd.id?productCatalogById(fd.id):null;if(fd.openShelfDays){const shelf=Number(fd.openShelfDays);if(!Number.isInteger(shelf)||shelf<15||shelf>720){toast('La vida útil postapertura debe estar entre 15 y 720 días, o quedar vacía si no aplica.');return}}const normalizedName=String(fd.name||'').trim().toUpperCase();const duplicate=state.productCatalog.find(c=>c.id!==fd.id&&String(c.name||'').trim().toUpperCase()===normalizedName);if(duplicate){toast('Ese producto ya existe en el Catálogo Maestro. Edite el registro existente en lugar de duplicarlo.');return}const rec={...old,...fd,name:String(fd.name||'').trim(),id:fd.id||crypto.randomUUID(),openShelfDays:fd.openShelfDays?Number(fd.openShelfDays):null,minStock:Number(fd.minStock||0)};await saveLocal('productCatalog',rec,{render:false});for(const lot of state.productLots.filter(l=>l.productId===rec.id&&productLotStatus(l)==='APTO'))await syncProductLotToERP(lot);f.reset();if($('#productPresetSelect'))$('#productPresetSelect').value='';await loadLocal();toast('Producto guardado en Catálogo Maestro.')});
  $('#productCatalogCancel').onclick=()=>{const f=$('#productCatalogForm');f.reset();if($('#productPresetSelect'))$('#productPresetSelect').value='';renderProductModule()};
  $('#productLotProduct').addEventListener('change',()=>{$('#productLotCodePreview').value=nextProductLotCode()});
  $('#productLotForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),cat=productCatalogById(fd.productId);if(!cat)return toast('Seleccione un producto.');const old=fd.id?productLotById(fd.id):null;const dec=productReceptionDecision(fd,cat);const rec={...old,...fd,id:fd.id||crypto.randomUUID(),internalCode:old?.internalCode||nextProductLotCode(),quantityReceived:Number(fd.quantityReceived||0),status:dec.status,statusReason:dec.reason,reviewedBy:activeUser(),reviewedAt:nowISO()};const saved=await saveLocal('productLots',rec,{render:false});if(dec.status==='APTO')await syncProductLotToERP(saved);await productTrace(saved.id,'RECEPCIÓN Y EVALUACIÓN',`${dec.status}: ${dec.reason}. Lote fabricante ${fd.manufacturerLot}; proveedor ${fd.supplier}; vencimiento ${fd.manufacturerExpiry}.`);f.reset();await loadLocal();toast(`Lote ${saved.internalCode}: ${dec.status}.`)});
  $('#productLotCancel').onclick=()=>$('#productLotForm').reset();
  $('#productUsageForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),lot=productLotById(fd.lotId);if(!lot||productLotStatus(lot)!=='APTO')return toast('El lote no está APTO.');const qty=Number(fd.quantity||0);if(qty<=0||qty>productAvailable(lot))return toast('Cantidad inválida o superior al stock disponible.');await registerIntegratedProductUse(lot.id,qty,fd.destinationType,fd.reference,fd.usageDate,fd.notes||'');f.reset();await loadLocal();toast('Uso registrado y stock actualizado.')});
  $('#productClosureForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f)),lot=productLotById(fd.lotId);if(!lot)return; if(!confirm(`Cerrar definitivamente ${lot.internalCode}? Esta acción quedará en trazabilidad.`))return;await saveLocal('productClosures',{...fd,id:crypto.randomUUID(),discardedQuantity:Number(fd.discardedQuantity||0),responsible:activeUser(),closedAt:nowISO()},{render:false});await productTrace(lot.id,'CIERRE DEFINITIVO',`${fd.reason}. Disposición: ${fd.disposalMethod}. ${fd.notes}`);const linkedBottle=state.catalogBottles.find(b=>b.productLotId===lot.id);if(linkedBottle)await saveLocal('catalogBottles',{...linkedBottle,operationalStatus:'BAJA',retiredAt:fd.closureDate,retiredReason:fd.reason,retiredBy:activeUser()},{render:false});f.reset();await loadLocal();toast('Lote cerrado definitivamente.')});
  $('#productExportBtn').onclick=()=>{const rows=[['Fecha/hora','Producto','Código lote','Acción','Usuario','Detalle'],...state.productTrace.sort((a,b)=>String(a.eventAt).localeCompare(String(b.eventAt))).map(t=>[t.eventAt,t.productName,t.lotCode,t.action,t.user,t.detail])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`trazabilidad_productos_${productToday()}.csv`;a.click();URL.revokeObjectURL(a.href)};
  ['productUsageForm','productClosureForm'].forEach(id=>{const f=$('#'+id);if(f?.elements.usageDate)f.elements.usageDate.value=productToday();if(f?.elements.closureDate)f.elements.closureDate.value=productToday()});
  if($('#productLotForm')?.elements.receivedDate)$('#productLotForm').elements.receivedDate.value=productToday();
}


function populateAuditFilters(){
  const uf=document.getElementById('auditUserFilter'),mf=document.getElementById('auditModuleFilter');
  if(uf){
    const current=uf.value;
    const users=[...new Set((state.auditLog||[]).map(e=>e.user).filter(Boolean))].sort();
    uf.innerHTML='<option value="">Todos</option>'+users.map(u=>`<option ${u===current?'selected':''}>${esc(u)}</option>`).join('');
  }
  if(mf){
    const current=mf.value;
    const modules=[...new Set((state.auditLog||[]).map(e=>e.module||auditModuleForDomain(e.domain||e.entityType)).filter(Boolean))].sort();
    mf.innerHTML='<option value="">Todos</option>'+modules.map(x=>`<option ${x===current?'selected':''}>${esc(x)}</option>`).join('');
  }
}
function filteredCentralAudit(){
  const u=document.getElementById('auditUserFilter')?.value||'';
  const m=document.getElementById('auditModuleFilter')?.value||'';
  const a=document.getElementById('auditActionFilter')?.value||'';
  const d1=document.getElementById('auditDateFrom')?.value||'';
  const d2=document.getElementById('auditDateTo')?.value||'';
  const q=String(document.getElementById('auditTextFilter')?.value||'').toLowerCase().trim();
  return [...(state.auditLog||[])].filter(e=>{
    const module=e.module||auditModuleForDomain(e.domain||e.entityType);
    const day=String(e.eventAt||'').slice(0,10);
    if(u&&e.user!==u)return false;
    if(m&&module!==m)return false;
    if(a&&e.action!==a)return false;
    if(d1&&day<d1)return false;
    if(d2&&day>d2)return false;
    if(q){
      const text=[e.user,e.email,module,e.action,e.recordLabel,e.entityId,e.deviceId,JSON.stringify(e.details||{})].join(' ').toLowerCase();
      if(!text.includes(q))return false;
    }
    return true;
  }).sort((x,y)=>String(y.eventAt||'').localeCompare(String(x.eventAt||'')));
}
function renderCentralAudit(){
  const rows=document.getElementById('centralAuditRows');
  if(!rows)return;
  populateAuditFilters();
  const events=filteredCentralAudit();
  rows.innerHTML=events.slice(0,500).map(e=>{
    const module=e.module||auditModuleForDomain(e.domain||e.entityType);
    const changes=Array.isArray(e.details?.changes)?e.details.changes:[];
    const detail=e.details?.summary||e.details?.reason||changes.slice(0,2).map(c=>`${c.field}: ${c.before} → ${c.after}`).join(' · ')||'—';
    return `<tr>
      <td>${esc(e.eventAt?new Date(e.eventAt).toLocaleString():'—')}</td>
      <td><b>${esc(e.user||'—')}</b></td>
      <td>${esc(e.email||'—')}</td>
      <td>${esc(module)}</td>
      <td><span class="pill">${esc(e.action||'—')}</span></td>
      <td>${esc(e.recordLabel||e.entityId||'—')}</td>
      <td><code>${esc(String(e.deviceId||'—').slice(0,12))}</code></td>
      <td title="${esc(JSON.stringify(e.details||{}))}">${esc(detail)}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="8" class="muted">No hay eventos con estos filtros.</td></tr>';
  const s=document.getElementById('auditSummary');
  if(s)s.textContent=`${events.length} evento(s) · mostrando ${Math.min(events.length,500)} · historial de solo lectura`;
}
function bindCentralAudit(){
  ['auditUserFilter','auditModuleFilter','auditActionFilter','auditDateFrom','auditDateTo','auditTextFilter'].forEach(id=>{
    document.getElementById(id)?.addEventListener(id==='auditTextFilter'?'input':'change',renderCentralAudit);
  });
  document.getElementById('auditRefreshBtn')?.addEventListener('click',renderCentralAudit);
  document.getElementById('auditClearFiltersBtn')?.addEventListener('click',()=>{
    ['auditUserFilter','auditModuleFilter','auditActionFilter','auditDateFrom','auditDateTo','auditTextFilter'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.value='';
    });
    renderCentralAudit();
  });
}
function renderAll(){renderCentralAudit();renderRefrigerator2Module();renderRefrigeratorModule();renderPhMeterModule();renderWaterBathModule();renderIncubatorModule();renderEnvironmentModule();const ambient=$('#condition-ambient'),fridge=$('#condition-refrigerator');if(ambient){ambient.classList.toggle('active',activeConditionPane==='ambient');ambient.style.display=activeConditionPane==='ambient'?'block':'none'}if(fridge){fridge.classList.toggle('active',activeConditionPane==='refrigerator');fridge.style.display=activeConditionPane==='refrigerator'?'block':'none'}renderEquipmentModule();renderProductModule();renderMediaOptions();renderActiveUser();renderSelects();renderBottleOptions();renderPrep();renderPendingQC();renderQC();renderRelease();renderInventory();renderKPIs();renderCatalogs();renderConfig();renderStrains();renderPerformanceTasks();renderPerformanceDetail();renderMicrobiology();renderColiformQC();renderSampleModule();renderCriteriaEngine();prepareQC();applyReleaseDefaults()}

window.openPendingQC=id=>{const s=$('#qcPrepSelect');s.value=id;prepareQC();$('#qcEntryPanel').scrollIntoView({behavior:'smooth',block:'start'})};
window.openClosure=id=>{const p=state.mediaPrep.find(x=>x.id===id);if(!p)return;$('#closurePrepSelect').value=id;$('#closureTypeSelect').value=p.expiryDate&&p.expiryDate<today()?'VENCIMIENTO':'AGOTADO';$('#closureForm').scrollIntoView({behavior:'smooth',block:'center'})};
window.showLot=id=>{const p=state.mediaPrep.find(x=>x.id===id);if(!p)return;const q=latestQC(id),r=latestRelease(id),events=state.auditLog.filter(e=>e.entityId===id||e.details?.prepId===id).sort((a,b)=>(a.eventAt||'').localeCompare(b.eventAt||''));$('#lotModalContent').innerHTML=`<h2>${esc(p.lotCode)}</h2><div class="trace-card"><div><span>ID interno</span><b>${esc(p.internalCode||p.id)}</b></div><div><span>Medio</span><b>${esc(p.medium)}</b></div><div><span>Frasco</span><b>${esc(p.bottleCode||'—')}</b></div><div><span>Estado</span>${pill(lotState(p))}</div><div><span>QC</span>${pill(q?.result||'PENDIENTE')}</div><div><span>Liberación</span>${pill(r?.decision||'SIN LIBERAR')}</div><div><span>Vence</span><b>${esc(p.expiryDate||'—')}</b></div><div><span>Disponible</span>${pill(availabilityState(p))}</div></div><h3>Historial automático</h3><div class="timeline">${events.map(e=>`<div class="timeline-item"><b>${esc(e.action)}</b><span>${esc(new Date(e.eventAt).toLocaleString())} · ${esc(e.user||'—')} · ${esc(e.deviceId||'—')}</span><small>${esc(e.details?.summary||'')}</small></div>`).join('')||'<p>Sin eventos históricos.</p>'}</div>`;$('#lotModal').classList.add('open');$('#lotModal').setAttribute('aria-hidden','false')};
window.editMedium=id=>{const x=state.catalogMedia.find(y=>y.id===id),f=$('#mediaCatalogForm');if(!x)return;for(const k of ['id','name','type','technicalClass','prefix','concentration','shelfLifeDays','phMin','phMax','expectedColor','expectedAppearance'])if(f.elements[k])f.elements[k].value=x[k]??'';const prof=x.performanceProfile||{};if(f.elements.performanceProductivityStrain)f.elements.performanceProductivityStrain.value=prof.productivity?.strainId||'';if(f.elements.performanceSelectivityStrain)f.elements.performanceSelectivityStrain.value=prof.selectivity?.strainId||'';if(f.elements.performanceSpecificityStrain)f.elements.performanceSpecificityStrain.value=prof.specificity?.strainId||'';f.scrollIntoView({behavior:'smooth'})};
window.editBottle=id=>{const x=state.catalogBottles.find(y=>y.id===id),f=$('#bottleCatalogForm');if(!x)return;const used=state.mediaPrep.some(p=>p.bottleId===x.id);f.elements.id.value=x.id;f.elements.medium.value=bottleFamilyForMedium(x.mediumFamily||x.medium);f.elements.code.value=x.code;f.elements.expiryDate.value=x.expiryDate||'';f.elements.medium.disabled=used;f.elements.code.readOnly=used;$('#bottleFormMode').textContent=used?'Frasco con uso histórico: identidad bloqueada; puede completar/corregir únicamente el vencimiento del fabricante.':'Corrigiendo registro sin uso';f.scrollIntoView({behavior:'smooth'})};
window.retireBottle=async id=>{const x=bottleById(id);if(!x)return;const reason=prompt('Motivo de baja del frasco/lote (ej. agotado, vencido, deteriorado):','');if(reason===null)return;const updated=await saveLocal('catalogBottles',{...x,operationalStatus:'BAJA',retiredAt:today(),retiredReason:reason.trim(),retiredBy:activeUser()},{render:false});await audit('catalogBottle',updated.id,'FRASCO DADO DE BAJA',{summary:`${updated.code}${reason.trim()?' · '+reason.trim():''}`});await loadLocal();toast(`${updated.code} dado de baja`)};
window.reactivateBottle=async id=>{const x=bottleById(id);if(!x)return;if(!confirm(`¿Reactivar ${x.code}? Volverá a aparecer en Preparación si no está bloqueado.`))return;const updated=await saveLocal('catalogBottles',{...x,operationalStatus:'ACTIVO',retiredAt:'',retiredReason:'',retiredBy:''},{render:false});await audit('catalogBottle',updated.id,'FRASCO REACTIVADO',{summary:updated.code});await loadLocal();toast(`${updated.code} reactivado`)};
window.editPerson=id=>{const x=state.catalogPersonnel.find(y=>y.id===id),f=$('#personCatalogForm');if(!x)return;f.elements.id.value=x.id;f.elements.code.value=x.code;f.elements.name.value=x.name||'';f.scrollIntoView({behavior:'smooth'})};

window.editStrainCatalog=id=>{const x=state.catalogStrains.find(y=>y.id===id),f=$('#strainCatalogForm');if(!x)return;for(const k of ['id','name','referenceCode','supplierLot','referenceExpiry','shortCode','recommendedMedium','incubationTemp','incubationHours','cryovialLifeMonths','storageTemp','expectedMorphology'])if(f.elements[k])f.elements[k].value=x[k]??'';f.scrollIntoView({behavior:'smooth'})};
window.openCryovialWriteoff=async id=>{const p=state.strainPreparations.find(x=>x.id===id);if(!p)return;const inv=strainInventoryForPrep(p);if(inv.available<=0){toast('No hay crioviales disponibles');return}const raw=prompt(`Cantidad de crioviales a dar de baja de ${p.workLot}. Disponibles: ${inv.available}`,'1');if(raw===null)return;const quantity=Number(raw);if(!Number.isInteger(quantity)||quantity<1||quantity>inv.available){toast('Cantidad de baja no válida');return}const reason=prompt('Motivo de baja (vencimiento, daño, contaminación, descarte planificado, otro):','');if(reason===null||!reason.trim()){toast('Debe registrar el motivo');return}const ev=await saveLocal('strainCryovialEvents',{id:crypto.randomUUID(),prepId:p.id,strainId:p.strainId,type:'BAJA',quantity,reason:reason.trim(),eventAt:nowISO(),responsible:activeUser()},{render:false});await audit('strainPreparation',p.id,'CRIOVIALES DADOS DE BAJA',{eventId:ev.id,summary:`${quantity} criovial(es) · ${reason.trim()}`});await loadLocal();toast('Baja registrada; inventario actualizado automáticamente')};




$('#microControlPointSelect')?.addEventListener('change',()=>{localStorage.setItem('microbio_pending_monitoring_point',$('#microControlPointSelect').value||'');updateMicroControlCalculated()});
$('#microControlDate')?.addEventListener('change',()=>{updateMicroControlCalculated()});
$('#microControlCancelBtn')?.addEventListener('click',()=>{localStorage.removeItem('microbio_pending_monitoring_point');localStorage.removeItem('microbio_pending_monitoring_source');activateMicroTab('planner');renderPlanner()});
$('#microControlForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const p=state.catalogMonitoringPoints.find(x=>x.id===$('#microControlPointSelect')?.value);if(!p){toast('Seleccione un punto de monitoreo');return}if(!activeUser()){toast('Seleccione un usuario activo');return}
  const controlDate=$('#microControlDate').value||today(),crit=microCriterionForPoint(p,controlDate);if(!crit){toast('No existe criterio vigente para este punto. Configure el Motor de Reglas.');return}const calc=microControlCalculation(p);if(!calc.ready){toast(calc.formula);return}const plate=selectedMicroPlate();if(!plate){toast('Seleccione el N.º de caja preparada utilizada en este control');return}const stillAvailable=plateAvailableOptions(p.medium,controlDate).some(o=>o.prep.id===plate.prep.id&&o.plateNumber===plate.plateNumber);if(!stillAvailable){toast('La caja seleccionada ya no está disponible o no corresponde al medio/fecha del control');renderMicroPlateOptions();return}const evaluation=evaluateCriterionValue(crit.snapshot,calc.value),colonies=Number($('#microObservedColonies')?.value),volume=p.type==='Agua'?Number($('#microObservedVolume')?.value):null,resistivity=p.type==='Agua'&&$('#microObservedResistivity')?.value!==''?Number($('#microObservedResistivity')?.value):null;
  const record={id:crypto.randomUUID(),controlCode:$('#microControlCode').value||nextMicroControlCode(),pointId:p.id,pointSnapshot:{id:p.id,code:p.code,name:p.name,type:p.type,criticality:p.criticality,frequency:p.frequency,frequencyDays:p.frequencyDays,medium:p.medium,microorganism:p.microorganism,method:p.method,exposureMinutes:p.exposureMinutes||0,plateDiameterMm:p.plateDiameterMm||0,swabAreaCm2:p.swabAreaCm2||0,unit:p.unit||''},criterionSnapshot:crit.snapshot,controlDate,controlTime:$('#microControlTime').value||microNowTime(),responsible:activeUser(),colonies,volumeAnalyzedMl:volume,resistivity,resultValue:Number(calc.value),resultUnit:p.unit||'',calculationFormula:calc.formula,result:evaluation.status==='CONFORME'?'CUMPLE':evaluation.status==='ALERTA'?'ALERTA':evaluation.status==='ACCION_REQUERIDA'?'NO CUMPLE':'SIN EVALUAR',criterionEvaluationStatus:evaluation.status,notes:$('#microControlNotes').value.trim(),platePrepId:plate.prep.id,plateLotCode:plate.prep.lotCode,plateNumber:plate.plateNumber,plateCode:plate.plateCode,plateExpiryDate:plate.prep.expiryDate||'',plateAssignmentStatus:'ASIGNADA_V200F'};
  await saveLocal('microbiologicalControls',record,{render:false});await saveLocal('microPlateEvents',{id:crypto.randomUUID(),prepId:plate.prep.id,plateNumber:plate.plateNumber,plateCode:plate.plateCode,type:'USO',quantity:1,controlId:record.id,controlCode:record.controlCode,pointId:p.id,eventDate:controlDate,eventAt:nowISO(),responsible:activeUser()},{render:false});await autoCloseExhaustedPlateLot(plate.prep.id,controlDate);await audit('microbiologicalControl',record.id,'CONTROL MICROBIOLÓGICO REGISTRADO',{pointId:p.id,prepId:plate.prep.id,summary:`${record.controlCode} · ${p.name} · ${plate.plateCode} · ${Number(calc.value).toFixed(2)} ${p.unit||''} · ${record.result}`});localStorage.removeItem('microbio_pending_monitoring_point');localStorage.removeItem('microbio_pending_monitoring_source');await loadLocal();renderPlanner();toast(`${record.controlCode} registrado · ${record.result} · ${plate.plateCode}. Planificador actualizado.`);activateMicroTab('results');
});

$('#criterionForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!activeUser()){toast('Seleccione un usuario activo');return}const f=e.currentTarget,o=Object.fromEntries(new FormData(f));let rule=state.criteriaRules.find(r=>r.id===o.ruleId);if(!rule){if(!o.code||!o.name||!o.domain||!o.scopeKey){toast('Complete código, nombre, dominio y alcance');return}rule=await saveLocal('criteriaRules',{id:crypto.randomUUID(),code:o.code.trim().toUpperCase(),name:o.name.trim(),domain:o.domain,scopeKey:o.scopeKey.trim(),description:'',status:'ACTIVO',currentVersionId:''},{render:false});}const versions=state.criteriaVersions.filter(v=>v.ruleId===rule.id);const versionNumber=Math.max(0,...versions.map(v=>Number(v.version||0)))+1;const num=x=>x===''||x===null?null:Number(x);if((o.min!==''||o.max!=='')&&(o.min===''||o.max==='')){toast('Para un rango debe completar mínimo y máximo');return}const v=await saveLocal('criteriaVersions',{id:crypto.randomUUID(),ruleId:rule.id,version:versionNumber,effectiveFrom:o.effectiveFrom||today(),effectiveTo:'',target:num(o.target),alert:num(o.alert),action:num(o.action),min:num(o.min),max:num(o.max),unit:o.unit.trim(),sourceType:o.sourceType,sourceReference:o.sourceReference.trim(),notes:o.notes.trim(),status:'VIGENTE'},{render:false});for(const old of versions.filter(x=>x.status==='VIGENTE'))await saveLocal('criteriaVersions',{...old,status:'HISTORICO',effectiveTo:addDays(v.effectiveFrom,-1)},{render:false});await saveLocal('criteriaRules',{...rule,currentVersionId:v.id,status:'ACTIVO'},{render:false});await audit('criteriaRule',rule.id,'NUEVA VERSIÓN DE CRITERIO',{summary:`${rule.code} · v${versionNumber} · ${criterionBandLabel(v)}`});await loadLocal();f.reset();f.elements.ruleId.value='';$('#criterionFormMode').textContent='Nuevo criterio / nueva regla';toast(`Criterio ${rule.code} v${versionNumber} guardado`)});
$('#clearCriterionBtn')?.addEventListener('click',()=>{const f=$('#criterionForm');f.reset();f.elements.ruleId.value='';$('#criterionFormMode').textContent='Nuevo criterio / nueva regla'});
$('#microorganismMasterForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,o=Object.fromEntries(new FormData(f));const old=state.catalogMicroorganisms.find(x=>x.id===o.id);o.id=old?.id||crypto.randomUUID();o.name=o.name.trim();o.referenceCode=o.referenceCode.trim();o.shortCode=o.shortCode.trim().toUpperCase();o.uses=o.uses.split(',').map(x=>x.trim()).filter(Boolean);o.active=old?.active!==false;if(!o.name){toast('Ingrese el microorganismo');return}if(state.catalogMicroorganisms.some(x=>x.id!==o.id&&o.referenceCode&&x.referenceCode===o.referenceCode)){toast('La referencia ya existe en el catálogo maestro');return}await saveLocal('catalogMicroorganisms',o);await audit('catalogMicroorganism',o.id,old?'MICROORGANISMO MAESTRO ACTUALIZADO':'MICROORGANISMO MAESTRO REGISTRADO',{summary:`${o.name} · ${o.referenceCode||'sin referencia'}`});f.reset();toast('Catálogo maestro de microorganismos actualizado')});


$('#prepMediumSelect').addEventListener('change',()=>{renderBottleOptions();updatePrepCalculated()});
$('#prepBottleSelect').addEventListener('change',updatePrepCalculated);
$('#prepForm [name="date"]').addEventListener('change',()=>{renderBottleOptions();updatePrepCalculated()});
$('#prepForm [name="quantity"]').addEventListener('input',updatePrepCalculated);
$('#prepVolumeSelect').addEventListener('change',updatePrepCalculated);
$('#qcPrepSelect').addEventListener('change',prepareQC);
$('#qcForm').addEventListener('input',updateQCPreview);
$('#releasePrepSelect').addEventListener('change',applyReleaseDefaults);
$('#performanceTaskSelect')?.addEventListener('change',renderPerformanceDetail);
$('#closeLotModal').onclick=()=>{$('#lotModal').classList.remove('open');$('#lotModal').setAttribute('aria-hidden','true')};
$('#lotModal').addEventListener('click',e=>{if(e.target.id==='lotModal')$('#closeLotModal').click()});


$$('.strain-tab').forEach(b=>b.onclick=()=>{$$('.strain-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.strain-tabpane').forEach(x=>x.classList.remove('active'));$(`#strain-tab-${b.dataset.strainTab}`).classList.add('active')});
$('#strainPrepForm')?.addEventListener('input',updateStrainPrepCalculated);
$('#strainPrepForm')?.elements.referenceOpenedDate?.addEventListener('change',()=>{const f=$('#strainPrepForm');if(!f)return;const openDate=f.elements.referenceOpenedDate.value;if(openDate&&(!f.elements.prepDate.value||f.elements.prepDate.value===today()))f.elements.prepDate.value=openDate;renderStrainMediumOptions();renderStrainPlateOptions();updateStrainPrepCalculated()});
$('#strainPrepForm')?.elements.prepDate?.addEventListener('change',()=>{renderStrainMediumOptions();renderStrainPlateOptions();updateStrainPrepCalculated()});
$('#strainPrepStrainSelect')?.addEventListener('change',updateStrainPrepCalculated);
$('#strainPrepMediumSelect')?.addEventListener('change',()=>{renderStrainPlateOptions();updateStrainPrepCalculated()});
$('#strainPrepPlateSelect')?.addEventListener('change',updateStrainPrepCalculated);
$('#reactStrainSelect')?.addEventListener('change',updateReactivationCalculated);
$('#reactMediumSelect')?.addEventListener('change',()=>{renderStrainPlateOptions();updateReactivationCalculated()});
$('#reactPlateSelect')?.addEventListener('change',updateReactivationCalculated);
$('#strainReactForm')?.elements.date?.addEventListener('change',()=>{renderReactivationStrainOptions();renderReactivationMediumOptions();updateReactivationCalculated()});
$('#strainReactForm')?.addEventListener('input',updateReactivationCalculated);
$('#clearStrainCatalogBtn')?.addEventListener('click',()=>$('#strainCatalogForm').reset());

$('#strainCatalogForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,o=Object.fromEntries(new FormData(f));const old=state.catalogStrains.find(x=>x.id===o.id);o.id=o.id||crypto.randomUUID();o.name=o.name.trim();o.referenceCode=o.referenceCode.trim();o.supplierLot=o.supplierLot.trim();o.shortCode=o.shortCode.trim().toUpperCase();o.incubationTemp=Number(o.incubationTemp);o.incubationHours=Number(o.incubationHours);o.cryovialLifeMonths=Number(o.cryovialLifeMonths);if(state.catalogStrains.some(x=>x.id!==o.id&&x.name.toLowerCase()===o.name.toLowerCase()&&x.supplierLot.toLowerCase()===o.supplierLot.toLowerCase())){toast('Esa cepa con ese lote proveedor ya existe');return}await saveLocal('catalogStrains',o);await audit('catalogStrain',o.id,old?'CEPA MAESTRA ACTUALIZADA':'CEPA MAESTRA REGISTRADA',{summary:`${o.name} · ${o.referenceCode} · ${o.supplierLot}`});f.reset();toast('Catálogo de cepas actualizado')});

$('#strainPrepForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,strain=strainById(f.elements.strainId.value),m=state.mediaPrep.find(p=>p.id===f.elements.mediumPrepId.value),date=f.elements.prepDate.value,sourceReferenceLot=productLotForStrain(strain),hasTraceProduct=!!state.productCatalog.find(c=>c.type==='Cepa de referencia'&&c.erpStrainId===strain?.id),anPlate=selectedStrainPlate('STRAIN_PREP'),total=Number(f.elements.reserveCount.value||0)+Number(f.elements.workCount.value||0),final=strainPrepStatusFromForm(),t=strainTurbidityResult(f.elements.bhiBase.value,f.elements.bhiInoculated.value);if(!strain||!m){toast('Seleccione cepa y lote de Agar Nutriente');return}if(hasTraceProduct&&!sourceReferenceLot){toast('La cepa está vinculada a Trazabilidad de Productos, pero no existe un lote comercial APTO, vigente y con stock.');return}if(!anPlate){toast('Seleccione el N.º de caja AN utilizada en la activación/preparación de la cepa');return}const allowedAN=eligibleNutrientAgarPreps(date,'STRAIN_PREP'),restrictedAN=!MediaAvailabilityService.isAvailableOn(m,date);if(!allowedAN.some(x=>x.id===m.id)){toast('El Agar Nutriente debe estar liberado y vigente, o estar en modo controlado de calificación inicial');return}if(strain.referenceExpiry&&validityReferenceDate(date)>strain.referenceExpiry){toast(`La cepa de referencia está vencida para la fecha de referencia ${validityReferenceDate(date)}`);return}if(total<1){toast('Debe preparar al menos un criovial');return}if(!final){toast('Complete observaciones y turbidez');return}const seq=nextStrainWorkSeq(strain.id,date),prepCode=nextStrainPrepId(date),workLot=`TRA-${strain.shortCode||'OTR'}-${date.slice(2,4)}-${String(seq).padStart(3,'0')}-${String(total).padStart(2,'0')}CV`,reserveCount=Number(f.elements.reserveCount.value||0),reserveLot=reserveCount?`RES-${strain.shortCode||'OTR'}-${date.slice(2,4)}-${String(seq).padStart(3,'0')}-${String(reserveCount).padStart(2,'0')}CV`:'';const p=await saveLocal('strainPreparations',{id:crypto.randomUUID(),prepCode,referenceOpenedDate:f.elements.referenceOpenedDate.value,strainId:strain.id,strainName:strain.name,referenceCode:strain.referenceCode,supplierLot:strain.supplierLot,referenceExpiry:strain.referenceExpiry,mediumPrepId:m.id,mediumLotCode:m.lotCode,mediumPrepDate:m.date,mediumExpiry:m.expiryDate,anPlateNumber:anPlate.plateNumber,anPlateCode:anPlate.plateCode,prepDate:date,incubationStart:f.elements.incubationStart.value,incubationHours:strain.incubationHours,incubationEnd:timeAddHours(f.elements.incubationStart.value,strain.incubationHours),incubationTemp:strain.incubationTemp,morphology:f.elements.morphology.value,growth:f.elements.growth.value,purity:f.elements.purity.value,observationResult:strainObservationResult(f.elements.morphology.value,f.elements.growth.value,f.elements.purity.value),reserveCount,workCount:Number(f.elements.workCount.value||0),totalCryovials:total,reserveLot,workLot,cryoprotectant:'Glicerol 20%',cryovialVolumeMl:1,bhiBase:Number(f.elements.bhiBase.value),bhiInoculated:Number(f.elements.bhiInoculated.value),turbidityDelta:t.delta,turbidityCompliance:t.compliance,storageTemp:strain.storageTemp,storageLocation:f.elements.storageLocation.value.trim(),preparedBy:activeUser(),verifiedBy:f.elements.verifiedBy.value,disposition:'Cepa de Trabajo',cryovialExpiry:addMonths(date,strain.cryovialLifeMonths),status:final,usageScope:restrictedAN?'PERFORMANCE_ONLY':'GENERAL',provisionalQualification:restrictedAN,qualificationMediumPrepId:restrictedAN?m.id:'',strainSnapshot:{...strain,capturedAt:nowISO(),catalogRevision:Number(strain.revision||0)},mediumSnapshot:{id:m.id,lotCode:m.lotCode,date:m.date,expiryDate:m.expiryDate,medium:m.medium,capturedAt:nowISO()}});if(sourceReferenceLot){try{await registerIntegratedProductUse(sourceReferenceLot.id,1,'Preparación inicial de cepa',p.prepCode,date,`${strain.name} · ${p.workLot}`);await saveLocal('strainPreparations',{...p,sourceProductLotId:sourceReferenceLot.id,sourceProductLotCode:sourceReferenceLot.internalCode},{render:false})}catch(err){toast(err.message);return}}await saveLocal('microPlateEvents',{id:crypto.randomUUID(),prepId:m.id,plateNumber:anPlate.plateNumber,plateCode:anPlate.plateCode,type:'USO',quantity:1,eventDate:date,eventAt:nowISO(),responsible:activeUser(),usageContext:'ACTIVACION_CEPA',strainPreparationId:p.id,strainPrepCode:p.prepCode},{render:false});await autoCloseExhaustedPlateLot(m.id,date);await audit('mediaPrep',m.id,'CAJA AN UTILIZADA EN ACTIVACIÓN DE CEPA',{summary:`${anPlate.plateCode} · ${p.prepCode} · ${strain.name}`});await audit('strainPreparation',p.id,'PREPARACIÓN DE CEPA REGISTRADA',{summary:`${p.prepCode} · ${strain.name} · ${p.workLot} · ${total} crioviales · ${final}`});if(final==='APTA')await audit('strainPreparation',p.id,restrictedAN?'CRIOVIALES PROVISIONALES PARA CALIFICACIÓN':'CRIOVIALES INGRESADOS A INVENTARIO',{summary:`${total} crioviales · vence ${p.cryovialExpiry}${restrictedAN?' · uso exclusivo prueba de rendimiento':''}`});await loadLocal();resetStrainPrep();toast(final==='APTA'?(restrictedAN?`Preparación ${p.prepCode} apta de forma restringida; ${total} crioviales reservados exclusivamente para completar el rendimiento de ${m.lotCode}.`:`Preparación ${p.prepCode} apta; ${total} crioviales ingresados al inventario.`):`Preparación ${p.prepCode} rechazada; no ingresó al inventario.`)});

$('#strainReactForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,prep=selectedReactPrep(),strain=strainById(f.elements.strainId.value),m=state.mediaPrep.find(p=>p.id===f.elements.mediumPrepId.value),anPlate=selectedStrainPlate('REACTIVATION'),qty=Number(f.elements.quantity.value||0),t=strainTurbidityResult(f.elements.bhiBase.value,f.elements.bhiInoculated.value),result=reactivationResultFromForm(f),initialConcentration=scientificValue(f.elements.initialMantissa.value,f.elements.initialExponent.value),finalConcentration=scientificValue(f.elements.finalMantissa.value,f.elements.finalExponent.value);if(!prep||!strain){toast('No existe una preparación APTA, con crioviales disponibles y vigente para esa fecha');return}if(!anPlate){toast('Seleccione el N.º de caja AN utilizada en la reactivación');return}const reactDate=f.elements.date.value;if(reactDate<prep.prepDate){toast('La fecha de reactivación no puede ser anterior a la preparación de la cepa');return}if(prep.cryovialExpiry&&validityReferenceDate(reactDate)>prep.cryovialExpiry){toast(`No se puede registrar: el lote de crioviales venció el ${prep.cryovialExpiry} para la fecha de referencia ${validityReferenceDate(reactDate)}`);return}const inv=strainInventoryForPrep(prep);if(!Number.isInteger(qty)||qty<1||qty>inv.available){toast(`Cantidad no válida. Disponibles: ${inv.available}`);return}if(!m||!eligibleNutrientAgarPreps(reactDate,'REACTIVATION').some(x=>x.id===m.id)){toast(m?.expiryDate&&reactDate>m.expiryDate?`No se puede registrar: el Agar Nutriente ${m.lotCode} venció el ${m.expiryDate}`:'Seleccione un Agar Nutriente válido para esta reactivación. En modo rendimiento solo se permite el AN que está siendo calificado.');return}if(result==='PENDIENTE DE EVALUACIÓN'||!initialConcentration||!finalConcentration){toast('Complete todos los controles requeridos antes de registrar la reactivación');return}const concentrationDrop=finalConcentration.numeric<initialConcentration.numeric/1000;const notes=[f.elements.notes.value.trim(),concentrationDrop?'ALERTA AUTOMÁTICA: concentración final más de 3 órdenes de magnitud por debajo de la inicial; verificar ensayo.':''].filter(Boolean).join(' | ');const r=await saveLocal('strainReactivations',{id:crypto.randomUUID(),reactivationCode:nextReactivationId(f.elements.date.value),prepId:prep.id,strainId:strain.id,strainName:strain.name,workLot:prep.workLot,date:f.elements.date.value,quantity:qty,mediumPrepId:m.id,mediumLotCode:m.lotCode,mediumExpiry:m.expiryDate,anPlateNumber:anPlate.plateNumber,anPlateCode:anPlate.plateCode,incubationStart:f.elements.incubationStart.value,incubationHours:strain.incubationHours,incubationEnd:timeAddHours(f.elements.incubationStart.value,strain.incubationHours),incubationTemp:strain.incubationTemp,morphology:f.elements.morphology.value,growth:f.elements.growth.value,purity:f.elements.purity.value,result,bhiBase:Number(f.elements.bhiBase.value),bhiInoculated:Number(f.elements.bhiInoculated.value),turbidityDelta:t.delta,turbidityCompliance:t.compliance,initialConcentration,finalConcentration,initialConcentrationDisplay:scientificDisplay(initialConcentration),finalConcentrationDisplay:scientificDisplay(finalConcentration),use:f.elements.use.value,preparedBy:activeUser(),verifiedBy:f.elements.verifiedBy.value,disposal:'Autoclave',qualificationPerformanceTestId:pendingPerformanceContext()?.test?.id||'',qualificationMediumPrepId:pendingPerformanceContext()?.prep?.id||'',notes});await saveLocal('microPlateEvents',{id:crypto.randomUUID(),prepId:m.id,plateNumber:anPlate.plateNumber,plateCode:anPlate.plateCode,type:'USO',quantity:1,eventDate:reactDate,eventAt:nowISO(),responsible:activeUser(),usageContext:'REACTIVACION_CEPA',reactivationId:r.id,reactivationCode:r.reactivationCode,strainId:strain.id},{render:false});await autoCloseExhaustedPlateLot(m.id,reactDate);await audit('mediaPrep',m.id,'CAJA AN UTILIZADA EN REACTIVACIÓN',{summary:`${anPlate.plateCode} · ${r.reactivationCode} · ${strain.name}`});await audit('strainPreparation',prep.id,'CRIOVIAL CONSUMIDO EN REACTIVACIÓN',{reactivationId:r.id,summary:`${qty} criovial(es) · ${r.reactivationCode} · ${r.use} · ${result}`});await loadLocal();await autoLinkPendingPerformanceReactivation(r);resetReactivation();toast(`${r.reactivationCode} registrada. Inventario descontado automáticamente.`)});

$('#prepForm').addEventListener('submit',async e=>{e.preventDefault();if(!activeUser()){toast('Seleccione un usuario activo');return}const v=prepCalc(),b=bottleById(e.currentTarget.elements.bottleId.value);if(!v.date){toast('Ingrese la fecha de preparación');return}if(!v.m||!b){toast('Seleccione medio y frasco/lote');return}if(!v.vol||v.vol<100||v.vol>1500){toast('Seleccione un volumen válido');return}if(!Number.isInteger(v.qty)||v.qty<1){toast('Ingrese una cantidad preparada válida');return}if(!bottleMatchesMedium(b,v.m.name)){toast('El frasco no corresponde al medio seleccionado');return}if((b.operationalStatus||'ACTIVO')!=='ACTIVO'){toast('Ese frasco/lote está dado de baja');return}if(!b.expiryDate){toast('El frasco/lote no tiene registrada la fecha de vencimiento del fabricante');return}if(bottleExpiredOn(b,v.date)){toast(`No se puede preparar: el frasco ${b.code} venció el ${b.expiryDate}`);return}if(!bottleSelectable(b,v.date)){toast(b.qualificationStatus==='PENDIENTE_RENDIMIENTO'?'Complete primero el rendimiento del frasco abierto':'Ese frasco no está disponible para preparación');return}if(!v.lotCode){toast('Complete volumen y cantidad');return}if(state.mediaPrep.some(p=>p.lotCode===v.lotCode)){toast('Código de lote duplicado');return}if(b.productLotId){const srcLot=productLotById(b.productLotId);if(!productIntegrationEligibleLot(srcLot)){toast('El lote de trazabilidad ya no está APTO, vigente o con stock');return}if(Number(v.mass||0)>productAvailable(srcLot)){toast(`Stock insuficiente del medio deshidratado. Requiere ${v.mass} g y hay ${productAvailable(srcLot)} g disponibles.`);return}}const id=crypto.randomUUID(),performanceRequired=!isANMedium(v.m?.name)&&b.qualificationStatus!=='CALIFICADO'&&b.qualificationStatus!=='NO_APLICA';const p=await saveLocal('mediaPrep',{id,internalCode:nextInternalCode(v.date),lotCode:v.lotCode,date:v.date,year:v.date.slice(0,4),lotNumber:v.lotNumber,type:v.m.type,medium:v.m.name,prefix:v.m.prefix,quantity:v.qty,unit:v.m.type==='Agar'?'Caja Petri':'Frasco',volumeMl:v.vol,concentration:v.m.concentration,theoreticalMass:v.mass,sterilityDueDate:v.date,macroscopicDueDate:addDays(v.date,systemConfig().macroscopicDays),expiryDate:addDays(v.date,v.m.shelfLifeDays),responsible:activeUser(),bottleId:b.id,bottleCode:b.code,bottleSnapshot:{id:b.id,code:b.code,mediumFamily:b.mediumFamily||b.medium,qualificationStatus:b.qualificationStatus||'NUEVO',expiryDate:b.expiryDate||''},criteriaSnapshot:{mediumId:v.m.id||'',mediumName:v.m.name,type:v.m.type,technicalClass:mediumTechnicalClass(v.m),prefix:v.m.prefix,concentration:Number(v.m.concentration),shelfLifeDays:Number(v.m.shelfLifeDays),phMin:Number(v.m.phMin),phMax:Number(v.m.phMax),expectedColor:v.m.expectedColor||'',expectedAppearance:v.m.expectedAppearance||'',capturedAt:nowISO(),catalogRevision:Number(v.m.revision||0),schemaVersion:SCHEMA_VERSION},performanceRequired,status:'PREPARADO'});if(b.productLotId){try{await registerIntegratedProductUse(b.productLotId,v.mass,'Preparación de medio',p.lotCode,v.date,`${p.medium} · ${p.volumeMl} mL`);p.sourceProductLotId=b.productLotId;p.sourceProductLotCode=productLotById(b.productLotId)?.internalCode||'';await saveLocal('mediaPrep',{...p,sourceProductLotId:b.productLotId,sourceProductLotCode:p.sourceProductLotCode},{render:false})}catch(err){toast(err.message);return}}await audit('mediaPrep',p.id,'PREPARACIÓN REGISTRADA',{summary:`${p.lotCode} · ${p.medium} · frasco ${b.code}${p.type==='Agar'?` · ${p.quantity} cajas Petri generadas (Caja 001${Number(p.quantity)>1?`–${String(p.quantity).padStart(3,'0')}`:''})`:''}`});if((b.qualificationStatus||'NUEVO')==='NUEVO'&&!bottleHasQualificationPrep(b)){const anNoPerformance=isANMedium(v.m?.name);const opened=await saveLocal('catalogBottles',{...b,openedAt:b.openedAt||v.date,qualificationStatus:anNoPerformance?'NO_APLICA':'PENDIENTE_RENDIMIENTO',qualificationPrepId:p.id,qualificationPrepLotCode:p.lotCode},{render:false});await audit('catalogBottle',opened.id,anNoPerformance?'FRASCO ABIERTO · RENDIMIENTO NO APLICA':'FRASCO ABIERTO · RENDIMIENTO PENDIENTE',{prepId:p.id,summary:anNoPerformance?`${opened.code} · AN excluido de prueba de rendimiento · primera preparación ${p.lotCode}`:`${opened.code} · primera preparación ${p.lotCode}`})}if(performanceRequired)await createPerformanceTaskForPrep(p);await loadLocal();resetPrep();toast(`Preparación ${p.lotCode} registrada.${p.type==='Agar'?` Inventario inicial: ${p.quantity} caja(s) Petri.`:''} ${performanceRequired?'Prueba de rendimiento creada automáticamente.':''}`)});

$('#qcForm').addEventListener('submit',async e=>{e.preventDefault();const prep=state.mediaPrep.find(p=>p.id===e.currentTarget.elements.prepId.value);if(!prep){toast('Seleccione un lote');return}if(latestQC(prep.id)){toast('Ese lote ya tiene QC');return}if(!mediaTransitionGuard(prep,'QC')){toast(`Flujo inválido: el lote está ${prep.status||'PREPARADO'} y no puede pasar a QC`);return}const result=qcResultFromForm();if(!result){toast('Complete todos los controles de calidad del medio');return}const m=prep.criteriaSnapshot||mediumByName(prep.medium),required=performanceRequiredForPrep(prep),tests=performanceTestsForPrep(prep),f=e.currentTarget;const q=await saveLocal('mediaQC',{id:crypto.randomUUID(),prepId:prep.id,noTurbidity:f.elements.noTurbidity.value,noMicroorganism:f.elements.noMicroorganism.value,sterility:f.elements.sterility.value,macroscopic:f.elements.macroscopic.value,ph:Number(f.elements.ph.value),phMin:m?.phMin,phMax:m?.phMax,productivity:'N/A',selectivity:'N/A',specificity:'N/A',performanceRequired:required,performanceTaskId:performanceTaskForPrep(prep.id)?.id||'',performanceTests:tests,technicalClass:mediumTechnicalClass(m),result,responsible:activeUser(),notes:f.elements.notes.value.trim()});await saveLocal('mediaPrep',{...prep,status:'QC'},{render:false});await audit('mediaPrep',prep.id,'QC REGISTRADO',{summary:`Resultado ${result} · ${activeUser()} · rendimiento ${required?performanceTaskStatus(performanceTaskForPrep(prep.id)):'NO APLICA'}`,qcId:q.id});if(prep.sourceProductLotId)await productTrace(prep.sourceProductLotId,'QC DEL MEDIO PREPARADO',`${prep.lotCode} · resultado ${result}`);await loadLocal();resetQC();toast(`QC guardado: ${result}${required&&!performanceResolvedForPrep(prep)?' · rendimiento aún pendiente':''}`)});

$('#releaseForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,p=state.mediaPrep.find(x=>x.id===f.elements.prepId.value),q=latestQC(f.elements.prepId.value);if(!p||!q||q.result!=='APTO'){toast('Seleccione un lote con QC APTO');return}if(!performanceResolvedForPrep(p)){toast('La prueba de rendimiento debe estar APTO antes de liberar el lote');return}if(!mediaTransitionGuard(p,'LIBERADO')&&!mediaTransitionGuard(p,'BLOQUEADO')){toast(`Flujo inválido: el lote está ${p.status||'—'} y no puede liberarse`);return}const decision=f.elements.decision.value;if(!decision){toast('Seleccione la decisión');return}const r=await saveLocal('mediaRelease',{id:crypto.randomUUID(),prepId:p.id,qcId:q.id,decision,date:p.date,responsible:activeUser()});await saveLocal('mediaPrep',{...p,status:decision==='LIBERADO'?'LIBERADO':'BLOQUEADO'},{render:false});await audit('mediaPrep',p.id,decision==='LIBERADO'?'LOTE LIBERADO':'LOTE BLOQUEADO',{summary:`Decisión ${decision}`,releaseId:r.id});if(p.sourceProductLotId)await productTrace(p.sourceProductLotId,'LIBERACIÓN DEL MEDIO PREPARADO',`${p.lotCode} · ${decision}`);await loadLocal();f.reset();renderSelects();applyReleaseDefaults();toast(`Decisión guardada: ${decision}`)});

$('#closureForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,p=state.mediaPrep.find(x=>x.id===f.elements.prepId.value),type=f.elements.closureType.value,reason=f.elements.closureReason.value.trim();if(!p){toast('Seleccione un lote');return}if(!mediaTransitionGuard(p,'CERRADO')){toast(`El lote debe estar LIBERADO o BLOQUEADO antes de cerrarse. Estado actual: ${p.status||'—'}`);return}if(!type){toast('Seleccione el motivo real de cierre');return}if(type==='OTRO'&&!reason){toast('Describa el otro motivo');return}const closedAt=nowISO();await saveLocal('mediaPrep',{...p,status:'CERRADO',closureType:type,closureReason:reason,closureDate:closedAt.slice(0,10),closureAt:closedAt,closureResponsible:activeUser()},{render:false});await audit('mediaPrep',p.id,'LOTE CERRADO',{summary:`${closureLabel(type)}${reason?' · '+reason:''}`});await loadLocal();f.reset();toast('Cierre registrado con fecha, hora y responsable automáticos')});

$('#mediaCatalogForm').addEventListener('submit',async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.currentTarget));o.id=o.id||crypto.randomUUID();o.technicalClass=String(o.technicalClass||'SIN_CLASIFICAR').toUpperCase();o.concentration=Number(o.concentration);o.shelfLifeDays=Number(o.shelfLifeDays);o.phMin=Number(o.phMin);o.phMax=Number(o.phMax);const existing=state.catalogMedia.find(m=>m.id===o.id)||DEFAULT_MEDIA.find(m=>m.name===o.name),base=existing?.performanceProfile||{};o.performanceProfile={productivity:{...(base.productivity||{}),strainId:o.performanceProductivityStrain||''},selectivity:{...(base.selectivity||{}),strainId:o.performanceSelectivityStrain||''},specificity:{...(base.specificity||{}),strainId:o.performanceSpecificityStrain||''}};delete o.performanceProductivityStrain;delete o.performanceSelectivityStrain;delete o.performanceSpecificityStrain;await saveLocal('catalogMedia',o);e.currentTarget.reset();toast('Medio guardado')});
$('#clearMediaCatalogBtn').onclick=()=>$('#mediaCatalogForm').reset();
$('#bottleCatalogForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const old=state.catalogBottles.find(b=>b.id===f.elements.id.value);const used=!!(old&&state.mediaPrep.some(p=>p.bottleId===old.id));const raw=Object.fromEntries(new FormData(f));const o=used?{...old,expiryDate:raw.expiryDate}:{...raw};o.code=(o.code||'').trim();const selectedFamily=used?bottleFamilyForMedium(old.mediumFamily||old.medium):bottleFamilyForMedium(o.medium);if(!selectedFamily){toast('Seleccione el medio del frasco');return}if(!o.expiryDate){toast('Ingrese la fecha de vencimiento del medio deshidratado indicada por el fabricante');return}const dup=state.catalogBottles.some(b=>b.code.trim().toLowerCase()===o.code.toLowerCase()&&b.id!==o.id);if(dup){toast('Ese código/lote de frasco ya existe');return}o.id=old?.id||crypto.randomUUID();o.mediumFamily=selectedFamily;o.medium=selectedFamily==='A1'?'A-1 medium':selectedFamily;o.qualificationStatus=old?.qualificationStatus||'NUEVO';o.openedAt=old?.openedAt||'';o.qualifiedAt=old?.qualifiedAt||'';o.qualifiedByLotId=old?.qualifiedByLotId||'';o.qualifiedByLotCode=old?.qualifiedByLotCode||'';o.operationalStatus=old?.operationalStatus||'ACTIVO';o.retiredAt=old?.retiredAt||'';o.retiredReason=old?.retiredReason||'';o.retiredBy=old?.retiredBy||'';await saveLocal('catalogBottles',o);await audit('catalogBottle',o.id,old?'FRASCO CORREGIDO':'FRASCO REGISTRADO',{summary:`${o.code} · ${bottleFamilyLabel(o.mediumFamily)} · vence fabricante ${o.expiryDate} · ${o.qualificationStatus}`});f.reset();f.elements.id.value='';f.elements.medium.disabled=false;f.elements.code.readOnly=false;$('#bottleFormMode').textContent='Nuevo frasco/lote';toast(old?'Frasco corregido':'Nuevo frasco registrado')});
$('#clearBottleCatalogBtn').onclick=()=>{const f=$('#bottleCatalogForm');f.reset();f.elements.id.value='';f.elements.medium.disabled=false;f.elements.code.readOnly=false;$('#bottleFormMode').textContent='Nuevo frasco/lote'};
$('#personCatalogForm').addEventListener('submit',async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.currentTarget));o.id=o.id||crypto.randomUUID();await saveLocal('catalogPersonnel',o);e.currentTarget.reset();toast('Personal guardado')});
$('#systemConfigForm').addEventListener('submit',async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.currentTarget));const old=systemConfig();await saveLocal('systemConfig',{...old,id:'media-control',sterilityDays:0,macroscopicDays:Number(o.macroscopicDays),performanceDays:Number(o.performanceDays),alertDays:Number(o.alertDays)});await audit('systemConfig','media-control','PARÁMETROS ACTUALIZADOS',{summary:'Motor de vigencia: fecha del documento para operación; fecha actual para consulta'});toast('Parámetros guardados')});


$('#monitoringPointForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,o=Object.fromEntries(new FormData(f));const old=state.catalogMonitoringPoints.find(x=>x.id===o.id);o.id=old?.id||o.id||crypto.randomUUID();o.code=(o.code||'').trim().toUpperCase();o.name=(o.name||'').trim();o.frequencyDays=Number(o.frequencyDays||0);if(![7,15,30].includes(o.frequencyDays)){toast('La frecuencia solo puede ser de 7, 15 o 30 días');return}o.frequency=monitoringFrequencyLabel(o.frequencyDays);o.exposureMinutes=Number(o.exposureMinutes||0);o.plateDiameterMm=Number(o.plateDiameterMm||0);o.swabAreaCm2=Number(o.swabAreaCm2||0);o.limitTarget=Number(o.limitTarget||0);o.limitMax=Number(o.limitMax||0);o.active=old?.active!==false;if(!o.code||!o.name||!o.type||!o.frequencyDays||!o.medium||!o.microorganism||!o.method){toast('Complete los campos obligatorios del punto');return}if(state.catalogMonitoringPoints.some(x=>x.id!==o.id&&(x.code===o.code||(x.name.toLowerCase()===o.name.toLowerCase()&&x.type===o.type)))){toast('Ya existe un punto con ese código o combinación área/tipo');return}await saveLocal('catalogMonitoringPoints',o);await audit('catalogMonitoringPoint',o.id,old?'PUNTO DE MONITOREO ACTUALIZADO':'PUNTO DE MONITOREO REGISTRADO',{summary:`${o.code} · ${o.name} · ${o.type} · ${o.frequency}`});f.reset();f.elements.id.value='';toast(old?'Punto actualizado':'Punto registrado')});
$('#clearMonitoringPointBtn')?.addEventListener('click',()=>{const f=$('#monitoringPointForm');f.reset();f.elements.id.value=''});

$$('.nav').forEach(b=>b.onclick=()=>{
if(!canAccessView(b.dataset.view)){toast('Este usuario no tiene acceso a este módulo.');return}
$$('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.view').forEach(x=>x.classList.remove('active'));$(`#view-${b.dataset.view}`).classList.add('active');applyReadOnlyToView(b.dataset.view)});
$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.tabpane').forEach(x=>x.classList.remove('active'));$(`#tab-${b.dataset.tab}`).classList.add('active')});

async function updateOutbox(){const rows=await idbAll('outbox');$('#outboxCount').textContent=rows.length}
function setSyncStatus(mode,text){const b=$('#syncBadge');b.className=`badge ${mode}`;b.textContent=text}

const PRODUCTION_FIREBASE_CONFIG=Object.freeze({
  apiKey:"AIzaSyA7vTtwpvrpswgN4WX6Dy-oqDA0zYCdrL8",
  authDomain:"laboratorio-kardex.firebaseapp.com",
  projectId:"laboratorio-kardex",
  storageBucket:"laboratorio-kardex.firebasestorage.app",
  messagingSenderId:"975014282931",
  appId:"1:975014282931:web:c553bae0a23be87c5892c6"
});
function bootstrapProductionFirebaseConfig(){
  let current=null;
  try{current=JSON.parse(localStorage.getItem('microbio_firebase_config')||'null')}catch{}
  if(!current?.apiKey||!current?.authDomain||!current?.projectId||!current?.appId){
    localStorage.setItem('microbio_firebase_config',JSON.stringify(PRODUCTION_FIREBASE_CONFIG));
    return PRODUCTION_FIREBASE_CONFIG;
  }
  return current;
}
function getFirebaseConfig(){try{return JSON.parse(localStorage.getItem('microbio_firebase_config')||'null')||PRODUCTION_FIREBASE_CONFIG}catch{return PRODUCTION_FIREBASE_CONFIG}}

function applyFirebaseConfigAccess(){
  const form=document.getElementById('firebaseForm');if(!form)return;
  const canEdit=isAdminUser();
  form.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=!canEdit});
  const on=document.getElementById('enableCloudBtn'),off=document.getElementById('disableCloudBtn');
  if(on)on.disabled=!canEdit;
  if(off)off.disabled=!canEdit;
  const hint=document.getElementById('cloudModeHint');
  if(hint&&!canEdit)hint.textContent='Configuración Firebase protegida: solo el Administrador puede modificarla.';
}
function fillFirebaseForm(){const c=getFirebaseConfig();if(!c)return;for(const [k,v] of Object.entries(c)){const el=$(`#firebaseForm [name="${k}"]`);if(el)el.value=v||''}}
$('#firebaseForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  if(!isAdminUser()){toast('Solo el Administrador puede cambiar Firebase.');return}
  const fd=new FormData(e.currentTarget);
  const cfg={
    apiKey:String(fd.get('apiKey')||'').trim(),
    authDomain:String(fd.get('authDomain')||'').trim(),
    projectId:String(fd.get('projectId')||'').trim(),
    storageBucket:String(fd.get('storageBucket')||'').trim(),
    messagingSenderId:String(fd.get('messagingSenderId')||'').trim(),
    appId:String(fd.get('appId')||'').trim()
  };
  if(!cfg.apiKey||!cfg.authDomain||!cfg.projectId||!cfg.appId){toast('Complete API key, Auth domain, Project ID y App ID.');return}
  localStorage.setItem('microbio_firebase_config',JSON.stringify(cfg));
  fillFirebaseForm();applyFirebaseConfigAccess();
  toast('Configuración Firebase guardada.');initFirebaseAuthOnly();
});
if($('#disconnectBtn'))$('#disconnectBtn').onclick=()=>toast('El ERP ya está operando solo en local.');

const BOOTSTRAP_OPERATIONAL_DOMAINS=Object.freeze([
  'mediaPrep','mediaQC','mediaRelease','performanceTasks','performanceTests','performanceLinks',
  'strainPreparations','strainReactivations','strainCryovialEvents',
  'microbiologicalControls','microPlateEvents','microActions','monitoringFrequencyDecisions',
  'coliformQCControls','coliformQCActions',
  'sampleIntakes','sampleAnalyses','duplicateEvaluations',
  'productLots','productUsage','productClosures','productTrace',
  'equipmentControls','equipmentCleaning','equipmentTrace',
  'environmentalConditions','environmentTrace',
  'refrigeratorReadings','refrigeratorTrace','refrigerator2Readings','refrigerator2Trace',
  'incubatorReadings','incubatorVerifications','incubatorTrace',
  'waterBathReadings','waterBathVerifications','waterBathTrace',
  'phMeterReadings','phMeterAccuracy','phMeterTrace'
]);
async function localOperationalRecordCount(){
  const rows=await idbAll('records');
  return rows.filter(r=>!r.deleted&&BOOTSTRAP_OPERATIONAL_DOMAINS.includes(r.domain)).length;
}
function bootstrapStatus(text,mode=''){
  const el=document.getElementById('bootstrapStatus');if(el){el.textContent=text;el.dataset.mode=mode}
}
async function writeBootstrapRemoteRecord(domain,data){
  if(!data?.id)return 0;
  const key=`${domain}:${data.id}`;
  const all=await idbAll('records');
  const current=all.find(x=>x.key===key)?.data;
  if(current&&(Number(current.updatedAtMs||0)>Number(data.updatedAtMs||0)))return 0;
  await idbPut('records',{key,domain,data,deleted:!!data.deleted});
  return 1;
}
async function bootstrapNewPcFromCloud(fsMod,fs){
  const localCount=await localOperationalRecordCount();
  if(localCount>0){
    bootstrapStatus(`Bootstrap omitido: esta computadora ya tiene ${localCount} registro(s) operativos locales.`,'SKIPPED');
    return {bootstrapped:false,reason:'LOCAL_DATA_EXISTS',received:0};
  }

  bootstrapStatus('Bootstrap: buscando información existente en Firebase…','RUNNING');
  let received=0,cloudDocs=0;

  for(const domain of DOMAINS){
    const ref=fsMod.collection(fs,'workspaces',WORKSPACE_ID,CLOUD_COLLECTIONS[domain]);
    const snap=await fsMod.getDocs(ref);
    cloudDocs+=snap.size;
    for(const doc of snap.docs){
      const data=doc.data();
      received+=await writeBootstrapRemoteRecord(domain,data);
    }
  }

  if(cloudDocs===0){
    bootstrapStatus('Bootstrap: Firebase no contiene datos todavía. Esta PC continúa con su base local inicial.','EMPTY');
    return {bootstrapped:false,reason:'CLOUD_EMPTY',received:0};
  }

  await loadLocal();
  renderAll();
  localStorage.setItem('microbio_bootstrap_completed_at',nowISO());
  localStorage.setItem('microbio_bootstrap_device',deviceId);
  bootstrapStatus(`Bootstrap completado: ${received} registro(s) recibidos desde Firebase.`,'DONE');
  await idbPut('syncMeta',{key:`bootstrap:${deviceId}`,deviceId,received,cloudDocs,completedAt:nowISO(),version:VERSION});
  return {bootstrapped:true,reason:'OK',received};
}
async function startCloudListeners(fsMod,fs){
  for(const domain of DOMAINS){
    const ref=fsMod.collection(fs,'workspaces',WORKSPACE_ID,CLOUD_COLLECTIONS[domain]);
    const unsub=fsMod.onSnapshot(ref,snap=>snap.docChanges().forEach(ch=>{
      if(ch.type!=='removed')saveRemote(domain,ch.doc.data());
    }),err=>{
      if($('#firebaseStatus'))$('#firebaseStatus').textContent='Listener: '+err.message;
    });
    state.listeners.push(unsub);
  }
}

function firebaseAuthStatus(text,mode=''){
  const el=document.getElementById('firebaseAuthStatus');if(el){el.textContent=text;el.dataset.mode=mode}
}
function updateFirebaseAuthForm(){
  const userEl=document.getElementById('firebaseAuthErpUser');
  const emailEl=document.getElementById('firebaseAuthEmail');
  const fbUser=state.auth?.currentUser;
  if(userEl)userEl.value=activeUser()||'';
  if(emailEl)emailEl.value=fbUser?.email||'';
  if(fbUser){
    firebaseAuthStatus(`Firebase Auth: ${fbUser.email||fbUser.uid} · UID ${fbUser.uid}`,'SIGNED_IN');
  }else{
    firebaseAuthStatus('Firebase Auth: sin sesión.','SIGNED_OUT');
  }
}
async function firebaseSignOut({silent=false}={}){
  if(state.auth&&state.authMod)await state.authMod.signOut(state.auth);
  state.connected=false;
  state.listeners?.forEach(fn=>{try{fn()}catch{}});
  state.listeners=[];
  setSyncStatus('offline','LOCAL');
  updateFirebaseAuthForm();
  if(!silent)toast('Sesión Firebase cerrada.');
}
async function ensureFirebaseAuthMatchesActiveUser(){
  if(!state.auth)return false;
  const current=state.auth.currentUser,mapped=firebaseEmailForUser(activeUser()).toLowerCase();
  if(!current)return false;
  if(mapped&&String(current.email||'').toLowerCase()!==mapped){
    await firebaseSignOut({silent:true});
    firebaseAuthStatus(`Firebase Auth: el usuario ERP ${activeUser()} requiere su propia cuenta.`,'MISMATCH');
    return false;
  }
  return true;
}

async function initFirebaseAuthOnly(){
  const cfg=getFirebaseConfig();
  if(!cfg?.apiKey||!cfg?.projectId||!cfg?.appId){
    toast('Primero complete y guarde la configuración de Firebase.');
    return false;
  }
  if(state.auth&&state.authMod){
    updateFirebaseAuthForm();
    updateSyncActivationAvailability();
    return true;
  }
  try{
    firebaseAuthStatus('Firebase Auth: inicializando…','INIT');
    const appMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
    const fbApp=appMod.getApps().length?appMod.getApp():appMod.initializeApp(cfg);
    const auth=authMod.getAuth(fbApp);
    await authMod.setPersistence(auth,authMod.browserLocalPersistence);
    state.authMod=authMod;
    state.auth=auth;
    if(state.authUnsub)try{state.authUnsub()}catch{}
    state.authUnsub=authMod.onAuthStateChanged(auth,async user=>{
      updateFirebaseAuthForm();
      if(user){
        const identity=await resolveErpIdentityFromCloud(user);
        if(identity){
          applyCloudIdentity(identity);
          renderActiveUser();
          applyAccessControl();
          hideSecureLogin();
          resetSessionInactivityTimer();
          firebaseAuthStatus(`Firebase Auth: ${user.email||user.uid} · ${identity.code}`,'SIGNED_IN');
          markAuthenticatedState();
          await ensureUnifiedCloudSession();
        }else{
          await authMod.signOut(auth);
          state.connected=false;
          setSyncStatus('offline','LOCAL');
          showSecureLogin('Cuenta Firebase sin perfil ERP autorizado en el directorio cloud.');
        }
      }else{
        state.connected=false;
        state.listeners?.forEach(fn=>{try{fn()}catch{}});
        state.listeners=[];
        setSyncStatus('offline','LOCAL');
        firebaseAuthStatus('Firebase Auth: sin sesión.','SIGNED_OUT');
        showSecureLogin('Ingrese sus credenciales.');
      }
      updateSyncActivationAvailability();
    });
    updateFirebaseAuthForm();
    updateSyncActivationAvailability();
    return true;
  }catch(err){
    firebaseAuthStatus('Firebase Auth: no disponible · '+String(err?.message||err),'ERROR');
    toast('No se pudo inicializar Firebase Authentication.');
    return false;
  }
}
function updateSyncActivationAvailability(){
  const btn=document.getElementById('enableCloudBtn');
  if(!btn)return;
  const canEdit=isAdminUser();
  const signed=!!state.auth?.currentUser;
  btn.disabled=!(canEdit&&signed);
  btn.title=signed?'Reconectar sincronización Multi-PC':'La sesión principal debe estar autenticada';
}
async function firebaseSignInForActiveUser(){
  if(!(await initFirebaseAuthOnly()))return;
  const email=String(document.getElementById('firebaseAuthEmail')?.value||'').trim().toLowerCase();
  const password=String(document.getElementById('firebaseAuthPassword')?.value||'');
  if(!email||!password){toast('Ingrese correo y contraseña Firebase.');return}
  const mapped=firebaseEmailForUser(activeUser()).toLowerCase();
  if(mapped&&mapped!==email){toast(`El correo configurado para ${activeUser()} es ${mapped}.`);return}
  try{
    firebaseAuthStatus('Firebase Auth: autenticando…','SIGNING_IN');
    const cred=await state.authMod.signInWithEmailAndPassword(state.auth,email,password);
    saveFirebaseEmailForUser(activeUser(),email);
    const pwd=document.getElementById('firebaseAuthPassword');
    if(pwd)pwd.value='';
    firebaseAuthStatus(`Firebase Auth: ${cred.user.email} · autenticado.`,'SIGNED_IN');
    updateSyncActivationAvailability();
    toast('Sesión Firebase iniciada correctamente.');
  }catch(err){
    firebaseAuthStatus('Firebase Auth: error · '+String(err?.message||err),'ERROR');
    updateSyncActivationAvailability();
    toast('No se pudo iniciar sesión Firebase.');
  }
}
async function startAuthenticatedCloudSession(){
  if(!CLOUD_SYNC_ENABLED||!state.auth?.currentUser||!state.firestore||!state.firebase)return;
  if(!(await ensureFirebaseAuthMatchesActiveUser()))return;
  state.connected=true;
  if($('#firebaseStatus'))$('#firebaseStatus').textContent=`Autenticado como ${state.auth.currentUser.email}. Preparando sincronización segura…`;
  await bootstrapNewPcFromCloud(state.firebase,state.firestore);
  await startCloudListeners(state.firebase,state.firestore);
  if(cloudWriteAllowed())await flushOutbox();
  setSyncStatus('online',cloudReadOnlyClient()?'FIREBASE · LECTURA':'FIREBASE');
  if($('#firebaseStatus'))$('#firebaseStatus').textContent=`Firebase seguro activo · ${state.auth.currentUser.email}.`;
}
function bindFirebaseAuthControls(){updateFirebaseAuthForm();}
async function connectFirebase(config){
  if(!config?.apiKey||!config?.projectId||!config?.appId){
    state.connected=false;
    setSyncStatus('offline','LOCAL');
    if($('#firebaseStatus'))$('#firebaseStatus').textContent='Configuración Firebase incompleta.';
    return;
  }
  try{
    if(!state.auth?.currentUser){
      state.connected=false;
      setSyncStatus('offline','LOCAL');
      if($('#firebaseStatus'))$('#firebaseStatus').textContent='Sesión principal no autenticada.';
      return;
    }

    setSyncStatus('syncing','SINCRONIZANDO');

    const appMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const fsMod=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');

    // IMPORTANTE: reutiliza la app creada por Authentication; no crea un segundo estado Firebase.
    const fbApp=appMod.getApps().length?appMod.getApp():appMod.initializeApp(config);
    const fs=fsMod.getFirestore(fbApp);

    state.firebase=fsMod;
    state.firestore=fs;

    // Evita listeners duplicados al reconectar.
    state.listeners?.forEach(fn=>{try{fn()}catch{}});
    state.listeners=[];

    await bootstrapNewPcFromCloud(fsMod,fs);
    await startCloudListeners(fsMod,fs);

    state.connected=true;
    if(cloudWriteAllowed())await flushOutbox();

    updateFirebaseAuthForm();
    setSyncStatus('online',cloudReadOnlyClient()?'FIREBASE · LECTURA':'FIREBASE');
    if($('#firebaseStatus'))$('#firebaseStatus').textContent=`Firebase seguro activo · ${state.auth.currentUser.email}.`;
    updateSyncActivationAvailability();
  }catch(err){
    state.connected=false;
    setSyncStatus('offline','AUTH');
    if($('#firebaseStatus'))$('#firebaseStatus').textContent='Error de conexión Firebase: '+String(err?.message||err);
  }
}
async function flushOutbox(){if(!CLOUD_SYNC_ENABLED||!state.connected||!cloudWriteAllowed())return;const rows=await idbAll('outbox');if(!rows.length){updateOutbox();return}setSyncStatus('syncing','SINCRONIZANDO');for(const row of rows){try{const ref=state.firebase.doc(state.firestore,'workspaces',WORKSPACE_ID,CLOUD_COLLECTIONS[row.domain],row.entityId);await state.firebase.setDoc(ref,row.payload,{merge:true});await idbPut('syncMeta',{key:`ack:${row.opId}`,opId:row.opId,entityId:row.entityId,domain:row.domain,ackedAt:nowISO()});await idbDelete('outbox',row.key)}catch(err){row.attempts=Number(row.attempts||0)+1;row.lastAttemptAt=nowISO();row.lastError=String(err?.message||err);await idbPut('outbox',row);console.error('Sync pendiente',row.key,err)}}await updateOutbox();setSyncStatus('online','FIREBASE')}
window.addEventListener('online',()=>{if(CLOUD_SYNC_ENABLED&&state.connected&&cloudWriteAllowed())flushOutbox()});

async function migrateANPerformanceExclusion(){
  let changed=0;
  for(const p of state.mediaPrep.filter(x=>isANMedium(x.medium))){
    if(p.performanceRequired!==false){await saveLocal('mediaPrep',{...p,performanceRequired:false},{render:false});changed++}
  }
  for(const b of state.catalogBottles.filter(x=>isANMedium(x.mediumFamily||x.medium))){
    if(['PENDIENTE_RENDIMIENTO','NUEVO'].includes(String(b.qualificationStatus||'NUEVO'))&&b.openedAt){
      await saveLocal('catalogBottles',{...b,qualificationStatus:'NO_APLICA',qualificationTaskId:'',qualificationTests:[]},{render:false});changed++
    }
  }
  if(changed)await audit('systemConfig','an-performance-exclusion','AN EXCLUIDO DE PRUEBA DE RENDIMIENTO',{summary:`${changed} registro(s) ajustado(s). Los demás medios conservan sus reglas de rendimiento.`});
  return changed;
}


$('#coliformQCForm')?.addEventListener('input',e=>{if(e.target?.name==='actualDate'&&e.currentTarget.dataset.mode==='HISTORICAL')refreshQCHistoricalEntry();else if(['start35','end35','start44'].includes(e.target?.name))qcCascadeTimesFrom(e.target.name);else updateQCExecutionPreview()});
$('#coliformQCForm')?.addEventListener('change',e=>{if(e.currentTarget.dataset.mode==='HISTORICAL'&&(e.target?.name==='actualDate'||e.target?.name==='historicalType'))refreshQCHistoricalEntry();else if(['q3MediumA1','q3MediumLMX'].includes(e.target?.name)){qcApplyQ3MediumSelection();updateQCExecutionPreview()}else if(['start35','end35','start44'].includes(e.target?.name))qcCascadeTimesFrom(e.target.name);else updateQCExecutionPreview()});
$('#coliformQCSaveBtn')?.addEventListener('click',saveColiformQC);


function bindAccessControl(){
  const form=document.getElementById('accessUserForm');if(!form)return;
  document.getElementById('accessUserSelect')?.addEventListener('change',loadAccessEditor);
  document.getElementById('accessRoleSelect')?.addEventListener('change',restoreRoleTemplateInEditor);
  document.getElementById('accessResetBtn')?.addEventListener('click',restoreRoleTemplateInEditor);
  form.addEventListener('submit',e=>{
    e.preventDefault();
    if(!isAdminUser()){toast('Solo el Administrador puede modificar permisos.');return}
    const code=document.getElementById('accessUserSelect').value;
    if(String(code).toUpperCase()==='JJF'){toast('JJF permanece como Administrador con acceso total.');return}
    const role=document.getElementById('accessRoleSelect').value;
    const permissions={};
    document.querySelectorAll('#accessPermissionRows select[data-access-view]').forEach(s=>permissions[s.dataset.accessView]=s.value);
    const oldEmail=firebaseEmailForUser(code);
    const result=saveAccessProfile(code,role,permissions);
    const newEmail=String(document.getElementById('accessFirebaseEmail')?.value||'').trim().toLowerCase();
    saveFirebaseEmailForUser(code,newEmail);
    centralAuditEvent({
      action:'PERMISSIONS_CHANGE',
      module:'Administración',
      domain:'accessProfile',
      entityId:code,
      recordLabel:code,
      before:{role:result?.before?.role||'',permissions:result?.before?.permissions||{},firebaseEmail:oldEmail},
      after:{role,permissions,firebaseEmail:newEmail},
      details:{summary:`Permisos actualizados · ${code}`}
    }).catch(()=>{});
    toast(`Permisos de ${code} guardados.`);
    loadAccessEditor();
    if(code===activeUser())applyAccessControl();
  });
}

function bindCloudAdminControls(){
  const on=document.getElementById('enableCloudBtn');
  const off=document.getElementById('disableCloudBtn');
  const hint=document.getElementById('cloudModeHint');

  if(on){
    on.textContent='Reconectar Firebase';
    on.onclick=async ()=>{
      if(!isAdminUser()){toast('Solo el Administrador puede administrar la conexión cloud.');return}
      if(!state.auth?.currentUser){toast('La sesión principal no está autenticada.');return}
      await ensureUnifiedCloudSession();
    };
  }

  if(off)off.onclick=async ()=>{
    if(!isAdminUser()){toast('Solo el Administrador puede desactivar la sincronización.');return}
    CLOUD_SYNC_ENABLED=false;
    localStorage.setItem('microbio_cloud_enabled','false');
    state.listeners?.forEach(fn=>{try{fn()}catch{}});
    state.listeners=[];
    state.connected=false;
    setSyncStatus('offline','AUTH');
    if(hint)hint.textContent='Sincronización desactivada manualmente. La sesión del usuario permanece autenticada.';
    toast('Sincronización desactivada.');
  };

  if(hint)hint.textContent='Sesión única: iniciar sesión en el ERP autentica y conecta Firebase automáticamente.';
}
showSecureLogin('Ingrese sus credenciales.');
bootstrapProductionFirebaseConfig();
async function boot(){db=await openDB();$('#deviceId').textContent=deviceId;await seed();await migrate();await loadLocal();await dedupeIntegratedBottleMirrors();await loadLocal();ensureStateDomains();await seedEquipmentCatalog();await migrateAutoclaveCleaningFrequencyV342G();await seedEnvironmentConfig();await seedRefrigeratorConfig();await seedRefrigerator2Config();await seedIncubatorConfig();await seedWaterBathConfig();await seedPhMeterConfig();await migrateIncubatorScheduleWorkdays();ensureStateDomains();for(const lot of state.productLots.filter(l=>productLotStatus(l)==='APTO'))await syncProductLotToERP(lot);await dedupeIntegratedBottleMirrors();await loadLocal();await migrateMonitoringFrequenciesV220();await loadLocal();await migrateANPerformanceExclusion();await loadLocal();await reconcileExhaustedPlateLots();await loadLocal();await migrateSurfaceSwabLimitsD2();for(const p of state.mediaPrep.filter(x=>performanceRequiredForPrep(x)&&!performanceTaskForPrep(x.id)&&bottleById(x.bottleId)?.qualificationStatus!=='CALIFICADO'))await createPerformanceTaskForPrep(p);await loadLocal();renderSelects();bindAccessControl();bindRealPermissionGuards();bindCloudAdminControls();bindFirebaseAuthControls();bindSecureLogin();bindUserDirectoryControls();bindCentralAudit();bindDeletionSecurityGuard();bindMicroPlanner();bindSampleModule();bindProductModule();bindEquipmentModule();bindEnvironmentModule();bindRefrigeratorModule();bindRefrigerator2Module();bindIncubatorModule();bindWaterBathModule();bindControlChartHub();bindPhMeterModule();activateMicroTab('catalog');resetPrep();resetQC();resetStrainPrep();resetReactivation();applyAccessControl();adminAccessSafetyCheck();fillFirebaseForm();applyFirebaseConfigAccess();await initFirebaseAuthOnly();await updateOutbox();if(CLOUD_SYNC_ENABLED){const cfg=getFirebaseConfig();if($('#firebaseStatus'))$('#firebaseStatus').textContent=`Conectando · workspace ${WORKSPACE_ID} · schema v${SCHEMA_VERSION}.`;await connectFirebase(cfg)}else{setSyncStatus('offline','LOCAL');if($('#firebaseStatus'))$('#firebaseStatus').textContent=`Cloud Foundation definida · workspace ${WORKSPACE_ID} · schema v${SCHEMA_VERSION} · sincronización desactivada.`}}
boot().catch(err=>{console.error(err);toast('Error de arranque: '+err.message)});

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',syncVisibleAppVersion,{once:true});
}else{
  syncVisibleAppVersion();
}
