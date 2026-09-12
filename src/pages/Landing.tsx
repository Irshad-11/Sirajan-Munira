import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTrackView } from '../lib/context';
import { getLiveStats } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Procedural 3D book (FR-34) — no external asset, built from primitives,
// styled to match the site's palette, animates on scroll.
// ---------------------------------------------------------------------------

function BookMesh({ scrollProgress }: { scrollProgress: React.MutableRefObject<number> }) {
  const group = useRef<any>(null);
  const coverLeft = useRef<any>(null);
  const coverRight = useRef<any>(null);

  useFrame((state) => {
    const p = scrollProgress.current; // 0 -> 1 over hero height
    if (group.current) {
      group.current.rotation.y = 0.6 + p * 2.4 + Math.sin(state.clock.elapsedTime * 0.3) * 0.05;
      group.current.position.y = -0.2 + p * 0.3;
    }
    if (coverRight.current) {
      // "opens" the book as the user scrolls
      coverRight.current.rotation.y = -Math.min(p * 2.2, 1.4);
    }
  });

  return (
    <group ref={group} rotation={[0.15, 0.6, 0]}>
      {/* pages block */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.55, 2.1, 0.32]} />
        <meshStandardMaterial color="#f4ecd8" />
      </mesh>
      {/* spine */}
      <mesh position={[-0.8, 0, 0]}>
        <boxGeometry args={[0.05, 2.15, 0.36]} />
        <meshStandardMaterial color="#5a3d2b" />
      </mesh>
      {/* left cover (fixed) */}
      <mesh ref={coverLeft} position={[0, 0, -0.18]}>
        <boxGeometry args={[1.6, 2.15, 0.04]} />
        <meshStandardMaterial color="#7a4f2b" />
      </mesh>
      {/* right cover (opens) */}
      <group position={[0.78, 0, 0.16]}>
        <mesh ref={coverRight} position={[0.02, 0, 0]}>
          <boxGeometry args={[1.56, 2.15, 0.04]} />
          <meshStandardMaterial color="#8a5a34" />
        </mesh>
      </group>
    </group>
  );
}

function Hero3D() {
  const scrollProgress = useRef(0);

  useEffect(() => {
    const heroHeight = 640;
    const onScroll = () => {
      scrollProgress.current = Math.min(1, Math.max(0, window.scrollY / heroHeight));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 42 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <directionalLight position={[-3, -2, -4]} intensity={0.3} />
      <Suspense fallback={null}>
        <BookMesh scrollProgress={scrollProgress} />
      </Suspense>
    </Canvas>
  );
}

export default function Landing() {
  const [stats, setStats] = useState<{ books: number; categories: number; visitors: number } | null>(null);
  useTrackView('site', 'landing');

  useEffect(() => {
    getLiveStats().then(setStats).catch(() => setStats({ books: 0, categories: 0, visitors: 0 }));
  }, []);

  return (
    <div className="landing-page">
      <section className="hero">
        <div className="hero-3d"><Hero3D /></div>
        <div className="hero-copy">
          <h1>সৃজন মুনীরা</h1>
          <p className="hero-tagline">Sirājan Munīrā — a book-annotation and knowledge-archiving imprint of Safeenah.</p>
          <div className="hero-actions">
            <Link to="/books" className="primary">বইঘর দেখুন / Browse the Bookshelf</Link>
            <Link to="/collections" className="secondary">সংগ্রহ দেখুন / Explore Collections</Link>
          </div>
        </div>
      </section>

      <section className="stats-block">
        <div className="stat"><span className="stat-num">{stats?.books ?? '—'}</span><span>বই / Books</span></div>
        <div className="stat"><span className="stat-num">{stats?.categories ?? '—'}</span><span>কালেকশন / Collections</span></div>
        <div className="stat"><span className="stat-num">{stats?.visitors ?? '—'}</span><span>ভিজিটর / Visitors</span></div>
      </section>

      <section className="landing-teaser">
        <div>
          <h3>প্রতিটি হেডিং একটি ইউনিট</h3>
          <p className="muted">Every finding is deep-linkable, copyable in a citable format, and collectible into curated
          collections — without ever needing an account.</p>
        </div>
        <div>
          <h3>Read your way</h3>
          <p className="muted">Eleven reading themes, adjustable fonts, and bookmarks that live only on your device.</p>
        </div>
      </section>
    </div>
  );
}
