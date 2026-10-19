// Run: node tests/stat-ptr-edge.test.js  — tester edge cases for statScore() and pull-to-refresh beyond the coder's tests.
const fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const i=src.indexOf("function statScore("),j=src.indexOf("\n// Overall rating",i);assert(i>=0&&j>i,"missing statScore");
const code=src.slice(i,j),oldCode=code.replace("if(d)days++","if(owed)days++");
const ds=d=>d.toISOString().slice(0,10),addDays=(k,n)=>{const d=new Date(k+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return ds(d)};
// goals: [{category,from?,created?}] scheduled every day from `created`; done: {day:{cat:n}}.
function score({sched={},done={},goals=null,asOf,first,cat="a",old=false}){
  const state={log:{},firstDay:first};
  Object.entries(done).forEach(([k,n])=>{state.log[k]=Array.from({length:n},(_,x)=>k+":"+x)});
  const goalsOn=goals?()=>goals:k=>Array.from({length:sched[k]||0},()=>({category:"a"}));
  const catDoneOn=(c,k)=>c==="a"?(state.log[k]||[]).length:0;
  const catLifetime=(c,until)=>Object.keys(state.log).filter(k=>!until||k<=until).reduce((n,k)=>n+catDoneOn(c,k),0);
  return new Function("state","goalsOn","catDoneOn","catLifetime","addDays","createdDay","today",(old?oldCode:code)+";return statScore")
    (state,goalsOn,catDoneOn,catLifetime,addDays,g=>g.created||"0000-00-00",()=>asOf)(cat,asOf);
}
const D1="2026-09-01";let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n};
let n=0,fails=[];const t=(name,f)=>{try{f();n++;console.log("ok  "+name)}catch(e){fails.push(name);console.log("FAIL "+name+"\n     "+e.message)}};

t("property (first 30 days): a fully missed day never raises the score, 2000 random histories",()=>{
  for(let r=0;r<2000;r++){
    const len=1+rnd(27),sched={},done={};
    for(let k=0;k<len;k++){const d=addDays(D1,k);sched[d]=rnd(6);done[d]=rnd(2)?rnd(sched[d]+2):0}
    const miss=addDays(D1,len);sched[miss]=1+rnd(5);
    const before=score({sched,done,asOf:miss,first:D1}),after=score({sched,done,asOf:addDays(miss,1),first:D1});
    assert(after<=before,`history ${JSON.stringify({sched,done})}: ${after} > ${before}`);
  }
});
t("area created mid-window: days before createdDay are not owed",()=>{
  const goals=[{category:"a",created:addDays(D1,5)}],done={[addDays(D1,5)]:1};
  const a=score({goals,done,asOf:addDays(D1,6),first:D1});
  const b=score({sched:{[addDays(D1,5)]:1},done,asOf:addDays(D1,6),first:D1});
  assert.strictEqual(a,b);
});
t("day with 0 scheduled but completions counts as done and owed (no divide issues)",()=>{
  const s=score({sched:{},done:{[D1]:2},asOf:addDays(D1,1),first:D1});assert(s>0&&Number.isFinite(s));
});
t("other area's completions do not lift area b",()=>assert.strictEqual(score({sched:{},done:{[D1]:5},asOf:addDays(D1,1),first:D1,cat:"b"}),0));
t("the 'this week' delta is not ▲ after a fully missed week (first month)",()=>{
  const sched={},done={};for(let k=0;k<10;k++){const d=addDays(D1,k);sched[d]=3;done[d]=3}
  for(let k=10;k<17;k++)sched[addDays(D1,k)]=1;
  const now=addDays(D1,17),weekAgo=addDays(now,-7);
  assert(score({sched,done,asOf:now,first:D1})<=score({sched,done,asOf:weekAgo,first:D1}));
});
t("veterans (30+ days): missed days never raise the score, and lower it below the old formula (decided: intended)",()=>{
  // 60 days of history, 3 goals a day, every other day fully missed.
  const sched={},done={};for(let k=0;k<60;k++){const d=addDays(D1,k);sched[d]=3;done[d]=k%2?0:3}
  const asOf=addDays(D1,60),now=score({sched,done,asOf,first:D1}),was=score({sched,done,asOf,first:D1,old:true});
  assert(now<was,`missed days should now reduce the ramp too: new ${now}, old ${was}`);
  const perfect={};for(let k=0;k<60;k++)perfect[addDays(D1,k)]=3;
  assert.strictEqual(score({sched,done:perfect,asOf,first:D1}),score({sched,done:perfect,asOf,first:D1,old:true}),"no misses: unchanged");
  for(let r=0;r<500;r++){
    const sc={},dn={};for(let k=0;k<30+rnd(40);k++){const d=addDays(D1,k);sc[d]=rnd(5);dn[d]=rnd(2)?rnd(sc[d]+2):0}
    const last=Object.keys(sc).sort().pop(),miss=addDays(last,1);sc[miss]=1+rnd(4);
    const before=score({sched:sc,done:dn,asOf:miss,first:D1}),after=score({sched:sc,done:dn,asOf:addDays(miss,1),first:D1});
    assert(after<=before,`veteran history ${JSON.stringify({sc,dn})}: ${after} > ${before}`);
  }
});

// ---------- pull to refresh: sync outcomes ----------
const pi=src.indexOf("const PTR_AT="),pj=src.indexOf('document.addEventListener("touchcancel",ptrEnd);',pi);
const ptrCode=src.slice(pi,pj)+'document.addEventListener("touchcancel",ptrEnd);';
function load(syncImpl){
  const ls={},toasts=[];let pending=[],renders=0;
  const cls=()=>{const s=new Set();return{add:c=>s.add(c),remove:c=>s.delete(c),toggle:(c,on)=>on?s.add(c):s.delete(c),contains:c=>s.has(c)}};
  const ptr={style:{},classList:cls(),firstChild:{style:{}}},toastEl={textContent:""},menu={classList:cls()};menu.classList.add("hidden");
  const toast=s=>{toastEl.textContent=s;toasts.push(s)};
  const env={$:id=>({ptr,toast:toastEl,menuList:menu})[id],document:{addEventListener:(t,f)=>ls[t]=f,querySelector:()=>null},
    window:{scrollY:0,LIFESTYLE:{sync:o=>syncImpl(o,toast)}},navigator:{onLine:true},matchMedia:()=>({matches:false}),toast,
    render:()=>renders++,checkRelease:async()=>{},setTimeout:f=>pending.push(f)};
  const names=Object.keys(env);new Function(...names,ptrCode)(...names.map(k=>env[k]));
  const tg={closest:()=>null},mv=y=>{const e={touches:[{clientX:100,clientY:y}],target:tg,preventDefault(){this.p=true}};ls.touchmove(e);return e};
  return{ls,ptr,toasts,get renders(){return renders},
    async pull(){ls.touchstart({touches:[{clientX:100,clientY:100}],target:tg});mv(150);mv(400);ls.touchend({type:"touchend"});
      for(let k=0;k<6;k++){await new Promise(r=>setImmediate(r));const p=pending;pending=[];p.forEach(f=>f())}},mv,tg};
}
const asyncTests=[
  ["sync's own 'Synced' toast is kept (no 'Up to date' over it)",async()=>{const a=load(async(o,toast)=>{assert.strictEqual(o.quiet,false);toast("Synced with your account");return true});await a.pull();assert.deepStrictEqual(a.toasts,["Synced with your account"])}],
  ["sync failure toast is kept; indicator retracts and a later pull works",async()=>{let c=0;const a=load(async(o,toast)=>{c++;toast("Sync failed: x");return true});await a.pull();assert.deepStrictEqual(a.toasts,["Sync failed: x"]);assert.strictEqual(a.ptr.style.transform,"translateY(0px)");await a.pull();assert.strictEqual(c,2)}],
  ["sync that rejects still resets refreshing and retracts",async()=>{let c=0;const a=load(async()=>{c++;throw new Error("boom")});
    const h=()=>{};process.on("unhandledRejection",h);await a.pull();await a.pull();process.off("unhandledRejection",h);
    assert.strictEqual(c,2,"second pull blocked: refreshing not reset");assert(!a.ptr.classList.contains("spin"))}],
  ["reversing a pull back above the start cancels without refresh",async()=>{let c=0;const a=load(async()=>{c++});a.ls.touchstart({touches:[{clientX:100,clientY:100}],target:a.tg});a.mv(150);a.mv(400);a.mv(90);a.ls.touchend({type:"touchend"});await new Promise(r=>setImmediate(r));assert.strictEqual(c,0);assert.strictEqual(a.ptr.style.transform,"translateY(0px)")}],
  ["upward first move hands off to native scroll (never prevented)",async()=>{const a=load(async()=>{});a.ls.touchstart({touches:[{clientX:100,clientY:300}],target:a.tg});const e=a.mv(250);const e2=a.mv(400);assert(!e.p&&!e2.p)}],
  ["sync already in flight: says 'Already syncing', not 'Up to date'",async()=>{const a=load(async()=>"busy");await a.pull();assert.deepStrictEqual(a.toasts,["Already syncing"])}],
  ["a second quick pull keeps sync's identical 'Synced' toast",async()=>{const a=load(async(o,toast)=>{toast("Synced with your account");return true});await a.pull();await a.pull();
    assert.deepStrictEqual(a.toasts,["Synced with your account","Synced with your account"])}],
  ["a pull that starts on a goal row swallows the release click; a plain tap does not",async()=>{const a=load(async()=>true);await a.pull();
    const ev=()=>({stopPropagation(){this.s=true},preventDefault(){}}),e1=ev();a.ls.click(e1);assert(e1.s,"click after pull reached the goal row");
    const now=Date.now;Date.now=()=>now()+1000;const e2=ev();a.ls.click(e2);Date.now=now;assert(!e2.s,"later tap was eaten");
    a.ls.touchstart({touches:[{clientX:100,clientY:100}],target:a.tg});a.ls.touchend({type:"touchend"});Date.now=()=>now()+2000;const e3=ev();a.ls.click(e3);Date.now=now;assert(!e3.s,"plain tap eaten")}],
];
(async()=>{for(const[name,f]of asyncTests){try{await f();n++;console.log("ok  "+name)}catch(e){fails.push(name);console.log("FAIL "+name+"\n     "+e.message)}}
  console.log(`\n${n} passed`+(fails.length?`, ${fails.length} failed: ${fails.join("; ")}`:""));if(fails.length)process.exit(1)})();
