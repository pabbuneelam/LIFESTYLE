// Run: node tests/scroll-motion-edge.test.js  — tester's knock-on guards for the scroll-driven motion block:
// fixed UI never inside an animated panel, no transform fights, no specificity override, fallback rules intact.
const fs=require("fs"),path=require("path"),assert=require("assert");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const css=read("style.css"),app=read("app.js"),html=read("index.html");
let n=0,fails=[];const t=(name,fn)=>{try{fn();n++;console.log("ok  "+name)}catch(e){fails.push(name);console.log("FAIL "+name+"\n     "+e.message)}};

const MQ="@media(prefers-reduced-motion:no-preference){@supports(animation-timeline:view()){";
const at=css.indexOf(MQ),before=css.slice(0,at),block=css.slice(at+MQ.length);
// Flat rules outside any @media/@supports/@keyframes (top level of the file before the block).
const strip=s=>{let out="",d=0,skip=0;for(let i=0;i<s.length;i++){const c=s[i];if(c==="@"&&d===0){skip=1}if(c==="{"){d++;if(skip&&d===1){skip=2}}if(skip!==2)out+=c;if(c==="}"){d--;if(skip===2&&d===0){skip=0}}}return out};
const top=[...strip(before).matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m=>({sel:m[1].trim(),decl:m[2]}));
const spec=s=>{const ids=(s.match(/#[\w-]+/g)||[]).length,cls=(s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g)||[]).length;return ids*100+cls};

t("block is appended last and wraps to end of file",()=>{assert(at>0);assert(/\}\}\s*$/.test(css))});
t("no transform property anywhere in the new block (only transform-origin), so .stat:hover/.page.entering/.task transforms never fight",()=>{
  assert(!/(^|[;{])transform\s*:/.test(block),"block sets transform");
});
t("new block sets no z-index and only the hairline pseudo is positioned",()=>{
  assert(!/z-index/.test(block));
  const pos=[...block.matchAll(/([^{};]+)\{[^}]*position:[^;}]+/g)].map(m=>m[1].trim());
  assert.deepStrictEqual(pos,[".topbar::after"]);
});
t(".topbar has no other ::after rule and stays position:sticky (contains the absolute hairline)",()=>{
  assert(!/\.topbar:{1,2}after/.test(before));
  assert(/\.topbar\{position:sticky;top:0;z-index:30/.test(before));
});
t("fallback and interaction rules before the block are intact (.rv, .stat:hover, .task-row .task, page swap)",()=>{
  assert(before.includes(".rv{opacity:0;transform:translateY(18px);animation:none;"));
  assert(before.includes(".stat:hover{transform:translateY(-3px)"));
  assert(before.includes(".stat.rv-in:hover{transform:translateY(-3px)}"));
  assert(before.includes(".task-row .task{position:relative;z-index:1;touch-action:pan-y;transition:transform"));
  assert(before.includes(".page.entering{animation:pageSwap .3s var(--ease) both}"));
});
t("reduced motion still kills panel/stat animation outside the block",()=>{
  assert(/@media\(prefers-reduced-motion:reduce\)\{[^@]*\.topbar,\.stat,\.panel,[^{]*\{animation:none/.test(before));
});
t("no top-level rule out-specifies (0,2,0) to override the scrubbed animation on panels/stats",()=>{
  const bad=top.filter(r=>/animation(-name)?\s*:/.test(r.decl)).flatMap(r=>r.sel.split(",").map(s=>s.trim()))
    .filter(s=>{const last=s.split(/[\s>+~]+/).pop();return/\.(panel|stat)(?![\w-])/.test(last)&&spec(s)>20});
  assert.deepStrictEqual(bad,[]);
});

// ---- DOM placement: tiny tag-stack walk of index.html ----
const fixedCls=[...strip(before).matchAll(/([^{}]+)\{[^}]*position:fixed/g)].flatMap(m=>m[1].split(",")).map(s=>s.trim()).filter(s=>/^\.[\w-]+$/.test(s)).map(s=>s.slice(1));
const walk=()=>{const out=[],stack=[];const VOID=/^(meta|link|br|img|input|hr|source)$/i;
  for(const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/gi)){const[, close,tag,attrs]=m;
    if(close){while(stack.length&&stack.pop().tag!==tag.toLowerCase());continue}
    const cls=((attrs.match(/class="([^"]*)"/)||[])[1]||"").split(/\s+/).filter(Boolean);
    const node={tag:tag.toLowerCase(),cls,parent:stack[stack.length-1]||null};out.push(node);
    if(!VOID.test(tag)&&!/\/$/.test(attrs))stack.push(node)}
  return out};
const nodes=walk();
const anc=(n,f)=>{for(let p=n.parent;p;p=p.parent)if(f(p))return p;return null};
const animated=n=>n.parent&&((n.cls.includes("panel")&&n.parent.cls.some(c=>c==="page"||c==="lab-tab"))||(n.cls.includes("stat")&&n.parent.cls.includes("stats")));

t("fixed-position classes are known (nav, modal, step-banner, fixed-toast, undo-bar)",()=>{
  for(const c of["modal","step-banner","fixed-toast","undo-bar"])assert(fixedCls.includes(c),c+" not found as position:fixed");
});
t("no position:fixed element in index.html sits inside an animated panel (scale/translate would trap it)",()=>{
  const trapped=nodes.filter(n=>n.cls.some(c=>fixedCls.includes(c))&&anc(n,animated)).map(n=>n.cls.join("."));
  assert.deepStrictEqual(trapped,[]);
});
t("app.js templates never inject fixed-position classes",()=>{
  for(const c of fixedCls)assert(!new RegExp('class=\\\\?["\'][^"\']*\\b'+c+'\\b').test(app),c+" injected by app.js");
});
t(".topbar (menu dropdown) is not inside any animated element",()=>{
  const tb=nodes.find(n=>n.cls.includes("topbar"));assert(tb);assert(!animated(tb)&&!anc(tb,animated));
});
t("every .stats child is a .stat (CSS .stats>.stat matches initReveal's .stats > *)",()=>{
  const kids=nodes.filter(n=>n.parent&&n.parent.cls.includes("stats"));assert(kids.length>0);
  assert(kids.every(k=>k.cls.includes("stat")),kids.map(k=>k.cls.join(".")).join(","));
});

// ---- initReveal gate: partial window.CSS objects fall back to the .rv path ----
const fn=app.slice(app.indexOf("function initReveal"),app.indexOf("updateTimer();render();"));
const run=CSSobj=>{let q=0;const document={querySelectorAll:()=>{q++;return[]}};const window={IntersectionObserver:function(){},CSS:CSSobj};
  new Function("document","window","IntersectionObserver","matchMedia","setTimeout",fn+";return initReveal")(document,window,function(){return{observe(){},unobserve(){}}},()=>({matches:false}),()=>0)();return q};
t("window.CSS without supports(): falls back to .rv (does not throw)",()=>assert(run({})>0));
t("CSS.supports only true for other features: falls back to .rv",()=>assert(run({supports:(p,v)=>p==="display"})>0));
t("CSS.supports true for animation-timeline view(): skips .rv entirely",()=>assert.strictEqual(run({supports:(p,v)=>p==="animation-timeline"&&v==="view()"}),0));

console.log(`\n${n} passed`+(fails.length?`, ${fails.length} failed: ${fails.join("; ")}`:""));
if(fails.length)process.exit(1);
