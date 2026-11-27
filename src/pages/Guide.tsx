import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, X as XIcon } from 'lucide-react';
const Yes = ({ t }: { t: string }) => <span className="gd-yn"><Check size={14} aria-hidden /> {t}</span>;
const No = ({ t }: { t: string }) => <span className="gd-yn gd-no"><XIcon size={14} aria-hidden /> {t}</span>;
import { copyToClipboard } from '../lib/richtext';
import { siteOrigin } from '../lib/ai';
import '../styles/guide.css';

function CopyBox({ text, label = 'কপি' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="gd-copy">
      <pre>{text}</pre>
      <button onClick={async () => { if (await copyToClipboard(text)) { setOk(true); setTimeout(() => setOk(false), 1800); } }} aria-label={`${label} — prompt copy`}>
        {ok ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {ok ? 'কপি হয়েছে' : label}
      </button>
    </div>
  );
}

function Card({ id, title, badge, children, open = false }: { id: string; title: string; badge?: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="gd-card" id={id} open={open}>
      <summary><span>{title}</span>{badge && <em className="gd-badge">{badge}</em>}</summary>
      <div className="gd-body">{children}</div>
    </details>
  );
}

export default function GuidePage() {
  const o = siteOrigin();
  const [tab, setTab] = useState(0);
  const prompts = [
    { t: 'বিষয় খুঁজুন', p: `আমার প্রশ্ন: [এখানে বিষয় লিখুন]. ${o}/llms.txt পড়ে সব বই খুঁজে সব প্রাসঙ্গিক finding বের করো। প্রতিটির ফুল permalink, বই, PDF পৃষ্ঠা ও শুরুর কথা দাও। শেষে বলো কতটি finding পড়েছ।` },
    { t: 'একটি বইয়ে', p: `${o}/llms.txt পড়ো। তারপর শুধু "[বইয়ের নাম]" বইয়ের ${o}/book/[বইয়ের-key]/index.tsv ও part-ফাইলগুলো পড়ে "[বিষয়]" সম্পর্কিত সব finding দাও (permalink + PDF পৃষ্ঠা সহ)। END OF BOOK পর্যন্ত পড়ো।` },
    { t: 'কালেকশন JSON', p: `আমার প্রশ্ন: [এখানে প্রশ্ন]. ${o}/llms.txt পড়ে সব বই খুঁজে সব প্রাসঙ্গিক finding বের করো। উত্তর শুধু একটি JSON ব্লকে দাও, schema 'sirajan-collection/1', প্রতিটি item-এ ফুল permalink, book, title, pdf_page, first_words (হুবহু), match, note থাকবে। শেষে এক লাইনে বলো কতটি finding পড়েছ কতটির মধ্যে।` },
    { t: 'উদ্ধৃতি যাচাই', p: `${o}/llms.txt পড়ো। নিচের বাক্যটি সাইটের কোন finding-এ আছে খুঁজে দাও: ${o}/ai-integration/verify?q=<বাক্যটি>। পাওয়া গেলে permalink, বই, PDF পৃষ্ঠা দাও; না পেলে স্পষ্ট বলো "পাওয়া যায়নি"।\n\nবাক্য: [এখানে পেস্ট করুন]` },
    { t: 'তুলনা', p: `আমি নিচে কিছু finding দিচ্ছি (বা এই কালেকশন JSON)। বইগুলোর মধ্যে মিল ও অমিল তুলনা করো, প্রতিটি দাবির পাশে permalink দাও।\n\n[এখানে "Copy as AI context" পেস্ট করুন]` },
  ];
  const wf = [
    ['উপ-বিষয় অনুযায়ী ভাগ', 'আমার কালেকশনের findings উপ-বিষয় অনুযায়ী ভাগ করো; প্রতিটি দলের নিচে permalink।'],
    ['বই-বই তুলনা', 'একই বিষয়ে বিভিন্ন বইয়ের বক্তব্যের মিল-অমিল টেবিলে দেখাও।'],
    ['টাইমলাইন / টেবিল', 'findings থেকে টেবিল বানাও: বই | পৃষ্ঠা | সারাংশ | permalink।'],
    ['কীওয়ার্ড ও সমার্থক শব্দ', 'এই বিষয়ের জন্য আরও কী কী শব্দ/বানানে খোঁজা উচিত তার তালিকা দাও (যেমন আফজাল / শ্রেষ্ঠ / সর্বোত্তম)।'],
    ['সারসংক্ষেপ', 'প্রতিটি finding ২ লাইনে সারাংশ করো, লিংকসহ।'],
    ['পড়ার প্রশ্ন / কুইজ', 'এই findings থেকে ১০টি অধ্যয়ন-প্রশ্ন ও উত্তর বানাও, উত্তরের পাশে permalink।'],
    ['প্রবন্ধের খসড়া', 'এই findings দিয়ে একটি প্রবন্ধের খসড়া লেখো; প্রতিটি উদ্ধৃতির পাশে permalink।'],
    ['ফাঁক খোঁজা', 'এই বিষয়ে আমার কালেকশনে কী কী দিক বাদ পড়েছে? কোন বইগুলো আরও দেখা যায়?'],
    ['verify দিয়ে যাচাই', 'তোমার উত্তরের প্রতিটি উদ্ধৃতি /ai-integration/verify দিয়ে মিলিয়ে দেখাও।'],
  ];
  const tiers: [string, string, string, string][] = [
    ['ব্রাউজিং আছে (ChatGPT/Claude/Gemini-এর web)', 'llms.txt থেকে সরাসরি পড়ে সব করতে পারে', '✅ search/verify GET', 'বেশিরভাগ ক্ষেত্রে প্রম্পট কপি করলেই যথেষ্ট'],
    ['ব্রাউজিং নেই — TXT/JSON আপলোড', 'আপনি বইয়ের TXT/JSON বা কালেকশন ডাউনলোড করে দেবেন', '❌ নিজে খুঁজতে পারে না', 'আপলোড করা ফাইলের মধ্যেই উত্তর'],
    ['Projects / Custom GPT / Gems / NotebookLM', 'ফাইল একবার যোগ করে বারবার ব্যবহার', '❌ (ফাইলের ভেতর)', 'SKILL.md-কে instruction হিসেবে বসান'],
    ['কোডিং এজেন্ট (Claude Code, Codex…)', 'curl/fetch দিয়ে index.tsv, part, search সব চালাতে পারে', '✅ পূর্ণ', 'openapi.json দিন'],
    ['লোকাল মডেল', 'ছোট কনটেক্সট — কালেকশনের "Copy as AI context" ব্যবহার করুন', '❌ সাধারণত', 'একসাথে ২০–৩০টির বেশি finding দেবেন না'],
  ];
  const faq: [string, string][] = [
    ['কালেকশন কী?', 'কয়েকটি finding-এর তালিকা (ID + নোট)। বই ছাড়িয়ে বিষয়ভিত্তিক সাজানো যায়।'],
    ['Temporary, Local, Global — পার্থক্য?', 'Temporary: শুধু এই ট্যাবে, বন্ধ করলে মুছে যায়। Local: এই ব্রাউজারে সেভ থাকে (শুধু ID, নোট, তারিখ) — Export করে রাখুন। Global: শুধু অ্যাডমিন; সবার জন্য সাইটে দেখায়।'],
    ['AI কেন কিছু finding মিস করে?', 'অনেক AI সব পাতা পড়ে না বা ফাইল মাঝপথে কেটে যায়। তাই শেষে "কতটি পড়েছ" জিজ্ঞেস করুন এবং Verified / Check চিহ্ন দেখুন।'],
    ['ডাউনলোড কীভাবে?', 'বইয়ের পাতায় Analyze with GenAI › TXT / JSON / download। কালেকশন পাতাতেও একই।'],
    ['মূল PDF কোথায়?', 'প্রতিটি বইয়ের পাতায় "Source" লিংক; প্রতিটি finding-এ PDF পৃষ্ঠা নম্বর আছে।'],
    ['AI-এর দেওয়া তথ্য কি ঠিক?', 'না-ও হতে পারে। ইম্পোর্টারের Verified / Check চিহ্ন AI-এর লেখা সাইটের সাথে মিলিয়ে দেখায়; সাইটেরটাই চূড়ান্ত।'],
  ];

  return (
    <div className="page gd">
      <h1 className="gd-h1">পাঠকের গাইড</h1>
      <p className="gd-lead">খোঁজা, কালেকশন বানানো এবং AI দিয়ে কাজ করার সহজ নির্দেশনা।</p>
      <nav className="gd-toc" aria-label="সূচি">
        {[['search', 'খোঁজা'], ['books', 'বই'], ['collections', 'কালেকশন'], ['links', 'লিংক'], ['saving', 'সেভ'], ['agents', 'AI এজেন্ট'], ['prompts', 'প্রম্পট'], ['work', 'বিশ্লেষণ'], ['loop', 'কাজের ধাপ'], ['faq', 'FAQ']].map(([id, t]) => <a key={id} href={`#${id}`}>{t}{id === 'agents' && <em className="gd-badge">নতুন</em>}</a>)}
      </nav>

      <Card id="search" title="১. সাইটে খোঁজা" open>
        <p><Link to="/search">Search</Link> পাতায় শব্দ লিখুন। সাইট বানানের ভিন্নতা (ড়/ঢ়, ি/ী, য-ফলা) আর সমার্থক শব্দ (আফজাল / শ্রেষ্ঠ / সর্বোত্তম) নিজেই ধরে। কোনো বইয়ের ভেতরে খুঁজতে বইয়ের পাতার সার্চ বক্স ব্যবহার করুন — এটি পুরো বই খোঁজে, শুধু লোড হওয়া অংশ নয়।</p>
      </Card>
      <Card id="books" title="২. বই পড়া ও ঘোরা">
        <p>প্রতিটি বই অনেক finding-এ ভাগ করা। বইয়ের পাতায় ওপরে সার্চ বক্স, তার নিচে "Jump to a finding" — কোনো permalink বা ID পেস্ট করলে সরাসরি সেই finding-এ যাবে।</p>
      </Card>
      <Card id="collections" title="৩. কালেকশন বানানো">
        <p>কোনো finding-এর <b>Add</b> চাপুন › Temporary / Local (/ অ্যাডমিনের জন্য Global)। অথবা AI-এর JSON <Link to="/collections/import">Import collection</Link>-এ পেস্ট করুন। সেভ করা কালেকশন <Link to="/my-collections">My collections</Link>-এ।</p>
      </Card>
      <Card id="links" title="৪. লিংক ও উদ্ধৃতি">
        <p>প্রতিটি finding-এ <b>Link</b> (permalink) ও <b>Cite</b> (বই + পৃষ্ঠা + লিংক) বোতাম আছে। permalink-এ <code>#id</code> থাকে, তাই লম্বা বইয়েও সেই finding-এ পৌঁছে যায়।</p>
      </Card>
      <Card id="saving" title="৫. সেভ ও ব্যাকআপ">
        <p>Local কালেকশন শুধু এই ব্রাউজারে থাকে। ব্রাউজার ডাটা মুছলে হারাবে — তাই My collections থেকে <b>Export all</b> করে ফাইল রাখুন; পরে <b>Import backup</b> দিয়ে ফেরত আনুন।</p>
      </Card>

      <Card id="agents" title="AI এজেন্ট সিস্টেম" badge="নতুন" open>
        <p>এই সাইট AI-এর জন্য সরল টেক্সট ফাইল দেয়: <code>llms.txt</code> (শুরুর নির্দেশ ও উত্তরের ফরম্যাট), <code>index.tsv</code> (সব finding-এর তালিকা), বইয়ের part-ফাইল, <code>search</code> ও <code>verify</code>।</p>
        <div className="gd-tablewrap"><table className="gd-table">
          <thead><tr><th>AI-এর ধরন</th><th>কীভাবে কাজ করে</th><th>নিজে সার্চ?</th><th>পরামর্শ</th></tr></thead>
          <tbody>{tiers.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} data-l={['ধরন', 'কীভাবে', 'সার্চ', 'পরামর্শ'][i]}>{c.startsWith('✅') ? <Yes t={c.slice(1).trim()} /> : c.startsWith('❌') ? <No t={c.slice(1).trim()} /> : c}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="gd-links">ফাইল: <a href="/llms.txt">llms.txt</a> · <a href="/ai-integration/SKILL.md">SKILL.md</a> · <a href="/index.tsv">index.tsv</a> · <a href="/openapi.json">openapi.json</a> · <Link to="/ai-integration">বিস্তারিত (AI Integration)</Link></p>
      </Card>

      <Card id="prompts" title="স্টার্টার প্রম্পট (কপি করুন)" open>
        <div className="gd-tabs" role="tablist">{prompts.map((p, i) => <button key={p.t} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{p.t}</button>)}</div>
        <CopyBox text={prompts[tab].p} />
        <p className="gd-hint">[ ] অংশগুলো নিজের কথায় বদলে নিন।</p>
      </Card>

      <Card id="work" title="AI দিয়ে বিশ্লেষণ ও কাজ">
        <p>কালেকশন থেকে <b>Copy as AI context</b> চেপে নিচের যেকোনো নির্দেশ সঙ্গে দিন:</p>
        <div className="gd-wf">{wf.map(([t, p]) => <div key={t} className="gd-wfi"><b>{t}</b><CopyBox text={p} /></div>)}</div>
      </Card>

      <Card id="loop" title="সুপারিশকৃত কাজের ধাপ">
        <ol className="gd-steps">
          <li>AI-কে প্রশ্ন করুন (কালেকশন JSON প্রম্পট)।</li><li>উত্তরের JSON কপি করুন।</li>
          <li><Link to="/collections/import">Import collection</Link>-এ পেস্ট › Validate।</li>
          <li>Verified / Check চিহ্ন দেখুন — Check হলে "AI said vs Site says" মিলিয়ে নিন।</li>
          <li>ঠিক না থাকলে বাদ দিন বা AI-কে ঠিক করতে বলুন।</li>
          <li>Temporary / Local-এ সেভ করুন।</li>
          <li><b>Copy as AI context</b> দিয়ে ফলো-আপ প্রশ্ন করুন।</li>
        </ol>
        <p className="gd-hint">টিপস: প্রশ্ন ছোট ও নির্দিষ্ট রাখুন · "কতটি পড়েছ" জিজ্ঞেস করুন · একসাথে বেশি বই না দিয়ে একটি একটি করে দেখুন · permalink ছাড়া কিছু বিশ্বাস করবেন না।</p>
      </Card>

      <Card id="faq" title="প্রশ্নোত্তর (FAQ)">
        {faq.map(([q, a]) => <details key={q} className="gd-faq"><summary>{q}</summary><p>{a}</p></details>)}
      </Card>
    </div>
  );
}
