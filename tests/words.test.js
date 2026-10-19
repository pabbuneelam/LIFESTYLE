// Run: node tests/words.test.js  — words.txt/actions.txt hygiene, hasRealWord() on gibberish vs real words, and the
// Round 3 task rule (2+ meaningful tokens and an action word) in estimateDifficulty().
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,".."),src=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const api=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,hasRealWord,isTask,lists,listText,setWords:w=>{WORDS=w},setActions:a=>{ACTIONS=a},get W(){return WORDS},get A(){return ACTIONS}}")();
const xpForDiff=new Function(cut("const DIFF=","\n")+";return xpForDiff")();
const CATEGORIES=new Function(cut("const CATEGORIES=","const CATS=")+";return CATEGORIES")();
const raw=fs.readFileSync(path.join(root,"words.txt"),"utf8"),list=raw.trim().split("\n"),WORDS=new Set(list);
const rawA=fs.readFileSync(path.join(root,"actions.txt"),"utf8"),listA=rawA.trim().split("\n"),ACTIONS=new Set(listA);
let n=0;const t=(name,fn)=>{fn();n++;console.log("ok  "+name)};

t("list is dictionary-sized (100k+ words) and under 2 MB",()=>{assert(list.length>=100000,list.length);assert(raw.length<2*1024*1024,raw.length)});
t("list hygiene: lowercase a-z only, no blanks, no duplicates, sorted",()=>{
  assert(list.every(w=>/^[a-z]+$/.test(w)));assert.strictEqual(WORDS.size,list.length);assert.deepStrictEqual([...list].sort(),list);
});
t("required habit/brand words and units present",()=>{
  for(const w of "leetcode duolingo hiit gym crossfit youtube tiktok instagram netflix snapchat reddit podcast pushups pullups situps burpees skincare meditate journal lofi spotify anki notion github linkedin python javascript vitamins protein stretching cardio yoga pilates mindfulness gratitude declutter meal prep km mins hrs kg lb reps sets".split(" "))assert(WORDS.has(w),w);
});
t("gibberish absent from list",()=>{for(const w of ["asdfgh","qwrtp","zxcvb","hjkl","xkcdqq","aaaaaa","xxxx","qwrt"])assert(!WORDS.has(w),w)});

t("actions.txt hygiene: 10k+ lowercase a-z words, sorted, no duplicates, small",()=>{
  assert(listA.length>=10000,listA.length);assert(rawA.length<200*1024,rawA.length);
  assert(listA.every(w=>/^[a-z]{2,}$/.test(w)));assert.strictEqual(ACTIONS.size,listA.length);assert.deepStrictEqual([...listA].sort(),listA);
  for(const w of "run walk read write meditate study ran went wrote gym yoga journal homework prayer workout".split(" "))assert(ACTIONS.has(w),w);
});

// Lazy build: loadWords only stores text; the Sets appear on the first hasRealWord/estimateDifficulty call.
t("lists are built lazily on first use, then the raw text is dropped",()=>{
  const a=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,hasRealWord,listText,get W(){return WORDS},get A(){return ACTIONS}}")();
  assert.strictEqual(a.W,null);assert.strictEqual(a.estimateDifficulty("banana"),2,"nothing loaded: rated as before");
  a.listText.words=raw;a.listText.actions=rawA;
  assert.strictEqual(a.W,null,"storing the text must not build the Set");
  assert.strictEqual(a.estimateDifficulty("banana"),0);
  assert(a.W instanceof Set&&a.W.size===WORDS.size+1&&a.A instanceof Set&&a.A.has("run"));
  assert(!("words" in a.listText)&&!("actions" in a.listText),"text freed after build");
  const w=a.W;a.hasRealWord("run");assert.strictEqual(a.W,w,"built once");
});
t("only words.txt loaded: gibberish rule on, task rule off (single words rated as before)",()=>{
  const a=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,listText}")();
  a.listText.words=raw;assert.strictEqual(a.estimateDifficulty("asdfgh"),0);assert.strictEqual(a.estimateDifficulty("banana"),2);
});

t("list not loaded: everything counts as recognised, gibberish and single words rated as before",()=>{
  api.setWords(null);api.setActions(null);assert.strictEqual(api.hasRealWord("asdfgh"),true);assert.strictEqual(api.estimateDifficulty("asdfgh"),2);
  assert.strictEqual(api.isTask("banana"),true);assert.strictEqual(api.estimateDifficulty("Meditate"),2);
});
api.setWords(WORDS);api.setActions(ACTIONS);
const no=["asdfghs","hjkling","qwrtped","asdfgh","hjkl qwrt","aaaaaa","xxxx 5","hjkl 5 hours","5 hours","10k","3km","123","!!!","🏃","$50","5am",""," "];
// Real words (hasRealWord true) that are still not a task: single words, a word plus gibberish, no action word.
const wordsNotTask=["boxes","hydrating","hydrated","journalled","studies","Moisturise","Run!","LEETCODE","journaling","banana","Meditate",
  "Hydrate","asdf run","the table","a banana","the gym","my homework","banana 5","Exfoliate","Gym!!","run asdf qwrt"];
const tasks=["run 5 km","run 5km","Run 3 km","Meditate 10 minutes","Go to the gym","走る","Don't snooze","pushups x50","push-ups x 20",
  "no-phone today","10,000 steps","journal 2 pages","Plan tomorrow's top 3 priorities","No sugar today","Less than 2 hours of screen time",
  "Phone out of the bedroom tonight","Gym 1 hour","Yoga 20 min","Homework for an hour","Set an alarm","Be on time","Read 20 pages",
  "Ran 5 miles","Wrote 300 words","I'll run today"];
// Verb stems: inflected verbs count as action words through stems().
const stemmed=["reading 20 pages","walked 3 miles","Hydrating twice a day","studied for an hour","Journalled 2 pages","swimming 10 laps","meditated 15 minutes"];
t("unrecognised goals (no real word)",()=>{for(const g of no){assert.strictEqual(api.hasRealWord(g),false,g);assert.strictEqual(api.estimateDifficulty(g),0,g)}});
t("real words that are not a task are unrated",()=>{for(const g of wordsNotTask){assert.strictEqual(api.hasRealWord(g),true,g);assert.strictEqual(api.estimateDifficulty(g),0,g)}});
t("action-word goals are rated",()=>{for(const g of tasks)assert(api.estimateDifficulty(g)>0,g)});
t("verb stems count as action words",()=>{for(const g of stemmed)assert(api.estimateDifficulty(g)>0,g)});
t("a number with its unit is one token: 'Run 5 km' is run+5km; '5 km' alone has no word",()=>{
  assert.strictEqual(api.isTask("Run 5 km"),true);assert.strictEqual(api.estimateDifficulty("5 km"),0);assert.strictEqual(api.isTask("gym"),false);
});
// Best-effort (spec): nouns that are also WordNet verbs (bread, sky, dog) make word pairs pass. Documented, not desired.
t("known limit: noun pairs with a noun-verb still rate",()=>{for(const g of ["banana bread","blue sky","table 5"])assert(api.estimateDifficulty(g)>0,g)});
t("unrated goal earns 0 XP",()=>{assert.strictEqual(xpForDiff(api.estimateDifficulty("asdfgh")),0);assert.strictEqual(xpForDiff(api.estimateDifficulty("banana")),0)});
t("every idea in every area is rated (never 'Can't rate')",()=>{
  for(const c of Object.values(CATEGORIES))for(const idea of c.ideas)assert(api.estimateDifficulty(idea)>0,idea);
});
t("every goal in tests/difficulty-cases.js is rated",()=>{
  const cases=require("./difficulty-cases.js"),bad=[];
  for(const set of Object.values(cases))for(const l of Object.values(set))for(const c of l.split("|"))if(!api.estimateDifficulty(c.slice(2)))bad.push(c);
  assert.deepStrictEqual(bad,[]);
});
t("unrated message shown in the goal modal",()=>{
  assert(src.includes(`"Can't rate this. Describe what you'll do, e.g. Read 20 pages."`));assert(!src.includes("Try describing the task"));
});
console.log(n+" passed");
