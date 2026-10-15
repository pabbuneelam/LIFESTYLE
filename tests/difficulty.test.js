// Run: node tests/difficulty.test.js  — scores estimateDifficulty() from app.js against the labelled cases.
const fs=require("fs"),path=require("path");
const src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const start=src.indexOf("// Hard-effort activities by area"),end=src.indexOf("const DIFF=");
const estimate=new Function(src.slice(start,end)+";return estimateDifficulty")();
const cases=require("./difficulty-cases.js"),tune={},holdout=cases.holdout;for(const set of [cases.tune,cases.holdout1_now_tuning,cases.holdout2_now_tuning])for(const[a,l]of Object.entries(set))tune[a]=tune[a]?tune[a]+"|"+l:l,L=["","E","M","H"];
let failedAny=false;
for(const[setName,set]of Object.entries({tune,holdout})){
  let total=0,wrong=0;const lines=[];
  for(const[area,list]of Object.entries(set)){
    let aw=0;const cases=list.split("|");
    for(const c of cases){const want=c[0],goal=c.slice(2),got=L[estimate(goal)];total++;if(got!==want){wrong++;aw++;lines.push(`  ${area}: "${goal}" expected ${want}, got ${got}`)}}
    lines.unshift(`  ${area.padEnd(10)} ${cases.length-aw}/${cases.length}`);
  }
  console.log(`${setName}: ${total-wrong}/${total} correct, error ${(wrong/total*100).toFixed(2)}%`);
  console.log(lines.join("\n"));
  // Tuning cases must all pass; the unseen holdout only has to stay at or above 80% so the test catches regressions.
  if(setName==="tune"?wrong:(total-wrong)/total<0.8)failedAny=true;
}
process.exit(failedAny?1:0);
