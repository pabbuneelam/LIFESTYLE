// Run: node tests/words-round4.test.js — tester Round 4 retest: a fresh batch of realistic goals (none in
// words-realgoals.test.js, CATEGORIES ideas or difficulty-cases.js), the Round 4 loopholes, and words.txt hygiene.
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.join(__dirname,".."),src=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,"missing "+a);return src.slice(i,j)};
const api=new Function(cut("// Hard-effort activities by area","const DIFF=")+";return{estimateDifficulty,listText}")();
api.listText.words=fs.readFileSync(path.join(root,"words.txt"),"utf8");api.listText.actions=fs.readFileSync(path.join(root,"actions.txt"),"utf8");
const rate=g=>api.estimateDifficulty(g);
let pass=0,fail=0;const t=(name,fn)=>{try{fn();pass++;console.log("ok  "+name)}catch(e){fail++;console.log("FAIL "+name+"\n     "+e.message)}};
const unrated=l=>l.filter(g=>!rate(g));

// 122 fresh realistic multi-word goals.
const FRESH=["Brush teeth twice","Floss before bed","Make the bed","Water the plants","Take out recycling","Unload dishwasher","Mop kitchen floor","Change bedsheets","Pay rent","Pay credit card bill","Cancel unused subscriptions","Check bank balance","Log expenses","Cook dinner at home","Batch cook chicken","Grocery run","Buy groceries for the week","Text Zainab back","Email professor Okafor","Reply to Slack messages","Wish Dad happy birthday","Visit Grandpa Lou","Dinner with Marisol","Hang out with Theo","Lunch with Bilal","Video call with Ana","Squat 3x5","Bench press 5x5","Deadlift 225","Swim 20 laps","Bike 10 miles","Row 2000m","Jump rope 5 min","Hike Runyon Canyon","Run 3 miles","Walk 8000 steps","Plank 2 minutes","Foam roll 10 min","Stretch hamstrings","Hot yoga class","Spin class at 6","Pilates 45 min","Swim practice","BJJ class","Drink 3 liters","Eat 5 servings of veggies","No soda this week","Skip dessert","Cut caffeine after 2pm","No phone after 9pm","Limit Instagram to 20 min","No alcohol weekends","Intermittent fast 16 hours","Sleep by 11pm","Wake up at 6","No screens in bed","Morning walk","Evening stretch","Night routine","Study for chem midterm","Finish lab report","Review lecture notes","Do calc homework","Practice SAT math","Anki 50 cards","Learn 10 Spanish words","Read one chapter","Watch a TED talk","Apply to 3 jobs","Prep for interview","Network on LinkedIn","Finish the slide deck","Clear email inbox","Deep work 2 hours","Code for 1 hour","Meditate 15 min","Gratitude journal","Therapy session Thursday","Breathwork 5 min","Read Quran 1 page","Go to Mass","Bible study Wednesday","Sunday service","Quiet time 10 min","Dog walk","Feed the cat","Clean litter box","Vet appointment","Dentist cleaning","Doctor checkup","Get a flu shot","Practice piano scales","Guitar practice","Sing 15 min","Draw for 20 min","Paint a canvas","Knit a scarf","Write a poem","Edit photos","Film a TikTok","Leg workout","Upper body day","Rest day","Core workout 10 min","Abs circuit","Mobility 15 min","Weigh-in Monday","Weekly weigh in","Check in with therapist","Daily check-in","Skincare at night","Sunscreen every morning","Wash face","Moisturize hands","Take makeup off","Journal 1 page","Read before bed","No snooze","Charge phone outside bedroom","Stand up every hour","Contacts out","Retainer tonight"];

t("fresh realistic goals are all rated",()=>{const u=unrated(FRESH);console.log("     "+u.length+"/"+FRESH.length+" unrated");assert.deepStrictEqual(u,[])});
// The difficulty rules already score "N (math) problems" as a counted task (amt() in estimateDifficulty), and
// "50 flashcards" / "30 questions" rate, so the same shape with "problems" must too.
t("counted study tasks without a verb are rated (20 math problems)",()=>{
  assert.deepStrictEqual(unrated(["20 math problems","Math problems 20","50 flashcards","30 questions","10 practice problems"]),[]);
});
t("daily-habit nouns with a frequency are rated (Sunscreen daily)",()=>{
  assert.deepStrictEqual(unrated(["Sunscreen every morning","Sunscreen daily","Multivitamin daily"]),[]);
});
// Phone keyboards capitalise the first letter, so "asdf run" is typed as "Asdf run" in the goal input
// (index.html #goalInput has no autocapitalize="off"). The Round 4 spec says "asdf run" stays unrated.
t("gibberish + verb stays unrated when the phone auto-capitalises the first word",()=>{
  for(const g of ["Asdf run","Qwerty walk","Hjkl sleep","Sdfgh read","Xqzt Run"])assert.strictEqual(rate(g),0,g);
});
t("words.txt has no code fragments swept from app.js identifiers (toLowerCase, hasRealWord, tok, const)",()=>{
  const W=new Set(fs.readFileSync(path.join(root,"words.txt"),"utf8").split("\n"));
  assert.deepStrictEqual(["ase","eal","ord","ower","tok","const","et"].filter(w=>W.has(w)),[]);
});
// Round 5: the first word never counts as a name, so "Xqzt Run" moved to the unrated test above.
t("known limit (Round 4, documented): Capitalised gibberish after a verb counts as a name",()=>{for(const g of ["Run Xqzt","Run XQZT","Run Zzzz Qqqq"])assert(rate(g)>0,g)});
t("still unrated: lone single words, gibberish pairs, little-word phrases",()=>{
  for(const g of ["Gym","Run","Banana","Meditate","Xqzt","Asdf","Asdfgh qwerty","this not that","asdf not qwer","not bad","checkin","Weighin","in"])assert.strictEqual(rate(g),0,g);
});
t("X not Y: real swaps rate; real-word pairs around 'not' also rate (accepted, like 'blue sky')",()=>{
  for(const g of ["Tea not coffee","Stairs not elevator","Hot not cold","Cats not dogs","me not you"])assert(rate(g)>0,g);
});
t("times of day are not durations: am/pm alone is no action",()=>{
  for(const g of ["Banana 5pm","10pm","5h","30 min","the 30 min"])assert.strictEqual(rate(g),0,g);
  for(const g of ["Bed 10pm","Lunch 1pm","Team meeting 10am","Pizza 2 hours"])assert(rate(g)>0,g);
});
t("day/night phrases: task phrases rate, greetings do not",()=>{
  for(const g of ["Game night","Board game night","Rest day","Core day","Leg day tomorrow","Date night"])assert(rate(g)>0,g);
  for(const g of ["Good day","Happy day","Good night","Tonight","Day 5"])assert.strictEqual(rate(g),0,g);
});
t("weigh-in / check-in in every spelling with a space or hyphen",()=>{
  for(const g of ["Weigh in","weigh-in","Weigh-in","Check in","check-in","Check-in","Weekly weigh in","Daily check-in","Weigh-in Monday"])assert(rate(g)>0,g);
});
console.log(pass+" passed, "+fail+" failed");process.exit(fail?1:0);
