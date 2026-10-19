// Run: node tests/sync-click-r2.test.js — round 2 tester checks: cloud.js sync() return contract and the 350ms click guard.
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,"..");
const cloud=fs.readFileSync(path.join(root,"cloud.js"),"utf8"),app=fs.readFileSync(path.join(root,"app.js"),"utf8");
let n=0,fails=[];
const t=async(name,f)=>{try{await f();n++;console.log("ok  "+name)}catch(e){fails.push(name);console.log("FAIL "+name+"\n     "+e.message)}};

// ---------- sync(): the real function from cloud.js with stubbed pull/push ----------
const si=cloud.indexOf("async function sync("),sj=cloud.indexOf("L.sync=sync;",si);assert(si>=0&&sj>si,"missing sync");
function mkSync({user=true,online=true,pull=async()=>{},push=async()=>{}}={}){
  const toasts=[],status=[],nav={onLine:online},L={toast:s=>toasts.push(s)};
  const f=new Function("user","navigator","setStatus","pull","push","L","console",
    "let busy=false,lastSynced=0;"+cloud.slice(si,sj)+";return sync")(user,nav,s=>status.push(s),pull,push,L,{warn(){}});
  return{sync:f,toasts,status,nav};
}
const run=async()=>{
await t("signed out: returns undefined, no toast (refresh then says 'Up to date')",async()=>{const s=mkSync({user:null});assert.strictEqual(await s.sync({quiet:false}),undefined);assert.deepStrictEqual(s.toasts,[])});
await t("offline: returns undefined, no toast",async()=>{const s=mkSync({online:false});assert.strictEqual(await s.sync({quiet:false}),undefined)});
await t("success, quiet:false: returns true and toasts 'Synced'",async()=>{const s=mkSync();assert.strictEqual(await s.sync({quiet:false}),true);assert.deepStrictEqual(s.toasts,["Synced with your account"])});
await t("failure, quiet:false: returns true and toasts 'Sync failed'",async()=>{const s=mkSync({push:async()=>{throw{code:"x"}}});assert.strictEqual(await s.sync({quiet:false}),true);assert.deepStrictEqual(s.toasts,["Sync failed: x"])});
await t("while a sync runs: second call returns 'busy' and the first still finishes",async()=>{let go,calls=0;const s=mkSync({pull:()=>calls++?Promise.resolve():new Promise(r=>go=r)});
  const p1=s.sync();assert.strictEqual(await s.sync({quiet:false}),"busy");go();assert.strictEqual(await p1,true);
  assert.strictEqual(await s.sync({quiet:false}),true,"busy flag not released")});
await t("quiet default (auto-sync callers): no toast; return value is ignored by onUser/online/visibility/syncNow",async()=>{const s=mkSync();await s.sync();assert.deepStrictEqual(s.toasts,[]);
  for(const re of[/await sync\(\)\}/,/addEventListener\("online",\(\)=>sync\(\)\)/,/lastSynced>60000\)sync\(\)\}/,/\$\("syncNow"\)\.addEventListener\("click",\(\)=>sync\(\{quiet:false\}\)\)/])assert(re.test(cloud),"caller changed: "+re)});

// ---------- 350ms click guard ----------
const pi=app.indexOf("const PTR_AT="),pj=app.indexOf('document.addEventListener("touchcancel",ptrEnd);',pi);
const code=app.slice(pi,pj)+'document.addEventListener("touchcancel",ptrEnd);';
function load(){
  const ls={},cls=()=>{const s=new Set();return{add:c=>s.add(c),remove:c=>s.delete(c),toggle:(c,on)=>on?s.add(c):s.delete(c),contains:c=>s.has(c)}};
  const ptr={style:{},classList:cls(),firstChild:{style:{}}},menu={classList:cls()};menu.classList.add("hidden");let pending=[];
  const env={$:id=>({ptr,toast:{textContent:""},menuList:menu})[id],document:{addEventListener:(t,f)=>ls[t]=f,querySelector:()=>null},
    window:{scrollY:0,LIFESTYLE:{sync:async()=>true}},navigator:{onLine:true},matchMedia:()=>({matches:false}),toast(){},render(){},checkRelease:async()=>{},setTimeout:f=>pending.push(f)};
  const names=Object.keys(env);new Function(...names,code)(...names.map(k=>env[k]));
  const tg={closest:()=>null},start=(x,y)=>ls.touchstart({touches:[{clientX:x,clientY:y}],target:tg}),
    move=(x,y)=>ls.touchmove({touches:[{clientX:x,clientY:y}],target:tg,preventDefault(){}}),end=()=>ls.touchend({type:"touchend"}),cancel=()=>ls.touchcancel({type:"touchcancel"}),
    click=()=>{const e={stopPropagation(){this.s=true},preventDefault(){this.p=true}};ls.click(e);return!!e.s};
  return{start,move,end,cancel,click,flush:async()=>{for(let k=0;k<6;k++){await new Promise(r=>setImmediate(r));const p=pending;pending=[];p.forEach(f=>f())}}};
}
const at=(ms,f)=>{const now=Date.now,b=now();Date.now=()=>b+ms;try{return f()}finally{Date.now=now}};
await t("plain tap (no move) right away: click goes through",async()=>{const a=load();a.start(100,100);a.end();assert(!a.click())});
await t("tap with <10px jitter: click goes through",async()=>{const a=load();a.start(100,100);a.move(103,108);a.end();assert(!a.click())});
await t("horizontal goal-row swipe at the top: following click not eaten (swipe code owns it)",async()=>{const a=load();a.start(100,100);a.move(160,105);a.end();assert(!a.click())});
await t("upward scroll at the top: following click not eaten",async()=>{const a=load();a.start(100,300);a.move(100,250);a.end();assert(!a.click())});
await t("short pull below threshold: release click eaten, toast/menu tap 360ms later is not",async()=>{const a=load();a.start(100,100);a.move(100,150);a.end();
  assert(a.click(),"release click not eaten");assert(!at(360,a.click),"legit tap at +360ms lost")});
await t("full pull: release click eaten; menu tap after the window passes, during the refresh spinner",async()=>{const a=load();a.start(100,100);a.move(100,400);a.end();
  assert(a.click());assert(!at(351,a.click));await a.flush()});
await t("pull cancelled by touchcancel still clears the decided flag, so the next plain tap is not eaten",async()=>{const a=load();a.start(100,100);a.move(100,150);a.cancel();
  at(1000,()=>{a.start(100,100);a.end();assert(!a.click(),"stale ptrDecided ate a later tap")})});
};
run().then(()=>{console.log(`\n${n} passed`+(fails.length?`, ${fails.length} failed: ${fails.join("; ")}`:""));if(fails.length)process.exit(1)});
