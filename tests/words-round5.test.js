// Run: node tests/words-round5.test.js — tester Round 5 retest: a fresh batch of realistic goals (none in other
// tests, CATEGORIES ideas or difficulty-cases.js), the Round 5 side changes, and words.txt coverage of the regexes.
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,".."),src=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const sec=cut("// Hard-effort activities by area","const DIFF=");
const api=new Function(sec+";return{estimateDifficulty,listText,RES:[AREA_HARD_RE,INTENSE_RE,HARD_RE,EASY_RE,ABSTAIN_RE,DURATION_RE,TASK_RE]}")();
const WTXT=fs.readFileSync(path.join(root,"words.txt"),"utf8");
api.listText.words=WTXT;api.listText.actions=fs.readFileSync(path.join(root,"actions.txt"),"utf8");
const rate=g=>api.estimateDifficulty(g);
let pass=0,fail=0;const t=(name,fn)=>{try{fn();pass++;console.log("ok  "+name)}catch(e){fail++;console.log("FAIL "+name+"\n     "+e.message)}};
const unrated=l=>l.filter(g=>!rate(g));

// 75 fresh realistic multi-word goals.
const FRESH=["Vacuum the stairs","Wipe down counters","Fold the laundry","Iron work shirts","Organize the closet","Renew passport","File taxes","Budget for next month","Transfer 200 to savings","Sell old clothes online","Meal prep lunches","Pack a healthy lunch","Eat breakfast before 9","Two eggs and toast","Drink green tea","Swap soda for water","Protein shake after gym","Call grandma Sunday","Send thank you card","Plan date with wife","Walk with Jun after work","Host game night","Compliment a coworker","Incline walk 20 min","Run a 5k","Hill sprints x8","Kettlebell swings 50","Calisthenics 30 min","Climb at the gym","Tennis lesson","Shoot hoops 30 min","Golf range bucket","Surf in the morning","Study 2 hours for LSAT","Read 30 pages of Dune","Finish Coursera module","Practice typing 10 min","Review flashcards","Outline essay","Do one LeetCode problem","Learn a chord","Practice violin","Try a new recipe","Photograph sunset","Read Psalms","Pray before meals","Fast on Monday","Attend Bible study","Volunteer at shelter","Do a body scan","Box breathing 4 min","Sauna then cold plunge","Journal three wins","Walk without music","Lights out by 10:30","Melatonin at 10","Put phone on charger at 9","Take vitamin D","Take fish oil","Floss nightly","Cut nails","Get a haircut","Wear retainer","Use face serum","Lotion after shower","Send 5 cold emails","Ship the feature","Code review before lunch","Post on LinkedIn","Prep slides for Monday","Stand-up at 10","Read the news for 10 min","Take creatine","Brush the dog","Clean the fish tank"];

t("fresh realistic goals are all rated",()=>{const u=unrated(FRESH);console.log("     "+u.length+"/"+FRESH.length+" unrated");assert.deepStrictEqual(u,[])});
// Spec Round 5 item 1: "sunscreen, multivitamin (and similar supplement/skincare nouns)". Same shape as "Multivitamin daily".
t("similar supplement/skincare nouns with a frequency are rated",()=>{
  assert.deepStrictEqual(unrated(["Melatonin at 10","Probiotic daily","Ashwagandha daily","Collagen in coffee","Toner at night"]),[]);
});
t("more supplement/skincare nouns are rated, single words stay unrated",()=>{
  assert.deepStrictEqual(unrated(["Magnesium before bed","Electrolytes after run","Omega 3 daily","Biotin daily","Fiber supplement","Cleanser at night","Vitamin D daily","Prebiotic daily"]),[]);
  for(const g of ["Melatonin","Collagen","Toner","Vitamin"])assert.strictEqual(rate(g),0,g);
});
t("unfollow (a WordNet verb) is an action",()=>assert(rate("Unfollow 10 accounts")>0));
// Known limit, accepted by the user in Round 6: WordNet 3.0 (2006) lacks these verbs or lists them hyphenated
// (baby-sit), and hyphenated entries are deliberately not stripped, so these goals stay unrated.
t("known limit: babysit/declutter/livestream/upcycle goals stay unrated",()=>{
  for(const g of ["Babysit Sunday","Babysit for Hana","Declutter one drawer","Livestream at 8","Upcycle old jeans"])assert.strictEqual(rate(g),0,g);
});
t("Round 5 fixes: counted tasks, sunscreen/multivitamin, auto-capitalised gibberish, jummah",()=>{
  for(const g of ["20 math problems","Math problems 20","Physics problem set","Problem set 3","Sunscreen daily","Spf 50 daily","Multivitamin daily","Retinol twice a week","Creatine 5g","Jummah prayer","Reply to DMs"])assert(rate(g)>0,g);
  for(const g of ["Asdf run","Qwerty walk","qwerty walk","Hjkl sleep","Xqzt Run","Tok run","Ower walk","Const read","Et run"])assert.strictEqual(rate(g),0,g);
});
t("single words stay unrated, including the new activity nouns",()=>{
  for(const g of ["Problem","Problems","Sunscreen","Multivitamin","Serum","Qwerty","Jummah"])assert.strictEqual(rate(g),0,g);
});
t("kgs/kms dropped from words.txt: units after a number still count",()=>{for(const g of ["Run 5 kms","Lift 100 kgs","Run 5 km"])assert(rate(g)>0,g)});
// Accepted trade-off of spec Round 5 item 2 (first word never counts as a name).
t("trade-off pinned: an unknown name typed first is unrated; known nouns first still rate",()=>{
  for(const g of ["Priya call","Zainab call","Jayden FaceTime"])assert.strictEqual(rate(g),0,g);
  for(const g of ["Mom call","Sarah lunch","Leila brunch","John gym","Call Priya"])assert(rate(g)>0,g);
});
t("known limit: 'problem' is an action word, so 'Big problem 2' rates",()=>assert(rate("Big problem 2")>0));
t("every letter run in every difficulty regex (named *_RE and literals in estimateDifficulty) is in words.txt, minus fragments",()=>{
  const W=new Set(WTXT.split("\n"));
  const lits=cut("function estimateDifficulty","const DIFF=").match(/(?<=[(=,:!&|?\[;{}\n]\s*|return\s+)\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+\/[gimsuy]*/g)||[];
  const FRAG=new Set(["promot","boundar","organi","memori","snoo","imum","sz","kilomet"]);
  const miss=new Set();
  for(const re of [...api.RES.map(r=>r.source),...lits])for(const w of re.replace(/\\[a-z]/gi," ").match(/[a-z]{2,}/g)||[])if(!W.has(w)&&!FRAG.has(w))miss.add(w);
  assert.deepStrictEqual([...miss],[]);
});
console.log(pass+" passed, "+fail+" failed");process.exit(fail?1:0);
