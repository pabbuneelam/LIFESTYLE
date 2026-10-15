// Run: node tests/hold-reveal.test.js  — drives the real renderGoals()+attachHold() and initReveal() from app.js
// with a tiny fake DOM and a fake clock: tap vs hold vs drag vs cancel, keyboard edit, and the scroll-reveal rules.
const fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};

// ---------- fake clock ----------
function clock(){
  let now=0,id=0;const q=new Map();
  return{
    setTimeout:(f,ms)=>{q.set(++id,{f,at:now+ms});return id},
    clearTimeout:i=>q.delete(i),
    tick(ms){const end=now+ms;for(;;){const due=[...q].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;q.delete(due[0]);now=due[1].at;due[1].f()}now=end}
  };
}
// ---------- fake DOM element ----------
function el(tag="div"){
  const cls=new Set(),ls={},kids=[];
  const e={tagName:tag,dataset:{},style:{setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}},textContent:"",disabled:false,kids,
    classList:{add:(...x)=>x.forEach(c=>cls.add(c)),remove:(...x)=>x.forEach(c=>cls.delete(c)),contains:x=>cls.has(x),toggle:(x,on)=>(on??!cls.has(x))?cls.add(x):cls.delete(x)},
    get className(){return[...cls].join(" ")},set className(v){cls.clear();String(v).split(/\s+/).filter(Boolean).forEach(c=>cls.add(c))},
    _html:"",get innerHTML(){return this._html},set innerHTML(v){this._html=v;kids.length=0},
    insertAdjacentHTML(_,h){this._html+=h},
    append(...c){kids.push(...c)},
    querySelector(s){const c=s.slice(1);if(c==="task-name")return this._name||(this._name=el("span"));return kids.find(k=>k.classList.contains(c))||null},
    addEventListener(t,f,o){(ls[t]||(ls[t]=[])).push({f,once:o&&o.once})},
    dispatch(t,props={}){const ev={type:t,button:0,pointerId:1,clientX:0,clientY:0,shiftKey:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},target:e,...props};
      (ls[t]||[]).slice().forEach(l=>{l.f(ev);if(l.once)ls[t]=ls[t].filter(x=>x!==l)});return ev}
  };
  return e;
}

// ---------- renderGoals + attachHold harness ----------
const goalsCode=cut("function renderGoals","// Swipe a goal away")+cut("// Press and hold a goal","function renderHomeChallenge");
function home({goals,view="2026-10-15",today="2026-10-15",done=[]}){
  const c=clock(),els={},$=id=>els[id]||(els[id]=el()),calls={toggle:[],toast:[],open:[],remove:[],vibrate:0};
  const document={createElement:t=>el(t)};
  const env={$,document,setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,navigator:{vibrate(){calls.vibrate++}},
    state:{swipeTipSeen:false},viewKey:()=>view,today:()=>today,fmtDate:k=>k,addDays:(k,n)=>k,daysBetween:()=>0,MAX_PLAN_DAYS:1,
    goalsOn:()=>goals,CATS:["body","mind"],CATEGORIES:{body:{color:"#f00"},mind:{color:"#0f0"}},isDone:id=>done.includes(id),hex:()=>"",startsLater:g=>!!g.from,
    toggle:id=>calls.toggle.push(id),toast:s=>calls.toast.push(s),removeGoal:id=>calls.remove.push(id),
    openGoal:(cat,rep,g)=>calls.open.push([cat,rep,g&&g.id]),attachSwipe(){}};
  const names=Object.keys(env);
  const api=new Function(...names,goalsCode+";return{renderGoals,attachHold,HOLD_MS,HOLD_SLOP}")(...names.map(k=>env[k]));
  api.renderGoals();
  const rows=$("habitList").kids,card=i=>rows[i].querySelector(".task");
  // A real tap: pointerdown, pointerup, click (the browser's order).
  const press=(i,ms,props={})=>{card(i).dispatch("pointerdown",props);c.tick(ms);card(i).dispatch("pointerup",props)};
  return Object.assign(api,{c,calls,rows,card,press,$});
}
let n=0,fails=[];const t=(name,fn)=>{try{fn();n++;console.log("ok  "+name)}catch(e){fails.push(name);console.log("FAIL "+name+"\n     "+e.message)}};
const G=[{id:"g1",name:"Walk",category:"body",xp:10},{id:"g2",name:"Read",category:"mind",xp:10,date:"2026-10-15"}];

t("constants match the spec (450ms, 8px)",()=>{const a=home({goals:G});assert.strictEqual(a.HOLD_MS,450);assert.strictEqual(a.HOLD_SLOP,8)});
t("tip copy mentions hold to edit",()=>{const a=home({goals:G});assert(a.$("habitList").innerHTML.includes("Tip: swipe a goal left to delete it, or hold to edit."))});
t("quick tap (<450ms) toggles and does not open edit",()=>{
  const a=home({goals:G});a.press(0,200);a.card(0).dispatch("click");
  assert.deepStrictEqual(a.calls.toggle,["g1"]);assert.strictEqual(a.calls.open.length,0);assert(!a.card(0).classList.contains("holding"));
});
t("pointerdown adds .holding feedback, release removes it",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");assert(a.card(0).classList.contains("holding"));
  a.card(0).dispatch("pointerup");assert(!a.card(0).classList.contains("holding"));
});
t("hold 450ms opens edit with that goal (category, repeat=!date, goal) and vibrates",()=>{
  const a=home({goals:G});a.card(1).dispatch("pointerdown");a.c.tick(450);
  assert.deepStrictEqual(a.calls.open,[["mind",false,"g2"]]);assert.strictEqual(a.calls.vibrate,1);assert(!a.card(1).classList.contains("holding"));
});
t("hold then immediate release does not toggle or delete",()=>{
  const a=home({goals:G});a.press(0,460);a.card(0).dispatch("click");
  assert.strictEqual(a.calls.open.length,1);assert.deepStrictEqual(a.calls.toggle,[]);assert.deepStrictEqual(a.calls.remove,[]);
});
// Prove-It: the click-swallow flag expires 300ms after the hold fires, so a finger kept down a little longer
// (release ~0.8s after touching) gets its click through and the goal toggles. iOS Safari dispatches that click
// to the pressed element (touch pointers are implicitly captured), so a normal long-press checks the goal off.
t("BUG: hold kept down past ~750ms then release still must not toggle",()=>{
  const a=home({goals:G});a.press(0,800);a.card(0).dispatch("click");
  assert.strictEqual(a.calls.open.length,1);
  assert.deepStrictEqual(a.calls.toggle,[],"goal was toggled by the click after a long hold");
});
t("hold on a future-day (locked) row opens edit and shows no Locked toast",()=>{
  const a=home({goals:G,view:"2026-10-16"});a.press(0,500);a.card(0).dispatch("click");
  assert.strictEqual(a.calls.open.length,1);assert.deepStrictEqual(a.calls.toast,[]);
});
t("drag past 8px (horizontal) cancels the hold",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");a.card(0).dispatch("pointermove",{clientX:-9});a.c.tick(600);
  assert.strictEqual(a.calls.open.length,0);assert(!a.card(0).classList.contains("holding"));
});
t("vertical scroll (9px) cancels the hold",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");a.card(0).dispatch("pointermove",{clientY:9});a.c.tick(600);
  assert.strictEqual(a.calls.open.length,0);
});
t("small jitter within 8px keeps the hold",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");a.card(0).dispatch("pointermove",{clientX:8,clientY:-8});a.c.tick(450);
  assert.strictEqual(a.calls.open.length,1);
});
t("move from another pointer id does not cancel",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");a.card(0).dispatch("pointermove",{pointerId:2,clientX:50});a.c.tick(450);
  assert.strictEqual(a.calls.open.length,1);
});
t("row entering .swiping cancels the hold",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");a.rows[0].classList.add("swiping");a.card(0).dispatch("pointermove",{clientX:1});a.c.tick(600);
  assert.strictEqual(a.calls.open.length,0);
});
for(const ev of["pointercancel","pointerleave","pointerup"])t(ev+" mid-hold cancels",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");a.c.tick(300);a.card(0).dispatch(ev);a.c.tick(500);
  assert.strictEqual(a.calls.open.length,0);assert(!a.card(0).classList.contains("holding"));
});
t("hold during .removing animation is ignored",()=>{
  const a=home({goals:G});a.rows[0].classList.add("removing");a.card(0).dispatch("pointerdown");a.c.tick(600);
  assert.strictEqual(a.calls.open.length,0);assert(!a.card(0).classList.contains("holding"));
});
t("non-primary (right) button never starts a hold",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown",{button:2});a.c.tick(600);assert.strictEqual(a.calls.open.length,0);
});
t("second pointerdown restarts the timer (no double open)",()=>{
  const a=home({goals:G});a.card(0).dispatch("pointerdown");a.c.tick(300);a.card(0).dispatch("pointerdown");a.c.tick(300);
  assert.strictEqual(a.calls.open.length,0);a.c.tick(150);assert.strictEqual(a.calls.open.length,1);
});
t("contextmenu is prevented on the task",()=>{const a=home({goals:G});assert(a.card(0).dispatch("contextmenu").defaultPrevented)});
t("keyboard: e, E and Shift+Enter open edit; plain Enter/Space do not",()=>{
  const a=home({goals:G});
  for(const k of[{key:"e"},{key:"E"},{key:"Enter",shiftKey:true}])assert(a.card(0).dispatch("keydown",k).defaultPrevented);
  assert.strictEqual(a.calls.open.length,3);
  for(const k of[{key:"Enter"},{key:" "}])assert(!a.card(0).dispatch("keydown",k).defaultPrevented);
  assert.strictEqual(a.calls.open.length,3);
});
t("swiped flag is cleaned up after a hold (no stuck swallow for the next tap)",()=>{
  const a=home({goals:G});a.press(0,460);a.c.tick(400);assert.strictEqual(a.rows[0].dataset.swiped,undefined);
  a.press(0,100);a.card(0).dispatch("click");assert.deepStrictEqual(a.calls.toggle,["g1"]);
});

// ---------- initReveal harness ----------
const revealCode=cut("function initReveal","updateTimer();render();");
function reveal({reduced=false,io=true}={}){
  const c=clock(),observed=new Set();let cb=null;
  const mkPage=(id,active,{panels=2,stats=0,lab=[]}={})=>{
    const p=el("section");p.id=id;p.className="page"+(active?" active":"");
    p.panels=Array.from({length:panels},()=>{const x=el("section");x.className="panel";return x});
    p.stats=Array.from({length:stats},()=>{const x=el("article");x.className="stat";return x});
    p.labs=lab.map(k=>Array.from({length:k},()=>{const x=el("section");x.className="panel";return x}));
    p.task=el("button");p.task.className="task"; // must never be tagged
    p.querySelectorAll=s=>s===":scope > .panel"?p.panels:s===".stats > *"?p.stats:s===":scope > .lab-tab"?p.labs.map(ps=>({querySelectorAll:()=>ps})):[];
    return p;
  };
  const pages=[mkPage("home",true,{panels:6,stats:3}),mkPage("lab",false,{panels:0,lab:[3,2]})];
  const all=()=>pages.flatMap(p=>[...p.panels,...p.stats,...p.labs.flat()]);
  const document={querySelectorAll:s=>s===".page"?pages:s===".page.active .rv:not(.rv-in)"?pages.filter(p=>p.classList.contains("active")).flatMap(p=>[...p.panels,...p.stats,...p.labs.flat()]).filter(e=>e.classList.contains("rv")&&!e.classList.contains("rv-in")):[]};
  function IO(f,opts){cb=f;this.opts=opts;this.observe=e=>observed.add(e);this.unobserve=e=>observed.delete(e);IO.last=this}
  const window=io?{IntersectionObserver:IO}:{};
  const fn=new Function("document","window","IntersectionObserver","matchMedia","setTimeout",revealCode+";return initReveal")(document,window,IO,()=>({matches:reduced}),c.setTimeout);
  fn();
  return{c,pages,all,observed,fire:(es)=>cb(es.map(([target,isIntersecting])=>({target,isIntersecting}))),IO};
}
t("reduced motion: no element gets .rv, nothing observed",()=>{const r=reveal({reduced:true});assert(r.all().every(e=>!e.classList.contains("rv")));assert.strictEqual(r.observed.size,0)});
t("no IntersectionObserver: no element gets .rv (content stays visible)",()=>{const r=reveal({io:false});assert(r.all().every(e=>!e.classList.contains("rv")))});
t("panels, stat cards and Lab tab panels get .rv and are observed; task rows are not",()=>{
  const r=reveal();assert(r.all().every(e=>e.classList.contains("rv")&&r.observed.has(e)));
  assert(r.pages.every(p=>!p.task.classList.contains("rv")));assert.strictEqual(r.observed.size,6+3+5);
});
t("observer options match spec (threshold .12, rootMargin -6% bottom)",()=>{
  const r=reveal();assert.strictEqual(r.IO.last.opts.threshold,.12);assert.strictEqual(r.IO.last.opts.rootMargin,"0px 0px -6% 0px");
});
t("stagger is min(index,4)*40ms per set",()=>{
  const r=reveal(),h=r.pages[0];
  assert.deepStrictEqual(h.panels.map(e=>e.style["--rv-d"]),["0ms","40ms","80ms","120ms","160ms","160ms"]);
  assert.deepStrictEqual(h.stats.map(e=>e.style["--rv-d"]),["0ms","40ms","80ms"]);
  assert.deepStrictEqual(r.pages[1].labs[1].map(e=>e.style["--rv-d"]),["0ms","40ms"]);
});
t("intersecting adds .rv-in once and unobserves; non-intersecting stays hidden",()=>{
  const r=reveal(),[a,b]=r.pages[0].panels;r.fire([[a,true],[b,false]]);
  assert(a.classList.contains("rv-in")&&!r.observed.has(a));assert(!b.classList.contains("rv-in")&&r.observed.has(b));
});
t("transitionend drops the stagger delay",()=>{const r=reveal(),a=r.pages[0].panels[1];a.dispatch("transitionend");assert.strictEqual(a.style["--rv-d"],undefined)});
t("1.5s safety net reveals everything left on the active page only",()=>{
  const r=reveal();r.c.tick(1499);assert(!r.pages[0].panels[5].classList.contains("rv-in"));r.c.tick(1);
  assert([...r.pages[0].panels,...r.pages[0].stats].every(e=>e.classList.contains("rv-in")));
  assert(r.pages[1].labs.flat().every(e=>!e.classList.contains("rv-in"))); // hidden page waits for its own observer
});

// ---------- CSS / service worker guards ----------
const css=fs.readFileSync(path.join(__dirname,"..","style.css"),"utf8"),sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
t("reduced motion CSS disables reveal, hold scale and page swap",()=>{
  assert(/@media\(prefers-reduced-motion:reduce\)\{\.rv,\.rv-in\{opacity:1;transform:none;transition:none\}\.task\.holding\{transform:none;transition:none\}\}/.test(css));
  assert(/@media\(prefers-reduced-motion:reduce\)\{\.page\.entering\{animation:none\}\}/.test(css));
});
t("page swap only animates opacity/transform, no first-load pageIn on .page.active",()=>{
  assert(/\.page\.active\{display:block\}/.test(css));assert(/@keyframes pageSwap\{from\{opacity:0;transform:[^}]*\}to\{opacity:1;transform:none\}\}/.test(css));
});
t("sw cache bumped to lifestyle-v4 and activate deletes other caches",()=>{
  assert(sw.includes('const CACHE="lifestyle-v4"'));assert(sw.includes("keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))"));
});

// ---------- startup wiring / nav call sites ----------
t("startup calls initReveal then sets navReady, and animationend only clears on the page itself",()=>{
  assert(src.includes("checkStepReturn();initReveal();navReady=true;"));
  const line=src.split("\n").find(l=>l.includes('addEventListener("animationend"'));
  const p=el("section");p.classList.add("entering");const child=el();
  new Function("document",line)({querySelectorAll:()=>[p]});
  p.dispatch("animationend",{target:child});assert(p.classList.contains("entering"),"child animation must not clear");
  p.dispatch("animationend",{target:p});assert(!p.classList.contains("entering"));
});
t("modal is not inside any .page (fixed positioning unaffected by page/panel transforms)",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),i=html.indexOf('id="goalModal"');
  const before=html.slice(0,i),open=(before.match(/<section[^>]*class="page/g)||[]).length,closed=(before.match(/<\/section>/g)||[]).length;
  assert(i>0&&closed>=open,"goalModal appears inside a section");
  assert(html.includes('id="goalLabel"')&&html.includes('id="goalTitle"'));
});

console.log(n+" passed"+(fails.length?", "+fails.length+" failed: "+fails.join(" | "):""));
if(fails.length)process.exit(1);
