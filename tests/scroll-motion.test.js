// Run: node tests/scroll-motion.test.js  — static guards on the CSS scroll-driven motion block (collapsing title,
// scrubbed panels, parallax), the initReveal gate, the SW cache bump and the asset stamps.
const fs=require("fs"),path=require("path"),assert=require("assert");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const css=read("style.css"),app=read("app.js"),sw=read("sw.js"),html=read("index.html");
let n=0,fails=[];const t=(name,fn)=>{try{fn();n++;console.log("ok  "+name)}catch(e){fails.push(name);console.log("FAIL "+name+"\n     "+e.message)}};

// Extract the body of a block starting at `open` (index of its "{") by brace matching.
const body=(s,open)=>{let d=0;for(let i=open;i<s.length;i++){if(s[i]==="{")d++;else if(s[i]==="}"&&--d===0)return s.slice(open+1,i)}throw Error("unbalanced")};
const MQ="@media(prefers-reduced-motion:no-preference)",SUP="@supports(animation-timeline:view())";
const mqAt=css.indexOf(MQ);
const outer=mqAt>=0?body(css,css.indexOf("{",mqAt)):"";
const block=outer.startsWith(SUP)?body(outer,outer.indexOf("{")):"";
const rules=[...block.replace(/@keyframes\s*[\w-]+\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g,"").matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m=>({sel:m[1].trim(),decl:m[2]}));
const frames=Object.fromEntries([...block.matchAll(/@keyframes\s*([\w-]+)\{((?:[^{}]*\{[^}]*\})*)[^{}]*\}/g)].map(m=>[m[1],m[2]]));

t("block exists: no-preference media wraps the animation-timeline @supports",()=>{assert(mqAt>=0,"no-preference media missing");assert(block.length>0,"@supports block not directly inside")});
t("every animation-timeline lives inside the block (0 outside)",()=>{
  const total=(css.replace(SUP,"").match(/animation-timeline/g)||[]).length,inside=(block.match(/animation-timeline/g)||[]).length;
  assert(inside>0);assert.strictEqual(total-inside,0);
});
t("ttl*/sd* keyframes declare only opacity/scale/translate/transform",()=>{
  for(const k of["ttlShrink","ttlFade","ttlLine","sdIn","sdOut","sdDrift"])assert(frames[k]!==undefined,"missing @keyframes "+k);
  for(const[k,b]of Object.entries(frames))for(const m of b.matchAll(/([a-z-]+)\s*:/g))assert(/^(opacity|scale|translate|transform)$/.test(m[1]),k+" animates "+m[1]);
});
t("values match the spec (title .65, panels .4/.94 in, .7/.98 out, drift +-6px)",()=>{
  assert(/scale:\.65/.test(frames.ttlShrink));assert(/opacity:0/.test(frames.ttlFade));
  assert(/opacity:\.4;scale:\.94/.test(frames.sdIn));assert(/opacity:\.7;scale:\.98/.test(frames.sdOut));
  assert(/translate:0 -6px/.test(frames.sdDrift)&&/translate:0 6px/.test(frames.sdDrift));
});
t("no forbidden selectors, no position:fixed / overflow / will-change / filter",()=>{
  for(const r of rules)assert(!/\.task|\.task-row|\.modal|\.menu-|\.nav|\.hero-/.test(r.sel),"bad selector "+r.sel);
  assert(!/position:fixed|overflow|will-change/.test(block));
  assert(!/filter:(?!none)/.test(block),"only backdrop-filter:none is allowed in the block");
});
t("the .topbar rule itself is never animated or transformed",()=>{
  for(const r of rules)if(r.sel.split(",").some(s=>s.trim()===".topbar"))assert(!/animation|transform|scale|translate/.test(r.decl),r.sel);
  for(const m of css.matchAll(/(?:^|[}\n])\.topbar\{([^}]*)\}/g))assert(!/animation-timeline|transform|scale:/.test(m[1]));
});
t("scrubbed animations are linear, no ease/cubic-bezier, timeline after shorthand",()=>{
  const anim=rules.filter(r=>/animation:/.test(r.decl));assert(anim.length>=4);
  for(const r of anim){
    assert(!/ease|cubic-bezier/.test(r.decl),r.sel);
    const shorts=r.decl.match(/animation:([^;]*)/)[1].split(",");assert(shorts.every(s=>/\blinear\b/.test(s)),r.sel);
    assert(r.decl.indexOf("animation-timeline")>r.decl.indexOf("animation:"),"timeline before shorthand in "+r.sel);
  }
});
t("title uses the root scroll timeline over 0-64px (eyebrow 0-36px)",()=>{
  const g=rules.find(r=>r.sel===".topbar #greeting"),e=rules.find(r=>r.sel===".topbar .eyebrow"),l=rules.find(r=>r.sel===".topbar::after");
  assert(g&&e&&l);for(const r of[g,e,l])assert(/animation-timeline:scroll\(root block\)/.test(r.decl));
  assert(/animation-range:0px 64px/.test(g.decl)&&/animation-range:0px 36px/.test(e.decl)&&/animation-range:0px 64px/.test(l.decl));
  assert(/transform-origin:left center/.test(g.decl));
});
t("panels: three view() timelines with header inset and non-overlapping in/out ranges",()=>{
  const p=rules.find(r=>r.sel===".page>.panel,.stats>.stat,.lab-tab>.panel");assert(p);
  assert.strictEqual((p.decl.match(/view\(block 96px 0px\)/g)||[]).length,3);
  assert(/animation-range:entry 0% entry 55%,exit 60% exit 100%,cover 0% cover 100%/.test(p.decl));
});
t("scrubbed panels drop their backdrop blur (iOS Safari re-blurs every frame otherwise)",()=>{
  const p=rules.find(r=>r.sel===".page>.panel,.stats>.stat,.lab-tab>.panel");
  assert(/(^|;)backdrop-filter:none/.test(p.decl)&&/-webkit-backdrop-filter:none/.test(p.decl));
  assert(/--panel:rgba\(17,17,22,\.9\d?\)/.test(p.decl),"background made more opaque to replace the blur");
});
t("initReveal skips .rv when CSS scroll-driven animations are supported (single early return)",()=>{
  const fn=app.slice(app.indexOf("function initReveal"),app.indexOf("updateTimer();render();"));
  assert(fn.includes('window.CSS&&window.CSS.supports&&window.CSS.supports("animation-timeline","view()")'));
  assert.strictEqual((fn.match(/\)return;/g)||[]).length,1);
});
t("sw cache is lifestyle-v6",()=>assert(sw.includes('const CACHE="lifestyle-v6"')));
t("index.html asset stamps match and moved past 20261015172805",()=>{
  const s=html.match(/style\.css\?v=(\d+)/)[1],a=html.match(/app\.js\?v=(\d+)/)[1];
  assert.strictEqual(s,a);assert.notStrictEqual(s,"20261015172805");
});

console.log(`\n${n} passed`+(fails.length?`, ${fails.length} failed: ${fails.join("; ")}`:""));
if(fails.length)process.exit(1);
