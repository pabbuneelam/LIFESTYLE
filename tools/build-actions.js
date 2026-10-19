// Builds actions.txt (the action words estimateDifficulty() needs before it rates a goal) and actions-NOTICE.txt.
// Run manually: node tools/build-actions.js   (needs network once and the `tar` command; not part of the deploy)
//
// Source: WordNet 3.0 by Princeton University, https://wordnet.princeton.edu
//   Download: https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz, pinned by SHA-256 below (the file is static).
//   We take every single-word verb lemma from dict/index.verb and every irregular verb form from dict/verb.exc
//   (ran, went, wrote...). Regular inflections (reading, walked) are matched in app.js by stems().
//   Licence: WordNet 3.0 licence (permissive, BSD-like, not share-alike). It requires the copyright notice and
//   statements on all copies, so the WordNet-3.0/LICENSE file is written verbatim to actions-NOTICE.txt.
// Then we add ACTIVITY, hand-listed activity nouns that make a goal a task on their own ("Gym 1 hour", "Yoga 20 min").
// Note: many English nouns are also WordNet verbs (table, bread, sky), so "banana bread" still counts as a task.
const fs=require("fs"),path=require("path"),crypto=require("crypto"),{execFileSync}=require("child_process");
const ROOT=path.join(__dirname,"..");
const SRC="https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz";
const SHA256="640db279c949a88f61f851dd54ebbb22d003f8b90b85267042ef85a3781d3a52";
const ACTIVITY=`gym yoga pilates workout workouts cardio hiit crossfit zumba homework prayer prayers journal journaling journalling
meditation run walk swim hike sport sports practice study session meal prep mealprep flashcards duolingo leetcode therapy
class lesson lecture chores laundry errands shower bath nap breakfast lunch dinner skincare exercise exercises training
stretches pushups pullups situps burpees squats lunges planks laps steps reps sets sprints marathon jog
guitar piano violin cello viola drums flute ukulele saxophone trumpet clarinet harp singing choir band
tennis soccer football basketball baseball volleyball pickleball badminton golf chess hockey rugby cricket softball
boxing climbing bouldering skating skiing snowboarding surfing cycling rowing frisbee pingpong
spanish french german italian japanese chinese mandarin korean arabic hindi urdu portuguese russian latin kanji vocab
treadmill elliptical stairmaster peloton sauna weights abs core spin
appointment haircut chores laundry groceries errands routine session bedtime asleep checkin weighin
bible quran rosary masjid mosque church temple taraweeh sunlight retainer protein calories gratitude gratitudes
facetime mcat lsat gre gmat
problem problems sunscreen spf multivitamin multivitamins vitamins supplements moisturizer moisturiser retinol serum creatine
vitamin supplement melatonin magnesium probiotic probiotics prebiotic prebiotics ashwagandha collagen electrolyte electrolytes
omega biotin fiber fibre toner cleanser lotion`.split(/\s+/);

(async()=>{
  const res=await fetch(SRC);if(!res.ok)throw new Error("download failed: "+res.status);
  const tgz=Buffer.from(await res.arrayBuffer()),sha=crypto.createHash("sha256").update(tgz).digest("hex");
  if(sha!==SHA256)throw new Error("WordNet download changed (sha256 "+sha+"); review it, then update SHA256");
  const file=f=>execFileSync("tar",["-xzOf","-","WordNet-3.0/"+f],{input:tgz,maxBuffer:64<<20}).toString("utf8");
  const verbs=file("dict/index.verb").split("\n").filter(l=>!l.startsWith(" ")).map(l=>l.split(" ")[0]);
  const irregular=file("dict/verb.exc").split("\n").map(l=>l.split(" ")[0]);
  const list=[...new Set([...verbs,...irregular,...ACTIVITY].filter(w=>/^[a-z]{2,}$/.test(w)))].sort();
  fs.writeFileSync(path.join(ROOT,"actions.txt"),list.join("\n")+"\n");
  fs.writeFileSync(path.join(ROOT,"actions-NOTICE.txt"),"actions.txt is a modified version (single-word verbs and irregular verb forms\n"+
    "only, with app-specific activity words added) of WordNet 3.0. Built by tools/build-actions.js from:\n"+SRC+"\n\n"+file("LICENSE"));
  console.log("actions.txt: "+list.length+" words");
})().catch(e=>{console.error(e.message);process.exit(1)});
