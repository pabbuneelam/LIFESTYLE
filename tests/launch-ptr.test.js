// Run: node tests/launch-ptr.test.js  — launch intro wiring and the pull-to-refresh gesture in app.js.
const fs=require("fs"),path=require("path"),assert=require("assert");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const src=read("app.js"),css=read("style.css"),html=read("index.html"),cloud=read("cloud.js"),sw=read("sw.js");
let n=0,fails=[];const t=(name,fn)=>Promise.resolve().then(fn).then(()=>{n++;console.log("ok  "+name)},e=>{fails.push(name);console.log("FAIL "+name+"\n     "+e.message)});

// ---------- launch intro ----------
const launchTests=[
t("#launch is the first child of <body>, followed by the session-skip script",()=>{
  const b=html.slice(html.indexOf("<body>")+6).trimStart();
  assert(b.startsWith('<div id="launch" aria-hidden="true"><span class="launch-mark">LIFESTYLE</span></div>\n<script>'));
  assert(/sessionStorage\.getItem\("launched"\)\)document\.getElementById\("launch"\)\.remove\(\);else sessionStorage\.setItem\("launched","1"\)\}catch\(e\)\{\}/.test(b));
}),
t("launch CSS: no taps blocked, timing totals 900ms, composite-only keyframes, hidden under reduced motion",()=>{
  assert(/#launch\{[^}]*pointer-events:none[^}]*animation:launchOut \.3s ease-out \.6s both/.test(css));
  assert(/\.launch-mark\{[^}]*animation:launchIn \.45s var\(--ease\) both/.test(css));
  const kf=css.match(/@keyframes launchIn\{.*?\}\}/)[0]+css.match(/@keyframes launchOut\{.*?\}\}/)[0];
  assert(!/width|height|top|left/.test(kf),kf);
  assert(css.includes("@media(prefers-reduced-motion:reduce){#launch{display:none}}"));
}),
t("launch removal: own animationend only, 1500ms safety net, immediate under reduced motion",()=>{
  const line=src.split("\n").find(l=>l.startsWith("if(launch)"));
  const run=reduced=>{const timers=[],ls={},el={removed:0,remove(){this.removed++},addEventListener:(t,f)=>ls[t]=f};
    new Function("launch","matchMedia","setTimeout",line)(el,()=>({matches:reduced}),(f,ms)=>timers.push([f,ms]));return{el,ls,timers}};
  const r=run(true);assert.strictEqual(r.el.removed,1);assert.strictEqual(r.timers.length,0);
  const a=run(false);assert.strictEqual(a.el.removed,0);
  a.ls.animationend({target:{}});assert.strictEqual(a.el.removed,0,"child animation must not remove");
  a.ls.animationend({target:a.el});assert.strictEqual(a.el.removed,1);
  assert.strictEqual(a.timers[0][1],1500);
}),
t("cloud.js exposes sync on the bridge; SW cache bumped",()=>{
  assert(/\n\}\nL\.sync=sync;/.test(cloud));assert(sw.includes('const CACHE="lifestyle-v8"'));
}),
];

// ---------- pull to refresh ----------
const i=src.indexOf("const PTR_AT="),j=src.indexOf('document.addEventListener("touchcancel",ptrEnd);',i);
assert(i>0&&j>i,"PTR block missing");const ptrCode=src.slice(i,j)+'document.addEventListener("touchcancel",ptrEnd);';
function load({scrollY=0,online=true,reduced=false,modal=false,menuOpen=false,sync=true}={}){
  const ls={},toasts=[],calls={render:0,sync:0,release:0};let pending=[];
  const cls=()=>{const s=new Set();return{add:c=>s.add(c),remove:c=>s.delete(c),toggle:(c,on)=>on?s.add(c):s.delete(c),contains:c=>s.has(c)}};
  const ptr={style:{},classList:cls(),firstChild:{style:{}}},toastEl={textContent:""},menu={classList:cls()};if(!menuOpen)menu.classList.add("hidden");
  const $=id=>({ptr,toast:toastEl,menuList:menu})[id];
  const window={scrollY,LIFESTYLE:sync?{sync:async()=>{calls.sync++}}:{}};
  const document={addEventListener:(t,f)=>ls[t]=f,querySelector:()=>modal?{}:null};
  const env={$,document,window,navigator:{onLine:online,serviceWorker:{getRegistration:async()=>({update(){}})}},
    matchMedia:()=>({matches:reduced}),toast:s=>{toastEl.textContent=s;toasts.push(s)},render:()=>calls.render++,
    checkRelease:async()=>{calls.release++},setTimeout:f=>pending.push(f)};
  const names=Object.keys(env);new Function(...names,ptrCode+";return refresh")(...names.map(k=>env[k]));
  const target={closest:sel=>null},touch=(x,y)=>({touches:[{clientX:x,clientY:y}],target});
  const api={ls,ptr,toasts,calls,window,
    start:(x=100,y=100,tg=target)=>ls.touchstart({touches:[{clientX:x,clientY:y}],target:tg}),
    move(x,y){const e={...touch(x,y),prevented:false,preventDefault(){this.prevented=true}};ls.touchmove(e);return e},
    end:(type="touchend")=>ls[type]({type,touches:[]}),
    async flush(){for(let k=0;k<5;k++){await new Promise(r=>setImmediate(r));const p=pending;pending=[];p.forEach(f=>f())}}};
  return api;
}
const pullBy=async(a,dy,dx=0)=>{a.start(100,100);a.move(100+dx/2,100+dy/2);const e=a.move(100+dx,100+dy);a.end();await a.flush();return e};

const ptrTests=[
t("pull 120px+ at the top runs one refresh: render, sync, release check, then retracts",async()=>{
  const a=load();const e=await pullBy(a,300);
  assert(e.prevented);assert.strictEqual(a.calls.sync,1);assert.strictEqual(a.calls.release,1);assert.strictEqual(a.calls.render,2);
  assert.deepStrictEqual(a.toasts,["Up to date"]);assert.strictEqual(a.ptr.style.transform,"translateY(0px)");assert(!a.ptr.classList.contains("spin"));
}),
t("rubber band caps the indicator at 120px",()=>{const a=load();a.start();a.move(100,120);a.move(100,600);assert.strictEqual(a.ptr.style.transform,"translateY(120px)")}),
t("pull under 70px snaps back without refreshing",async()=>{const a=load();await pullBy(a,130);assert.strictEqual(a.calls.render,0);assert.strictEqual(a.ptr.style.transform,"translateY(0px)");assert(a.ptr.classList.contains("settle"))}),
t("scrolled 1px down never arms or prevents scroll",async()=>{const a=load({scrollY:1});const e=await pullBy(a,300);assert(!e.prevented);assert.strictEqual(a.calls.render,0)}),
t("horizontal swipe (goal row delete) hands off and is never prevented",async()=>{const a=load();const e=await pullBy(a,40,-200);assert(!e.prevented);assert.strictEqual(a.calls.render,0)}),
t("open modal or open menu does not arm",async()=>{for(const o of[{modal:true},{menuOpen:true}]){const a=load(o);await pullBy(a,300);assert.strictEqual(a.calls.render,0)}}),
t("pull starting in an input does not arm",async()=>{const a=load();a.start(100,100,{closest:s=>s.includes("input")?{}:null});const e=a.move(100,400);a.end();await a.flush();assert(!e.prevented);assert.strictEqual(a.calls.render,0)}),
t("touchcancel past threshold snaps back, no refresh",async()=>{const a=load();a.start();a.move(100,120);a.move(100,400);a.end("touchcancel");await a.flush();assert.strictEqual(a.calls.render,0)}),
t("multi-touch does not arm",()=>{const a=load();a.ls.touchstart({touches:[{},{}],target:{closest:()=>null}});const e=a.move(100,400);assert(!e.prevented)}),
t("two quick pulls run refresh once",async()=>{const a=load();a.start();a.move(100,120);a.move(100,400);a.end();a.start();a.move(100,120);a.move(100,400);a.end();await a.flush();assert.strictEqual(a.calls.sync,1)}),
t("offline: shows saved-data toast, skips sync",async()=>{const a=load({online:false});await pullBy(a,300);assert.strictEqual(a.calls.sync,0);assert.deepStrictEqual(a.toasts,["Offline: showing saved data"])}),
t("signed-out / no bridge: still refreshes without error",async()=>{const a=load({sync:false});await pullBy(a,300);assert.deepStrictEqual(a.toasts,["Up to date"])}),
t("reduced motion: no rotation, no settle transition, toast instead of spinner",async()=>{const a=load({reduced:true});await pullBy(a,300);assert.strictEqual(a.ptr.firstChild.style.transform,undefined);assert(!a.ptr.classList.contains("settle"));assert.strictEqual(a.toasts[0],"Refreshing…")}),
t("refresh never calls location.reload directly",()=>assert(!/location\.reload/.test(ptrCode))),
t("#ptr markup and CSS above the topbar, safe-area aware; overscroll contained",()=>{
  assert(html.includes('<div id="ptr" aria-hidden="true"><i></i></div>'));
  assert(/#ptr\{[^}]*top:calc\(env\(safe-area-inset-top\)[^}]*z-index:40/.test(css));assert(css.includes("html,body{overscroll-behavior-y:contain}"));
}),
];
Promise.all([...launchTests,...ptrTests]).then(()=>{console.log(`\n${n} passed`+(fails.length?`, ${fails.length} failed: ${fails.join("; ")}`:""));if(fails.length)process.exit(1)});
