// Optional account: Firebase sign-in plus backup/sync of the app's state.
// The device copy (localStorage, owned by app.js) stays primary. The cloud holds users/{uid} (profile)
// and users/{uid}/days/{YYYY-MM-DD}; each doc stores its slice of state as JSON. We hash every slice
// and upload only slices that changed since the cloud last matched; on open we pull docs other devices wrote.
const L=window.LIFESTYLE;
if(L){
const SDK="https://www.gstatic.com/firebasejs/13.0.0/";
const CONFIG={apiKey:"AIzaSyDbXL20tky7P5EZF5iJl_I_d4VEuQ_DQPc",authDomain:"lifestyle-pabbuneelam.firebaseapp.com",projectId:"lifestyle-pabbuneelam",storageBucket:"lifestyle-pabbuneelam.firebasestorage.app",messagingSenderId:"921708864511",appId:"1:921708864511:web:d941df2cc105b064417dca"};
const USE_EMULATOR=location.hostname==="localhost"&&new URLSearchParams(location.search).has("emulator");
const DAY_KEYS=["log","history","journal","daily","focus","metrics","autoStep"],DAY_RE=/^\d{4}-\d{2}-\d{2}$/;
const SIGNED_IN_FLAG="lifestyle_signed_in";
const $=id=>document.getElementById(id);

let fb=null,auth=null,db=null,user=null,meta=null,uploadTimer=null,busy=false,lastSynced=0,status="Not signed in";

/* ---------- Firebase loading ---------- */
async function ensureFirebase(){
  if(fb)return fb;
  const[app,a,f]=await Promise.all([import(SDK+"firebase-app.js"),import(SDK+"firebase-auth.js"),import(SDK+"firebase-firestore.js")]);
  const inst=app.initializeApp(CONFIG);
  auth=a.initializeAuth(inst,{persistence:[a.indexedDBLocalPersistence,a.browserLocalPersistence],popupRedirectResolver:a.browserPopupRedirectResolver});
  db=f.getFirestore(inst);
  if(USE_EMULATOR){a.connectAuthEmulator(auth,"http://localhost:9099",{disableWarnings:true});f.connectFirestoreEmulator(db,"localhost",8080)}
  fb={...a,...f};
  fb.onAuthStateChanged(auth,u=>onUser(u));
  return fb;
}

/* ---------- state <-> docs ---------- */
function split(state){
  const profile={},days={};
  for(const[k,v]of Object.entries(state)){
    if(!DAY_KEYS.includes(k)){profile[k]=v;continue}
    for(const[d,val]of Object.entries(v||{}))if(DAY_RE.test(d))(days[d]||(days[d]={}))[k]=val;
  }
  return{profile,days};
}
function join(profile,days){
  const s={...profile};DAY_KEYS.forEach(k=>s[k]={});
  for(const[d,day]of Object.entries(days))for(const k of DAY_KEYS)if(day[k]!==undefined)s[k][d]=day[k];
  return s;
}
const docsOf=state=>{const{profile,days}=split(state),out={profile:JSON.stringify(profile)};for(const[d,v]of Object.entries(days))out[d]=JSON.stringify(v);return out};
function hash(str){let h=5381;for(let i=0;i<str.length;i++)h=(h*33^str.charCodeAt(i))>>>0;return h.toString(36)+str.length.toString(36)}
const refOf=id=>id==="profile"?fb.doc(db,"users",user.uid):fb.doc(db,"users",user.uid,"days",id);

/* ---------- per-account sync bookkeeping ---------- */
const metaKey=uid=>"lifestyle_cloud_"+uid;
function loadMeta(uid){try{return JSON.parse(localStorage.getItem(metaKey(uid)))||null}catch(e){return null}}
function saveMeta(){try{localStorage.setItem(metaKey(user.uid),JSON.stringify(meta))}catch(e){}}
function clearMeta(uid){try{localStorage.removeItem(metaKey(uid))}catch(e){}}

/* ---------- combining two histories (first sign-in on a device that already has data) ---------- */
const union=(a=[],b=[])=>[...new Set([...a,...b])];
function unionBy(a=[],b=[],merge){const m=new Map(a.map(x=>[x.id,x]));b.forEach(x=>m.set(x.id,m.has(x.id)&&merge?merge(m.get(x.id),x):m.get(x.id)||x));return[...m.values()]}
function combineProfile(l,r){
  const out={...r,...l};
  out.xp=Math.max(l.xp||0,r.xp||0);out.bestStreak=Math.max(l.bestStreak||0,r.bestStreak||0);
  out.name=l.name||r.name||"";out.shortcutName=l.shortcutName||r.shortcutName||"";
  out.goals=unionBy(l.goals,r.goals);out.todos=unionBy(l.todos,r.todos);
  out.challenges=unionBy(l.challenges,r.challenges,(x,y)=>({...x,checkins:union(x.checkins,y.checkins)}));
  out.program=l.program&&r.program?(l.program.start<=r.program.start?l.program:r.program):l.program||r.program||null;
  out.rankDates={...r.rankDates};for(const[k,v]of Object.entries(l.rankDates||{}))if(!out.rankDates[k]||v<out.rankDates[k])out.rankDates[k]=v;
  out.weekly={...r.weekly,...l.weekly};
  out.firstDay=[l.firstDay,r.firstDay].filter(Boolean).sort()[0];
  out.stepSync=Math.max(l.stepSync||0,r.stepSync||0)||undefined;
  return out;
}
function combineDay(l={},r={}){
  const out={...r,...l};
  out.log=union(l.log,r.log);out.autoStep=union(l.autoStep,r.autoStep);
  if(l.history||r.history)out.history=(l.history?.done||0)>=(r.history?.done||0)?l.history||r.history:r.history;
  const lt=l.journal?.text||"",rt=r.journal?.text||"";
  if(lt||rt)out.journal={text:lt&&rt&&lt!==rt?lt+"\n\n—\n\n"+rt:lt||rt,mood:l.journal?.mood??r.journal?.mood??null};
  if(l.daily||r.daily)out.daily=true;
  if(l.focus||r.focus)out.focus=Math.max(l.focus||0,r.focus||0);
  if(l.metrics||r.metrics){out.metrics={...r.metrics};for(const[k,v]of Object.entries(l.metrics||{}))out.metrics[k]=Math.max(Number(v)||0,Number(out.metrics[k])||0)}
  for(const k of Object.keys(out))if(out[k]===undefined)delete out[k];
  return out;
}
const hasData=st=>(st.goals||[]).length>0||Object.keys(st.log||{}).length>0||(st.xp||0)>0||Object.keys(st.journal||{}).length>0;

/* ---------- pull / push ---------- */
async function pull(){
  const first=!meta,since=meta?.pulledAt||0;
  const[pSnap,dSnap]=await Promise.all([
    fb.getDoc(refOf("profile")),
    fb.getDocs(since?fb.query(fb.collection(db,"users",user.uid,"days"),fb.where("updatedAt",">",fb.Timestamp.fromMillis(since))):fb.collection(db,"users",user.uid,"days"))
  ]);
  const remote={},stamps={};let newest=since;
  const take=(id,snap)=>{const d=snap.data();if(!d?.data)return;try{remote[id]=JSON.parse(d.data)}catch(e){return}const ms=d.updatedAt?.toMillis?.()||0;stamps[id]=ms;newest=Math.max(newest,ms)};
  if(pSnap.exists())take("profile",pSnap);
  dSnap.forEach(s=>DAY_RE.test(s.id)&&take(s.id,s));

  const local=L.getState(),{profile:lp,days:ld}=split(local);
  let profile=lp,days={...ld},changed=false;

  if(first){
    meta={known:{},stamps:{},pulledAt:0};
    const remoteHas=!!remote.profile,localHas=hasData(local);
    if(remoteHas&&localHas){
      const ok=confirm("This device and your account both have LIFESTYLE progress.\n\nThey'll be combined: goals, ticked days, journals and challenges from both are kept, and the higher XP and best streak win.\n\nA copy of this device's data is saved first. Continue?");
      if(!ok){await fb.signOut(auth);return false}
      try{localStorage.setItem("lifestyle_backup_before_merge",JSON.stringify(local))}catch(e){}
      profile=combineProfile(lp,remote.profile);
      for(const[d,v]of Object.entries(remote))if(d!=="profile")days[d]=combineDay(ld[d],v);
      changed=true;
    }else if(remoteHas){
      profile=remote.profile;days={};
      for(const[d,v]of Object.entries(remote))if(d!=="profile")days[d]=v;
      changed=true;
    }
    // Remote copies we adopted unchanged count as already in the cloud.
    if(!(remoteHas&&localHas))for(const[id,v]of Object.entries(remote))meta.known[id]=hash(JSON.stringify(v));
  }else{
    // Newest wins per doc: remote beats local unless this device changed it more recently.
    for(const[id,v]of Object.entries(remote)){
      const json=JSON.stringify(v),h=hash(json);
      if(h===meta.known[id])continue;
      const localJson=id==="profile"?JSON.stringify(lp):ld[id]?JSON.stringify(ld[id]):null;
      const localDirty=localJson!==null&&hash(localJson)!==meta.known[id];
      if(localDirty&&(meta.stamps[id]||0)>stamps[id])continue;
      if(id==="profile")profile=v;else days[id]=v;
      meta.known[id]=h;changed=true;
    }
  }
  meta.pulledAt=newest;saveMeta();
  if(changed)L.setState(join(profile,days));
  return true;
}
async function push(){
  const docs=docsOf(L.getState()),dirty=Object.entries(docs).filter(([id,json])=>hash(json)!==meta.known[id]);
  for(let i=0;i<dirty.length;i+=400){
    const batch=fb.writeBatch(db);
    dirty.slice(i,i+400).forEach(([id,json])=>batch.set(refOf(id),{data:json,updatedAt:fb.serverTimestamp()}));
    await batch.commit();
    dirty.slice(i,i+400).forEach(([id,json])=>meta.known[id]=hash(json));
    saveMeta();
  }
  return dirty.length;
}
async function sync({quiet=true}={}){
  if(!user||busy)return;
  if(!navigator.onLine){setStatus("Offline, will sync");return}
  busy=true;setStatus("Syncing…");
  try{
    if(await pull()===false)return;
    await push();
    lastSynced=Date.now();setStatus("synced");
    if(!quiet)L.toast("Synced with your account");
  }catch(e){
    console.warn("[LIFESTYLE] sync failed",e);
    setStatus(navigator.onLine?"Sync error":"Offline, will sync");
    if(!quiet)L.toast("Sync failed: "+(e.code||e.message||"unknown error"),6000);
  }finally{busy=false}
}
L.sync=sync; // pull-to-refresh in app.js re-syncs through the bridge
// Note local edits with a timestamp (for newest-wins), then upload shortly after typing stops.
L.onSave(state=>{
  if(!user||!meta)return;
  const now=Date.now();let any=false;
  for(const[id,json]of Object.entries(docsOf(state)))if(hash(json)!==meta.known[id]&&meta.stamps[id]!==now){meta.stamps[id]=now;any=true}
  if(!any)return;
  saveMeta();
  clearTimeout(uploadTimer);uploadTimer=setTimeout(async()=>{
    if(busy||!navigator.onLine){if(!navigator.onLine)setStatus("Offline, will sync");return}
    busy=true;setStatus("Syncing…");
    try{await push();lastSynced=Date.now();setStatus("synced")}catch(e){console.warn("[LIFESTYLE] upload failed",e);setStatus("Sync error")}finally{busy=false}
  },1500);
});
// "Reset everything" while signed in also clears the cloud copy, so it can't come back on the next pull.
L.onReset(async()=>{
  if(!user)return;
  try{await wipeCloud();meta={known:{},stamps:{},pulledAt:0};saveMeta();await push();setStatus("synced")}catch(e){setStatus("Sync error")}
});
async function wipeCloud(){
  const snap=await fb.getDocs(fb.collection(db,"users",user.uid,"days")),refs=[];
  snap.forEach(s=>refs.push(s.ref));
  for(let i=0;i<refs.length;i+=400){const b=fb.writeBatch(db);refs.slice(i,i+400).forEach(r=>b.delete(r));await b.commit()}
  await fb.deleteDoc(refOf("profile"));
}

/* ---------- UI ---------- */
function setStatus(s){
  status=s;
  const el=$("syncStatus");if(!el)return;
  el.textContent=s==="synced"?"Synced "+new Date(lastSynced).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):s;
  el.classList.toggle("ok",s==="synced");el.classList.toggle("warn",/error|Offline/.test(s));
}
async function onUser(u){
  const prev=user;user=u;
  $("acctSignedOut").classList.toggle("hidden",!!u);$("acctSignedIn").classList.toggle("hidden",!u);
  $("acctTitle").textContent=u?"Your account":"Back up your progress";
  try{u?localStorage.setItem(SIGNED_IN_FLAG,"1"):localStorage.removeItem(SIGNED_IN_FLAG)}catch(e){}
  if(!u){meta=null;setStatus("Not signed in");return}
  $("acctWho").textContent=u.email||u.displayName||"your account";
  if(prev?.uid!==u.uid){meta=loadMeta(u.uid);await sync()}
}
const ERRORS={
  "auth/invalid-email":"That email address doesn't look right.",
  "auth/missing-password":"Enter your password.",
  "auth/weak-password":"Use a password with at least 6 characters.",
  "auth/email-already-in-use":"That email already has an account. Tap Sign in instead.",
  "auth/invalid-credential":"Email or password is incorrect.",
  "auth/wrong-password":"Email or password is incorrect.",
  "auth/user-not-found":"No account with that email. Tap Create account.",
  "auth/too-many-requests":"Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed":"No internet connection.",
  "auth/popup-closed-by-user":"Google sign-in was closed before finishing.",
  "auth/cancelled-popup-request":"Google sign-in was closed before finishing.",
  "auth/popup-blocked":"Google sign-in couldn't open here. Use email and password instead.",
  "auth/operation-not-supported-in-this-environment":"Google sign-in isn't supported here. Use email and password instead.",
  "auth/web-storage-unsupported":"Google sign-in isn't supported here. Use email and password instead."
};
const fail=e=>{console.warn("[LIFESTYLE] auth",e);L.toast(ERRORS[e?.code]||"Something went wrong: "+(e?.code||e?.message||"unknown"),6000)};
async function run(btn,fn){
  if(btn.disabled)return;btn.disabled=true;
  try{await ensureFirebase();await fn()}catch(e){fail(e)}finally{btn.disabled=false}
}
const creds=()=>({email:$("acctEmail").value.trim(),password:$("acctPassword").value});

$("googleSignIn").addEventListener("click",e=>run(e.currentTarget,()=>fb.signInWithPopup(auth,new fb.GoogleAuthProvider())));
$("emailForm").addEventListener("submit",e=>{e.preventDefault();run($("emailSignIn"),async()=>{const c=creds();await fb.signInWithEmailAndPassword(auth,c.email,c.password);$("acctPassword").value=""})});
$("emailSignUp").addEventListener("click",e=>run(e.currentTarget,async()=>{const c=creds();await fb.createUserWithEmailAndPassword(auth,c.email,c.password);$("acctPassword").value="";L.toast("Account created. Your progress is backing up.")}));
$("forgotPassword").addEventListener("click",e=>run(e.currentTarget,async()=>{
  const email=creds().email;if(!email){L.toast("Type your email above first.");return}
  await fb.sendPasswordResetEmail(auth,email);L.toast("Password reset email sent to "+email,5000);
}));
$("syncNow").addEventListener("click",()=>sync({quiet:false}));
$("signOutBtn").addEventListener("click",e=>run(e.currentTarget,async()=>{
  const keep=confirm("Keep a copy of your progress on this device after signing out?\n\nOK keeps it here. Cancel removes it from this device (it stays safe in your account).");
  const uid=user.uid;
  try{await push()}catch(err){}
  await fb.signOut(auth);clearMeta(uid);
  if(!keep)L.setState(L.fresh());
  L.toast("Signed out.");
}));
$("deleteAccount").addEventListener("click",e=>run(e.currentTarget,async()=>{
  if(!confirm("Delete your LIFESTYLE account?\n\nYour cloud backup is erased permanently. Progress on this device is kept."))return;
  const uid=user.uid;
  const del=async()=>{await wipeCloud();await fb.deleteUser(auth.currentUser)};
  try{await del()}
  catch(err){
    if(err.code!=="auth/requires-recent-login")throw err;
    // Firebase wants a fresh sign-in before deleting an account.
    const u=auth.currentUser;
    if(u.providerData.some(p=>p.providerId==="google.com"))await fb.reauthenticateWithPopup(u,new fb.GoogleAuthProvider());
    else{const pw=prompt("Enter your password to confirm deleting your account:");if(!pw)return;await fb.reauthenticateWithCredential(u,fb.EmailAuthProvider.credential(u.email,pw))}
    await del();
  }
  clearMeta(uid);L.toast("Account deleted. Your progress is still on this device.",5000);
}));

window.addEventListener("online",()=>sync());
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&user&&Date.now()-lastSynced>60000)sync()});

// Only load Firebase at startup for people who have signed in before.
let flagged=false;try{flagged=!!localStorage.getItem(SIGNED_IN_FLAG)}catch(e){}
if(flagged)ensureFirebase().catch(err=>{console.warn("[LIFESTYLE] Firebase unavailable",err);setStatus("Offline, will sync")});
}
