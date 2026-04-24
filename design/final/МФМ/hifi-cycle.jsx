// ─── HI-FI · 02/05 · CYCLE SCREEN ────────────────────────────
// Axis of days salary→salary, today marker, mandatory payments,
// difference: counted-in-limit vs paid, next payment, daily limit.

const CYCLE_DATA = (() => {
  const cycleStart   = { date: '10 апр', label: 'Зарплата', amount: 120000 };
  const cycleEnd     = { date: '10 май', label: 'Зарплата', amount: 120000 };
  const today        = { date: '24 апр', dayIndex: 14, totalDays: 30 };

  // Payments within cycle
  const payments = [
    { id:'rent',    date:'10 апр', dayIndex: 0,  name:'Аренда',       amount:45000, status:'paid',    counted:true  },
    { id:'phone',   date:'15 апр', dayIndex: 5,  name:'Связь',        amount:650,   status:'paid',    counted:true  },
    { id:'loan',    date:'25 апр', dayIndex: 15, name:'Кредит',       amount:12400, status:'due',     counted:true  }, // tomorrow
    { id:'school',  date:'28 апр', dayIndex: 18, name:'Школа',        amount:8500,  status:'counted', counted:true  },
    { id:'insure',  date:'05 май', dayIndex: 25, name:'Страховка',    amount:3200,  status:'counted', counted:true  },
    { id:'fitness', date:'08 май', dayIndex: 28, name:'Фитнес',       amount:2400,  status:'counted', counted:true  },
  ];

  const totalMandatory  = payments.reduce((s,p) => s + p.amount, 0);
  const paidSoFar       = payments.filter(p => p.status === 'paid').reduce((s,p) => s + p.amount, 0);
  const remainingMand   = totalMandatory - paidSoFar;
  const discretionary   = cycleStart.amount - totalMandatory;          // живёт «свободно»
  const daysLeft        = today.totalDays - today.dayIndex;
  const dailyLimit      = Math.floor(discretionary * 0.7 / today.totalDays); // грубо — иллюстрация
  const availableUntilPayday = 43100;                                  // из «сегодня»
  const nextPayment = payments.find(p => p.status === 'due' || p.status === 'counted');

  return {
    cycleStart, cycleEnd, today,
    payments, totalMandatory, paidSoFar, remainingMand, discretionary,
    daysLeft, dailyLimit, availableUntilPayday, nextPayment,
  };
})();

const cfmt = n => n.toLocaleString('ru-RU');

// ─── Header ──────────────────────────────────────────────────
function CycleHeader({ d }) {
  return (
    <div style={{ padding: '12px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Цикл</span>
        <div style={{ width: 14, height: 0.5, background: 'var(--ink-55)' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>{d.cycleStart.date} → {d.cycleEnd.date}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="eyebrow">день</span>
        <span className="slab tnum" style={{ fontSize: 13 }}>{d.today.dayIndex + 1}</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>/ {d.today.totalDays}</span>
      </div>
    </div>
  );
}

// ─── Available hero ──────────────────────────────────────────
function AvailableHero({ d }) {
  return (
    <div style={{ padding: '18px 18px 14px', display: 'grid', gridTemplateColumns: '3px 1fr', gap: 14, alignItems: 'stretch' }}>
      <div style={{ background: 'var(--ink)' }} />
      <div>
        <div className="eyebrow">Доступно до зарплаты</div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <HeroNumber value={cfmt(d.availableUntilPayday)} />
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>· {d.daysLeft} дн.</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 1, background: 'var(--ink)' }} />
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>дневной лимит</span>
          <span className="slab tnum" style={{ fontSize: 13 }}>{cfmt(d.dailyLimit)}</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>₽/день</span>
        </div>
      </div>
    </div>
  );
}

// ─── Axis of days ────────────────────────────────────────────
function CycleAxis({ d }) {
  const W = 304, H = 78;
  const padX = 6;
  const axisY = 42;
  const N = d.today.totalDays;
  const step = (W - padX * 2) / N;
  const xAt = (dayIdx) => padX + dayIdx * step;

  const statusColor = { paid: 'var(--ink-55)', due: 'var(--red)', counted: 'var(--blue)' };

  return (
    <div style={{ padding: '4px 18px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span className="eyebrow eyebrow--ink">Ось дней · зарплата → зарплата</span>
        <div style={{ flex: 1, height: 0.5, background: 'var(--hair)' }} />
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>{d.today.totalDays} дн.</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        {/* salary endpoints */}
        <line x1={xAt(0)} y1="8" x2={xAt(0)} y2={axisY + 10} stroke="var(--ink)" strokeWidth="1.5" />
        <line x1={xAt(N)} y1="8" x2={xAt(N)} y2={axisY + 10} stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={xAt(0)} cy="8" r="3" fill="var(--blue)" />
        <circle cx={xAt(N)} cy="8" r="3" fill="none" stroke="var(--blue)" strokeWidth="1.2" />

        {/* main axis */}
        <line x1={xAt(0)} y1={axisY} x2={xAt(N)} y2={axisY} stroke="var(--ink)" strokeWidth="0.8" />

        {/* day ticks */}
        {Array.from({ length: N + 1 }).map((_, i) => {
          const isWeek = i % 7 === 0;
          return (
            <line key={i} x1={xAt(i)} y1={axisY} x2={xAt(i)} y2={axisY + (isWeek ? 5 : 3)} stroke="var(--hair)" strokeWidth="0.5" />
          );
        })}

        {/* past shade — hairline below */}
        <line x1={xAt(0)} y1={axisY + 2} x2={xAt(d.today.dayIndex)} y2={axisY + 2} stroke="var(--ink-35)" strokeWidth="0.8" />

        {/* today — heavy vertical */}
        <line x1={xAt(d.today.dayIndex)} y1={axisY - 18} x2={xAt(d.today.dayIndex)} y2={axisY + 12} stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={xAt(d.today.dayIndex)} cy={axisY} r="2.6" fill="var(--ink)" />
        <text x={xAt(d.today.dayIndex)} y={axisY - 22} fontSize="7.5" fontFamily="Archivo Black" textAnchor="middle" fill="var(--ink)" letterSpacing="0.8">СЕГ · 24 АПР</text>

        {/* payments — notches above axis */}
        {d.payments.map((p, i) => {
          const x = xAt(p.dayIndex);
          const col = statusColor[p.status];
          const y0 = axisY - 10;
          const y1 = axisY;
          return (
            <g key={p.id}>
              <line x1={x} y1={y0} x2={x} y2={y1} stroke={col} strokeWidth={p.status === 'due' ? 1.5 : 1} />
              {p.status === 'paid' && (
                <line x1={x - 2} y1={y0} x2={x + 2} y2={y0} stroke={col} strokeWidth="1" />
              )}
              {p.status === 'due' && (
                <polygon points={`${x-2.2},${y0-1} ${x+2.2},${y0-1} ${x},${y0-4}`} fill={col} />
              )}
              {p.status === 'counted' && (
                <circle cx={x} cy={y0} r="1.6" fill="none" stroke={col} strokeWidth="1" />
              )}
            </g>
          );
        })}

        {/* endpoint labels */}
        <text x={xAt(0)} y={axisY + 18} fontSize="7" fontFamily="JetBrains Mono" fill="var(--ink-55)" textAnchor="start">{d.cycleStart.date}</text>
        <text x={xAt(N)} y={axisY + 18} fontSize="7" fontFamily="JetBrains Mono" fill="var(--ink-55)" textAnchor="end">{d.cycleEnd.date}</text>

        {/* week ticks */}
        {[7, 14, 21].map(wk => (
          <text key={wk} x={xAt(wk)} y={axisY + 18} fontSize="7" fontFamily="JetBrains Mono" fill="var(--ink-35)" textAnchor="middle">{wk}</text>
        ))}

        {/* legend */}
        <g transform={`translate(${padX}, ${H - 8})`}>
          <LegendDot x="0"  label="оплачен"      color="var(--ink-55)" shape="bar"  />
          <LegendDot x="68" label="к оплате"     color="var(--red)"    shape="tri"  />
          <LegendDot x="138" label="учтён"        color="var(--blue)"   shape="dot"  />
        </g>
      </svg>
    </div>
  );
}

function LegendDot({ x, label, color, shape }) {
  return (
    <g transform={`translate(${x}, 0)`}>
      {shape === 'bar' && <line x1="0" y1="-2" x2="4" y2="-2" stroke={color} strokeWidth="1" />}
      {shape === 'tri' && <polygon points="0,-1 4,-1 2,-4" fill={color} />}
      {shape === 'dot' && <circle cx="2" cy="-2" r="1.6" fill="none" stroke={color} strokeWidth="1" />}
      <text x="8" y="0" fontSize="7" fontFamily="JetBrains Mono" fill="var(--ink-55)" letterSpacing="0.04em">{label}</text>
    </g>
  );
}

// ─── Next payment callout ────────────────────────────────────
function NextPaymentCallout({ d }) {
  if (!d.nextPayment) return null;
  const p = d.nextPayment;
  return (
    <div style={{ margin: '0 18px 10px', border: '0.5px solid var(--ink)', display: 'grid', gridTemplateColumns: '3px 1fr auto', alignItems: 'stretch' }}>
      <div style={{ background: 'var(--red)' }} />
      <div style={{ padding: '8px 10px' }}>
        <div className="eyebrow" style={{ fontSize: 8 }}>Ближайший платёж · завтра</div>
        <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="slab" style={{ fontSize: 13, letterSpacing: '-0.01em' }}>{p.name}</span>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>· {p.date}</span>
        </div>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', borderLeft: '0.5px solid var(--hair)' }}>
        <span className="slab tnum" style={{ fontSize: 15, color: 'var(--red)' }}>{cfmt(p.amount)}</span>
        <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)' }}>₽</span>
      </div>
    </div>
  );
}

// ─── Payments list ───────────────────────────────────────────
function PaymentsList({ d }) {
  const byStatus = (s) => d.payments.filter(p => p.status === s);
  return (
    <div style={{ padding: '4px 18px 8px', borderTop: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8, marginBottom: 8 }}>
        <span className="eyebrow eyebrow--ink">Обязательные платежи</span>
        <span className="mono tnum" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>{d.payments.length} шт · {cfmt(d.totalMandatory)} ₽</span>
      </div>

      <PaymentGroup title="К оплате" payments={byStatus('due')} />
      <PaymentGroup title="Учтены в лимите" payments={byStatus('counted')} />
      <PaymentGroup title="Оплачены" payments={byStatus('paid')} muted />
    </div>
  );
}

function PaymentGroup({ title, payments, muted }) {
  if (!payments.length) return null;
  const statusCol = { paid: 'var(--ink-55)', due: 'var(--red)', counted: 'var(--blue)' };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
        <span className="mono tnum" style={{ fontSize: 9, color: 'var(--ink-55)' }}>{payments.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {payments.map((p, i) => (
          <div key={p.id} style={{
            display: 'grid', gridTemplateColumns: '2px 44px 1fr auto',
            alignItems: 'center', columnGap: 10,
            padding: '6px 0',
            borderTop: i === 0 ? '0.5px solid var(--ink-80)' : '0.5px solid var(--hair)',
            opacity: muted ? 0.6 : 1,
          }}>
            <div style={{ width: 2, height: 14, background: statusCol[p.status] }} />
            <span className="mono tnum" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>{p.date}</span>
            <span className="slab" style={{ fontSize: 11.5, letterSpacing: '-0.01em', textDecoration: muted ? 'line-through' : 'none', textDecorationColor: 'var(--ink-35)' }}>{p.name}</span>
            <span className="slab tnum" style={{ fontSize: 12, color: p.status === 'due' ? 'var(--red)' : 'var(--ink)' }}>
              {cfmt(p.amount)} <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)' }}>₽</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary triad ───────────────────────────────────────────
function CycleSummary({ d }) {
  return (
    <div style={{ margin: '4px 18px 8px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '0.5px solid var(--ink-80)' }}>
      <CellC label="оплачено"          value={cfmt(d.paidSoFar)}     color="var(--ink-55)" />
      <CellC label="осталось платежей" value={cfmt(d.remainingMand)} color="var(--red)"    divider />
      <CellC label="свободные"         value={cfmt(d.discretionary)} color="var(--blue)"   divider />
    </div>
  );
}
function CellC({ label, value, color, divider }) {
  return (
    <div style={{ padding: '7px 9px', borderLeft: divider ? '0.5px solid var(--ink-80)' : 'none' }}>
      <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>{label}</div>
      <span className="slab tnum" style={{ fontSize: 13, color }}>{value}</span>
      <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)', marginLeft: 3 }}>₽</span>
    </div>
  );
}

// ─── CTA ─────────────────────────────────────────────────────
function CycleCTA() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '0.5px solid var(--ink)' }}>
      <button style={{
        padding: '12px 14px', background: 'var(--ink)', color: 'var(--paper)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Glyph shape="triangle" fill="var(--paper)" size={8} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Отметить оплату</span>
      </button>
      <button style={{
        padding: '12px 14px', background: 'var(--paper)', color: 'var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', borderLeft: '0.5px solid var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Glyph shape="bar" fill="var(--ink)" size={8} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Новый платёж</span>
      </button>
    </div>
  );
}

// ─── Full screen ─────────────────────────────────────────────
function HiFiCycle() {
  const d = CYCLE_DATA;
  return (
    <PhoneFrame h={880}>
      <CycleHeader d={d} />
      <AvailableHero d={d} />
      <CycleAxis d={d} />
      <NextPaymentCallout d={d} />
      <CycleSummary d={d} />
      <PaymentsList d={d} />
      <div style={{ flex: 1, minHeight: 6 }} />
      <CycleCTA />
      <TabBar active={1} />
    </PhoneFrame>
  );
}

Object.assign(window, { HiFiCycle, CYCLE_DATA });
