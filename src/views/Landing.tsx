import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

/**
 * What a visitor sees before they sign in. The graphs here aren't decoration
 * borrowed from a stock kit. They're drawn in the same node/edge/state-color
 * language as the real Canvas (see canvasLayout.ts, Canvas.tsx), with the exact
 * example questions PRODUCT.md uses to make the domain-agnostic claim concrete
 * rather than asserted.
 */
const LOOP = [
  { label: 'Ask a question', color: 'var(--dim)' },
  { label: 'Write what you believe', color: 'var(--amber)' },
  { label: 'Discover a gap', color: 'var(--blue)' },
  { label: 'Follow the subquestion', color: 'var(--violet)' },
  { label: 'Return, and revise', color: 'var(--green)' },
  { label: 'Explain it from memory', color: 'var(--accent)' },
];

type IconKind = 'revise' | 'brain' | 'nodes' | 'radiate';

const PRINCIPLES: { title: string; body: string; color: string; icon: IconKind }[] = [
  {
    title: 'Misconceptions are the product',
    body: 'Every revision is kept, not overwritten. The trail from wrong to understood is what you learned, and deleting it would delete the learning.',
    color: 'var(--amber)',
    icon: 'revise',
  },
  {
    title: 'Explaining beats recognizing',
    body: '"Can Explain" is a distinct state from "Understood," earned in a drill where the original answer stays hidden until you’ve produced your own.',
    color: 'var(--green)',
    icon: 'brain',
  },
  {
    title: 'Structure emerges',
    body: 'No folders, no tags, no curriculum to set up first. You ask a question, and the map draws itself from where your curiosity actually goes.',
    color: 'var(--blue)',
    icon: 'nodes',
  },
  {
    title: 'One subject, then any subject',
    body: 'The same question object works for a Kubernetes probe, a Roman collapse, or a Japanese particle. Nothing about the model is domain-specific.',
    color: 'var(--violet)',
    icon: 'radiate',
  },
];

const EXAMPLES = [
  'Why does Kubernetes need readiness probes?',
  'Why did the Roman Republic collapse?',
  'Why do dominant chords create tension?',
  'Why does this sentence use は instead of が?',
  'Why do cells need mitochondria?',
  'Why do central banks raise rates during inflation?',
];

/** Fades a section in the first time it scrolls into view, then leaves it alone. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('in-view');
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const scrollable = h.scrollHeight - h.clientHeight;
      setP(scrollable > 0 ? h.scrollTop / scrollable : 0);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);
  return p;
}

export function Landing({ onContinue }: { onContinue: () => void }) {
  const progress = useScrollProgress();
  const loopRef = useReveal<HTMLElement>();
  const principlesRef = useReveal<HTMLElement>();
  const mapRef = useReveal<HTMLElement>();
  const finalRef = useReveal<HTMLElement>();

  return (
    <div className="landing">
      <div className="landing-progress" style={{ transform: `scaleX(${progress})` }} />

      <header className="landing-nav">
        <div className="brand">
          <i className="ball" />
          Pinball Learn
        </div>
        <button className="btn ghost small" onClick={onContinue}>
          Sign in
        </button>
      </header>

      <section className="landing-hero">
        <div className="landing-glow landing-glow-a" aria-hidden="true" />
        <div className="landing-glow landing-glow-b" aria-hidden="true" />
        <div className="landing-hero-copy">
          <p className="eyebrow">learn.pinball.sh</p>
          <h1>
            Learning is <em>not linear</em>.
          </h1>
          <p className="landing-lede">
            Ask a question. Answer it badly. Follow the question that answer raises, and
            come back to fix what you thought you knew. Pinball Learn keeps the whole
            trail, including the parts you got wrong.
          </p>
          <div className="landing-cta-row">
            <button className="btn primary" onClick={onContinue}>
              Continue
            </button>
            <span className="small dimmer">Invite-only, for now.</span>
          </div>
        </div>
        <HeroGraph />
      </section>

      <section className="landing-loop reveal" ref={loopRef}>
        <p className="eyebrow landing-section-eyebrow">The loop</p>
        <div className="loop-layout">
          <LoopGraph />
          <div className="loop-side">
            <div className="loop-list">
              {LOOP.map((step, i) => (
                <div className="loop-item" key={step.label}>
                  <span className="loop-num mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="loop-dot" style={{ background: step.color }} />
                  <span className="loop-label">{step.label}</span>
                </div>
              ))}
            </div>
            <p className="loop-caption">
              Then the cycle runs again on the parent question, now with a model that no
              longer has the gap the subquestion found.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-principles reveal" ref={principlesRef}>
        <p className="eyebrow landing-section-eyebrow">What it actually does differently</p>
        <div className="principle-grid">
          {PRINCIPLES.map((p, i) => (
            <div className="principle-card" key={p.title}>
              <span className="principle-num mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="p-icon">
                <PrincipleIcon kind={p.icon} color={p.color} />
              </span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-map reveal" ref={mapRef}>
        <div className="landing-map-copy">
          <p className="eyebrow landing-section-eyebrow">A map, not a folder</p>
          <p className="landing-lede">
            Every book is a tree of questions that can reach across into any other
            book. The map exists to show what's still unanswered, not to be
            organized. You never see an empty map you have to fill in.
          </p>
          <ul className="landing-examples">
            {EXAMPLES.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
        <MapGraph />
      </section>

      <section className="landing-final reveal" ref={finalRef}>
        <p className="landing-final-quote">
          One question leads to another, ideas collide, <span className="accent">connections
          emerge</span>, and understanding develops through exploration.
        </p>
        <button className="btn primary" onClick={onContinue}>
          Continue
        </button>
      </section>

      <footer className="landing-foot">
        <span>Pinball Learn</span>
        <span className="dimmer">Questions, not notes.</span>
      </footer>
    </div>
  );
}

/** Small line-art marks for the principle cards, drawn to match, not borrowed from an icon font. */
function PrincipleIcon({ kind, color }: { kind: IconKind; color: string }) {
  const box = { width: 22, height: 22, viewBox: '0 0 22 22', fill: 'none' as const, 'aria-hidden': true as const };

  if (kind === 'revise') {
    // A faded, dashed circle (the wrong answer) arcs into a solid one (the revision).
    return (
      <svg {...box}>
        <circle cx={5.5} cy={16} r={3} stroke={color} strokeWidth={1.5} strokeDasharray="2.4 2.4" opacity={0.5} />
        <path d="M8.3 14.2C10.8 10.6 13.4 8.4 16.6 6.6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <path d="M13.2 5.9 17 6.2 16.4 10" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={16.6} cy={6.6} r={2.6} fill={color} />
      </svg>
    );
  }
  if (kind === 'brain') {
    return (
      <svg {...box}>
        <path
          d="M9.3 4.6c-1.6 0-2.9 1.2-3 2.7-1 .5-1.7 1.5-1.7 2.7 0 .8.3 1.6.9 2.1-.2.4-.3.9-.3 1.3 0 1.6 1.3 2.9 2.9 2.9.3 0 .5 0 .8-.1.4.8 1.2 1.4 2.1 1.4V5.2c-.4-.4-1-.6-1.7-.6Z"
          stroke={color} strokeWidth={1.3} strokeLinejoin="round"
        />
        <path
          d="M12.7 4.6c1.6 0 2.9 1.2 3 2.7 1 .5 1.7 1.5 1.7 2.7 0 .8-.3 1.6-.9 2.1.2.4.3.9.3 1.3 0 1.6-1.3 2.9-2.9 2.9-.3 0-.5 0-.8-.1-.4.8-1.2 1.4-2.1 1.4V5.2c.4-.4 1-.6 1.7-.6Z"
          stroke={color} strokeWidth={1.3} strokeLinejoin="round"
        />
        <path d="M11 5.4v12.6" stroke={color} strokeWidth={1.1} opacity={0.45} />
      </svg>
    );
  }
  if (kind === 'nodes') {
    // The same node/edge grammar as the real graphs, just three of them.
    return (
      <svg {...box}>
        <path d="M6 16.5 11 6 17 14" stroke={color} strokeWidth={1.4} opacity={0.55} />
        <circle cx={6} cy={16.5} r={2.5} fill={color} />
        <circle cx={11} cy={6} r={2.5} fill={color} />
        <circle cx={17} cy={14} r={2.5} fill={color} />
      </svg>
    );
  }
  // 'radiate' — one center, many directions: the same model reaching into any subject.
  return (
    <svg {...box}>
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 11 + 3.4 * Math.cos(rad);
        const y1 = 11 + 3.4 * Math.sin(rad);
        const x2 = 11 + 8.6 * Math.cos(rad);
        const y2 = 11 + 8.6 * Math.sin(rad);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} strokeLinecap="round" />;
      })}
      <circle cx={11} cy={11} r={2.8} fill={color} />
    </svg>
  );
}

/**
 * Five nodes, loosely constellated. Not a real layout, just the real visual grammar.
 * Move the mouse over it and your cursor joins the graph as a new question, with a
 * dashed line finding the node it's closest to. It's the same thing the product does
 * with a real question: it lands somewhere, and it's linked to what's nearest.
 */
function HeroGraph() {
  const nodes = [
    { x: 60, y: 150, state: 'exploring', w: 132 },
    { x: 230, y: 60, state: 'understood', w: 140 },
    { x: 230, y: 230, state: 'can_explain', w: 118 },
    { x: 420, y: 130, state: 'unexplored', w: 108 },
    { x: 420, y: 250, state: 'verified', w: 96 },
  ];
  const edges: [number, number, boolean][] = [
    [0, 1, false],
    [0, 2, false],
    [1, 3, false],
    [2, 3, true],
    [2, 4, false],
  ];
  const pt = (n: (typeof nodes)[number]) => ({ x: n.x + n.w / 2, y: n.y + 16 });
  const anchors = nodes.map(pt);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setCursor({
      x: ((e.clientX - rect.left) / rect.width) * 540,
      y: ((e.clientY - rect.top) / rect.height) * 300,
    });
  };

  let nearest = -1;
  if (cursor) {
    let best = Infinity;
    anchors.forEach((a, i) => {
      const d = (a.x - cursor.x) ** 2 + (a.y - cursor.y) ** 2;
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
  }

  return (
    <svg
      ref={svgRef}
      className="hero-graph"
      viewBox="0 0 540 300"
      role="presentation"
      aria-hidden="true"
      onMouseMove={onMove}
      onMouseLeave={() => setCursor(null)}
    >
      {edges.map(([a, b, dashed], i) => {
        const pa = pt(nodes[a]);
        const pb = pt(nodes[b]);
        const dx = Math.max(40, Math.abs(pb.x - pa.x) * 0.5);
        return (
          <path
            key={i}
            d={`M ${pa.x} ${pa.y} C ${pa.x + dx} ${pa.y}, ${pb.x - dx} ${pb.y}, ${pb.x} ${pb.y}`}
            className={`hg-edge ${dashed ? 'crosses' : ''}`}
          />
        );
      })}
      {nodes.map((n, i) => (
        <g key={i} className="hg-node" style={{ animationDelay: `${i * 0.5}s` }}>
          <rect x={n.x} y={n.y} width={n.w} height={32} rx={8} />
          <rect x={n.x} y={n.y} width={4} height={32} rx={2} className={`state-fill ${n.state}`} />
        </g>
      ))}
      {cursor && nearest >= 0 && (
        <g className="hg-ghost">
          <path
            d={`M ${cursor.x} ${cursor.y} L ${anchors[nearest].x} ${anchors[nearest].y}`}
            className="hg-ghost-edge"
          />
          <circle cx={cursor.x} cy={cursor.y} r={9} className="hg-ghost-ring" />
          <circle cx={cursor.x} cy={cursor.y} r={4} className="hg-ghost-core" />
          <text x={cursor.x} y={cursor.y - 16} textAnchor="middle" className="hg-ghost-label">
            your question
          </text>
        </g>
      )}
    </svg>
  );
}

/** Six nodes on a ring, one flowing into the next, closing back on itself. */
function LoopGraph() {
  const cx = 140;
  const cy = 140;
  const r = 104;
  const angle = (i: number) => (Math.PI * 2 * i) / LOOP.length - Math.PI / 2;
  const pts = LOOP.map((_, i) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  }));

  return (
    <svg className="loop-graph" viewBox="0 0 280 280" role="presentation" aria-hidden="true">
      {pts.map((p, i) => {
        const n = pts[(i + 1) % pts.length];
        const restart = i === pts.length - 1;
        return (
          <path
            key={i}
            d={`M ${p.x} ${p.y} A ${r} ${r} 0 0 1 ${n.x} ${n.y}`}
            className={`lg-flow ${restart ? 'restart' : ''}`}
            style={{ animationDelay: `${i * -0.4}s` }}
          />
        );
      })}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={7}
          className="lg-node"
          style={{ fill: LOOP[i].color, color: LOOP[i].color, animationDelay: `${i * 0.35}s` }}
        />
      ))}
      <circle cx={cx} cy={cy} r={2.5} className="lg-center" />
    </svg>
  );
}

/** A slightly denser tree, meant to read as "the real map" beside real questions. */
function MapGraph() {
  const rows = [
    { depth: 0, state: 'can_explain', w: 168 },
    { depth: 1, state: 'understood', w: 200 },
    { depth: 1, state: 'understood', w: 148 },
    { depth: 2, state: 'exploring', w: 176 },
    { depth: 0, state: 'unexplored', w: 132 },
  ];
  const rowH = 40;
  // Each row's parent is the nearest earlier row exactly one level shallower, so a
  // row connects to its parent whether or not it's the parent's first child.
  const parentOf = rows.map((r, i) => {
    if (r.depth === 0) return -1;
    for (let j = i - 1; j >= 0; j--) {
      if (rows[j].depth === r.depth - 1) return j;
    }
    return -1;
  });
  const dotY = (i: number) => 12 + i * rowH + 8;

  return (
    <svg className="map-graph" viewBox="0 0 320 220" role="presentation" aria-hidden="true">
      {rows.map((r, i) => {
        const x = 10 + r.depth * 28;
        const y = 12 + i * rowH;
        const pIdx = parentOf[i];
        return (
          <g key={i}>
            {pIdx >= 0 && (
              <path
                d={`M ${x - 18} ${dotY(pIdx)} V ${dotY(i)} H ${x - 6}`}
                className="mg-guide"
              />
            )}
            <circle cx={x} cy={dotY(i)} r={4} className={`state-dot ${r.state}`} />
            <rect x={x + 12} y={y} width={r.w} height={16} rx={4} className="mg-bar" />
          </g>
        );
      })}
    </svg>
  );
}
