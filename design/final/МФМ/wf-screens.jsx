// Wireframe SCREENS — inside Phone frames.
// 3 Dashboard directions: "Single Answer", "Runway Bars", "Two Envelopes"
// 4 other screens: Runway, Savings, History, Settings
// State variants adjust numbers/banners.

// ── State-derived numbers ─────────────────────────────────────
const STATE_DATA = {
  'normal':            { available: 412, days: 11, safe: 37, safeTmr: 41, bill: null,  cashRisk: false },
  'tight':             { available: 120, days: 9,  safe: 13, safeTmr: 15, bill: null,  cashRisk: false, tight: true },
  'cash-risk':         { available: -42, days: 7,  safe: 0,  safeTmr: 0,  bill: null,  cashRisk: true },
  'payday-arrived':    { available: 0,   days: 0,  safe: 0,  safeTmr: 0,  bill: null,  payday: true },
  'payment-due-tomorrow': { available: 260, days: 8, safe: 32, safeTmr: 36, bill: { name: 'Internet', amount: 45, when: 'tomorrow' } },
  'savings-off-track': { available: 412, days: 11, safe: 37, safeTmr: 41, bill: null,  offTrack: true },
};
function useData(state) { return STATE_DATA[state] || STATE_DATA['normal']; }

// ── State banner (used on several screens) ───────────────────
function StateBanner({ state }) {
  const d = useData(state);
  if (d.cashRisk) return <Banner color="var(--risk)" bg="rgba(201,63,47,0.08)" icon="!">Cash-risk · reserve protects you, but spending = $0.</Banner>;
  if (d.payday)   return <Banner color="var(--accent-2)" bg="rgba(31,111,235,0.08)" icon="↻">Payday · confirm income to start new cycle.</Banner>;
  if (d.tight)    return <Banner color="var(--warn)" bg="rgba(212,160,23,0.12)" icon="~">Tight week · stay under $15/day.</Banner>;
  if (d.bill)     return <Banner color="var(--warn)" bg="rgba(212,160,23,0.10)" icon="•">{d.bill.name} ${d.bill.amount} due {d.bill.when} (already subtracted).</Banner>;
  if (d.offTrack) return <Banner color="var(--risk)" bg="rgba(201,63,47,0.08)" icon="↓">Savings off track for year-end goal.</Banner>;
  return null;
}
function Banner({ children, color, bg, icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: bg, border: `1.3px solid ${color}`, borderRadius: 10,
      padding: '6px 10px', margin: '10px 14px',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 18, background: color, color: '#fff',
        fontFamily: 'Caveat', fontWeight: 700, fontSize: 14, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</span>
      <H size={12} color={color} weight={700} style={{ lineHeight: 1.2 }}>{children}</H>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// DIRECTION 1 — "Single Answer"
// Hero number fills top half. Minimal everything else.
// ═════════════════════════════════════════════════════════════
function DashSingleAnswer({ state }) {
  const d = useData(state);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 14px 0', display: 'flex', justifyContent: 'space-between' }}>
        <H size={12} color="var(--muted)">wed · apr 22</H>
        <H size={12} color="var(--muted)">{d.payday ? 'payday!' : `${d.days} days → payday`}</H>
      </div>
      <StateBanner state={state} />

      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 14px', textAlign: 'center' }}>
        <H size={13} color="var(--muted)" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Safe to spend today</H>
        <div style={{ margin: '8px 0 4px' }}>
          <BigNumber value={d.safe} size={d.cashRisk ? 82 : 96} color={d.cashRisk ? 'var(--risk)' : 'var(--ink)'} />
        </div>
        <Squiggle width={130} color="var(--accent)" h={7} />

        <div style={{ marginTop: 18 }}>
          <H size={13} color="var(--muted)">if I spend nothing today, tomorrow</H>
          <div style={{ marginTop: 2 }}>
            <BigNumber value={d.safeTmr} size={36} color="var(--ink-2)" />
          </div>
        </div>
      </div>

      {/* quick actions */}
      <div style={{ padding: '0 14px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SketchBox seed={1} pad={10} radius={14}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'Caveat', fontSize: 24, fontWeight: 700 }}>−</span>
            <H size={14} weight={700}>Add expense</H>
          </div>
        </SketchBox>
        <SketchBox seed={2} pad={10} radius={14}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'Caveat', fontSize: 24, fontWeight: 700, color: 'var(--accent-2)' }}>→</span>
            <H size={14} weight={700} color="var(--accent-2)">To savings</H>
          </div>
        </SketchBox>
      </div>

      {/* small strip: next bill + balance */}
      <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <MiniStat label="operational" value="$812" />
        <MiniStat label="next bill" value="Internet · Apr 23" />
        <MiniStat label="savings" value="$4,310" />
      </div>

      <TabBar active={0} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// DIRECTION 2 — "Runway Bars"
// Hero + day-by-day bars visible on home, quick visual trust.
// ═════════════════════════════════════════════════════════════
function DashRunwayBars({ state }) {
  const d = useData(state);
  // Generate 11 days; taller = higher safe spend
  const days = Array.from({ length: Math.max(d.days, 6) }, (_, i) => {
    const base = d.safe || 30;
    const dip = i === 2 ? 0.4 : (i === 6 ? 0.55 : 1);
    return { h: base * (0.8 + Math.sin(i * 1.4) * 0.15) * dip, mandatory: i === 2 || i === 6 };
  });
  const maxH = Math.max(...days.map(x => x.h), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 14px 0', display: 'flex', justifyContent: 'space-between' }}>
        <H size={12} color="var(--muted)">wed · apr 22</H>
        <H size={12} color="var(--muted)">{d.days} days → payday</H>
      </div>
      <StateBanner state={state} />

      {/* hero */}
      <div style={{ textAlign: 'center', padding: '10px 14px 0' }}>
        <H size={12} color="var(--muted)" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Safe today</H>
        <div><BigNumber value={d.safe} size={64} color={d.cashRisk ? 'var(--risk)' : 'var(--ink)'} /></div>
        <H size={12} color="var(--muted)">(tomorrow if $0 today → <B>${d.safeTmr}</B>)</H>
      </div>

      {/* runway bars */}
      <div style={{ margin: '14px 14px 0', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 92, borderBottom: '1.5px solid var(--ink)' }}>
          {days.slice(0, 11).map((day, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {day.mandatory && <span style={{ fontFamily: 'Caveat', fontSize: 10, color: 'var(--warn)' }}>•</span>}
              <div style={{
                width: '100%',
                height: `${(day.h / maxH) * 70}px`,
                background: i === 0 ? 'var(--ink)' : 'repeating-linear-gradient(135deg, var(--ink) 0 1px, transparent 1px 4px)',
                border: '1.2px solid var(--ink)',
                borderRadius: '2px 2px 0 0',
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          {days.slice(0, 11).map((_, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'Kalam', fontSize: 9, color: i === 0 ? 'var(--ink)' : 'var(--muted)', fontWeight: i === 0 ? 700 : 400 }}>
              {i === 0 ? 'TODAY' : 22 + i}
            </div>
          ))}
        </div>
        <H size={10} color="var(--muted)" style={{ display: 'block', marginTop: 6, textAlign: 'center' }}>
          solid = today · dashed = projected · • = mandatory bill
        </H>
      </div>

      {/* bill + quick add */}
      <div style={{ padding: '10px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end' }}>
        <SketchBox seed={3} pad={8} radius={10}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <H size={11} color="var(--muted)">Next bill</H>
              <div><H size={14} weight={700}>Internet · Apr 23</H></div>
            </div>
            <C size={22}>$45</C>
          </div>
        </SketchBox>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SketchBox seed={4} pad={8} radius={14}>
            <div style={{ textAlign: 'center' }}><H size={13} weight={700}>− add expense</H></div>
          </SketchBox>
          <SketchBox seed={5} pad={8} radius={14}>
            <div style={{ textAlign: 'center' }}><H size={13} weight={700} color="var(--accent-2)">→ to savings</H></div>
          </SketchBox>
        </div>
      </div>

      <TabBar active={0} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// DIRECTION 3 — "Two Envelopes"
// Physical metaphor: two boxes. Operational (with daily answer) vs Savings.
// Visually communicates the separation the user insisted on.
// ═════════════════════════════════════════════════════════════
function DashTwoEnvelopes({ state }) {
  const d = useData(state);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 14px 0', display: 'flex', justifyContent: 'space-between' }}>
        <H size={12} color="var(--muted)">wed · apr 22</H>
        <H size={12} color="var(--muted)">{d.days} days → payday</H>
      </div>
      <StateBanner state={state} />

      {/* Operational envelope — big */}
      <div style={{ padding: '6px 14px 6px' }}>
        <SketchBox seed={6} pad={14} radius={16} highlight="rgba(255,214,92,0.2)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <H size={11} color="var(--muted)" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Operational</H>
            <H size={12} color="var(--muted)">$812 left</H>
          </div>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <H size={11} color="var(--muted)">safe today</H>
            <BigNumber value={d.safe} size={72} color={d.cashRisk ? 'var(--risk)' : 'var(--ink)'} />
            <H size={12} color="var(--muted)">or ${d.safeTmr} tomorrow if nothing today</H>
          </div>
          {/* mini segmented bar: spent / safe / reserve */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', height: 10, border: '1.3px solid var(--ink)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ flex: 3, background: 'var(--ink)' }} title="spent" />
              <div style={{ flex: 5, background: 'repeating-linear-gradient(135deg, var(--ink) 0 1px, transparent 1px 4px)' }} title="remaining safe" />
              <div style={{ flex: 2, background: 'var(--warn)' }} title="reserve" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontFamily: 'Kalam', fontSize: 10, color: 'var(--muted)' }}>
              <span>spent</span><span>safe remaining</span><span>reserve</span>
            </div>
          </div>
        </SketchBox>
      </div>

      {/* Savings envelope — smaller */}
      <div style={{ padding: '0 14px' }}>
        <SketchBox seed={7} pad={12} radius={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <H size={11} color="var(--accent-2)" weight={700} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Savings — sealed</H>
              <div><BigNumber value="4,310" size={38} color="var(--accent-2)" /></div>
              <H size={11} color="var(--muted)">+$180/mo avg · year-end forecast $5,340</H>
            </div>
            <SketchBox seed={8} pad={6} radius={40} stroke="var(--accent-2)">
              <H size={11} weight={700} color="var(--accent-2)">→ add</H>
            </SketchBox>
          </div>
        </SketchBox>
      </div>

      {/* quick add */}
      <div style={{ padding: '10px 14px 6px', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
        <SketchBox seed={9} pad={14} radius={22} fill="var(--ink)">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Caveat', fontSize: 28, fontWeight: 700, color: '#fff' }}>+</span>
            <H size={15} weight={700} style={{ color: '#fff' }}>log expense</H>
          </div>
        </SketchBox>
      </div>

      <TabBar active={0} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 2 — Runway / Forecast
// Day-by-day list.
// ═════════════════════════════════════════════════════════════
function ScreenRunway() {
  const days = [];
  const today = 22;
  for (let i = 0; i < 11; i++) {
    const date = today + i;
    const tight = (i === 2 || i === 6);
    const safe = 37 + Math.round(Math.sin(i * 1.3) * 5) - (tight ? 15 : 0);
    days.push({ date, safe, mandatory: i === 2 ? 'Internet $45' : (i === 6 ? 'Gym $29' : null), isToday: i === 0 });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px 0' }}>
        <C size={28}>Runway</C>
        <H size={12} color="var(--muted)">apr 22 → may 2 · 11 days</H>
      </div>

      {/* summary strip */}
      <div style={{ padding: '8px 14px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <MiniStat label="avail." value="$412" />
        <MiniStat label="bills left" value="$74" />
        <MiniStat label="reserve" value="$100" />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {days.map((d, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '42px 1fr 70px', alignItems: 'center', gap: 8,
            padding: '5px 8px', borderRadius: 8,
            background: d.isToday ? 'rgba(232,93,43,0.15)' : 'transparent',
            border: d.isToday ? '1.5px solid var(--accent)' : '1px dashed var(--thin)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <H size={9} color="var(--muted)">apr</H>
              <div><C size={20}>{d.date}</C></div>
            </div>
            <div>
              <H size={12} weight={d.isToday ? 700 : 400}>
                {d.isToday ? 'TODAY · safe to spend' : 'if on pace'}
              </H>
              {d.mandatory && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 6, background: 'var(--warn)' }} />
                  <H size={11} color="var(--warn)">{d.mandatory}</H>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <BigNumber value={d.safe} size={22} color={d.safe < 15 ? 'var(--risk)' : 'var(--ink)'} />
            </div>
          </div>
        ))}
        <div style={{ textAlign: 'center', padding: 8, borderTop: '1px dashed var(--thin)', marginTop: 4 }}>
          <H size={13} weight={700}>May 3 · payday → +$1,400</H>
        </div>
      </div>

      <TabBar active={1} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 3 — Savings
// ═════════════════════════════════════════════════════════════
function ScreenSavings({ state }) {
  const offTrack = state === 'savings-off-track';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px 0' }}>
        <C size={28}>Savings</C>
      </div>

      {offTrack && <StateBanner state={state} />}

      {/* Hero saved now */}
      <div style={{ padding: '8px 14px' }}>
        <H size={11} color="var(--muted)" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Saved now</H>
        <BigNumber value="4,310" size={60} color="var(--accent-2)" />
        <H size={12} color="var(--muted)" style={{ display: 'block', marginTop: 2 }}>
          pace <B>$180/mo</B> · since jan 2026
        </H>
      </div>

      {/* forecast */}
      <div style={{ padding: '0 14px 8px' }}>
        <SketchBox seed={10} pad={12} radius={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <H size={12} color="var(--muted)">Forecast by</H>
            <C size={20}>Dec 31, 2026</C>
          </div>
          {/* date slider */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 2, background: 'var(--ink)', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '60%', top: -7, width: 16, height: 16, borderRadius: 16, background: 'var(--ink)', border: '2px solid var(--paper)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <H size={10} color="var(--muted)">nominal</H>
              <BigNumber value="5,830" size={32} color="var(--ink)" />
            </div>
            <div style={{ width: 1, background: 'var(--thin)' }} />
            <div style={{ textAlign: 'right' }}>
              <H size={10} color="var(--muted)">today's money (0.90×)</H>
              <BigNumber value="5,378" size={32} color={offTrack ? 'var(--muted)' : 'var(--ink-2)'} />
            </div>
          </div>
        </SketchBox>
      </div>

      {/* Goals */}
      <div style={{ padding: '0 14px', flex: 1, overflow: 'auto' }}>
        <H size={11} color="var(--muted)" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Goals</H>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          <Goal title="Emergency fund" cur={4310} target={6000} deadline="aug" ontrack={!offTrack} />
          <Goal title="Summer trip" cur={420} target={1200} deadline="jun" ontrack={false} />
          <Goal title="New laptop" cur={0} target={1800} deadline="dec" ontrack={true} />
        </div>
      </div>

      <TabBar active={2} />
    </div>
  );
}
function Goal({ title, cur, target, deadline, ontrack }) {
  const pct = Math.min(1, cur / target);
  return (
    <SketchBox seed={title.length} pad={10} radius={12}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <H size={13} weight={700}>{title}</H>
        <H size={10} color={ontrack ? 'var(--ok)' : 'var(--risk)'} weight={700}>
          {ontrack ? '✓ on track' : '✕ behind'}
        </H>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <H size={11} color="var(--muted)">${cur} / ${target}</H>
        <H size={11} color="var(--muted)">by {deadline}</H>
      </div>
      <div style={{ marginTop: 6, height: 8, background: 'var(--paper-2)', border: '1.2px solid var(--ink)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: ontrack ? 'var(--ink)' : 'repeating-linear-gradient(135deg, var(--risk) 0 2px, transparent 2px 5px)' }} />
      </div>
    </SketchBox>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 4 — History
// ═════════════════════════════════════════════════════════════
function ScreenHistory() {
  const items = [
    { d: 'apr 22', t: 'Coffee', amt: -4.50, kind: 'exp' },
    { d: 'apr 22', t: 'Lunch', amt: -12.30, kind: 'exp' },
    { d: 'apr 21', t: 'To Savings', amt: -100, kind: 'xfer' },
    { d: 'apr 21', t: 'Groceries', amt: -42.11, kind: 'exp' },
    { d: 'apr 20', t: 'Paycheck', amt: 1400, kind: 'inc' },
    { d: 'apr 20', t: 'Rent', amt: -780, kind: 'bill' },
    { d: 'apr 19', t: 'Gas', amt: -38, kind: 'exp' },
    { d: 'apr 18', t: 'Refund · shirt', amt: 24, kind: 'inc' },
    { d: 'apr 17', t: 'Dinner out', amt: -28, kind: 'exp' },
  ];
  const mark = { exp: '−', inc: '+', xfer: '→', bill: '!' };
  const col = { exp: 'var(--ink)', inc: 'var(--ok)', xfer: 'var(--accent-2)', bill: 'var(--warn)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px 0' }}>
        <C size={28}>History</C>
      </div>
      {/* filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto' }}>
        {['all', 'expenses', 'income', 'transfers', 'bills'].map((c, i) => (
          <div key={c} style={{
            fontFamily: 'Kalam', fontSize: 11, padding: '3px 10px', borderRadius: 20,
            border: '1.3px solid var(--ink)', background: i === 0 ? 'var(--ink)' : 'transparent',
            color: i === 0 ? 'var(--paper)' : 'var(--ink)', fontWeight: 700, whiteSpace: 'nowrap',
          }}>{c}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 14px 10px' }}>
        {items.map((x, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0', borderBottom: '1px dashed var(--thin)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 24, background: col[x.kind], color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Caveat', fontSize: 16, fontWeight: 700,
            }}>{mark[x.kind]}</div>
            <div style={{ flex: 1 }}>
              <H size={13} weight={700}>{x.t}</H>
              <H size={10} color="var(--muted)">{x.d}</H>
            </div>
            <C size={22} color={x.amt > 0 ? 'var(--ok)' : 'var(--ink)'}>
              {x.amt > 0 ? '+' : '−'}${Math.abs(x.amt).toFixed(x.amt % 1 === 0 ? 0 : 2)}
            </C>
          </div>
        ))}
      </div>
      <TabBar active={3} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SCREEN 5 — Settings
// ═════════════════════════════════════════════════════════════
function ScreenSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px 0' }}>
        <C size={28}>Settings</C>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px' }}>
        <SettingGroup title="Pay cycle">
          <SettingRow label="1st payday" value="5th of month" />
          <SettingRow label="2nd payday" value="20th of month" />
          <SettingRow label="Typical amount #1" value="$1,400" />
          <SettingRow label="Typical amount #2" value="$1,400" />
        </SettingGroup>
        <SettingGroup title="Money">
          <SettingRow label="Reserve buffer" value="$100" />
          <SettingRow label="Purchasing power coef." value="0.90 / year" sub="(default · ~10% yearly erosion)" />
        </SettingGroup>
        <SettingGroup title="Calculation">
          <SettingRow label="Include today in divisor" toggle={true} />
          <SettingRow label="Round safe-to-spend" value="to $1" />
          <SettingRow label="Auto-subtract planned savings" toggle={true} />
        </SettingGroup>
        <SettingGroup title="Data">
          <SettingRow label="Export CSV" link />
          <SettingRow label="Reset cycle manually" link />
        </SettingGroup>
      </div>
      <TabBar active={4} />
    </div>
  );
}
function SettingGroup({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <H size={10} color="var(--muted)" weight={700} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{title}</H>
      <SketchBox seed={title.length} pad={0} radius={12} style={{ marginTop: 4 }}>
        <div>{children}</div>
      </SketchBox>
    </div>
  );
}
function SettingRow({ label, value, sub, toggle, link }) {
  const [on, setOn] = React.useState(true);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px dashed var(--thin)' }}>
      <div>
        <H size={13}>{label}</H>
        {sub && <div><H size={10} color="var(--muted)">{sub}</H></div>}
      </div>
      {toggle != null ? (
        <div onClick={() => setOn(!on)} style={{
          width: 32, height: 18, borderRadius: 20, border: '1.3px solid var(--ink)',
          background: on ? 'var(--ink)' : 'transparent', position: 'relative', cursor: 'pointer',
        }}>
          <div style={{
            position: 'absolute', top: 1, left: on ? 15 : 1, width: 14, height: 14, borderRadius: 14,
            background: on ? 'var(--paper)' : 'var(--ink)', transition: 'left .15s',
          }} />
        </div>
      ) : link ? (
        <H size={12} color="var(--accent-2)" weight={700}>›</H>
      ) : (
        <H size={13} color="var(--muted)">{value}</H>
      )}
    </div>
  );
}

// shared mini stat
function MiniStat({ label, value }) {
  return (
    <SketchBox seed={label.length} pad={8} radius={8}>
      <H size={10} color="var(--muted)" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</H>
      <div><H size={13} weight={700}>{value}</H></div>
    </SketchBox>
  );
}

Object.assign(window, {
  DashSingleAnswer, DashRunwayBars, DashTwoEnvelopes,
  ScreenRunway, ScreenSavings, ScreenHistory, ScreenSettings,
  StateBanner,
});
