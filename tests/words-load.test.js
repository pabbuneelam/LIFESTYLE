// Run: node tests/words-load.test.js — word-list loading, 0-XP readers (migrate, toggle), SW precache,
// real dictionary words that must never be rated "Can't rate", and the licence notice for the shipped list.
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,".."),src=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const WORDS=new Set(fs.readFileSync(path.join(root,"words.txt"),"utf8").split(/\s+/));
let n=0,fails=0;const tests=[];const t=(name,fn)=>tests.push([name,fn]);

// loadWords(), sliced with its own listText so the fetch and the modal can be stubbed.
function loader(fetchImpl,modalOpen){
  const calls={auto:0,urls:[]};
  const $=()=>({classList:{contains:c=>c==="hidden"?!modalOpen:false}});
  const api=new Function("fetch","$","autoDifficulty","const listText={};"+cut("function loadWords(","\n")+";return{loadWords,listText}")(u=>{calls.urls.push(u);return fetchImpl(u)},$,()=>calls.auto++);
  return Object.assign(api,{calls});
}
const flush=()=>new Promise(r=>setTimeout(r,0));
const okFetch=u=>Promise.resolve({ok:true,text:()=>Promise.resolve(u.includes("actions")?"run\n":"run\nwalk\n")});

t("loadWords: before load nothing is stored",async()=>{const a=loader(okFetch,false);assert.deepStrictEqual(a.listText,{})});
t("loadWords: fetches words.txt and actions.txt and stores the raw text, closed modal is not re-rated",async()=>{
  const a=loader(okFetch,false);a.loadWords();await flush();await flush();
  assert.deepStrictEqual(a.calls.urls,["./words.txt","./actions.txt"]);
  assert.strictEqual(a.listText.words,"run\nwalk\n");assert.strictEqual(a.listText.actions,"run\n");assert.strictEqual(a.calls.auto,0);
});
t("loadWords: with the goal modal open each arriving list re-rates the field",async()=>{
  const a=loader(okFetch,true);a.loadWords();await flush();await flush();assert.strictEqual(a.calls.auto,2);
});
t("loadWords: network failure stores nothing, no throw",async()=>{
  const a=loader(()=>Promise.reject(new TypeError("offline")),true);a.loadWords();await flush();await flush();
  assert.deepStrictEqual(a.listText,{});assert.strictEqual(a.calls.auto,0);
});
t("loadWords: HTTP 404 stores nothing",async()=>{
  const a=loader(()=>Promise.resolve({ok:false,text:()=>Promise.resolve("<html>")}),true);a.loadWords();await flush();await flush();
  assert.deepStrictEqual(a.listText,{});
});
t("loadWords: one list failing keeps the other",async()=>{
  const a=loader(u=>u.includes("actions")?Promise.reject(new Error("x")):okFetch(u),false);a.loadWords();await flush();await flush();
  assert.strictEqual(a.listText.words,"run\nwalk\n");assert(!("actions" in a.listText));
});
t("loadWords is scheduled after first render (not awaited)",async()=>{
  const i=src.indexOf("updateTimer();render();"),j=src.indexOf("(window.requestIdleCallback||setTimeout)(loadWords)");
  assert(i>=0&&j>i,"loadWords must be scheduled after the startup render()");
});
t("sw.js precaches words.txt and actions.txt in the v8 cache",async()=>{
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  assert(/CACHE="lifestyle-v8"/.test(sw));assert(/ASSETS=\[[^\]]*"\.\/words\.txt"/.test(sw));assert(/ASSETS=\[[^\]]*"\.\/actions\.txt"/.test(sw));
});

// migrate(): a stored xp of 0 must stay 0; a missing xp still defaults to 10.
t("migrate keeps xp 0 and defaults missing xp to 10",async()=>{
  const migrate=new Function("fresh","uid","CATEGORIES","today",cut("function migrate(","function load(")+";return migrate")(
    ()=>({goals:[],log:{},xp:0,bestStreak:0,history:{},journal:{}}),()=>"u",{body:{}},()=>"2026-10-18");
  const s=migrate({goals:[{id:"a",name:"asdf",category:"body",xp:0},{id:"b",name:"run",category:"body"}],xp:50});
  assert.strictEqual(s.goals[0].xp,0);assert.strictEqual(s.goals[1].xp,10);
});

// toggle(): checking/unchecking a 0-XP goal leaves total XP alone and never toasts "+0 XP".
function toggler(goal,xp=100){
  const toasts=[],state={xp,log:{},history:{}};
  const toggle=new Function("goalById","today","fmtDate","state","gainXP","CATEGORIES","syncToday","toast","streak","render",
    cut("function toggle(","\n}\n")+"\n}\nreturn toggle")(id=>id===goal.id?goal:null,()=>"2026-10-18",k=>k,state,
    (d,msg)=>{state.xp=Math.max(0,state.xp+d);if(msg)toasts.push(msg)},{body:{name:"Body"}},()=>{},s=>toasts.push(s),()=>1,()=>{});
  return{toggle,state,toasts};
}
t("toggle 0-XP goal: check then uncheck, total XP unchanged, toast says Done",async()=>{
  const a=toggler({id:"g",name:"asdf",category:"body",xp:0});
  a.toggle("g");assert.strictEqual(a.state.xp,100);assert.strictEqual(a.toasts[0],"Done · Body");
  a.toggle("g");assert.strictEqual(a.state.xp,100);assert(!a.toasts.some(s=>/\+0 XP/.test(s)),a.toasts.join("|"));
});
t("toggle normal goal: toast still shows +XP",async()=>{
  const a=toggler({id:"g",name:"run",category:"body",xp:20});a.toggle("g");
  assert.strictEqual(a.state.xp,120);assert.strictEqual(a.toasts[0],"+20 XP · Body");
});

// Prove-It: real, defined English words people type as goals are recognised as words (Round 3: on their own they are
// still not a task, so estimateDifficulty rates them 0; that is covered in words.test.js).
const api=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,hasRealWord,setWords:w=>{WORDS=w}}")();
api.setWords(WORDS);
t("real dictionary words used as goals are recognised",async()=>{
  const real=["Hydrate","Crochet","Affirmations","Water houseplants","Journalling","Kettlebell swings","Dumbbell curls","Kayak",
    "Snowboard","Wellbeing","Moisturise","Exfoliate","Proofread","Annotate","Memorise vocab","Breathwork","Stargazing","Creatine"];
  const rejected=real.filter(g=>!api.hasRealWord(g));
  assert.deepStrictEqual(rejected,[],"not recognised: "+rejected.join(", "));
});

// words.txt is generated from SCOWL/ESDB, whose licence requires its copyright + permission notice to ship with the list.
t("SCOWL/ESDB licence notice ships with words.txt",async()=>{
  const s=fs.readFileSync(path.join(root,"words-NOTICE.txt"),"utf8");
  assert(/Copyright 2000-\d+ by Kevin Atkinson/.test(s)&&/Permission to use, copy, modify, distribute/.test(s)&&/words\.txt/.test(s));
  assert(/ESDB_REV="1e5b7d3"/.test(fs.readFileSync(path.join(root,"tools","build-words.js"),"utf8")),"generator must pin the source revision");
});

// actions.txt is built from WordNet 3.0, whose licence requires its copyright notice on all copies.
t("WordNet licence notice ships with actions.txt",async()=>{
  const s=fs.readFileSync(path.join(root,"actions-NOTICE.txt"),"utf8");
  assert(/WordNet 3\.0 Copyright 2006 by Princeton University/.test(s)&&/Permission to use, copy, modify and distribute/.test(s)&&/actions\.txt/.test(s));
  assert(/SHA256="[0-9a-f]{64}"/.test(fs.readFileSync(path.join(root,"tools","build-actions.js"),"utf8")),"generator must pin the download");
});

(async()=>{
  for(const[name,fn]of tests){try{await fn();n++;console.log("ok  "+name)}catch(e){fails++;console.log("FAIL "+name+"\n     "+e.message)}}
  console.log(n+" passed, "+fails+" failed");process.exit(fails?1:0);
})();
