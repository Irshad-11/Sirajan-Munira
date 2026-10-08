import React from 'react';
import { Link } from 'react-router-dom';
import { HandHeart, ShieldCheck } from 'lucide-react';

// ---------------------------------------------------------------------------
// Purpose + curator disclaimer (Bangla).
// One shared component so the wording is identical on the Landing page and
// the About page — edit the text here and both places update.
// ---------------------------------------------------------------------------

export function CuratorNote({ compact }: { compact?: boolean }) {
  return (
    <div className={`cn ${compact ? 'cn--compact' : ''}`} lang="bn">
      <style>{CN_CSS}</style>

      <article className="cn-aim">
        <span className="cn-aim__glow" aria-hidden="true" />
        <div className="cn-aim__icon" aria-hidden="true"><HandHeart size={20} /></div>
        <div className="cn-aim__body">
          <p className="cn-kicker">এই সাইট কেন</p>
          <h3 className="cn-aim__title">
            <em>আহলে বাইতের</em> শান ও মান সামনে আনা
          </h3>
          <p>
            এই সাইটের মূল লক্ষ্য হলো <strong>সুন্নি-ক্লাসিফাইড সোর্স</strong> থেকে আহলে বাইতের
            শান ও মান নিয়ে বর্ণিত হাদিসগুলো একসঙ্গে তুলে ধরা। এই হাদিসগুলো সুন্নি ধারার সুপরিচিত
            লেখকদের বিভিন্ন বইয়ে উল্লেখ আছে।
          </p>
          <p>
            সমাজে এই হাদিসগুলো সাধারণত আড়ালেই থেকে যায়, এগুলোকে তেমন গুরুত্ব দেওয়া হয় না। কিন্তু
            আমার মনে হয়, এগুলো গুরুত্ব পাওয়ার অধিকার রাখে। আহলে বাইতের খেদমতে এটা আমার ছোট্ট একটা চেষ্টা।
          </p>
        </div>
      </article>

      <aside className="cn-disclaimer" role="note" aria-label="ডিসক্লেইমার">
        <div className="cn-disclaimer__icon" aria-hidden="true"><ShieldCheck size={18} /></div>
        <div>
          <p className="cn-kicker cn-kicker--muted">ডিসক্লেইমার</p>
          <p className="cn-disclaimer__lead">আমি শুধু একজন কিউরেটর।</p>
          <p>
            এই সাইটের প্রতিটি finding কোনো না কোনো প্রকাশিত বই থেকে নেওয়া। প্রতিটি finding-এ যা
            বলা হয়েছে, তার সব দায়িত্ব <strong>সেই বই এবং বইয়ের লেখকের</strong>। আমার কাজ শুধু এই
            অংশগুলো খুঁজে বের করা, বাংলায় অনুবাদ করা, আর পড়া ও খোঁজার সুবিধার জন্য সাজিয়ে রাখা।
          </p>
          <p className="cn-disclaimer__foot">
            অনুবাদে বা রেফারেন্সে কোনো ভুল চোখে পড়লে <Link to="/contact">জানাবেন</Link>।
          </p>
        </div>
      </aside>
    </div>
  );
}

const CN_CSS = `
.cn { display:grid; gap:1rem; font-family:'Hind Siliguri', var(--font-english), sans-serif; }
.cn-kicker { margin:0 0 .35rem; font-size:.78rem; font-weight:700; letter-spacing:.04em; color:var(--accent); }
.cn-kicker--muted { color:var(--muted); }

/* --- the aim --- */
.cn-aim {
  position:relative; overflow:hidden; display:grid; grid-template-columns:auto 1fr; gap:1.1rem;
  padding:1.5rem 1.5rem 1.4rem; border-radius:10px;
  background:linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 62%);
  border:1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
}
.cn-aim::before { /* thin accent rule down the left edge */
  content:''; position:absolute; left:0; top:14%; bottom:14%; width:3px; border-radius:0 3px 3px 0;
  background:linear-gradient(to bottom, transparent, var(--accent), transparent);
}
.cn-aim__glow { position:absolute; right:-60px; top:-60px; width:200px; height:200px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, color-mix(in srgb, #e0a24a 32%, transparent), transparent 70%);
  animation: cnGlow 6s ease-in-out infinite; }
@keyframes cnGlow { 0%,100% { opacity:.55; transform:scale(1); } 50% { opacity:1; transform:scale(1.12); } }
.cn-aim__icon { width:42px; height:42px; border-radius:50%; display:grid; place-items:center; color:var(--accent);
  background:var(--surface); border:1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  box-shadow:0 0 0 5px color-mix(in srgb, var(--accent) 7%, transparent); }
.cn-aim__body { position:relative; min-width:0; }
.cn-aim__title { margin:0 0 .6rem; font-family:'Hind Siliguri', sans-serif; font-weight:700; font-size:clamp(1.15rem,2.6vw,1.4rem); line-height:1.5; color:var(--fg); }
.cn-aim__title em { font-style:normal; color:var(--accent); }
.cn-aim p:not(.cn-kicker) { margin:0 0 .7rem; font-size:1rem; line-height:1.95; color:var(--fg); }
.cn-aim p:last-child { margin-bottom:0; }
.cn-aim strong { font-weight:600; }

/* --- the disclaimer --- */
.cn-disclaimer { display:grid; grid-template-columns:auto 1fr; gap:.9rem; padding:1.1rem 1.3rem; border-radius:10px;
  background:var(--surface); border:1px dashed color-mix(in srgb, var(--fg) 22%, var(--border)); }
.cn-disclaimer__icon { width:34px; height:34px; border-radius:8px; display:grid; place-items:center; color:var(--muted);
  background:color-mix(in srgb, var(--fg) 5%, var(--surface)); }
.cn-disclaimer p { margin:0 0 .5rem; font-size:.95rem; line-height:1.9; color:var(--muted); }
.cn-disclaimer p:last-child { margin-bottom:0; }
.cn-disclaimer strong { color:var(--fg); font-weight:600; }
.cn-disclaimer__lead { color:var(--fg) !important; font-weight:700; font-size:1.05rem !important; }
.cn-disclaimer__foot { font-size:.88rem !important; }
.cn-disclaimer a { color:var(--accent); border-bottom:1px dotted var(--accent); text-decoration:none; }

.cn--compact .cn-aim { padding:1.25rem 1.2rem; }

@media (max-width:560px){
  .cn-aim, .cn-disclaimer { grid-template-columns:1fr; }
  .cn-aim { padding:1.25rem 1.1rem; }
}
@media (prefers-reduced-motion: reduce){ .cn-aim__glow { animation:none; } }
`;