// Run: node tests/plan-window.test.js  — checks the Home planning window (today + MAX_PLAN_DAYS) in app.js.
const fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const code=[cut("const pad=","function weekStart"),cut("function weekStart","\n"),cut("let viewDay=","function catDoneOn"),cut("function renderWeek","function renderGoals")].join("\n");

// Load the real functions with a frozen clock and a tiny fake DOM.
function load(now,goals=[]){
  const Real=Date;
  class FakeDate extends Real{constructor(...a){a.length?super(...a):super(now+"T09:00:00")}}
  const strip={innerHTML:"",querySelectorAll:()=>[]};
  const $=()=>strip,state={history:{},goals},active=()=>goals;
  const api=new Function("Date","$","state","active","renderGoals",code+";return{today,addDays,daysBetween,weekStart,viewKey,setViewDay,renderWeek,MAX_PLAN_DAYS,get viewDay(){return viewDay}}")(FakeDate,$,state,active,()=>{});
  api.strip=strip;return api;
}
const days=html=>[...html.matchAll(/data-day="([^"]+)"/g)].map(m=>m[1]);
let n=0;const t=(name,fn)=>{fn();n++;console.log("ok  "+name)};

t("window is one day",()=>assert.strictEqual(load("2026-10-14").MAX_PLAN_DAYS,1));
t("next disabled only on tomorrow, prev only on today",()=>{
  const a=load("2026-10-14"),T=a.today(),tm=a.addDays(T,1);
  assert.strictEqual(a.daysBetween(T,T)>=a.MAX_PLAN_DAYS,false); // nextDay enabled today
  assert.strictEqual(a.daysBetween(T,tm)>=a.MAX_PLAN_DAYS,true); // nextDay disabled tomorrow
});
t("setViewDay clamps far future to tomorrow",()=>{
  const a=load("2026-10-14");a.setViewDay(a.addDays(a.today(),5));
  assert.strictEqual(a.viewKey(),"2026-10-15");
});
t("setViewDay tomorrow / today / past",()=>{
  const a=load("2026-10-14");
  a.setViewDay("2026-10-15");assert.strictEqual(a.viewKey(),"2026-10-15");
  a.setViewDay("2026-10-14");assert.strictEqual(a.viewDay,null);assert.strictEqual(a.viewKey(),"2026-10-14");
  a.setViewDay("2026-10-10");assert.strictEqual(a.viewDay,null);
});
t("week strip: only today and tomorrow tappable (Wed)",()=>{
  const a=load("2026-10-14",[{id:"x",date:"2026-10-17"},{id:"y",date:"2026-10-15"}]);a.renderWeek();
  assert.deepStrictEqual(days(a.strip.innerHTML),["2026-10-14","2026-10-15"]);
  const divs=a.strip.innerHTML.match(/<div class="wk future[^"]*"/g);
  assert.strictEqual(divs.length,3); // Fri 16 .. Sun 18 dimmed, non-interactive
  assert(divs.every(d=>!d.includes("planned")),"out-of-window day shows planned dot");
  assert(/<button class="wk future[^"]* planned"/.test(a.strip.innerHTML),"tomorrow planned dot missing");
});
t("Saturday: tomorrow (Sunday) is in the strip",()=>{
  const a=load("2026-10-17");a.renderWeek();assert.deepStrictEqual(days(a.strip.innerHTML),["2026-10-17","2026-10-18"]);
});
t("Sunday: tomorrow is outside the Mon-Sun strip, next button still reaches it",()=>{
  const a=load("2026-10-18");a.renderWeek();assert.deepStrictEqual(days(a.strip.innerHTML),["2026-10-18"]);
  a.setViewDay(a.addDays(a.viewKey(),1));assert.strictEqual(a.viewKey(),"2026-10-19");
  a.setViewDay(a.addDays(a.viewKey(),1));assert.strictEqual(a.viewKey(),"2026-10-19"); // clamped
});
t("year boundary Dec 31 -> Jan 1",()=>{
  const a=load("2026-12-31");a.setViewDay("2027-01-09");assert.strictEqual(a.viewKey(),"2027-01-01");
});
t("DST boundaries",()=>{
  for(const d of ["2026-03-07","2026-03-08","2026-10-31","2026-11-01","2026-03-28","2026-03-29","2026-10-24","2026-10-25"]){
    const a=load(d);a.setViewDay(a.addDays(d,3));
    assert.strictEqual(a.daysBetween(d,a.viewKey()),1,d);
  }
});
t("midnight rollover with tomorrow selected",()=>{
  const a=load("2026-10-14");a.setViewDay("2026-10-15");
  const b=load("2026-10-15");// same stored viewDay seen after midnight: viewKey falls back to today
  assert.strictEqual(new Function("viewDay","today","return viewDay&&viewDay>today()?viewDay:today()")(a.viewDay,b.today),"2026-10-15");
});
t("far-future goals are not mutated by rendering",()=>{
  const goals=[{id:"a",date:"2026-10-19"},{id:"b",from:"2026-10-19",skip:["2026-10-25"]}],snap=JSON.stringify(goals);
  const a=load("2026-10-14",goals);a.renderWeek();a.setViewDay("2026-10-19");a.renderWeek();
  assert.strictEqual(JSON.stringify(goals),snap);
});
t("removing a daily goal on tomorrow skips only tomorrow",()=>{
  const g={id:"d",name:"Run",from:"2026-10-01"},rm=cut("function removeGoal","\n  if(isDone");
  let undo=null;const a=load("2026-10-14");
  const state={goals:[g]};new Function("state","today","goalById","render","showUndo","fmtDate",rm+"\n}return removeGoal")(state,a.today,()=>g,()=>{},(m,s)=>undo=s,()=>"Thursday")("d","2026-10-15");
  assert.deepStrictEqual(g.skip,["2026-10-15"]);assert.strictEqual(JSON.parse(undo).goals[0].skip,undefined); // undo snapshot predates the skip
});
console.log(`\n${n} passed`);
