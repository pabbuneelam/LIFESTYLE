// Builds words.txt (the offline list estimateDifficulty() uses to tell real goals from gibberish) and words-NOTICE.txt.
// Run manually: node tools/build-words.js   (needs network once; not part of the deploy)
//
// Source: SCOWL / English Speller Database (ESDB) by Kevin Atkinson, via the custom list generator at app.aspell.net.
//   Parameters: size 70, spellings US + GB(-ise), variant level 1, diacritics stripped. https://wordlist.aspell.net
//   Pinned to ESDB Git Revision 1e5b7d3 (2026-06-24); the script refuses to build if the server's revision differs,
//   so reruns stay byte-identical. To update: check the new list, then change ESDB_REV.
//   Licence: permissive (MIT-like, not share-alike). It requires the copyright + permission notice to ship with the
//   list, so the header of the download is written verbatim to words-NOTICE.txt next to words.txt.
// We keep plain words (proper nouns lowercased; all-caps abbreviations and single letters other than a/i dropped),
// then add every word the app's own ideas, difficulty rules and test goals use, plus habit/brand/religious words
// dictionaries miss, so nothing the app suggests is ever rated "can't rate".
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const SRC="http://app.aspell.net/create?max_size=70&spelling=US&spelling=GBs&max_variant=1&diacritic=strip&download=wordlist&encoding=utf-8&format=inline";
const ESDB_REV="1e5b7d3";
const HAND=`leetcode duolingo hiit gym crossfit youtube tiktok instagram netflix snapchat reddit podcast pushups pullups situps burpees
skincare meditate journal lofi spotify anki notion github linkedin python javascript vitamins protein stretching cardio yoga pilates
mindfulness gratitude declutter meal prep km mins hrs kg lb reps sets
breathwork creatine zumba vocab keto macros quran koran namaz salah salat dua dhikr wudu tahajjud fajr isha maghrib asr zuhr
torah shabbat daf yomi gita puja japa rosary novena devotional devotionals
calc econ chem bio stats kcal wellbeing selfcare screentime doomscroll doomscrolling mealprep affirmation affirmations
kettlebell kettlebells paddleboard paddleboarding rollerblade rollerblading vinyasa ashtanga qigong taichi bjj mma muay thai
calisthenics plank planks deadlifts hypertrophy protein electrolytes probiotics collagen ashwagandha magnesium
unsubscribe journalled journalling skincare sunscreen spf retinol serum moisturiser moisturizer
hydrate rehydrate hydration oatmeal smoothie smoothies matcha kombucha veggies
pomodoro todo todos inbox anki quizlet khan coursera udemy codecademy hackerrank kaggle figma canva
whatsapp facetime discord twitch pinterest strava fitbit peloton headspace calm notion obsidian
pickleball stairmaster mcat lsat gmat taraweeh jummah kegel kegels standup`.split(/\s+/);
// Fragments left over from regex syntax in app.js (e.g. "promot(ed|ion)", "boundar", "organi[sz]e", "kilomet"); not words.
const JUNK=new Set(["promot","boundar","organi","memori","snoo","imum","sz","kilomet"]);
// Keyboard-row mashes the dictionary lists as words; typed as a goal ("Qwerty walk") they are gibberish.
const MASH=new Set(["qwerty"]);

const words=s=>s.toLowerCase().match(/[a-z]+/g)||[];
const app=fs.readFileSync(path.join(ROOT,"app.js"),"utf8");
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);if(i<0||j<0)throw new Error("app.js changed: missing "+a);return app.slice(i,j)};

function extras(){
  const out=[...HAND];
  const CATEGORIES=new Function(cut("const CATEGORIES=","const CATS=")+";return CATEGORIES")();
  for(const c of Object.values(CATEGORIES))for(const idea of c.ideas)out.push(...words(idea));
  // Literal runs from the difficulty regexes only (the named *_RE constants and the regex literals inside
  // estimateDifficulty), with escapes (\b, \d, \w) removed first, so app.js identifiers never leak in.
  const named=new Function(cut("// Hard-effort activities by area","const DIFF=")+
    ";return[AREA_HARD_RE,INTENSE_RE,HARD_RE,EASY_RE,ABSTAIN_RE,DURATION_RE,TASK_RE]")().map(r=>r.source);
  const literals=cut("function estimateDifficulty","const DIFF=").match(/(?<=[(=,:!&|?]\s*)\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+\/[gimsuy]*/g)||[];
  for(const re of [...named,...literals])out.push(...(re.replace(/\\[a-z]/gi," ").match(/[a-z]{2,}/g)||[]));
  const cases=require(path.join(ROOT,"tests","difficulty-cases.js"));
  for(const set of Object.values(cases))for(const list of Object.values(set))out.push(...words(list.replace(/(^|\|)[EMH] /g," ")));
  return out.filter(w=>w.length>1&&!JUNK.has(w));
}

(async()=>{
  const res=await fetch(SRC);if(!res.ok)throw new Error("download failed: "+res.status);
  const text=(await res.text()).replace(/\r/g,""),sep=text.indexOf("\n---\n");
  if(sep<0)throw new Error("unexpected download: no notice/word separator");
  const notice=text.slice(0,sep),rev=(notice.match(/ESDB Git Revision:.*\[(\w+)\]/)||[])[1];
  if(rev!==ESDB_REV)throw new Error("ESDB revision is "+rev+", pinned "+ESDB_REV+"; review the new list, then update ESDB_REV");
  const dict=text.slice(sep+5).split("\n").filter(w=>/^[A-Za-z][a-z]*$/.test(w)).map(w=>w.toLowerCase()).filter(w=>(w.length>1||w==="a"||w==="i")&&!MASH.has(w));
  const set=new Set([...dict,...extras()]);
  const list=[...set].sort();
  fs.writeFileSync(path.join(ROOT,"words.txt"),list.join("\n")+"\n");
  fs.writeFileSync(path.join(ROOT,"words-NOTICE.txt"),"words.txt is a modified version (lowercased, filtered, with app-specific words added)\n"+
    "of a word list generated from SCOWL / ESDB. Built by tools/build-words.js from:\n"+SRC+"\n\n"+notice+"\n");
  console.log("words.txt: "+list.length+" words");
})().catch(e=>{console.error(e.message);process.exit(1)});
