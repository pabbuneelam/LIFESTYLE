// Run: node tests/nav-transition.test.js  — checks nav() plays the page-switch animation only after startup and only on a real change.
const fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const code=cut("let navReady=","\n  checkStepReturn();\n}")+"}";

function load(){
  const mk=id=>{const c=new Set(id==="home"?["active"]:[]);return{id,offsetWidth:1,classList:{add:x=>c.add(x),remove:x=>c.delete(x),contains:x=>c.has(x),toggle:(x,on)=>on?c.add(x):c.delete(x)},has:x=>c.has(x)}};
  const pages=["home","program","lab"].map(mk),by=Object.fromEntries(pages.map(p=>[p.id,p]));
  const document={querySelectorAll:s=>s===".page"?pages:[],querySelector:()=>pages.find(p=>p.has("active"))};
  const $=id=>by[id]||{textContent:""},noop=()=>{};
  const api=new Function("document","$","window","setMenu","PAGE_NAMES","renderProgram","renderChallenges","renderProgress","renderLab","renderProfile","checkStepReturn",
    code+";return{nav,ready(){navReady=true}}")(document,$,{scrollTo:noop},noop,{},noop,noop,noop,noop,noop,noop);
  return Object.assign(api,{by});
}
let n=0;const t=(name,fn)=>{fn();n++;console.log("ok  "+name)};

t("no animation before startup finishes (first load / deep link)",()=>{
  const a=load();a.nav("lab");assert(a.by.lab.has("active"));assert(!a.by.lab.has("entering"));
});
t("switching after startup animates only the incoming page",()=>{
  const a=load();a.ready();a.nav("program");
  assert(a.by.program.has("active")&&a.by.program.has("entering"));assert(!a.by.home.has("active")&&!a.by.home.has("entering"));
});
t("re-selecting the current page does not animate",()=>{
  const a=load();a.ready();a.nav("home");assert(!a.by.home.has("entering"));
});
t("rapid taps leave exactly one active page and no stale entering class",()=>{
  const a=load();a.ready();a.nav("program");a.nav("lab");a.nav("home");
  assert.deepStrictEqual(Object.values(a.by).filter(p=>p.has("active")).map(p=>p.id),["home"]);
  assert.deepStrictEqual(Object.values(a.by).filter(p=>p.has("entering")).map(p=>p.id),["home"]);
});
console.log(n+" passed");
