'use client';
// CodeLab | كود لاب — Next.js 14 (App Router) single-file app. Put this file at app/page.js
import { useState, useEffect, useRef, useCallback } from 'react';

/* ===== Config ===== */
const GEMINI_MODEL = 'gemini-2.0-flash';
const LANGS = { html: 'HTML', css: 'CSS', js: 'JavaScript', python: 'Python', cpp: 'C++', java: 'Java' };
const STARTERS = {
  html: '<h1>مرحباً بك في CodeLab</h1>\n<button id="b">اضغط هنا</button>',
  css: 'body { background: #1e1b4b; color: #fde68a; font-family: sans-serif; }\nh1 { text-align: center; }',
  js: "document.getElementById('b').onclick = () => alert('أهلاً!');",
  python: 'name = "CodeLab"\nprint("Hello " + name)',
  cpp: '#include <iostream>\nint main() {\n  std::cout << "Hello";\n  return 0;\n}',
  java: 'public class Main {\n  public static void main(String[] a) {\n    System.out.println("Hello");\n  }\n}',
};
const KW = /\b(function|const|let|var|return|if|else|for|while|class|import|def|print|int|void|public|static|new|include|true|false|null|None|and|or|not|in|try|catch)\b/g;
/* ===== Optional Supabase backend: real accounts, shared content, file uploads, synced progress. Off when env vars are missing ===== */
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sbOn = !!(SB && SBK);
const sess = () => { try { return JSON.parse(localStorage.getItem('cl_sess')); } catch { return null; } };
const sbH = () => ({ apikey: SBK, 'Content-Type': 'application/json', Authorization: `Bearer ${sess()?.access_token || SBK}` });
async function sbAuth(kind, body) {
  const r = await fetch(`${SB}/auth/v1/${kind === 'up' ? 'signup' : 'token?grant_type=password'}`, { method: 'POST', headers: { apikey: SBK, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!d.access_token) throw new Error(kind === 'up' && d.id ? 'تم إنشاء الحساب. افتح رسالة التأكيد في بريدك ثم سجّل الدخول.' : d.msg || d.error_description || 'البريد أو كلمة السر غير صحيحة');
  localStorage.setItem('cl_sess', JSON.stringify(d)); return d;
}
const sbGet = async (key) => { try { const r = await fetch(`${SB}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, { headers: sbH() }); return (await r.json())?.[0]?.value ?? null; } catch { return null; } };
const sbSet = (key, value) => fetch(`${SB}/rest/v1/kv`, { method: 'POST', headers: { ...sbH(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key, value }) }).catch(() => {});
const sbUpsert = (table, row) => fetch(`${SB}/rest/v1/${table}`, { method: 'POST', headers: { ...sbH(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(row) }).catch(() => {});
async function sbUpload(file) {
  const path = `${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
  const r = await fetch(`${SB}/storage/v1/object/content/${path}`, { method: 'POST', headers: { apikey: SBK, Authorization: `Bearer ${sess()?.access_token}`, 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  if (!r.ok) throw new Error('فشل الرفع: سجّل الدخول بحساب المالك أولاً (أو الملف أكبر من الحد المسموح)');
  return `${SB}/storage/v1/object/public/content/${path}`;
}
let llm = null; // optional on-device model (WebLLM), loaded only on demand

/* ===== Level generator: 100 progressive levels per language, answers computed by code ===== */
const geminiOn = !!process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const CHAT_RULES = 'أنت مساعد منصة CodeLab التعليمية. أجب بالعربية وباختصار، وفقط عن أمرين: (1) استخدام المنصة: محرر الأكواد، المستويات الـ100، المصادر الحرة، المفكرة، التنزيل المحمي، التسجيل. (2) تعلم البرمجة (HTML, CSS, JavaScript, Python, C++, Java). إذا كان السؤال خارج ذلك فاعتذر بلطف ووجّه المستخدم لسؤال عن المنصة أو البرمجة.';
const MK = {
html: `a|ينشئ رابطاً|<a href="#">رابط</a>
h1|هو أكبر عنوان|<h1>عنوان</h1>
p|يكتب فقرة نصية|<p>نص</p>
img|يعرض صورة|<img src="a.png" alt="x">
br|ينزل لسطر جديد|<br>
ul|ينشئ قائمة نقطية|<ul><li>1</li></ul>
ol|ينشئ قائمة مرقمة|<ol><li>1</li></ol>
div|يجمع عناصر في حاوية|<div class="box">..</div>
span|يلف جزءاً من النص|<span>نص</span>
button|ينشئ زراً|<button>اضغط</button>
input|ينشئ حقل إدخال|<input type="text">
form|ينشئ نموذجاً لإرسال البيانات|<form action="/go"></form>
table|ينشئ جدولاً|<table><tr><td>1</td></tr></table>
strong|يجعل النص عريضاً ومهماً|<strong>مهم</strong>
em|يجعل النص مائلاً|<em>نص</em>
hr|يرسم خطاً أفقياً|<hr>
label|يربط نصاً بحقل إدخال|<label for="n">الاسم</label>
textarea|ينشئ مربع نص كبير|<textarea rows="3"></textarea>
select|ينشئ قائمة منسدلة|<select><option>1</option></select>
video|يعرض فيديو|<video src="v.mp4" controls></video>
audio|يشغل صوتاً|<audio src="a.mp3" controls></audio>
header|يمثل رأس الصفحة|<header>..</header>
nav|يحتوي روابط التنقل|<nav><a href="#">1</a></nav>
main|يحتوي المحتوى الرئيسي|<main>..</main>
section|يقسم الصفحة إلى أقسام|<section>..</section>
article|يمثل مقالاً مستقلاً|<article>..</article>
footer|يمثل ذيل الصفحة|<footer>..</footer>
canvas|يرسم رسوماً بالجافاسكريبت|<canvas id="c"></canvas>
iframe|يضمّن صفحة داخل صفحة|<iframe src="p.html"></iframe>
script|يضيف كود جافاسكريبت|<script src="a.js"></script>
link|يربط ملف CSS|<link rel="stylesheet" href="s.css">
meta|يحدد بيانات الصفحة مثل الترميز|<meta charset="utf-8">
title|يحدد عنوان التبويب|<title>موقعي</title>
details|ينشئ محتوى قابلاً للطي|<details><summary>أكثر</summary></details>`,
css: `color|يغير لون النص|color: red;
background|يغير خلفية العنصر|background: #222;
font-size|يحدد حجم الخط|font-size: 18px;
margin|يضبط المسافة الخارجية|margin: 10px;
padding|يضبط المسافة الداخلية|padding: 10px;
border|يضيف إطاراً|border: 1px solid red;
border-radius|يدوّر الحواف|border-radius: 12px;
width|يحدد العرض|width: 200px;
height|يحدد الارتفاع|height: 100px;
display|يغير طريقة عرض العنصر|display: flex;
justify-content|يوزع عناصر flex أفقياً|justify-content: center;
align-items|يحاذي عناصر flex عمودياً|align-items: center;
flex-direction|يغير اتجاه flex|flex-direction: column;
gap|يضع مسافة بين عناصر flex أو grid|gap: 8px;
grid-template-columns|يحدد أعمدة الشبكة|grid-template-columns: 1fr 1fr;
position|يحدد نوع التموضع|position: absolute;
top|يزيح العنصر من الأعلى|top: 10px;
z-index|يرتب العناصر فوق بعضها|z-index: 5;
opacity|يتحكم في الشفافية|opacity: 0.5;
box-shadow|يضيف ظلاً للعنصر|box-shadow: 0 4px 8px #000;
text-align|يحاذي النص|text-align: center;
font-weight|يجعل الخط عريضاً|font-weight: bold;
line-height|يحدد تباعد الأسطر|line-height: 1.6;
overflow|يتحكم في المحتوى الزائد|overflow: hidden;
cursor|يغير شكل المؤشر|cursor: pointer;
transition|يجعل التغيير سلساً|transition: all 0.3s;
transform|يدوّر أو يكبّر العنصر|transform: rotate(45deg);
animation|يشغل حركة معرّفة بـ keyframes|animation: spin 2s infinite;
@media|يطبق أنماطاً حسب حجم الشاشة|@media (max-width: 600px) { }
:hover|يطبق نمطاً عند مرور المؤشر|a:hover { color: red; }
::before|يضيف محتوى قبل العنصر|p::before { content: "★"; }
var(--x)|يستخدم متغير CSS|color: var(--main);
backdrop-filter|يضبب ما خلف العنصر|backdrop-filter: blur(8px);
object-fit|يحدد كيفية ملء الصورة لإطارها|object-fit: cover;`,
};
const rnd = (n, k) => { const x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const pk = (n, k, lo, hi) => lo + Math.floor(rnd(n, k) * (hi - lo + 1));
function genLevel(lang, n) {
  let q, ans, opts;
  if (lang === 'html' || lang === 'css') {
    const E = MK[lang].split('\n').map((l) => l.split('|')), i = Math.min(33, Math.floor((n - 1) / 3)), f = (n - 1) % 3, e = E[i];
    const o1 = E[(i + 11) % 34], o2 = E[(i + 23) % 34], w = lang === 'html' ? 'وسم' : 'خاصية أو أمر';
    if (f === 0) { q = `أي ${w} ${e[1]}؟`; opts = [e[0], o1[0], o2[0]]; }
    else if (f === 1) { q = `ماذا يفعل ${e[0]}؟`; opts = [e[1], o1[1], o2[1]]; }
    else { q = `أي كود صحيح ${e[1]}؟`; opts = [e[2], e[2].slice(0, -1), e[2].replace(/[:"=]/, '')]; if (opts[2] === e[2]) opts[2] = e[2] + '}'; }
    ans = opts[0];
  } else {
    const J = lang === 'js', P = lang === 'python', X = P ? '' : ';';
    const D = (a, v) => (P ? `${a} = ${v}` : J ? `let ${a} = ${v};` : `int ${a} = ${v};`);
    const PR = (x) => ({ js: `console.log(${x});`, python: `print(${x})`, cpp: `cout << ${x};`, java: `System.out.println(${x});` })[lang];
    const FN = (body) => (P ? `def f(x): return ${body}` : J ? `function f(x) { return ${body}; }` : `${lang === 'java' ? 'static ' : ''}int f(int x) { return ${body}; }`);
    const TN = (c, y, no) => (P ? `${y} if ${c} else ${no}` : `${c} ? ${y} : ${no}`);
    const FOR = (v, from, to, body) => (P ? `for ${v} in range(${from}, ${to}):\n    ${body}` : `for (${J ? 'let' : 'int'} ${v} = ${from}; ${v} < ${to}; ${v}++) ${body};`);
    const bd = Math.floor((n - 1) / 10), t = (n - 1) % 10;
    let a = 2 + t * 3 + pk(n, 1, 0, 2), b = pk(n, 2, 2, 5 + t), c = pk(n, 3, 2, 4 + t), L;
    if (bd === 0) { L = [D('a', a), D('b', b), PR('a + b')]; ans = a + b; }
    else if (bd === 1) { L = [D('a', a), D('b', b), D('c', c), PR('a * b - c')]; ans = a * b - c; }
    else if (bd === 2) { L = [D('a', a), D('b', b), D('c', c), PR('(a + b) * c - a')]; ans = (a + b) * c - a; }
    else if (bd === 3) { const K = 3 + t * 2 + pk(n, 4, 0, 1); L = [D('s', 0), FOR('i', 1, K + 1, 's += i'), PR('s')]; ans = (K * (K + 1)) / 2; }
    else if (bd === 4) { const K = 6 + t * 2 + pk(n, 4, 0, 1), m = pk(n, 6, 2, 3); L = [D('s', 0), FOR('i', 1, K + 1, P ? `if i % ${m} == 0: s += i` : `if (i % ${m} == 0) s += i`), PR('s')]; ans = 0; for (let i = 1; i <= K; i++) if (i % m === 0) ans += i; }
    else if (bd === 5) { L = [FN(`x * ${a} + ${b}`), PR(`f(${c})`)]; ans = c * a + b; }
    else if (bd === 6) { a = 20 + t * 6 + pk(n, 1, 0, 5); b = pk(n, 2, 3, 9); L = [D('a', a), D('b', b), PR(P ? 'a // b + a % b' : J ? 'Math.floor(a / b) + a % b' : 'a / b + a % b')]; ans = Math.floor(a / b) + (a % b); }
    else if (bd === 7) { const K = 3 + t, M = pk(n, 5, 3, 7); L = [D('c', 0), FOR('i', 0, K, P ? `for j in range(0, ${M}):\n        if (i + j) % 2 == 0: c += 1` : `for (${J ? 'let' : 'int'} j = 0; j < ${M}; j++) if ((i + j) % 2 == 0) c++`), PR('c')]; ans = 0; for (let i = 0; i < K; i++) for (let j = 0; j < M; j++) if ((i + j) % 2 === 0) ans++; }
    else if (bd === 8) { const K = pk(n, 4, 3, 7), z = 1 + t; L = [FN(TN('x <= 1', '1', 'x * f(x - 1)')), PR(`f(${K}) + ${z}`)]; ans = z; let fa = 1; for (let i = 2; i <= K; i++) fa *= i; ans += fa; }
    else { const K = 6 + t; L = [FN(TN('x < 2', 'x', 'f(x - 1) + f(x - 2)')), PR(`f(${K})`)]; let x = 0, y = 1; for (let i = 0; i < K; i++) [x, y] = [y, x + y]; ans = x; }
    q = `ما ناتج هذا الكود؟\n${L.join('\n')}`; opts = [ans, ans + 1 + (n % 3), ans - 2 - (n % 2)];
  }
  const k = Math.floor(rnd(n, 9) * 3), r = opts.map((_, j) => String(opts[(j + k) % 3]));
  return [q, r, r.indexOf(String(ans))];
}
const DEF = {
  pin: '100100',
  dev: { name: 'اسم المطور', bio: 'مطور برمجيات شغوف بتعليم البرمجة بطريقة ممتعة ومبسطة للجميع.', photo: '', tech: ['React', 'Next.js', 'Python', 'C++', 'Java', 'Tailwind', 'Node.js', 'Git'] },
  links: [{ n: 'واتساب', u: 'https://wa.me/' }, { n: 'يوتيوب', u: 'https://youtube.com' }, { n: 'تيك توك', u: 'https://tiktok.com' }, { n: 'جيت هاب', u: 'https://github.com' }],
  resources: Object.keys(LANGS).flatMap((k) => [{ id: k + '_v', lang: k, t: `فيديو شرح ${LANGS[k]}`, type: 'video', u: '' }, { id: k + '_p', lang: k, t: `مذكرة ${LANGS[k]}`, type: 'pdf', u: '' }]),
  custom: {},
};

/* ===== Helpers ===== */
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
function usePersist(key, init) {
  const [v, setV] = useState(init);
  const ready = useRef(false);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setV(JSON.parse(s)); } catch {} ready.current = true; }, [key]);
  useEffect(() => { if (ready.current) try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function highlight(code, lang) {
  let t = esc(code);
  if (lang === 'html') return t.replace(/(&lt;\/?[\w-]+)|(\s[\w-]+=)|("[^"]*")|(&gt;)/g, (m, a, b, c, d) => a || d ? `<i class="t1">${m}</i>` : b ? `<i class="t2">${m}</i>` : `<i class="t3">${m}</i>`);
  if (lang === 'css') return t.replace(/([\w-]+)(\s*:)|([.#][\w-]+)|(\d+[a-z%]*)/g, (m, p, c, s, n) => p ? `<i class="t2">${p}</i>${c}` : s ? `<i class="t1">${m}</i>` : `<i class="t4">${m}</i>`);
  const cm = lang === 'python' ? '#.*' : '\\/\\/.*';
  return t.replace(new RegExp(`(${cm})|("(?:[^"\\\\]|\\\\.)*"|'[^']*')|(\\b\\d+\\b)`, 'g'), (m, c, s, n) => c ? `<i class="t5">${m}</i>` : s ? `<i class="t3">${m}</i>` : `<i class="t4">${m}</i>`).replace(/(<i class="t\d">.*?<\/i>)|\b(function|const|let|var|return|if|else|for|while|class|import|def|print|int|void|public|static|new|include|true|false|null|None|and|or|not|in|try|catch)\b/g, (m, k, w) => k ? k : `<i class="t1">${w}</i>`);
}
/* ===== On-device diagnostics (no network): finds errors and explains them in Arabic ===== */
function diagnose(code, lang) {
  const d = [], add = (line, why, fix) => d.push({ line, why, fix });
  const lines = code.split('\n');
  if (lang === 'html') {
    const V = 'area base br col embed hr img input link meta source track wbr'.split(' '), st = [], re = /<(\/?)([a-zA-Z][\w-]*)[^>]*?>/g, ln = (i) => code.slice(0, i).split('\n').length;
    let m;
    while ((m = re.exec(code))) {
      const t = m[2].toLowerCase(); if (V.includes(t) || m[0].endsWith('/>')) continue;
      if (!m[1]) st.push([t, ln(m.index)]);
      else { const p = st.pop(); if (!p || p[0] !== t) { add(ln(m.index), `الوسم </${t}> لا يطابق ${p ? '<' + p[0] + '>' : 'أي وسم مفتوح'}`, 'أغلق الوسوم بنفس ترتيب فتحها'); if (p) st.push(p); } }
    }
    st.forEach(([t, l]) => add(l, `الوسم <${t}> لم يُغلق`, `أضف </${t}> في المكان المناسب`));
    return d;
  }
  const st = [], pr = { ')': '(', ']': '[', '}': '{' }, nz = lines.map((l, i) => [l, i]).filter(([l]) => l.trim());
  lines.forEach((ln, i) => {
    let s = ln.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, 'S');
    if (lang === 'python') s = s.replace(/#.*/, ''); else if (lang !== 'css') s = s.replace(/\/\/.*/, '');
    if (/["'`]/.test(s)) add(i + 1, 'نص (string) لم تُغلق علامة التنصيص الخاصة به', 'أغلق النص بنفس علامة التنصيص التي بدأ بها');
    for (const ch of s) { if ('([{'.includes(ch)) st.push([ch, i + 1]); else if (pr[ch]) { const p = st.pop(); if (!p || p[0] !== pr[ch]) add(i + 1, `القوس '${ch}' لا يطابق قوس فتح`, 'راجع أزواج الأقواس ( ) [ ] { }'); } }
    const tr = s.trim(), nx = (nz.find(([, j]) => j > i) || [''])[0].trim(), pv = [...nz].reverse().find(([, j]) => j < i);
    if (lang === 'python') {
      if (/^(def|if|elif|else|for|while|class|try|except|with)\b/.test(tr) && !tr.endsWith(':')) add(i + 1, 'ينقص النقطتان : في نهاية السطر', `اكتب ${tr}:`);
      if (/^print\s+[\w"']/.test(tr)) add(i + 1, 'دالة print تحتاج أقواساً', 'اكتب print( ... )');
      if (/^(if|while|elif)\b[^=]*[^=!<>]=[^=]/.test(tr)) add(i + 1, 'استخدمت = (إسناد) بدل == (مقارنة)', 'استبدل = بـ ==');
      if (pv && tr && pv[0].trim().endsWith(':') && ln.match(/^\s*/)[0].length <= pv[0].match(/^\s*/)[0].length) add(i + 1, 'السطر بعد النقطتين يجب أن يكون مُزاحاً للداخل', 'أضف مسافتين أو أربع في بداية السطر');
    } else if (lang === 'css') {
      if (/^[\w-]+\s*:\s*[^;{}]+$/.test(tr)) add(i + 1, 'ينقص ; في نهاية الخاصية', 'أضف ; في نهاية السطر');
      if (/^[\w-]+\s+[^:{};]+;$/.test(tr)) add(i + 1, 'ينقص النقطتان : بين اسم الخاصية وقيمتها', 'اكتب الخاصية: القيمة;');
    } else {
      if (/^(if|while)\s*\([^=!<>]*[^=!<>]=[^=][^)]*\)/.test(tr)) add(i + 1, 'استخدمت = (إسناد) داخل الشرط بدل == (مقارنة)', 'استبدل = بـ ==');
      if (lang !== 'js' && tr && !/[;{}(,:+\-*/&|=?]$/.test(tr) && !/^(#|\/\*|\*|if\b|for\b|while\b|else\b|\)|public|private|protected|class|using|import|package)/.test(tr) && !nx.startsWith('{')) add(i + 1, 'ينقص ; في نهاية السطر', 'أضف ; في نهاية الجملة');
      if (lang === 'java' && /\bstring\s+\w+/.test(tr)) add(i + 1, 'اسم النوع string يجب أن يكون String بحرف كبير', 'اكتب String');
      if (lang === 'java' && /\bsystem\.out/.test(tr)) add(i + 1, 'اسم System يجب أن يبدأ بحرف كبير', 'اكتب System.out.println');
    }
  });
  st.forEach(([c, l]) => add(l, `القوس '${c}' مفتوح ولم يُغلق`, 'أضف قوس الإغلاق المناسب'));
  if (lang === 'cpp' && /\bcout\b/.test(code) && !/#include\s*<iostream>/.test(code)) add(1, 'تستخدم cout بدون تضمين المكتبة', 'أضف #include <iostream> في أول الملف');
  if (lang === 'java' && !/class\s+\w+/.test(code)) add(1, 'لا يوجد class', 'كل كود جافا يجب أن يكون داخل class');
  if (lang === 'js' && !d.length) { try { new Function(code); } catch (e) { const m = e.message; add(0, /end of input/.test(m) ? 'الكود ناقص: قوس أو } لم يُغلق' : /missing \)/.test(m) ? 'قوس ) ناقص' : /Unexpected token|Invalid or unexpected/.test(m) ? 'رمز غير متوقع (فاصلة أو قوس أو علامة تنصيص ناقصة أو زائدة)' : m, 'راجع الأسطر الأخيرة قبل الخطأ وتأكد من اكتمال الأقواس والنصوص'); } }
  return d;
}
const fmtDiag = (d) => `📍 ${d.file ? d.file + ' · ' : ''}${d.line ? 'سطر ' + d.line : 'مكان الخطأ غير محدد'}\n🔎 السبب: ${d.why}\n🛠 الحل: ${d.fix}`;
const arJs = (m) => (/(\w+) is not defined/.test(m) ? `الاسم ${m.match(/(\w+) is not defined/)[1]} غير معرّف: تأكد من كتابته صحيحاً أو عرّفه قبل استخدامه` : /null|undefined/.test(m) ? 'تحاول استخدام عنصر غير موجود (غالباً الـ id غير مطابق لما في HTML)' : m);
async function explainWithGemini(code, lang, err) {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!key) return `**الخطأ:** ${err}\nلتفعيل الشرح الذكي أضف NEXT_PUBLIC_GEMINI_API_KEY في متغيرات البيئة على Vercel.`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: `أنت مصحح أكواد. اللغة: ${lang}. الخطأ: ${err}\nالكود:\n${code}\nاشرح بالعربية وبإيجاز: 1) مكان الخطأ 2) سببه التقني 3) طريقة إصلاحه. بدون مقدمات.` }] }] }) });
    const d = await r.json();
    return d?.candidates?.[0]?.content?.parts?.[0]?.text || 'تعذر الحصول على شرح الآن.';
  } catch { return 'تعذر الاتصال بخدمة الشرح. تحقق من الإنترنت.'; }
}

/* Offline encrypted store: AES-GCM in IndexedDB, entry named "<id>.codelab"; decrypted only in memory while playing */
const idb = () => new Promise((res, rej) => { const q = indexedDB.open('codelab-vault', 1); q.onupgradeneeded = () => q.result.createObjectStore('f'); q.onsuccess = () => res(q.result); q.onerror = rej; });
const idbOp = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('f', mode); const r = fn(tx.objectStore('f')); tx.oncomplete = () => res(r.result); tx.onerror = rej; }); };
async function vaultKey() {
  let raw = localStorage.getItem('cl_vk');
  if (!raw) { raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))); localStorage.setItem('cl_vk', raw); }
  return crypto.subtle.importKey('raw', Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function saveSecure(id, url) {
  const buf = await (await fetch(url)).arrayBuffer(), iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(), buf);
  await idbOp('readwrite', (s) => s.put({ iv, data: enc }, `${id}.codelab`));
}
async function openSecure(id) {
  const rec = await idbOp('readonly', (s) => s.get(`${id}.codelab`)); if (!rec) return null;
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, await vaultKey(), rec.data);
  return URL.createObjectURL(new Blob([dec], { type: 'video/mp4' }));
}

/* ===== UI atoms ===== */
const glass = 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_30px_-8px_rgba(168,85,247,.45)]';
const btn = 'px-4 py-2 rounded-xl font-bold transition active:scale-95';
const grad = 'bg-gradient-to-l from-fuchsia-600 to-violet-600 hover:brightness-125 text-white';
const Modal = ({ children, onClose }) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
    <div className={`${glass} bg-slate-900/90 w-full max-w-md p-6 cm`} onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);

/* ===== Editor ===== */
function Editor({ onError }) {
  const [lang, setLang] = useState('html');
  const [codes, setCodes] = usePersist('cl_codes', STARTERS);
  const [tab, setTab] = useState('html'); // web sub-tab
  const [out, setOut] = useState([]);
  const [run, setRun] = useState(0);
  const ta = useRef(null), pre = useRef(null);
  const web = ['html', 'css', 'js'].includes(lang);
  const cur = web ? tab : lang;
  const code = codes[cur] ?? '';
  const set = (v) => setCodes((c) => ({ ...c, [cur]: v }));
  const put = useCallback((text, caret = text.length) => {
    const el = ta.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    set(code.slice(0, a) + text + code.slice(b));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + caret; });
  }, [code, cur]);
  const PAIRS = { '{': '}', '[': ']', '(': ')', '<': '>', '"': '"' };
  const onKey = (e) => {
    const el = e.target, nx = code[el.selectionStart];
    if (Object.values(PAIRS).includes(e.key) && nx === e.key) { e.preventDefault(); requestAnimationFrame(() => (el.selectionStart = el.selectionEnd = el.selectionStart + 1)); el.selectionStart++; return; }
    if (PAIRS[e.key]) { e.preventDefault(); put(e.key + PAIRS[e.key], 1); }
    if (e.key === 'Tab') { e.preventDefault(); put('  '); }
  };
  useEffect(() => {
    const h = (e) => { if (e.data?.cl === 'err') { const dg = [{ line: e.data.l, why: arJs(e.data.m), fix: 'راجع هذا السطر في تبويب JS وتأكد من الأسماء والـ id', file: 'JS' }]; setOut([`✖ ${dg[0].why} (سطر ${e.data.l})`]); onError(codes.js, 'JavaScript', dg); } };
    window.addEventListener('message', h); return () => window.removeEventListener('message', h);
  }, [codes.js, onError]);
  const doRun = () => {
    const ds = web ? [['html', 'HTML'], ['css', 'CSS'], ['js', 'JS']].flatMap(([k, nm]) => diagnose(codes[k], k).map((x) => ({ ...x, file: nm }))) : diagnose(code, lang);
    if (web) setRun((n) => n + 1);
    if (ds.length) { setOut(ds.map((x) => `✖ ${x.file ? x.file + ' · ' : ''}${x.line ? 'سطر ' + x.line : ''}: ${x.why}`)); onError(code, LANGS[lang], ds); return; }
    const o = ['✔ تم التشغيل بدون أخطاء'];
    if (lang === 'python') [...code.matchAll(/print\((["'])(.*?)\1\s*(?:\+\s*(["'])?(.*?)\3?)?\)/g)].forEach((m) => o.push(m[2] + (m[4] ?? '')));
    if (lang === 'cpp') [...code.matchAll(/<<\s*"([^"]*)"/g)].forEach((m) => o.push(m[1]));
    if (lang === 'java') [...code.matchAll(/println\("([^"]*)"\)/g)].forEach((m) => o.push(m[1]));
    setOut(o);
  };
  const srcDoc = `<html dir="rtl"><style>${codes.css}</style><body>${codes.html}<script>window.onerror=(m,s,l)=>parent.postMessage({cl:'err',m,l},'*');${codes.js}<\/script></body></html>`;
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-3 gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        {Object.entries(LANGS).map(([k, v]) => <button key={k} onClick={() => { setLang(k); if (['html', 'css', 'js'].includes(k)) setTab(k); }} className={`${btn} text-sm ${lang === k || (web && k === tab && false) ? grad : 'bg-white/5 text-slate-300'}`}>{v}</button>)}
        <button onClick={doRun} className={`${btn} bg-emerald-500 text-black mr-auto`}>▶ تشغيل</button>
      </div>
      {web && <div className="flex gap-2">{['html', 'css', 'js'].map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-lg text-sm ${tab === t ? 'bg-amber-400 text-black font-bold' : 'bg-white/5 text-slate-300'}`}>{t.toUpperCase()}</button>)}</div>}
      <div className={`flex-1 grid gap-3 min-h-0 ${web ? 'md:grid-cols-2' : ''}`}>
        <div className={`${glass} relative overflow-hidden min-h-[220px]`} dir="ltr">
          <pre ref={pre} aria-hidden className="ed absolute inset-0 m-0 overflow-hidden" dangerouslySetInnerHTML={{ __html: highlight(code, cur) + '\n' }} />
          <textarea ref={ta} value={code} spellCheck={false} onChange={(e) => set(e.target.value)} onKeyDown={onKey}
            onScroll={(e) => { pre.current.scrollTop = e.target.scrollTop; pre.current.scrollLeft = e.target.scrollLeft; }}
            className="ed absolute inset-0 w-full h-full bg-transparent text-transparent caret-amber-300 resize-none outline-none" />
        </div>
        {web ? <iframe key={run} sandbox="allow-scripts" srcDoc={srcDoc} className="w-full h-full min-h-[220px] rounded-2xl bg-white" title="preview" /> : null}
      </div>
      <div className={`${glass} p-3 h-28 overflow-auto text-sm font-mono text-emerald-300`} dir="ltr">{out.length ? out.map((l, i) => <div key={i} className={l.startsWith('✖') ? 'text-rose-400' : ''}>{l}</div>) : <span className="text-slate-500">Terminal ›</span>}</div>
      <div className="flex gap-1 overflow-x-auto md:hidden" dir="ltr">
        {['{', '}', '[', ']', '<', '>', ';', '=', '"', ':'].map((c) => <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => (PAIRS[c] ? put(c + PAIRS[c], 1) : put(c))} className="min-w-10 h-10 rounded-lg bg-violet-900/60 text-amber-200 font-mono text-lg">{c}</button>)}
      </div>
    </div>
  );
}

/* ===== Levels + resources ===== */
function Levels({ cfg, user, setUser }) {
  const [lang, setLang] = useState('js');
  const [active, setActive] = useState(null);
  const [pick, setPick] = useState(null);
  const [res, setRes] = useState(null);
  const done = user.progress[lang] || 0;
  const getQ = (n) => cfg.custom[`${lang}:${n}`] || genLevel(lang, n);
  const tier = (n) => (n <= 33 ? ['مبتدئ', 'bg-emerald-500'] : n <= 66 ? ['متوسط', 'bg-amber-400'] : ['متقدم', 'bg-fuchsia-500']);
  const answer = (i) => {
    setPick(i);
    if (i === getQ(active)[2]) setTimeout(() => { setUser((u) => ({ ...u, progress: { ...u.progress, [lang]: Math.max(u.progress[lang] || 0, active) } })); setActive(null); setPick(null); }, 700);
    else setTimeout(() => setPick(null), 900);
  };
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap gap-2">{Object.entries(LANGS).map(([k, v]) => <button key={k} onClick={() => setLang(k)} className={`${btn} text-sm ${lang === k ? grad : 'bg-white/5 text-slate-300'}`}>{v}</button>)}</div>
      <p className="text-slate-300">تقدمك: <b className="text-amber-300">{done}</b> / 100</p>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => {
          const open = n <= done + 1, ok = n <= done, [tn, tc] = tier(n);
          return <button key={n} disabled={!open} onClick={() => setActive(n)} title={tn}
            className={`relative aspect-square rounded-xl grid place-items-center font-bold border ${ok ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : open ? 'border-fuchsia-400 text-white pulse' : 'bg-white/5 border-white/10 text-slate-600'}`}>
            {open ? n : '🔒'}<span className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full ${tc}`} /></button>;
        })}
      </div>
      <div className="flex gap-4 text-xs text-slate-400"><span>🟢 مبتدئ 1–33</span><span>🟡 متوسط 34–66</span><span>🟣 متقدم 67–100</span></div>
      <section className={`${glass} p-4`}>
        <h2 className="text-xl font-bold text-amber-300 mb-3">المصادر الحرة لـ {LANGS[lang]} · فيديوهات ومذكرات (مفتوحة بلا ترتيب)</h2>
        <div className="grid sm:grid-cols-2 gap-3">{cfg.resources.filter((r) => !r.lang || r.lang === lang).map((r) => (
          <button key={r.id} onClick={() => setRes(r)} className="text-right p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10">
            <span className="text-2xl">{r.type === 'video' ? '🎬' : '📄'}</span> <span className="font-bold">{r.t}</span> <span className="text-xs text-slate-400">{r.u ? '' : '(لم يُضف بعد)'}</span></button>))}</div>
      </section>
      {active && (() => { const [q, o] = getQ(active); return (
        <Modal onClose={() => setActive(null)}>
          <span className={`text-xs px-2 py-1 rounded-full text-black ${tier(active)[1]}`}>مستوى {active} · {tier(active)[0]}</span>
          <h3 className="text-lg font-bold mt-4 mb-2">{q.split('\n')[0]}</h3>{q.includes('\n') && <pre dir="ltr" className="bg-black/40 rounded-xl p-3 mb-3 text-sm text-emerald-300 overflow-auto font-mono">{q.split('\n').slice(1).join('\n')}</pre>}
          <div className="space-y-2">{o.map((t, i) => <button key={i} dir="auto" onClick={() => answer(i)} className={`w-full p-3 rounded-xl border text-start font-mono ${pick === i ? (i === getQ(active)[2] ? 'bg-emerald-500/30 border-emerald-400' : 'bg-rose-500/30 border-rose-400') : 'bg-white/5 border-white/10'}`}>{t}</button>)}</div>
        </Modal>); })()}
      {res && <ResourceView r={res} user={user} setUser={setUser} onClose={() => setRes(null)} />}
    </div>
  );
}

function ResourceView({ r, user, setUser, onClose }) {
  const [src, setSrc] = useState(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(true);
  const direct = /\.(mp4|webm)(\?|$)/i.test(r.u);
  const off = (user.offline || []).includes(r.id);
  useEffect(() => () => src && URL.revokeObjectURL(src), [src]);
  const dl = async () => { setMsg('جارٍ التنزيل والتشفير...'); try { await saveSecure(r.id, r.u); setUser((u) => ({ ...u, offline: [...(u.offline || []), r.id] })); setMsg('تم الحفظ مشفراً ✔'); } catch { setMsg('تعذر التنزيل (الرابط يجب أن يكون ملف mp4 مباشر يسمح بالـ CORS)'); } };
  const play = async () => setSrc(await openSecure(r.id));
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/95 overflow-auto p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between mb-3"><h3 className="text-xl font-bold">{r.t}</h3><button onClick={onClose} className={`${btn} bg-white/10`}>✕ إغلاق</button></div>
        <div className="aspect-video rounded-2xl overflow-hidden bg-black">
          {src ? <video src={src} controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} className="w-full h-full" />
            : r.type === 'video' && r.u ? (direct ? <video src={r.u} controls controlsList="nodownload" className="w-full h-full" /> : <iframe src={r.u} className="w-full h-full" allowFullScreen title={r.t} />)
            : r.u ? <iframe src={r.u} className="w-full h-full" title={r.t} /> : <div className="h-full grid place-items-center text-slate-500">لم يُرفع الملف بعد</div>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          {direct && !off && <button onClick={dl} className={`${btn} ${grad}`}>⬇ تنزيل محمي</button>}
          {off && <button onClick={play} className={`${btn} bg-emerald-500 text-black`}>▶ تشغيل بدون إنترنت</button>}
          <button onClick={() => setOpen(!open)} className={`${btn} bg-amber-400 text-black`}>📝 المفكرة</button>
          <span className="text-sm text-slate-400">{msg}</span>
        </div>
      </div>
      {open && <Notebook rid={r.id} user={user} setUser={setUser} />}
    </div>
  );
}

function Notebook({ rid, user, setUser }) {
  return (
    <aside className={`${glass} bg-slate-900/95 fixed bottom-0 left-0 right-0 md:left-4 md:right-auto md:bottom-4 md:w-80 h-64 p-3 flex flex-col z-50`}>
      <b className="text-amber-300 mb-2">مفكرتي · تُحفظ تلقائياً</b>
      <textarea value={user.notes?.[rid] || ''} onChange={(e) => setUser((u) => ({ ...u, notes: { ...u.notes, [rid]: e.target.value } }))} placeholder="دوّن ملاحظاتك عن هذا الدرس..." className="flex-1 bg-black/30 rounded-xl p-3 outline-none resize-none" />
    </aside>
  );
}

/* ===== Admin ===== */
function Admin({ cfg, setCfg, onExit }) {
  const [ok, setOk] = useState(false), [pin, setPin] = useState(''), [err, setErr] = useState('');
  const [lock, setLock] = usePersist('cl_lock', { n: 0, until: 0 });
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('lvl');
  const [users, setUsers] = useState([]);
  const loadUsers = () => sbOn && fetch(`${SB}/rest/v1/profiles?select=*&order=last_seen.desc`, { headers: sbH() }).then((r) => r.json()).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => setUsers([]));
  useEffect(() => { if (ok && tab === 'usr') loadUsers(); }, [ok, tab]);
  const [f, setF] = useState({ lang: 'js', n: 1, q: '', a: '', b: '', c: '', right: 0, rt: '', ru: '', rtype: 'video', rl: 'js', newPin: '', ln: '', lu: '' });
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const inp = 'w-full bg-black/30 border border-white/10 rounded-xl p-2 my-1 outline-none focus:border-fuchsia-400';
  const login = async () => { if (Date.now() < lock.until) return setErr('محاولات كثيرة، حاول بعد قليل'); const h = await sha(pin); const stored = cfg.pinHash || (await sha(DEF.pin)); if (h === stored) { setLock({ n: 0, until: 0 }); setOk(true); } else { const n = lock.n + 1; setLock(n >= 5 ? { n: 0, until: Date.now() + 300000 } : { n, until: 0 }); setErr(n >= 5 ? 'تم القفل 5 دقائق' : 'الرمز غير صحيح'); } };
  if (!ok) return (
    <div className="grid place-items-center h-[70vh] p-4"><div className={`${glass} p-6 w-full max-w-sm text-center`}>
      <div className="text-4xl mb-2">🔐</div><h2 className="font-bold mb-3">لوحة الأدمن</h2>
      <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="رمز المرور" className={`${inp} text-center tracking-widest`} />
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button onClick={login} className={`${btn} ${grad} w-full mt-2`}>دخول</button>
      <button onClick={onExit} className="block mx-auto text-xs text-slate-400 mt-3">رجوع</button></div></div>);
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex gap-2 flex-wrap"><button onClick={onExit} className={`${btn} text-sm bg-rose-600 text-white`}>🔒 خروج</button>{[['lvl', 'المستويات'], ['res', 'المصادر'], ['dev', 'المطور والروابط'], ['usr', 'المستخدمون'], ['pin', 'الأمان']].map(([k, v]) => <button key={k} onClick={() => setTab(k)} className={`${btn} text-sm ${tab === k ? grad : 'bg-white/5'}`}>{v}</button>)}</div>
      <div className={`${glass} p-4`}>
        {tab === 'lvl' && <>
          <select value={f.lang} onChange={u('lang')} className={inp}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k} className="text-black">{v}</option>)}</select>
          <input type="number" min="1" max="100" value={f.n} onChange={u('n')} className={inp} placeholder="رقم المستوى" />
          <input value={f.q} onChange={u('q')} className={inp} placeholder="السؤال" />
          {['a', 'b', 'c'].map((k) => <input key={k} value={f[k]} onChange={u(k)} className={inp} placeholder={`الخيار ${k.toUpperCase()}`} />)}
          <select value={f.right} onChange={u('right')} className={inp}>{['A', 'B', 'C'].map((x, i) => <option key={x} value={i} className="text-black">الإجابة الصحيحة: {x}</option>)}</select>
          <button className={`${btn} bg-white/10 w-full mb-2`} onClick={() => { const L = cfg.custom[`${f.lang}:${f.n}`] || genLevel(f.lang, +f.n); setF({ ...f, q: L[0], a: L[1][0], b: L[1][1], c: L[1][2], right: L[2] }); }}>تحميل المستوى الحالي للتعديل</button>
          <button className={`${btn} ${grad} w-full`} onClick={() => { setCfg({ ...cfg, custom: { ...cfg.custom, [`${f.lang}:${f.n}`]: [f.q, [f.a, f.b, f.c], +f.right] } }); setF({ ...f, q: '', a: '', b: '', c: '' }); }}>حفظ المستوى</button>
          <p className="text-xs text-slate-400 mt-2">المستويات المخصصة: {Object.keys(cfg.custom).length}</p></>}
        {tab === 'res' && <>
          <select value={f.rl} onChange={u('rl')} className={inp}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k} className="text-black">{v}</option>)}</select>
          <input value={f.rt} onChange={u('rt')} className={inp} placeholder="العنوان" />
          <input value={f.ru} onChange={u('ru')} className={inp} placeholder="الرابط (YouTube embed / mp4 / pdf)" dir="ltr" />
          {sbOn ? <input type="file" accept="video/*,.pdf" onChange={async (e) => { const fl = e.target.files[0]; if (!fl) return; try { setMsg('جارٍ الرفع...'); const url = await sbUpload(fl); setF((o) => ({ ...o, ru: url, rt: o.rt || fl.name })); setMsg('تم الرفع ✔ اضغط إضافة مصدر'); } catch (er) { setMsg(er.message); } }} className={inp} /> : <p className="text-xs text-slate-400">رفع الملفات يتطلب تفعيل Supabase (انظر ملف الإعداد).</p>}
          <p className="text-xs text-amber-300">{msg}</p>
          <select value={f.rtype} onChange={u('rtype')} className={inp}><option value="video" className="text-black">فيديو</option><option value="pdf" className="text-black">PDF</option></select>
          <button className={`${btn} ${grad} w-full`} onClick={() => { setCfg({ ...cfg, resources: [...cfg.resources, { id: 'r' + Date.now(), lang: f.rl, t: f.rt, u: f.ru, type: f.rtype }] }); setF({ ...f, rt: '', ru: '' }); }}>إضافة مصدر</button>
          {cfg.resources.map((r) => <div key={r.id} className="py-2 border-b border-white/5"><div className="flex justify-between"><span>{LANGS[r.lang] || 'الكل'} · {r.type === 'video' ? '🎬' : '📄'} {r.t}</span><button onClick={() => setCfg({ ...cfg, resources: cfg.resources.filter((x) => x.id !== r.id) })} className="text-rose-400">حذف</button></div><input value={r.u} dir="ltr" placeholder="الرابط" onChange={(e) => setCfg({ ...cfg, resources: cfg.resources.map((x) => (x.id === r.id ? { ...x, u: e.target.value } : x)) })} className={inp} /></div>)}</>}
        {tab === 'dev' && <>
          <input value={cfg.dev.name} onChange={(e) => setCfg({ ...cfg, dev: { ...cfg.dev, name: e.target.value } })} className={inp} placeholder="الاسم" />
          <input value={cfg.dev.photo} onChange={(e) => setCfg({ ...cfg, dev: { ...cfg.dev, photo: e.target.value } })} className={inp} placeholder="رابط الصورة" dir="ltr" />
          <textarea value={cfg.dev.bio} onChange={(e) => setCfg({ ...cfg, dev: { ...cfg.dev, bio: e.target.value } })} className={inp} rows={3} />
          <input value={cfg.dev.tech.join(',')} onChange={(e) => setCfg({ ...cfg, dev: { ...cfg.dev, tech: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} className={inp} placeholder="التقنيات مفصولة بفاصلة" />
          <hr className="border-white/10 my-3" />
          {cfg.links.map((l, i) => <div key={i} className="flex gap-1"><input value={l.n} onChange={(e) => setCfg({ ...cfg, links: cfg.links.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)) })} className={inp} /><input value={l.u} dir="ltr" onChange={(e) => setCfg({ ...cfg, links: cfg.links.map((x, j) => (j === i ? { ...x, u: e.target.value } : x)) })} className={inp} /><button onClick={() => setCfg({ ...cfg, links: cfg.links.filter((_, j) => j !== i) })} className="text-rose-400 px-2">✕</button></div>)}
          <div className="flex gap-1"><input value={f.ln} onChange={u('ln')} className={inp} placeholder="اسم الرابط" /><input value={f.lu} onChange={u('lu')} className={inp} placeholder="https://" dir="ltr" /><button onClick={() => { if (f.ln && f.lu) { setCfg({ ...cfg, links: [...cfg.links, { n: f.ln, u: f.lu }] }); setF({ ...f, ln: '', lu: '' }); } }} className={`${btn} bg-emerald-500 text-black`}>+</button></div></>}
        {tab === 'usr' && (sbOn ? <>
          <div className="flex justify-between mb-2"><b>عدد المستخدمين: {users.length}</b><button onClick={loadUsers} className="text-amber-300 text-sm">تحديث</button></div>
          {users.length === 0 && <p className="text-xs text-slate-400">لا يوجد مستخدمون بعد، أو أنك لم تسجّل الدخول ببريد المالك (مطلوب لعرض البيانات).</p>}
          {users.map((x) => <div key={x.id} className="py-2 border-b border-white/5 text-sm"><b>{x.name || 'بدون اسم'}</b> · <span dir="ltr">{x.email}</span><br />📞 <span dir="ltr">{x.phone || '-'}</span> · مستويات منجزة: {x.levels} · آخر ظهور: {new Date(x.last_seen).toLocaleDateString('ar-EG')}</div>)}</> : <p className="text-sm text-slate-400">عرض بيانات المستخدمين يتطلب تفعيل Supabase (حسابات حقيقية على خادم).</p>)}
        {tab === 'pin' && <>
          <input type="password" value={f.newPin} onChange={u('newPin')} className={inp} placeholder="رمز جديد (4 أرقام على الأقل)" />
          <button className={`${btn} ${grad} w-full`} onClick={async () => { if (f.newPin.length >= 4) { setCfg({ ...cfg, pinHash: await sha(f.newPin) }); setF({ ...f, newPin: '' }); } }}>تحديث الرمز</button></>}
      </div>
    </div>
  );
}

/* ===== Profile with 3D tilt cards ===== */
function Tilt({ children }) {
  const [s, setS] = useState('');
  return <div onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setS(`perspective(600px) rotateY(${((e.clientX - r.left) / r.width - 0.5) * 24}deg) rotateX(${-((e.clientY - r.top) / r.height - 0.5) * 24}deg) scale(1.06)`); }} onMouseLeave={() => setS('')} style={{ transform: s, transition: 'transform .15s' }} className={`${glass} p-4 text-center font-bold text-amber-200`}>{children}</div>;
}
function Profile({ cfg }) {
  const d = cfg.dev;
  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6 text-center">
      <div className="w-32 h-32 mx-auto rounded-full p-1 bg-gradient-to-tr from-fuchsia-500 via-amber-400 to-emerald-400">
        {d.photo ? <img src={d.photo} alt={d.name} className="w-full h-full rounded-full object-cover" /> : <div className="w-full h-full rounded-full bg-slate-900 grid place-items-center text-5xl">👨‍💻</div>}</div>
      <h1 className="text-3xl font-black">{d.name}</h1>
      <p className="text-slate-300 max-w-xl mx-auto leading-8">{d.bio}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{d.tech.map((t) => <Tilt key={t}>{t}</Tilt>)}</div>
      <div className="flex flex-wrap justify-center gap-3">{cfg.links.map((l) => <a key={l.n} href={l.u} target="_blank" rel="noopener noreferrer" className={`${btn} ${grad}`}>{l.n}</a>)}</div>
    </div>
  );
}

function Chat() {
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState([]), [t, setT] = useState(''), [busy, setBusy] = useState(false);
  const send = async () => {
    if (!t.trim() || busy) return;
    const h = [...msgs, { role: 'user', text: t }]; setMsgs(h); setT(''); setBusy(true);
    let reply = 'تعذر الاتصال الآن، حاول مرة أخرى.';
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: CHAT_RULES }] }, contents: h.slice(-10).map((m) => ({ role: m.role, parts: [{ text: m.text }] })) }) });
      reply = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || reply;
    } catch {}
    setMsgs([...h, { role: 'model', text: reply }]); setBusy(false);
  };
  return (
    <>
      <button onClick={() => setOpen(!open)} className={`${btn} ${grad} fixed bottom-20 right-4 z-40 rounded-full shadow-lg`}>🤖 تواصل مع الذكاء الاصطناعي</button>
      {open && (
        <div className={`${glass} bg-slate-900/95 fixed bottom-36 right-4 left-4 sm:left-auto sm:w-96 h-96 z-40 flex flex-col p-3`}>
          <b className="text-amber-300 mb-2">مساعد CodeLab · المنصة وتعلم البرمجة فقط</b>
          <div className="flex-1 overflow-auto space-y-2 text-sm">{msgs.length === 0 && <p className="text-slate-500">اسألني عن طريقة استخدام المنصة أو عن أي مفهوم برمجي.</p>}
            {msgs.map((m, i) => <div key={i} className={`p-2 rounded-xl whitespace-pre-wrap ${m.role === 'user' ? 'bg-violet-700/50' : 'bg-white/10'}`}>{m.text}</div>)}{busy && <p className="text-slate-500">...</p>}</div>
          <div className="flex gap-2 mt-2"><input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="اكتب سؤالك" className="flex-1 bg-black/30 rounded-xl p-2 outline-none" /><button onClick={send} className={`${btn} bg-emerald-500 text-black`}>إرسال</button></div>
        </div>)}
    </>
  );
}

/* ===== Root ===== */
export default function CodeLab({ startScreen = 'editor' }) {
  const [screen, setScreen] = useState(startScreen); // currentScreen
  const [cfg, setCfg] = usePersist('cl_cfg', DEF);
  const [user, setUser] = usePersist('cl_user', { progress: {}, notes: {}, offline: [] });
  const [isLoggedIn, setLogged] = usePersist('cl_logged', false);
  const [auth, setAuth] = useState(null); // target screen waiting for login
  const [form, setForm] = useState({ name: '', email: '', phone: '', pass: '' });
  const [mode, setMode] = useState('in'); // in = login, up = signup
  const [inst, setInst] = useState(null);
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); const h = (e) => { e.preventDefault(); setInst(e); }; window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h); }, []);
  const [explain, setExplain] = useState(null);
  const [theme, setTheme] = usePersist('cl_theme', 'dark');
  useEffect(() => { if (location.hash === '#light' || location.hash === '#dark') setTheme(location.hash.slice(1)); }, []);
  const tm = useRef(), pulled = useRef(false);
  const saveCfg = (c) => { setCfg(c); if (sbOn && sess()) { clearTimeout(tm.current); tm.current = setTimeout(() => sbSet('cfg', c), 800); } };
  const pull = async () => { const ss = sess(); if (!sbOn || !ss) return; const v = await sbGet('u:' + ss.user.id); if (v) setUser(v); pulled.current = true; };
  useEffect(() => {
    pull();
    if (sbOn) sbGet('cfg').then((v) => v && setCfg(v));
  }, []);
  useEffect(() => { if (!sbOn || !pulled.current || !sess()) return; const id = setTimeout(() => { sbSet('u:' + sess().user.id, user); saveProfile(user); }, 1000); return () => clearTimeout(id); }, [user]);
  // Hidden admin entry: tap the logo 7 times within 3s (or Ctrl+Shift+A on desktop)
  const taps = useRef({ n: 0, t: 0 });
  const tap = () => { const now = Date.now(), k = taps.current; k.n = now - k.t > 3000 ? 1 : k.n + 1; k.t = now; if (k.n >= 7) { k.n = 0; setScreen('admin'); } };
  useEffect(() => { const h = (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') setScreen('admin'); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const go = (s) => { if (s === 'levels' && !isLoggedIn) setAuth(s); else setScreen(s); };
  const saveProfile = (u) => { const ss = sess(); if (!sbOn || !ss) return; const md = ss.user?.user_metadata || {}; sbUpsert('profiles', { id: ss.user.id, name: md.name || '', email: ss.user.email, phone: md.phone || '', levels: Object.values(u.progress || {}).reduce((a, b) => a + b, 0), last_seen: new Date().toISOString() }); };
  const login = async () => {
    if (!form.email.includes('@') || form.pass.length < 6 || (mode === 'up' && !form.name)) return alert('أكمل الحقول: بريد صحيح وكلمة سر 6 أحرف على الأقل' + (mode === 'up' ? ' والاسم' : ''));
    if (sbOn) { try { await sbAuth(mode, mode === 'up' ? { email: form.email, password: form.pass, data: { name: form.name, phone: form.phone } } : { email: form.email, password: form.pass }); pulled.current = false; await pull(); saveProfile(user); } catch (e) { return alert(e.message); } }
    setLogged(true); setScreen(auth); setAuth(null);
  };
    const onError = useCallback(async (code, lang, diags) => {
    const local = diags.map(fmtDiag).join('\n\n');
    if (!geminiOn) return setExplain({ text: local, local: true });
    setExplain({ loading: true });
    const t = await explainWithGemini(code, lang, diags.map((x) => `سطر ${x.line}: ${x.why}`).join('; '));
    setExplain(t.startsWith('تعذر') ? { text: local, local: true } : { text: t });
  }, []);
  const boost = async () => {
    const base = explain.text; setExplain({ loading: true });
    try {
      llm ||= await (await import(/* webpackIgnore: true */ 'https://esm.run/@mlc-ai/web-llm')).CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
      const r = await llm.chat.completions.create({ messages: [{ role: 'system', content: 'اشرح خطأ البرمجة التالي بالعربية ببساطة وبإيجاز.' }, { role: 'user', content: base }] });
      setExplain({ text: base + '\n\n🧠 شرح مبسّط:\n' + r.choices[0].message.content, local: true, boosted: true });
    } catch { setExplain({ text: base + '\n\n(الجهاز لا يدعم WebGPU أو فشل تنزيل النموذج)', local: true, boosted: true }); }
  };
  const items = [['editor', 'محرر الأكواد'], ['levels', 'الـ 100 مستوى'], ['profile', 'بروفايل المطور']];
  return (
    <div dir="rtl" className={`min-h-screen text-slate-100 app ${theme === 'light' ? 'light' : ''}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&family=JetBrains+Mono&display=swap');
        .app{font-family:Tajawal,sans-serif;background:radial-gradient(900px 500px at 85% -10%,#4c1d95aa,transparent),radial-gradient(700px 400px at 0% 100%,#86198f55,transparent),#0b0816}
        .ed{font:14px/1.6 'JetBrains Mono',monospace;padding:14px;white-space:pre;tab-size:2;color:#e2e8f0}
        textarea.ed{-webkit-text-fill-color:transparent}
        .t1{color:#c084fc;font-style:normal}.t2{color:#fbbf24;font-style:normal}.t3{color:#34d399;font-style:normal}.t4{color:#f0abfc;font-style:normal}.t5{color:#64748b;font-style:normal}
        .pulse{animation:p 2s infinite}@keyframes p{50%{box-shadow:0 0 18px #d946ef}}

        .light.app{color-scheme:light;background:radial-gradient(900px 500px at 85% -10%,#ddd6fe,transparent),radial-gradient(700px 400px at 0% 100%,#fbcfe8,transparent),#f8f7ff;color:#1e1b4b}
        .light .text-slate-100,.light .text-slate-200,.light .text-slate-300{color:#1e1b4b}
        .light .text-slate-400,.light .text-slate-500,.light .text-slate-600{color:#475569}
        .light .bg-white\\/5{background:#ffffffb3}.light .bg-white\\/10{background:#ede9fe}
        .light .bg-slate-900\\/90,.light .bg-slate-900\\/95,.light .bg-slate-950\\/70,.light .bg-slate-950\\/95{background:#fffffff2}
        .light .bg-black\\/30,.light .bg-black\\/40{background:#f1f5f9}.light .bg-violet-900\\/60{background:#ddd6fe}
        .light .border-white\\/10,.light .border-white\\/5{border-color:#c4b5fd}
        .light .text-amber-300,.light .text-amber-200{color:#b45309}.light .text-emerald-300{color:#047857}
        .light button.pulse{color:#86198f}.light .ed{color:#1e293b}.light textarea.ed{color:transparent}
        .light .t1{color:#7c3aed}.light .t2{color:#b45309}.light .t3{color:#047857}.light .t4{color:#a21caf}.light .t5{color:#94a3b8}
        .light pre.text-emerald-300{color:#047857}
        @media(prefers-reduced-motion:reduce){.pulse{animation:none}}
      `}</style>
      <nav className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 bg-slate-950/70 backdrop-blur-xl border-b border-white/10 overflow-x-auto">
        <span onClick={tap} className="select-none cursor-default font-black text-xl bg-gradient-to-l from-amber-300 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent whitespace-nowrap">كود لاب | CodeLab</span>
        <div className="flex gap-1 mr-auto">{items.map(([k, v]) => <button key={k} onClick={() => go(k)} className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap transition ${screen === k ? grad : 'text-slate-300 hover:bg-white/10'}`}>{v}</button>)}</div>
        {inst && <button onClick={() => { inst.prompt(); setInst(null); }} className="px-3 py-2 rounded-xl bg-emerald-500 text-black whitespace-nowrap text-sm">📲 تثبيت</button>}
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="px-3 py-2 rounded-xl bg-white/10 whitespace-nowrap" aria-label="تبديل الوضع">{theme === 'light' ? '🌙 داكن' : '☀️ فاتح'}</button>
        <span className="text-xs whitespace-nowrap text-slate-400">{geminiOn ? '✨ Gemini' : '🧠 ذكاء محلي'}</span>
        {isLoggedIn && <button onClick={() => { localStorage.removeItem('cl_sess'); pulled.current = false; setLogged(false); setScreen('editor'); }} className="text-xs text-slate-400 whitespace-nowrap">خروج</button>}
      </nav>
      <main>
        {screen === 'editor' && <Editor onError={onError} />}
        {screen === 'levels' && <Levels cfg={cfg} user={user} setUser={setUser} />}
        {screen === 'profile' && <Profile cfg={cfg} />}
        {screen === 'admin' && <Admin cfg={cfg} setCfg={saveCfg} onExit={() => setScreen('editor')} />}
      </main>
      {geminiOn && <Chat />}
      {auth && (
        <Modal onClose={() => setAuth(null)}>
          <h2 className="text-xl font-black mb-1">{mode === 'in' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</h2>
          <p className="text-sm text-slate-400 mb-3">المحرر مجاني للجميع، والمستويات والمفكرة للمسجلين.</p>
          {[['name', 'الاسم', 'text'], ['email', 'البريد الإلكتروني', 'email'], ['phone', 'رقم الهاتف', 'tel'], ['pass', 'كلمة السر', 'password']].filter(([k]) => mode === 'up' || k === 'email' || k === 'pass').map(([k, p, t]) => <input key={k} type={t} placeholder={p} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 my-1 outline-none focus:border-fuchsia-400" />)}
          <button onClick={login} className={`${btn} ${grad} w-full mt-2`}>{mode === 'in' ? 'دخول' : 'إنشاء الحساب'}</button>
          <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="block mx-auto text-sm text-amber-300 mt-3">{mode === 'in' ? 'ليس لديك حساب؟ أنشئ حساباً' : 'لديك حساب؟ سجّل الدخول'}</button>
        </Modal>)}
      {explain && (
        <Modal onClose={() => setExplain(null)}>
          <h3 className="font-black text-amber-300 mb-2">🔍 شرح الخطأ</h3>
          <div className="whitespace-pre-wrap leading-7 text-sm max-h-80 overflow-auto">{explain.loading ? 'جارٍ التحليل...' : explain.text}</div>
          {explain.local && <p className="text-xs text-slate-500 mt-2">🧠 تحليل محلي يعمل على جهازك</p>}
          {explain.local && !explain.boosted && <button onClick={boost} className={`${btn} bg-white/10 w-full mt-2 text-sm`}>شرح أذكى بنموذج على الهاتف (تجريبي · تنزيل كبير)</button>}
          <button onClick={() => setExplain(null)} className={`${btn} ${grad} w-full mt-3`}>فهمت</button>
        </Modal>)}
    </div>
  );
}
