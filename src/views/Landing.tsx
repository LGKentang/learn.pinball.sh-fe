/**
 * What a visitor sees before they sign in. The graph in the hero and the "map"
 * section are not decoration borrowed from a stock kit — they are drawn in the
 * same node/edge/state-color language as the real Canvas (see canvasLayout.ts,
 * Canvas.tsx), with the exact example questions PRODUCT.md uses to make the
 * domain-agnostic claim concrete rather than asserted.
 */
const LOOP = [
  { label: 'Ask a question', color: 'var(--dim)' },
  { label: 'Write what you believe', color: 'var(--amber)' },
  { label: 'Discover a gap', color: 'var(--blue)' },
  { label: 'Follow the subquestion', color: 'var(--violet)' },
  { label: 'Return, and revise', color: 'var(--green)' },
  { label: 'Explain it from memory', color: 'var(--accent)' },
];

const PRINCIPLES: { title: string; body: string; color: string }[] = [
  {
    title: 'Misconceptions are the product',
    body: 'Every revision is kept, not overwritten. The trail from wrong to understood is what you learned — deleting it would delete the learning.',
    color: 'var(--amber)',
  },
  {
    title: 'Explaining beats recognizing',
    body: '"Can Explain" is a distinct state from "Understood," earned in a drill where the original answer stays hidden until you’ve produced your own.',
    color: 'var(--green)',
  },
  {
    title: 'Structure emerges',
    body: 'No folders, no tags, no curriculum to set up first. You ask a question; the map draws itself from where your curiosity actually goes.',
    color: 'var(--blue)',
  },
  {
    title: 'One subject, then any subject',
    body: 'The same question object works for a Kubernetes probe, a Roman collapse, or a Japanese particle. Nothing about the model is domain-specific.',
    color: 'var(--violet)',
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

export function Landing({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="landing">
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
        <div className="landing-hero-copy">
          <p className="eyebrow">learn.pinball.sh</p>
          <h1>Learning is not linear.</h1>
          <p className="landing-lede">
            Ask a question. Answer it badly. Follow the question that answer raises, and
            come back to fix what you thought you knew. Pinball Learn keeps the whole
            trail — including the parts you got wrong.
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

      <section className="landing-loop">
        <p className="eyebrow landing-section-eyebrow">The loop</p>
        <div className="loop-row">
          {LOOP.map((step, i) => (
            <div className="loop-step" key={step.label}>
              <div className="loop-node">
                <i style={{ background: step.color }} />
                <span>{step.label}</span>
              </div>
              {i < LOOP.length - 1 && <span className="loop-arrow">→</span>}
            </div>
          ))}
        </div>
        <p className="loop-caption">
          Then the cycle runs again — on the parent question, with a model that no
          longer has the gap the subquestion found.
        </p>
      </section>

      <section className="landing-principles">
        <p className="eyebrow landing-section-eyebrow">What it actually does differently</p>
        <div className="principle-grid">
          {PRINCIPLES.map((p) => (
            <div className="principle-card" key={p.title}>
              <i style={{ background: p.color }} />
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-map">
        <div className="landing-map-copy">
          <p className="eyebrow landing-section-eyebrow">A map, not a folder</p>
          <p className="landing-lede">
            Every book is a tree of questions that can reach across into any other
            book. The map exists to show what is still unanswered, not to be
            organized — you never see an empty map you have to fill in.
          </p>
          <ul className="landing-examples">
            {EXAMPLES.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
        <MapGraph />
      </section>

      <section className="landing-final">
        <p className="landing-final-quote">
          One question leads to another, ideas collide, connections emerge, and
          understanding develops through exploration.
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

/** Five nodes, loosely constellated — not a real layout, just the real visual grammar. */
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

  return (
    <svg className="hero-graph" viewBox="0 0 540 300" role="presentation" aria-hidden="true">
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
    </svg>
  );
}

/** A slightly denser version, meant to read as "the real map" beside real questions. */
function MapGraph() {
  const rows = [
    { depth: 0, state: 'can_explain', w: 168 },
    { depth: 1, state: 'understood', w: 200 },
    { depth: 1, state: 'understood', w: 148 },
    { depth: 2, state: 'exploring', w: 176 },
    { depth: 0, state: 'unexplored', w: 132 },
  ];
  const rowH = 40;
  return (
    <svg className="map-graph" viewBox="0 0 320 220" role="presentation" aria-hidden="true">
      {rows.map((r, i) => {
        const x = 10 + r.depth * 28;
        const y = 12 + i * rowH;
        const prevDepth = i > 0 ? rows[i - 1].depth : 0;
        return (
          <g key={i}>
            {r.depth > 0 && i > 0 && prevDepth < r.depth && (
              <path d={`M ${x - 18} ${y - rowH + 16} V ${y + 8} H ${x - 6}`} className="mg-guide" />
            )}
            <circle cx={x} cy={y + 8} r={4} className={`state-dot ${r.state}`} />
            <rect x={x + 12} y={y} width={r.w} height={16} rx={4} className="mg-bar" />
          </g>
        );
      })}
    </svg>
  );
}
