// Run: node tests/words-mash.test.js  — with the full SCOWL list, keyboard-mash gibberish must still be rejected,
// stems() must not crash or let suffixed gibberish through, and the Set build must stay cheap.
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,".."),src=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const api=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,hasRealWord,stems,setWords:w=>{WORDS=w}}")();
const raw=fs.readFileSync(path.join(root,"words.txt"),"utf8");
let n=0;const t=(name,fn)=>{fn();n++;console.log("ok  "+name)};
let W;
t("Set build from words.txt (same split as loadWords) is under 300 ms in node",()=>{
  const t0=Date.now();W=new Set(raw.split(/\s+/));const ms=Date.now()-t0;console.log("    build ms",ms,"size",W.size);assert(ms<300,ms);
});
api.setWords(W);
let seed=12345;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648,pick=s=>s[Math.floor(rnd()*s.length)];
const mash=(letters,min,max)=>{const seen=new Set();while(seen.size<200){let k=min+Math.floor(rnd()*(max-min+1)),s="";for(let i=0;i<k;i++)s+=pick(letters);seen.add(s)}return[...seen]};
const rate=list=>list.filter(s=>api.estimateDifficulty(s)===0).length/list.length;
t("random a-z mash, 3-8 letters: >= 95% rejected",()=>{const r=rate(mash("abcdefghijklmnopqrstuvwxyz",3,8));console.log("    ",(r*100).toFixed(1)+"%");assert(r>=0.95,r)});
t("random a-z mash, 5-8 letters: >= 99% rejected",()=>{const r=rate(mash("abcdefghijklmnopqrstuvwxyz",5,8));console.log("    ",(r*100).toFixed(1)+"%");assert(r>=0.99,r)});
t("home-row mash (asdfghjkl), 3-8 letters: >= 95% rejected",()=>{const r=rate(mash("asdfghjkl",3,8));console.log("    ",(r*100).toFixed(1)+"%");assert(r>=0.95,r)});
t("repeated-letter runs of 4+ are rejected (aaaa..zzzzzzzz)",()=>{
  for(const c of "abcdefghijklmnopqrstuvwxyz")for(let k=4;k<=8;k++)assert.strictEqual(api.estimateDifficulty(c.repeat(k)),0,c.repeat(k));
});
t("chat-speak with no dictionary entry is rejected",()=>{for(const g of ["lol","lmao","lmfao","rofl","omg","wtf","idk","smh","tbh","ngl","lolol","asdf","xd"])assert.strictEqual(api.estimateDifficulty(g),0,g)});
t("stems: never throws, never returns a base under 3 letters",()=>{
  for(const w of ["","s","es","ies","ed","ing","ss","sss","bus","gas","yes","boss","glass","boss's","qqs","aaed","iing"])for(const b of api.stems(w))assert(b.length>=3,w+"->"+b);
});
t("stems: ss endings and 3-letter -ies words keep real words recognised",()=>{
  for(const g of ["boss","glass","bosses","glasses","pies","ties","dies","lies","bus","gas"])assert.strictEqual(api.hasRealWord(g),true,g);
});
t("stems: gibberish with suffixes stays unrecognised",()=>{
  for(const g of ["asdfs","hjkles","qqqing","xxxed","bbbed","pppies","zzzies","kkkes","vvies","aaaing","asdfghed","hjklies"])assert.strictEqual(api.hasRealWord(g),false,g);
});
t("worst-case long gibberish input stays fast (1000x 650 chars < 500 ms)",()=>{
  const t0=Date.now();for(let i=0;i<1000;i++)api.estimateDifficulty("asdfghjkling ".repeat(50));assert(Date.now()-t0<500);
});
console.log(n+" passed");
