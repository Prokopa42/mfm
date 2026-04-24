// ─── HI-FI · 03/05 · SAVINGS SCREEN ──────────────────────────
// Model: savings = one pot. Goals = envelopes inside it.
// Invariant: allocated_total + unallocated == total_savings.

const SAVINGS_DATA = (() => {
  // Pot
  const total_savings   = 243100;                 // общий котёл
  const total_real      = 228400;                 // в сегодняшних ₽
  const inflation_loss  = total_savings - total_real;
  const monthly_pace    = 20000;                  // общий темп

  // Cushion (system reserve — not a goal)
  const cushion = {
    allocated: 178500,
    target:    180000,
    months_of_spend: 3.2,
    target_months:   3.0,
    status: 'ok',           // ok | low | critical
  };

  // Goals (envelopes)
  const goalsRaw = [
    {
      id: 'laptop',
      name: 'Новый ноутбук',
      allocated:    28600,
      target:       80000,
      deadline:     '31.12',
      months_left:  8,
      planned_pace: 8000,
    },
    {
      id: 'vacation',
      name: 'Отпуск',
      allocated:    16000,
      target:       120000,
      deadline:     '01.07',
      months_left:  3,
      planned_pace: 7000,
    },
  ];

  const goals = goalsRaw.map(g => {
    const gap_now        = Math.max(0, g.target - g.allocated);
    const required_pace  = g.months_left > 0 ? Math.round(gap_now / g.months_left) : 0;
    const forecast_at_dl = g.allocated + g.planned_pace * g.months_left;
    const gap_at_dl      = Math.max(0, g.target - forecast_at_dl);
    let status;
    if (g.allocated >= g.target)              status = 'done';
    else if (forecast_at_dl >= g.target)      status = 'on-track';
    else                                      status = 'behind';
    return { ...g, gap_now, required_pace, forecast_at_dl, gap_at_dl, status };
  });

  // Allocation math
  const allocated_to_goals = goals.reduce((s, g) => s + g.allocated, 0);
  const allocated_total    = cushion.allocated + allocated_to_goals;
  const unallocated        = total_savings - allocated_total;

  // Planned pace totals (must sum ≤ monthly_pace)
  const planned_to_goals   = goals.reduce((s, g) => s + g.planned_pace, 0);
  const planned_to_cushion = 0; // already full
  const planned_free       = monthly_pace - planned_to_goals - planned_to_cushion;

  // Sparkline — общий котёл
  const spark = {
    past:     [180000, 186000, 192000, 198000, 204000, 210000, 216000, 222000, 228000, 234000, 238000, 240000, 241500, 243100],
    forecast: [263100, 283100, 303100, 323100, 343100, 353400], // to 31.12
  };

  return {
    total_savings, total_real, inflation_loss,
    monthly_pace,
    cushion,
    goals,
    allocated_to_goals, allocated_total, unallocated,
    planned_to_goals, planned_free,
    spark,
  };
})();

// Helpers
const fmt = n => n.toLocaleString('ru-RU');

// ─── Header ──────────────────────────────────────────────────
function SavingsHeader({ d }) {
  return (
    <div style={{ padding: '12px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Накопления</span>
        <div style={{ width: 14, height: 0.5, background: 'var(--ink-55)' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>24 апр</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="eyebrow">темп котла</span>
        <span className="slab tnum" style={{ fontSize: 13, color: 'var(--blue)' }}>+{fmt(d.monthly_pace)}</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>₽/мес</span>
      </div>
    </div>
  );
}

// ─── Hero: ONLY total pot ────────────────────────────────────
function PotHero({ d }) {
  return (
    <div style={{ padding: '22px 18px 14px', display: 'grid', gridTemplateColumns: '3px 1fr', gap: 14, alignItems: 'stretch' }}>
      <div style={{ background: 'var(--blue)' }} />
      <div>
        <div className="eyebrow">Накоплено всего · общий котёл</div>
        <div style={{ marginTop: 10 }}>
          <HeroNumber value={fmt(d.total_savings)} />
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 1, background: 'var(--ink)' }} />
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>номинально</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="eyebrow">в сегодняшних ₽</span>
          <InlineNumber value={fmt(d.total_real)} size={15} color="var(--ink-55)" />
          <span className="mono" style={{ fontSize: 9, color: 'var(--red)' }}>−{fmt(d.inflation_loss)}</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink-35)' }}>инфляция</span>
        </div>
      </div>
    </div>
  );
}

// ─── Allocation bar: proves envelopes are inside the pot ─────
function AllocationBar({ d }) {
  const segs = [
    { id:'cushion',  label:'Подушка',        value: d.cushion.allocated,              fill: 'var(--ink)',   pattern: null },
    ...d.goals.map(g => ({
      id: g.id, label: g.name.split(' ')[0] + (g.name.split(' ')[1] ? ' ' + g.name.split(' ')[1] : ''),
      value: g.allocated,
      fill: g.status === 'behind' ? 'var(--red)' : 'var(--blue)',
      pattern: null,
    })),
    { id:'free',     label:'Не распределено', value: d.unallocated,                    fill: 'var(--paper)', pattern: 'hatch' },
  ];

  const sum = segs.reduce((s, x) => s + x.value, 0);
  const W = 304, H = 16;
  let cx = 0;

  return (
    <div style={{ padding: '0 18px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span className="eyebrow eyebrow--ink">Распределение котла</span>
        <div style={{ flex: 1, height: 0.5, background: 'var(--hair)' }} />
        <span className="mono tnum" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>= 100% от {fmt(d.total_savings)} ₽</span>
      </div>

      {/* The bar itself */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', border: '0.5px solid var(--ink)' }}>
        <defs>
          <pattern id="hatch-free" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink-35)" strokeWidth="0.6" />
          </pattern>
        </defs>
        {segs.map((s, i) => {
          const w = (s.value / sum) * W;
          const x = cx;
          cx += w;
          return (
            <g key={s.id}>
              <rect x={x} y="0" width={w} height={H}
                    fill={s.pattern === 'hatch' ? 'url(#hatch-free)' : s.fill} />
              {i > 0 && <line x1={x} y1="0" x2={x} y2={H} stroke="var(--paper)" strokeWidth="1" />}
            </g>
          );
        })}
      </svg>

      {/* Legend rows */}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 10, rowGap: 5 }}>
        {segs.map(s => {
          const pct = Math.round((s.value / sum) * 100);
          return (
            <React.Fragment key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, background: s.pattern === 'hatch' ? 'transparent' : s.fill, border: s.pattern === 'hatch' ? '0.5px dashed var(--ink-35)' : 'none' }} />
                <span className="mono" style={{ fontSize: 10, letterSpacing: '-0.01em' }}>{s.label}</span>
              </div>
              <div style={{ borderBottom: '0.5px dotted var(--ink-18)', alignSelf: 'end', marginBottom: 3 }} />
              <span className="mono tnum" style={{ fontSize: 10, color: s.id === 'free' ? 'var(--ink-55)' : 'var(--ink)' }}>
                {fmt(s.value)} <span style={{ color: 'var(--ink-35)' }}>₽ · {pct}%</span>
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Triad */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '0.5px solid var(--ink-80)' }}>
        <TriadCell label="распределено"      value={fmt(d.allocated_total)} />
        <TriadCell label="не распределено"   value={fmt(d.unallocated)}     divider />
        <TriadCell label="темп котла/мес"    value={`+${fmt(d.monthly_pace)}`} divider color="var(--blue)" />
      </div>
    </div>
  );
}

function TriadCell({ label, value, divider, color = 'var(--ink)' }) {
  return (
    <div style={{ padding: '7px 9px', borderLeft: divider ? '0.5px solid var(--ink-80)' : 'none' }}>
      <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>{label}</div>
      <span className="slab tnum" style={{ fontSize: 13, color }}>{value}</span>
      <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)', marginLeft: 3 }}>₽</span>
    </div>
  );
}

// ─── Pot trajectory ──────────────────────────────────────────
function PotTrajectory({ d }) {
  const W = 304, H = 64;
  const all = [...d.spark.past, ...d.spark.forecast];
  const max = Math.max(...all), min = Math.min(...all);
  const range = max - min || 1;
  const N = all.length;
  const step = W / (N - 1);
  const pastEnd = d.spark.past.length - 1;
  const xy = (v, i) => [i * step, H - 12 - ((v - min) / range) * (H - 20)];

  const pastPath = d.spark.past.map((v, i) => {
    const [x, y] = xy(v, i);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const forecastPath = d.spark.forecast.map((v, i) => {
    const [x, y] = xy(v, pastEnd + 1 + i);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const [pex, pey] = xy(d.spark.past[pastEnd], pastEnd);
  const [fx, fy]   = xy(d.spark.forecast[0], pastEnd + 1);
  const joinPath   = `M ${pex} ${pey} L ${fx} ${fy}`;
  const [todayX, todayY] = xy(d.spark.past[pastEnd], pastEnd);

  return (
    <div style={{ padding: '6px 18px 10px', borderTop: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 6 }}>
        <span className="eyebrow eyebrow--ink">Траектория котла</span>
        <div style={{ flex: 1, height: 0.5, background: 'var(--hair)' }} />
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>14 нед. факт → 24 нед. прогноз</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <line x1="0" y1={H - 12} x2={W} y2={H - 12} stroke="var(--hair)" strokeWidth="0.5" />
        <line x1="0" y1="8" x2={W} y2="8" stroke="var(--hair)" strokeWidth="0.5" strokeDasharray="1 2" />

        <path d={pastPath}     fill="none" stroke="var(--ink)"  strokeWidth="1.2" strokeLinejoin="round" />
        <path d={joinPath}     fill="none" stroke="var(--blue)" strokeWidth="1"   strokeDasharray="2 2" />
        <path d={forecastPath} fill="none" stroke="var(--blue)" strokeWidth="1"   strokeDasharray="2 2" strokeLinejoin="round" />

        <line x1={todayX} y1="4" x2={todayX} y2={H - 12} stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={todayX} cy={todayY} r="2.4" fill="var(--ink)" />
        <text x={todayX} y="3" fontSize="7.5" fontFamily="Archivo Black" textAnchor="middle" fill="var(--ink)" letterSpacing="0.8">СЕГ</text>

        {(() => {
          const [tx, ty] = xy(d.spark.forecast[d.spark.forecast.length - 1], N - 1);
          return (
            <g>
              <circle cx={tx} cy={ty} r="2.4" fill="none" stroke="var(--blue)" strokeWidth="1.2" />
              <text x={tx} y={ty - 6} fontSize="7.5" fontFamily="Archivo Black" textAnchor="end" fill="var(--blue)" letterSpacing="0.8">31.12</text>
            </g>
          );
        })()}
      </svg>

      {/* Forecast pair — ABOUT THE POT */}
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: '6px 0', borderTop: '0.5px solid var(--hair)' }}>
          <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>котёл к 31.12 · номин.</div>
          <span className="slab tnum" style={{ fontSize: 15, color: 'var(--blue)' }}>353 400</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)', marginLeft: 3 }}>₽</span>
        </div>
        <div style={{ padding: '6px 0', borderTop: '0.5px solid var(--hair)' }}>
          <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>в сегодняшних ₽</div>
          <span className="slab tnum" style={{ fontSize: 15, color: 'var(--ink-55)' }}>331 600</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)', marginLeft: 3 }}>₽</span>
        </div>
      </div>
    </div>
  );
}

// ─── Cushion: system reserve, not a goal ─────────────────────
function CushionBlock({ d }) {
  const c = d.cushion;
  const pct = Math.min(100, Math.round((c.allocated / c.target) * 100));
  return (
    <div style={{ padding: '10px 18px', borderTop: '0.5px solid var(--ink)', background: 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 9, height: 9, border: '1.2px solid var(--ink)', transform: 'rotate(45deg)' }} />
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Подушка</span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>· системный резерв</span>
        <div style={{ flex: 1 }} />
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--ink)' }}>{c.months_of_spend.toFixed(1)} <span style={{ color: 'var(--ink-55)' }}>из {c.target_months.toFixed(1)} мес.</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--thin)', border: '0.5px solid var(--hair)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: -0.5, bottom: -0.5, width: `${pct}%`, background: 'var(--ink)' }} />
        </div>
        <span className="slab tnum" style={{ fontSize: 11, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 14 }}>
        <span className="mono tnum" style={{ fontSize: 10 }}>{fmt(c.allocated)} <span style={{ color: 'var(--ink-55)' }}>₽ выделено</span></span>
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--ink-55)' }}>цель {fmt(c.target)} ₽</span>
      </div>
    </div>
  );
}

// ─── Goals list ──────────────────────────────────────────────
function GoalsList({ d }) {
  return (
    <div style={{ padding: '4px 18px 8px', borderTop: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8, marginBottom: 8 }}>
        <span className="eyebrow eyebrow--ink">Цели · конверты внутри котла</span>
        <span className="mono tnum" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>{d.goals.length} шт.</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {d.goals.map(g => <GoalRow key={g.id} g={g} />)}
      </div>
      {d.planned_free > 0 && (
        <div style={{ marginTop: 8, padding: '6px 10px', border: '0.5px dashed var(--ink-35)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Темп · не распределён в цели</span>
          <span className="mono tnum" style={{ fontSize: 10 }}>+{fmt(d.planned_free)} <span style={{ color: 'var(--ink-55)' }}>₽/мес</span></span>
        </div>
      )}
    </div>
  );
}

function GoalRow({ g }) {
  const pct = Math.min(100, Math.round((g.allocated / g.target) * 100));
  const statusMap = {
    'on-track':    { color: 'var(--blue)', label: 'в графике' },
    'behind':      { color: 'var(--red)',  label: 'отстаёт'   },
    'done':        { color: 'var(--ink)',  label: 'достигнута' },
  };
  const s = statusMap[g.status];

  return (
    <div style={{
      border: '0.5px solid var(--ink-80)',
      padding: '10px 12px',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      rowGap: 7,
      columnGap: 10,
    }}>
      {/* Name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 2, height: 11, background: s.color }} />
        <span className="slab" style={{ fontSize: 12, letterSpacing: '-0.01em' }}>{g.name}</span>
        <span className="mono" style={{ fontSize: 8.5, color: s.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>· {s.label}</span>
      </div>
      <span className="mono tnum" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>до {g.deadline} · {g.months_left} мес.</span>

      {/* Progress bar = allocated / target */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--thin)', border: '0.5px solid var(--hair)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: -0.5, bottom: -0.5, width: `${pct}%`, background: s.color }} />
        </div>
        <span className="slab tnum" style={{ fontSize: 11, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
      </div>

      {/* Row A: allocated / target / gap now */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 3, borderTop: '0.5px solid var(--hair)' }}>
        <GoalCell label="выделено"      value={fmt(g.allocated)} />
        <GoalCell label="цель"          value={fmt(g.target)}    color="var(--ink-55)" />
        <GoalCell label="разрыв сейчас" value={fmt(g.gap_now)}   color={s.color} />
      </div>

      {/* Row B: paces */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, borderTop: '0.5px solid var(--hair)', paddingTop: 4 }}>
        <PaceCell label="нужный темп"  value={`${fmt(g.required_pace)} ₽/мес`} color={s.color} />
        <PaceCell label="плановый темп" value={`+${fmt(g.planned_pace)} ₽/мес`} color="var(--ink)" />
      </div>

      {/* Row C: forecast at deadline */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: '0.5px solid var(--hair)', paddingTop: 4 }}>
        <PaceCell label="прогноз к дедлайну"  value={`${fmt(g.forecast_at_dl)} ₽`} color="var(--ink)" />
        <PaceCell label="разрыв к дедлайну"   value={g.gap_at_dl > 0 ? `${fmt(g.gap_at_dl)} ₽` : '0 ₽'} color={g.gap_at_dl > 0 ? s.color : 'var(--ink-55)'} />
      </div>
    </div>
  );
}

function GoalCell({ label, value, color = 'var(--ink)' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span className="mono" style={{ fontSize: 8, color: 'var(--ink-55)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <span className="slab tnum" style={{ fontSize: 11, color, marginTop: 1 }}>{value} <span className="mono" style={{ fontSize: 8, color: 'var(--ink-55)' }}>₽</span></span>
    </div>
  );
}
function PaceCell({ label, value, color = 'var(--ink)' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span className="mono" style={{ fontSize: 8, color: 'var(--ink-55)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <span className="mono tnum" style={{ fontSize: 10, color, marginTop: 1, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── CTA ─────────────────────────────────────────────────────
function SavingsCTA() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '0.5px solid var(--ink)' }}>
      <button style={{
        padding: '12px 14px', background: 'var(--ink)', color: 'var(--paper)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Glyph shape="square" fill="var(--paper)" size={8} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Отложить в котёл</span>
      </button>
      <button style={{
        padding: '12px 14px', background: 'var(--paper)', color: 'var(--blue)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', borderLeft: '0.5px solid var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Glyph shape="circle" fill="none" stroke="var(--blue)" size={8} sw={1.2} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Распределить</span>
      </button>
    </div>
  );
}

// ─── Full screen ─────────────────────────────────────────────
function HiFiSavings() {
  const d = SAVINGS_DATA;
  return (
    <PhoneFrame h={960}>
      <SavingsHeader d={d} />
      <PotHero d={d} />
      <AllocationBar d={d} />
      <PotTrajectory d={d} />
      <CushionBlock d={d} />
      <GoalsList d={d} />
      <div style={{ flex: 1, minHeight: 6 }} />
      <SavingsCTA />
      <TabBar active={2} />
    </PhoneFrame>
  );
}

Object.assign(window, { HiFiSavings, SAVINGS_DATA });
