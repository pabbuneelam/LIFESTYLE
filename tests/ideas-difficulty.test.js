// Run: node tests/ideas-difficulty.test.js — every built-in idea sits under its intended difficulty (1 Easy, 2 Medium,
// 3 Hard) and estimateDifficulty() agrees, so the badge on an idea matches the XP the goal gets once it is added.
const fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const cut=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b));
const api=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,setLists:(w,a)=>{WORDS=w;ACTIONS=a}}")();
const list=f=>new Set(fs.readFileSync(path.join(__dirname,"..",f),"utf8").split(/\s+/));
api.setLists(list("words.txt"),list("actions.txt"));
const CATEGORIES=new Function(cut("const CATEGORIES=","const CATS=")+";return CATEGORIES")();
const L=["","Easy","Medium","Hard"];let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log("ok  "+name)}catch(e){failed++;console.log("FAIL "+name+"\n     "+e.message.split("\n").join("\n     "))}};
for(const[c,cat]of Object.entries(CATEGORIES)){
  test(`${c}: ideas are grouped as Easy/Medium/Hard with at least 12 of each`,()=>{
    assert.deepStrictEqual(Object.keys(cat.ideas),["1","2","3"]);
    for(const d of[1,2,3])assert(cat.ideas[d].length>=12,`${L[d]} has only ${cat.ideas[d].length}`);
  });
  test(`${c}: estimateDifficulty matches each idea's assigned level`,()=>{
    const wrong=[];
    for(const d of[1,2,3])for(const x of cat.ideas[d]){const g=api.estimateDifficulty(x);if(g!==d)wrong.push(`"${x}" is ${L[d]}, estimated ${L[g]||"unrated"}`)}
    assert.deepStrictEqual(wrong,[]);
  });
  test(`${c}: no duplicate ideas`,()=>{
    const all=Object.values(cat.ideas).flat().map(x=>x.toLowerCase());
    assert.deepStrictEqual(all.filter((x,i)=>all.indexOf(x)!==i),[]);
  });
}
console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
