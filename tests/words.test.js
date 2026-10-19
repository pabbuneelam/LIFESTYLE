// Run: node tests/words.test.js  — words.txt hygiene and hasRealWord()/estimateDifficulty() on gibberish vs real goals.
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,".."),src=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const api=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,hasRealWord,setWords:w=>{WORDS=w}}")();
const xpForDiff=new Function(cut("const DIFF=","\n")+";return xpForDiff")();
const CATEGORIES=new Function(cut("const CATEGORIES=","const CATS=")+";return CATEGORIES")();
const raw=fs.readFileSync(path.join(root,"words.txt"),"utf8"),list=raw.trim().split("\n"),WORDS=new Set(list);
let n=0;const t=(name,fn)=>{fn();n++;console.log("ok  "+name)};

t("list is dictionary-sized (100k+ words) and under 2 MB",()=>{assert(list.length>=100000,list.length);assert(raw.length<2*1024*1024,raw.length)});
t("list hygiene: lowercase a-z only, no blanks, no duplicates, sorted",()=>{
  assert(list.every(w=>/^[a-z]+$/.test(w)));assert.strictEqual(WORDS.size,list.length);assert.deepStrictEqual([...list].sort(),list);
});
t("required habit/brand words and units present",()=>{
  for(const w of "leetcode duolingo hiit gym crossfit youtube tiktok instagram netflix snapchat reddit podcast pushups pullups situps burpees skincare meditate journal lofi spotify anki notion github linkedin python javascript vitamins protein stretching cardio yoga pilates mindfulness gratitude declutter meal prep km mins hrs kg lb reps sets".split(" "))assert(WORDS.has(w),w);
});
t("gibberish absent from list",()=>{for(const w of ["asdfgh","qwrtp","zxcvb","hjkl","xkcdqq","aaaaaa","xxxx","qwrt"])assert(!WORDS.has(w),w)});

t("list not loaded: everything counts as recognised, gibberish rated as before",()=>{
  api.setWords(null);assert.strictEqual(api.hasRealWord("asdfgh"),true);assert.strictEqual(api.estimateDifficulty("asdfgh"),2);
});
api.setWords(WORDS);
const no=["asdfghs","hjkling","qwrtped","asdfgh","hjkl qwrt","aaaaaa","xxxx 5","hjkl 5 hours","5 hours","10k","3km","123","!!!","🏃","$50","5am",""," "];
const yes=["boxes","hydrating","hydrated","journalled","studies","Moisturise","run 5 km","run 5km","asdf run","走る","Run!","LEETCODE","Don't snooze","pushups x50","push-ups","no-phone","10,000 steps","journal 2 pages","journaling","Plan tomorrow's top 3 priorities"];
t("unrecognised goals",()=>{for(const g of no){assert.strictEqual(api.hasRealWord(g),false,g);assert.strictEqual(api.estimateDifficulty(g),0,g)}});
t("recognised goals",()=>{for(const g of yes){assert.strictEqual(api.hasRealWord(g),true,g);assert(api.estimateDifficulty(g)>0,g)}});
t("unrated goal earns 0 XP",()=>assert.strictEqual(xpForDiff(api.estimateDifficulty("asdfgh")),0));
t("every idea in every area is rated (never 'Can't rate')",()=>{
  for(const c of Object.values(CATEGORIES))for(const idea of c.ideas)assert(api.estimateDifficulty(idea)>0,idea);
});
console.log(n+" passed");
