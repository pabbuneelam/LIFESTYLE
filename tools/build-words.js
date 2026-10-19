// Builds words.txt, the offline list estimateDifficulty() uses to tell real goals from gibberish.
// Run manually: node tools/build-words.js   (needs network once; not part of the deploy)
//
// Source: FrequencyWords by Hermit Dave, English 50k list from OpenSubtitles 2018, pinned to a commit so reruns match.
//   https://github.com/hermitdave/FrequencyWords/blob/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/en/en_50k.txt
//   Licence: CC BY-SA 4.0 for the word data (MIT for the repo's code). https://creativecommons.org/licenses/by-sa/4.0/
// We keep the top TOP plain a-z words, then add every word the app's own ideas, difficulty rules and test goals use,
// plus habit/brand words and units, so nothing the app suggests is ever rated "can't rate".
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const SRC="https://raw.githubusercontent.com/hermitdave/FrequencyWords/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/en/en_50k.txt";
const TOP=28000;
const HAND=`leetcode duolingo hiit gym crossfit youtube tiktok instagram netflix snapchat reddit podcast pushups pullups situps burpees
skincare meditate journal lofi spotify anki notion github linkedin python javascript vitamins protein stretching cardio yoga pilates
mindfulness gratitude declutter meal prep km mins hrs kg lb reps sets`.split(/\s+/);
// Fragments left over from regex syntax in app.js (e.g. "promot(ed|ion)", "boundar", "organi[sz]e"); not words.
const JUNK=new Set(["promot","boundar","organi","memori","snoo","raw","ed","ion","imum","sz","zs"]);

const words=s=>s.toLowerCase().match(/[a-z]+/g)||[];
const app=fs.readFileSync(path.join(ROOT,"app.js"),"utf8");
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);if(i<0||j<0)throw new Error("app.js changed: missing "+a);return app.slice(i,j)};

function extras(){
  const out=[...HAND];
  const CATEGORIES=new Function(cut("const CATEGORIES=","const CATS=")+";return CATEGORIES")();
  for(const c of Object.values(CATEGORIES))for(const idea of c.ideas)out.push(...words(idea));
  // Literal runs from the difficulty regexes, with escapes (\b, \d, \w) removed first.
  const rules=cut("const AREA_HARD_RE=","function estimateDifficulty").replace(/\/\/.*$/gm,"").replace(/\\[a-z]/gi," ");
  out.push(...(rules.replace(/String\.raw|new RegExp|const [A-Z_]+=|join/g," ").match(/[a-z]{2,}/g)||[]));
  const cases=require(path.join(ROOT,"tests","difficulty-cases.js"));
  for(const set of Object.values(cases))for(const list of Object.values(set))out.push(...words(list.replace(/(^|\|)[EMH] /g," ")));
  return out.filter(w=>w.length>1&&!JUNK.has(w));
}

(async()=>{
  const res=await fetch(SRC);if(!res.ok)throw new Error("download failed: "+res.status);
  const freq=(await res.text()).split("\n").map(l=>l.split(" ")[0]).filter(w=>/^[a-z]+$/.test(w)&&(w.length>1||w==="a"||w==="i"));
  const set=new Set([...freq.slice(0,TOP),...extras()]);
  const list=[...set].sort();
  fs.writeFileSync(path.join(ROOT,"words.txt"),list.join("\n")+"\n");
  console.log("words.txt: "+list.length+" words");
})().catch(e=>{console.error(e.message);process.exit(1)});
