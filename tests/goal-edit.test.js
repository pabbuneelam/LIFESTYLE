// Run: node tests/goal-edit.test.js  — checks editing a goal in place via openGoal(…,goal) + addGoal() in app.js.
const fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const code=cut("let editingId=","// Show a few ideas");

function load(goals,{done=[],xp=100,view="2026-10-15"}={}){
  const els={},$=id=>els[id]||(els[id]={value:"",textContent:"",innerHTML:"",checked:false,classList:{add(){},remove(){}},focus(){}});
  const toasts=[],state={goals,xp,log:{"2026-10-15":done}};
  const env={$,state,toasts,
    today:()=>"2026-10-15",viewKey:()=>view,fmtDate:k=>k,CATS:["body","mind"],CATEGORIES:{body:{name:"Body",icon:""},mind:{name:"Mind",icon:""}},
    syncGoalArea(){},autoDifficulty(){},render(){},toast:s=>toasts.push(s),uid:()=>"new"+goals.length,
    active:()=>state.goals.filter(g=>!g.archived),isDone:id=>done.includes(id),
    estimateDifficulty:n=>n.includes("hard")?3:1,xpForDiff:d=>d*10};
  const names=Object.keys(env).filter(k=>k!=="toasts");
  const api=new Function(...names,code+";return{openGoal,addGoal,closeGoal,get editingId(){return editingId}}")(...names.map(k=>env[k]));
  return Object.assign(api,{$,state,toasts});
}
let n=0;const t=(name,fn)=>{fn();n++;console.log("ok  "+name)};

t("edit prefills and switches copy",()=>{
  const a=load([{id:"g1",name:"Walk",category:"mind",xp:10}]);
  a.openGoal("mind",true,a.state.goals[0]);
  assert.strictEqual(a.editingId,"g1");assert.strictEqual(a.$("goalInput").value,"Walk");
  assert.strictEqual(a.$("goalCategory").value,"mind");assert.strictEqual(a.$("goalRepeat").checked,true);
  assert.deepStrictEqual([a.$("goalLabel").textContent,a.$("goalTitle").textContent,a.$("saveGoal").textContent],["EDIT GOAL","Edit goal","Save changes"]);
});
t("save updates in place: name, category, xp, same id, same length",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10}]);
  a.openGoal("body",true,a.state.goals[0]);a.$("goalInput").value="hard run";a.$("goalCategory").value="mind";a.addGoal();
  assert.strictEqual(a.state.goals.length,1);
  assert.deepStrictEqual(a.state.goals[0],{id:"g1",name:"hard run",category:"mind",xp:30});
  assert.strictEqual(a.editingId,null);assert.deepStrictEqual(a.toasts,["Goal updated."]);
});
t("done today: total XP follows the new xp",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10}],{done:["g1"],xp:100});
  a.openGoal("body",true,a.state.goals[0]);a.$("goalInput").value="hard run";a.addGoal();
  assert.strictEqual(a.state.xp,120);
});
t("empty name keeps modal in edit mode",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10}]);
  a.openGoal("body",true,a.state.goals[0]);a.$("goalInput").value="  ";a.addGoal();
  assert.deepStrictEqual(a.toasts,["Enter a goal first."]);assert.strictEqual(a.editingId,"g1");assert.strictEqual(a.state.goals[0].name,"Walk");
});
t("goal deleted meanwhile: graceful message, nothing added",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10}]);
  a.openGoal("body",true,a.state.goals[0]);a.state.goals[0].archived=true;a.addGoal();
  assert.deepStrictEqual(a.toasts,["That goal no longer exists."]);assert.strictEqual(a.state.goals.length,1);assert.strictEqual(a.editingId,null);
});
t("repeat off on a from-goal: date from `from`, from removed",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10,from:"2026-10-16"}]);
  a.openGoal("body",true,a.state.goals[0]);a.$("goalRepeat").checked=false;a.addGoal();
  assert.strictEqual(a.state.goals[0].date,"2026-10-16");assert(!("from"in a.state.goals[0]));
});
t("repeat on on a date-goal: date removed",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10,date:"2026-10-15"}]);
  a.openGoal("body",false,a.state.goals[0]);assert.strictEqual(a.$("goalRepeat").checked,false);
  a.$("goalRepeat").checked=true;a.addGoal();assert(!("date"in a.state.goals[0]));
});
t("repeat off on a plain daily goal: dated to the viewed day",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10}]);
  a.openGoal("body",true,a.state.goals[0]);a.$("goalRepeat").checked=false;a.addGoal();
  assert.strictEqual(a.state.goals[0].date,"2026-10-15");
});
t("close resets; next add opens blank and adds a new goal",()=>{
  const a=load([{id:"g1",name:"Walk",category:"body",xp:10}]);
  a.openGoal("body",true,a.state.goals[0]);a.closeGoal();assert.strictEqual(a.editingId,null);
  a.openGoal();assert.strictEqual(a.$("goalInput").value,"");
  assert.deepStrictEqual([a.$("goalLabel").textContent,a.$("goalTitle").textContent,a.$("saveGoal").textContent],["NEW GOAL","Add a goal","Add goal"]);
  a.$("goalInput").value="Read";a.addGoal();assert.strictEqual(a.state.goals.length,2);assert.strictEqual(a.state.goals[0].name,"Walk");
});
console.log(n+" passed");
