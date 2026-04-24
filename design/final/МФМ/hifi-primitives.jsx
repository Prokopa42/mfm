// ─── HI-FI PRIMITIVES ────────────────────────────────────────

// Bauhaus glyphs — same vocabulary as wireframes, tighter stroke
function Glyph({ shape, fill = 'var(--ink)', stroke = null, size = 10, sw = 1.2 }) {
  const s = size;
  const sp = stroke ? { fill: 'none', stroke, strokeWidth: sw } : { fill };
  if (shape === 'square')     return <svg width={s} height={s} style={{display:'block'}}><rect x="0.5" y="0.5" width={s-1} height={s-1} {...sp}/></svg>;
  if (shape === 'circle')     return <svg width={s} height={s} style={{display:'block'}}><circle cx={s/2} cy={s/2} r={s/2-0.5} {...sp}/></svg>;
  if (shape === 'triangle')   return <svg width={s} height={s} style={{display:'block'}}><polygon points={`${s/2},0.5 ${s-0.5},${s-0.5} 0.5,${s-0.5}`} {...sp}/></svg>;
  if (shape === 'bar')        return <svg width={s} height={s/3} style={{display:'block'}}><rect x="0" y="0" width={s} height={s/3} fill={fill}/></svg>;
  if (shape === 'halfcircle') return <svg width={s} height={s/2} style={{display:'block'}}><path d={`M 0.5 ${s/2} A ${s/2-0.5} ${s/2-0.5} 0 0 1 ${s-0.5} ${s/2}`} {...sp}/></svg>;
  return null;
}

// Phone frame — refined: cleaner bezel, thinner separators, honest iOS-ish status
function PhoneFrame({ children, w = 340, h = 700 }) {
  return (
    <div style={{
      width: w, height: h, background: 'var(--paper)',
      border: '1.5px solid var(--ink)',
      boxShadow: '0 24px 48px -20px rgba(20,18,13,0.28), 0 2px 0 var(--ink-18)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      position: 'relative',
    }}>
      {/* status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px 6px', borderBottom: '0.5px solid var(--hair)',
      }}>
        <span className="mono tnum" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.02em' }}>9:41</span>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--ink-55)' }}>●●● · 5G · ▮</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
      {/* home indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 8px' }}>
        <div style={{ width: 96, height: 3, background: 'var(--ink)', borderRadius: 2 }} />
      </div>
    </div>
  );
}

// Big number with currency — refined proportions
function HeroNumber({ value, size = 'var(--t-hero)', xSize = 'var(--t-hero-x)', color = 'var(--ink)' }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }}>
      <span className="slab tnum" style={{ fontSize: size, color, lineHeight: 0.88 }}>{value}</span>
      <span className="slab" style={{ fontSize: xSize, color, lineHeight: 1 }}>₽</span>
    </div>
  );
}

// Inline number — for "завтра могу", "ближайший платёж", footer strips
function InlineNumber({ value, color = 'var(--ink)', size = 'var(--t-num-m)', currency = true, currencyColor = 'var(--ink-55)' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
      <span className="slab tnum" style={{ fontSize: size, color }}>{value}</span>
      {currency && <span className="mono" style={{ fontSize: 9, color: currencyColor }}>₽</span>}
    </span>
  );
}

// Row divider — used between sections
function Hair({ color = 'var(--hair)', m = '0 18px' }) {
  return <div style={{ height: 0.5, background: color, margin: m }} />;
}

// Tab bar — refined version
function TabBar({ active = 0 }) {
  const items = [
    { label: 'Сегодня', shape: 'circle' },
    { label: 'Цикл',    shape: 'bar' },
    { label: 'Накоп.',  shape: 'square' },
    { label: 'История', shape: 'triangle' },
    { label: 'Настр.',  shape: 'halfcircle' },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
      borderTop: '0.5px solid var(--ink)',
      background: 'var(--paper)',
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          padding: '9px 0 7px',
          position: 'relative',
          opacity: i === active ? 1 : 0.5,
        }}>
          {i === active && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 18, height: 2, background: 'var(--ink)' }} />}
          <div style={{ height: 11, display: 'flex', alignItems: 'center' }}>
            <Glyph shape={it.shape} fill={i === active ? 'var(--ink)' : 'none'} stroke={i === active ? null : 'var(--ink-80)'} size={10} sw={1} />
          </div>
          <span className="slab" style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: i === active ? 'var(--ink)' : 'var(--ink-55)' }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// State banner — refined: hairline frame, 2px accent left, tighter padding
function Banner({ kind, title, note }) {
  const accentMap = {
    warning:  'var(--red)',
    info:     'var(--blue)',
    notice:   'var(--yellow)',
    success:  'var(--ink)',
  };
  const glyphMap = {
    warning:  'triangle',
    info:     'circle',
    notice:   'bar',
    success:  'square',
  };
  const accent = accentMap[kind] || 'var(--ink)';
  return (
    <div style={{
      margin: '10px 18px 4px',
      display: 'grid', gridTemplateColumns: '2px auto 1fr', alignItems: 'stretch',
      border: '0.5px solid var(--ink-80)',
    }}>
      <div style={{ background: accent }} />
      <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center' }}>
        <Glyph shape={glyphMap[kind] || 'square'} fill="var(--ink)" size={8} />
      </div>
      <div style={{ padding: '6px 10px 6px 0', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className="slab" style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>· {note}</span>
      </div>
    </div>
  );
}

Object.assign(window, { Glyph, PhoneFrame, HeroNumber, InlineNumber, Hair, TabBar, Banner });
