// ─── HI-FI DASHBOARD ─────────────────────────────────────────

const DATA = {
  normal: {
    date:    { dow: 'СР', day: 22, month: 'апр' },
    daysToPay: 11,
    safeToday: 1130,
    safeTomorrow: 1240,
    banner: null,

    // balance strip
    spent: 3200, free: 9200, cushion: 2000,

    // pace row
    pace: '+1 800',
    paceTarget: '53 400',
    paceGoalDate: '31.12',
    paceOk: true,

    // cycle
    cycleStart: 22,
    cycleEnd:   3,
    todayIdx:   0,    // 0..10
    cycleLen:   11,
    payments: [
      { idx: 1, label: 'Интернет', amount: 900,  nearest: true },
      { idx: 5, label: 'Спортзал', amount: 1200 },
    ],

    footer: [
      { label: 'Оперативный', value: '12 400', accent: null },
      { label: 'Подушка',     value: '2 000',  accent: null },
      { label: 'Накопления',  value: '43 100', accent: 'var(--blue)' },
    ],
  },

  offTrack: {
    date:    { dow: 'СР', day: 22, month: 'апр' },
    daysToPay: 11,
    safeToday: 1130,
    safeTomorrow: 1240,
    banner: { kind: 'warning', title: 'Цель отстаёт', note: 'темп ниже плана на 7 %' },

    spent: 3200, free: 9200, cushion: 2000,

    pace: '+1 250',
    paceTarget: '48 900',
    paceGoalDate: '31.12',
    paceOk: false,
    paceDelta: '−4 500 к цели',

    cycleStart: 22,
    cycleEnd:   3,
    todayIdx:   0,
    cycleLen:   11,
    payments: [
      { idx: 1, label: 'Интернет', amount: 900, nearest: true },
      { idx: 5, label: 'Спортзал', amount: 1200 },
    ],

    footer: [
      { label: 'Оперативный', value: '12 400', accent: null },
      { label: 'Подушка',     value: '2 000',  accent: null },
      { label: 'Накопления',  value: '43 100', accent: 'var(--red)' },   // accent shifts: signal
    ],
  },
};

// Header — date + days-to-payday counter
function DashHeader({ d }) {
  return (
    <div style={{ padding: '12px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.14em' }}>{d.date.dow}</span>
        <span className="slab tnum" style={{ fontSize: 14 }}>{d.date.day}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>{d.date.month}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="eyebrow">до зарплаты</span>
        <span className="slab tnum" style={{ fontSize: 13 }}>{d.daysToPay}</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>дн.</span>
      </div>
    </div>
  );
}

// Hero — can-spend-today, with thin yellow axis left + tomorrow secondary
function DashHero({ d }) {
  return (
    <div style={{ padding: '22px 18px 16px', display: 'grid', gridTemplateColumns: '3px 1fr', gap: 14, alignItems: 'stretch' }}>
      {/* axis — softer yellow, not dimmed */}
      <div style={{ background: 'var(--yellow)' }} />
      <div>
        <div className="eyebrow">Можно потратить сегодня</div>
        <div style={{ marginTop: 10 }}>
          <HeroNumber value="1 130" />
        </div>
        {/* tick — hairline-length accent, 1px tall */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 1, background: 'var(--ink)' }} />
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)', letterSpacing: '0.02em' }}>≈ 100 ₽/день</span>
        </div>

        {/* tomorrow — inline, one line */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="eyebrow">если не трачу — завтра</span>
          <InlineNumber value="1 240" size={15} />
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink-35)' }}>+110</span>
        </div>
      </div>
    </div>
  );
}

// Balance strip — потрачено / свободно / подушка, hairline proportional
function BalanceStrip({ d }) {
  const total = d.spent + d.free + d.cushion;
  const pctS = (d.spent / total) * 100;
  const pctF = (d.free / total) * 100;
  const pctC = (d.cushion / total) * 100;
  return (
    <div style={{ padding: '4px 18px 12px' }}>
      <div style={{ display: 'flex', height: 5, border: '0.5px solid var(--ink)' }}>
        <div style={{ width: `${pctS}%`, background: 'var(--ink)' }} />
        <div style={{ width: `${pctF}%`, borderLeft: '0.5px solid var(--ink)', borderRight: '0.5px solid var(--ink)' }} />
        <div style={{ width: `${pctC}%`, background: 'var(--yellow-bg)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `${pctS}% ${pctF}% ${pctC}%`, marginTop: 5 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)', letterSpacing: '0.02em' }}>потрачено</span>
          <span className="slab tnum" style={{ fontSize: 10.5 }}>3 200</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)', letterSpacing: '0.02em' }}>свободно</span>
          <span className="slab tnum" style={{ fontSize: 10.5 }}>9 200</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)', letterSpacing: '0.02em' }}>подушка</span>
          <span className="slab tnum" style={{ fontSize: 10.5 }}>2 000</span>
        </div>
      </div>
    </div>
  );
}

// Pace row — one line, includes mini-trend accent
function PaceRow({ d }) {
  const color = d.paceOk ? 'var(--blue)' : 'var(--red)';
  // sparkline points — 6 weeks, one dips in off-track
  const points = d.paceOk
    ? [18, 16, 17, 14, 13, 12, 11]
    : [18, 17, 15, 17, 16, 18, 19];
  const sparkW = 44, sparkH = 12;
  const step = sparkW / (points.length - 1);
  const max = Math.max(...points), min = Math.min(...points);
  const path = points.map((p, i) => `${i===0?'M':'L'} ${(i*step).toFixed(1)} ${((p - min)/(max-min||1)*(sparkH-2)+1).toFixed(1)}`).join(' ');
  return (
    <div style={{ padding: '0 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2px auto auto 1fr auto auto', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '0.5px solid var(--hair)', borderBottom: '0.5px solid var(--hair)' }}>
        <div style={{ width: 2, height: 14, background: color }} />
        <span className="eyebrow">Темп</span>
        <span className="slab tnum" style={{ fontSize: 11.5 }}>{d.pace} <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>₽/мес</span></span>
        <svg width={sparkW} height={sparkH} style={{ marginLeft: 4 }}>
          <path d={path} fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={sparkW} cy={((points[points.length-1] - min)/(max-min||1)*(sparkH-2)+1)} r="1.6" fill={color} />
        </svg>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>к {d.paceGoalDate}</span>
        <span className="slab tnum" style={{ fontSize: 12.5, color }}>{d.paceTarget} <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>₽</span></span>
      </div>
      {!d.paceOk && d.paceDelta && (
        <div style={{ padding: '4px 0 8px', display: 'flex', justifyContent: 'flex-end' }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--red)', letterSpacing: '0.02em' }}>{d.paceDelta}</span>
        </div>
      )}
    </div>
  );
}

// Cycle axis — refined: finer ticks, SEGODNYA label in ink, soft payment notches
function CycleAxis({ d }) {
  const W = 304;          // inner viewBox width
  const H = 58;
  const N = d.cycleLen;
  const col = W / N;
  const todayX = (d.todayIdx + 0.5) * col;
  const baselineY = 28;

  return (
    <div style={{ padding: '12px 18px 4px' }}>
      {/* Header row — separated with margin */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span className="eyebrow eyebrow--ink">Цикл</span>
        <div style={{ flex: 1, height: 0.5, background: 'var(--hair)' }} />
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)', letterSpacing: '0.02em' }}>22 апр → 3 мая</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        {/* today label — above */}
        <text x={todayX} y="9" fontSize="8" fontFamily="Archivo Black" textAnchor="middle" fill="var(--ink)" letterSpacing="1">СЕГОДНЯ</text>

        {/* baseline */}
        <line x1="0" y1={baselineY} x2={W} y2={baselineY} stroke="var(--ink)" strokeWidth="0.6" />

        {/* day ticks above baseline — hairline, every day */}
        {Array.from({ length: N }).map((_, i) => {
          const x = (i + 0.5) * col;
          return <line key={`t${i}`} x1={x} y1={baselineY - 4} x2={x} y2={baselineY} stroke="var(--ink-55)" strokeWidth="0.5" />;
        })}

        {/* today vertical — solid + taller, stops short of SEGODNYA label */}
        <line x1={todayX} y1="13" x2={todayX} y2={baselineY + 16} stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={todayX} cy={baselineY} r="2" fill="var(--ink)" />

        {/* payment notches — below baseline */}
        {d.payments.map((p, k) => {
          const x = (p.idx + 0.5) * col;
          const c = p.nearest ? 'var(--red)' : 'var(--ink-80)';
          return (
            <g key={`p${k}`}>
              <line x1={x} y1={baselineY} x2={x} y2={baselineY + (p.nearest ? 14 : 10)} stroke={c} strokeWidth={p.nearest ? 1.2 : 0.8} />
              {p.nearest && <circle cx={x} cy={baselineY + 14} r="1.6" fill={c} />}
            </g>
          );
        })}

        {/* day number labels — every 2nd, below */}
        {Array.from({ length: N }).map((_, i) => {
          if (i % 2 !== 0) return null;
          const day = d.cycleStart + i;
          const displayDay = day > 30 ? day - 30 : day;
          return <text key={`d${i}`} x={(i + 0.5) * col} y={H - 2} fontSize="7.5" fontFamily="JetBrains Mono" textAnchor="middle" fill="var(--ink-55)">{displayDay}</text>;
        })}
      </svg>
    </div>
  );
}

// Nearest payment row — refined
function NearestPaymentRow({ d }) {
  const p = d.payments.find((x) => x.nearest);
  if (!p) return null;
  return (
    <div style={{ padding: '0 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2px auto 1fr auto', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '0.5px solid var(--hair)' }}>
        <div style={{ width: 2, height: 14, background: 'var(--red)' }} />
        <span className="eyebrow">Ближайший</span>
        <span className="slab" style={{ fontSize: 11.5 }}>{p.label} <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>· 23 апр</span></span>
        <span className="slab tnum" style={{ fontSize: 12.5 }}>{p.amount.toLocaleString('ru-RU')} <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>₽</span></span>
      </div>
    </div>
  );
}

// Footer balances strip — three columns
function FooterStrips({ d }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      borderTop: '1px solid var(--ink)',
    }}>
      {d.footer.map((s, i) => (
        <div key={i} style={{
          padding: '9px 12px',
          borderLeft: i > 0 ? '0.5px solid var(--ink)' : 'none',
          position: 'relative',
        }}>
          {s.accent && <div style={{ position: 'absolute', top: 0, left: i > 0 ? 0 : -0.5, width: '100%', height: 1.5, background: s.accent }} />}
          <span className="eyebrow" style={{ fontSize: 8 }}>{s.label}</span>
          <div style={{ marginTop: 3 }}>
            <span className="slab tnum" style={{ fontSize: 14, color: s.accent || 'var(--ink)' }}>{s.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// CTA row — primary (ink) + secondary (outline blue)
function CTARow() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '0.5px solid var(--ink)' }}>
      <button style={{
        padding: '12px 14px', background: 'var(--ink)', color: 'var(--paper)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Glyph shape="square" fill="var(--paper)" size={8} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Записать расход</span>
      </button>
      <button style={{
        padding: '12px 14px', background: 'var(--paper)', color: 'var(--blue)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', borderLeft: '0.5px solid var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Glyph shape="circle" fill="none" stroke="var(--blue)" size={8} sw={1.2} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>В накопления</span>
      </button>
    </div>
  );
}

// ─── FULL DASHBOARD ─────────────────────────────────────────

function HiFiDashboard({ variant = 'normal' }) {
  const d = DATA[variant];
  return (
    <PhoneFrame>
      <DashHeader d={d} />
      {d.banner && <Banner kind={d.banner.kind} title={d.banner.title} note={d.banner.note} />}
      <DashHero d={d} />
      <BalanceStrip d={d} />
      <PaceRow d={d} />
      <CycleAxis d={d} />
      <NearestPaymentRow d={d} />
      <div style={{ flex: 1 }} />
      <FooterStrips d={d} />
      <CTARow />
      <TabBar active={0} />
    </PhoneFrame>
  );
}

Object.assign(window, { HiFiDashboard, DATA });
