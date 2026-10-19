// Run: node tests/stat-score.test.js  — statScore(): an uncompleted day must never raise an area's score.
const fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const i=src.indexOf("function statScore("),j=src.indexOf("\n// Overall rating",i);assert(i>=0&&j>i,"missing statScore");
const code=src.slice(i,j);
const ds=d=>d.toISOString().slice(0,10),addDays=(k,n)=>{const d=new Date(k+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return ds(d)};
// sched: {day:count of "a" goals scheduled}, done: {day:count completed}. Goals are uniquely id'd per day.
function score(sched,done,asOf,first){
  const state={log:{},firstDay:first};
  Object.entries(done).forEach(([k,n])=>state.log[k]=Array.from({length:n},(_,x)=>k+":"+x));
  const goalsOn=k=>Array.from({length:sched[k]||0},()=>({category:"a"}));
  const catDoneOn=(c,k)=>c==="a"?(state.log[k]||[]).length:0;
  const catLifetime=(c,until)=>Object.keys(state.log).filter(k=>!until||k<=until).reduce((n,k)=>n+catDoneOn(c,k),0);
  const fn=new Function("state","goalsOn","catDoneOn","catLifetime","addDays","createdDay","today",code+";return statScore")(state,goalsOn,catDoneOn,catLifetime,addDays,()=>"0000-00-00",()=>asOf);
  return fn("a",asOf);
}
let n=0;const t=(name,f)=>{f();n++;console.log("ok  "+name)};
const D1="2026-10-01",D2="2026-10-02",D3="2026-10-03";

t("(a) a missed 1-goal day after a 3/3 day does not raise the score",()=>{
  // Also a longer run (10 perfect days of 3, then misses of 1), where rounding cannot hide the rise.
  const before=score({[D1]:3},{[D1]:3},D2,D1); // asOf D2 = today, nothing owed yet
  const after=score({[D1]:3,[D2]:1},{[D1]:3},D3,D1);
  assert(after<=before,`after ${after} > before ${before}`);
  const sched={},done={};for(let k=0;k<10;k++){const d=addDays(D1,k);sched[d]=3;done[d]=3}
  const b=score(sched,done,addDays(D1,10),D1);
  for(let k=10;k<16;k++)sched[addDays(D1,k)]=1;
  const a=score(sched,done,addDays(D1,16),D1);
  assert(a<=b,`after misses ${a} > before ${b}`);
});
t("(b) many missed days never raise the score",()=>{
  const sched={[D1]:2},done={[D1]:2};let prev=score(sched,done,D2,D1);
  for(let k=1;k<40;k++){const d=addDays(D1,k);sched[d]=1;const s=score(sched,done,addDays(d,1),D1);assert(s<=prev,`day ${k}: ${s} > ${prev}`);prev=s}
});
t("(c) a full perfect 30-day month scores 100 with enough lifetime",()=>{
  const sched={},done={};for(let k=0;k<30;k++){const d=addDays(D1,k);sched[d]=10;done[d]=10}
  assert.strictEqual(score(sched,done,addDays(D1,29),D1),100);
});
t("(d) today's unfinished goals don't change the score",()=>{
  const a=score({[D1]:2},{[D1]:2},D2,D1),b=score({[D1]:2,[D2]:5},{[D1]:2},D2,D1);
  assert.strictEqual(a,b);
});
t("(e) area with no goals or completions scores 0",()=>assert.strictEqual(score({},{},D2,D1),0));
t("source: ramp counts only days with completions",()=>assert(/if\(d\)days\+\+/.test(code)));
console.log(`\n${n} passed`);
