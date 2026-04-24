// Sketchy primitives: hand-drawn-feeling rect, phone frame, arrows, scribbles.

// ── Rough rectangle path via manual noise
function roughRectPath(x, y, w, h, r = 8, seed = 1, jitter = 1.2) {
  const rand = (n) => {
    const s = Math.sin(seed * 9301 + n * 49297) * 233280;
    return (s - Math.floor(s)) * 2 - 1; // -1..1
  };
  const j = (n) => rand(n) * jitter;
  // four corners
  const x1 = x + j(1), y1 = y + j(2);
  const x2 = x + w + j(3), y2 = y + j(4);
  const x3 = x + w + j(5), y3 = y + h + j(6);
  const x4 = x + j(7), y4 = y + h + j(8);
  // control points for gentle wobble on edges
  const cp = (a, b, c, d, n) => `Q ${(a + c) / 2 + j(n) * 1.4} ${(b + d) / 2 + j(n + 1) * 1.4} ${c} ${d}`;
  return `M ${x1} ${y1}
          ${cp(x1, y1, x2, y2, 10)}
          ${cp(x2, y2, x3, y3, 12)}
          ${cp(x3, y3, x4, y4, 14)}
          ${cp(x4, y4, x1, y1, 16)} Z`;
}

// Sketch Box — hand-drawn border box. Children render inside.
function SketchBox({ children, style = {}, fill = 'transparent', stroke = 'var(--ink)', strokeW = 1.6, radius = 12, seed = 1, dashed = false, highlight = null, pad = 14 }) {
  const ref = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      const r = ref.current.getBoundingClientRect();
      setDims({ w: r.width, h: r.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const { w, h } = dims;
  return (
    <div ref={ref} style={{ position: 'relative', padding: pad, ...style }}>
      {w > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
          {highlight && (
            <path d={roughRectPath(3, 3, w - 6, h - 6, radius, seed + 30, 1.6)}
                  fill={highlight} opacity="0.55" />
          )}
          <path d={roughRectPath(2, 2, w - 4, h - 4, radius, seed, 1.2)}
                fill={fill} stroke={stroke} strokeWidth={strokeW}
                strokeDasharray={dashed ? '5 4' : 'none'} strokeLinejoin="round" />
          <path d={roughRectPath(2.5, 2.5, w - 5, h - 5, radius, seed + 11, 0.9)}
                fill="none" stroke={stroke} strokeWidth={strokeW * 0.6} opacity="0.55" strokeLinejoin="round" />
        </svg>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

// Squiggle underline
function Squiggle({ width = 80, color = 'var(--accent)', h = 6 }) {
  const pts = 14, amp = h / 2.4;
  let d = `M 0 ${h / 2}`;
  for (let i = 1; i <= pts; i++) {
    const x = (i / pts) * width;
    const y = h / 2 + Math.sin(i * 1.3) * amp + (Math.random() - 0.5) * 0.8;
    d += ` L ${x} ${y}`;
  }
  return <svg width={width} height={h} style={{ display: 'block' }}><path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></svg>;
}

// Hand-drawn arrow ↗
function Arrow({ from, to, color = 'var(--ink)', w = 1.6, curve = 20, label = null }) {
  const [x1, y1] = from, [x2, y2] = to;
  const mx = (x1 + x2) / 2 + curve, my = (y1 + y2) / 2 - curve;
  const ang = Math.atan2(y2 - my, x2 - mx);
  const ah = 9;
  const ax1 = x2 - Math.cos(ang - 0.4) * ah;
  const ay1 = y2 - Math.sin(ang - 0.4) * ah;
  const ax2 = x2 - Math.cos(ang + 0.4) * ah;
  const ay2 = y2 - Math.sin(ang + 0.4) * ah;
  return (
    <g>
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />
      <path d={`M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      {label && <text x={mx} y={my - 4} fontFamily="Caveat" fontSize="16" fill={color} textAnchor="middle">{label}</text>}
    </g>
  );
}

// Hatch fill (diagonal lines) inside a rect
function Hatch({ w, h, spacing = 6, color = 'var(--ink)', opacity = 0.25, angle = 45 }) {
  const lines = [];
  const diag = Math.hypot(w, h);
  const n = Math.ceil(diag / spacing) + 4;
  for (let i = -n; i < n; i++) {
    lines.push(<line key={i} x1={i * spacing} y1={-h} x2={i * spacing + h} y2={h * 2}
      stroke={color} strokeWidth="1" opacity={opacity} transform={`rotate(${angle})`} />);
  }
  return (
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
      <defs><clipPath id="hclip"><rect x="0" y="0" width={w} height={h} /></clipPath></defs>
      <g clipPath="url(#hclip)">{lines}</g>
    </svg>
  );
}

// Phone frame — low-fi. Screen area is children.
function Phone({ children, label = null, w = 300, h = 620, seed = 1, state = null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: w, height: h }}>
        {/* outer body */}
        <svg width={w + 10} height={h + 10} viewBox={`0 0 ${w + 10} ${h + 10}`}
             style={{ position: 'absolute', left: -5, top: -5, overflow: 'visible' }}>
          <path d={roughRectPath(3, 3, w + 4, h + 4, 34, seed, 1.1)} fill="#fff"
                stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
          <path d={roughRectPath(4, 4, w + 2, h + 2, 33, seed + 7, 0.7)} fill="none"
                stroke="var(--ink)" strokeWidth="1" opacity="0.55" strokeLinejoin="round" />
        </svg>
        {/* notch */}
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          width: 74, height: 18, borderRadius: 12, background: 'var(--ink)', zIndex: 2,
        }} />
        {/* screen */}
        <div style={{
          position: 'absolute', inset: '32px 14px 20px 14px',
          borderRadius: 22, overflow: 'hidden',
          background: 'var(--paper)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* status bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 16px 4px', fontFamily: 'Kalam', fontSize: 11, color: 'var(--muted)',
          }}>
            <span>9:41</span>
            <span style={{ letterSpacing: 1 }}>●●● ▲ ▮</span>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {children}
          </div>
          {/* home indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 6px' }}>
            <div style={{ width: 80, height: 3, borderRadius: 3, background: 'var(--ink)' }} />
          </div>
        </div>
      </div>
      {label && (
        <div style={{ fontFamily: 'Caveat', fontSize: 22, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>— {label} —</span>
          {state && <Pill>{state}</Pill>}
        </div>
      )}
    </div>
  );
}

function Pill({ children, color = 'var(--ink)', bg = 'transparent' }) {
  return (
    <span style={{
      fontFamily: 'Kalam', fontSize: 12, fontWeight: 700,
      letterSpacing: 0.3, textTransform: 'uppercase',
      padding: '3px 10px', borderRadius: 20, color, background: bg,
      border: `1.3px solid ${color}`,
    }}>{children}</span>
  );
}

// Handwritten label shortcut
function H({ children, size = 16, color = 'var(--ink)', weight = 400, style = {} }) {
  return <span style={{ fontFamily: 'Kalam', fontSize: size, color, fontWeight: weight, ...style }}>{children}</span>;
}
function C({ children, size = 22, color = 'var(--ink)', weight = 600, style = {} }) {
  return <span style={{ fontFamily: 'Caveat', fontSize: size, color, fontWeight: weight, lineHeight: 1.1, ...style }}>{children}</span>;
}

// Big number placeholder — draws the number in a huge hand style
function BigNumber({ value, currency = '$', size = 64, color = 'var(--ink)', strike = false }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, position: 'relative' }}>
      <span style={{ fontFamily: 'Caveat', fontSize: size * 0.55, color, marginRight: 3, alignSelf: 'flex-start', marginTop: size * 0.2 }}>{currency}</span>
      <span style={{ fontFamily: 'Caveat', fontWeight: 700, fontSize: size, color, lineHeight: 0.9, letterSpacing: -1 }}>{value}</span>
      {strike && (
        <span style={{ position: 'absolute', left: -4, right: -4, top: '50%', height: 2, background: 'var(--risk)', transform: 'rotate(-3deg)' }} />
      )}
    </div>
  );
}

// Checkbox / radio sketch
function Check({ on = false, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
      <path d={roughRectPath(1, 1, 12, 12, 3, 2, 0.6)} fill="none" stroke="var(--ink)" strokeWidth="1.4" />
      {on && <path d="M3 7.5 L6 10 L11 4" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// Segmented tab-bar for bottom of phone
function TabBar({ active = 0, items = ['Home', 'Runway', 'Savings', 'History', 'Settings'] }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: '8px 6px 6px', borderTop: '1.5px solid var(--ink)',
      background: 'var(--paper)',
    }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: i === active ? 1 : 0.5 }}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d={roughRectPath(2, 2, 14, 14, 3, i + 4, 0.6)} fill="none" stroke="var(--ink)" strokeWidth="1.3" />
            {i === active && <circle cx="9" cy="9" r="2.5" fill="var(--ink)" />}
          </svg>
          <H size={10} weight={i === active ? 700 : 400}>{t}</H>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  SketchBox, Squiggle, Arrow, Hatch, Phone, Pill, H, C, BigNumber, Check, TabBar,
  roughRectPath,
});
