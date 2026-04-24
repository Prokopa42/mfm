// ─── HI-FI · 04/05 · HISTORY SCREEN ──────────────────────────
// Secondary, clean, tabular. Filter by type.

const HISTORY_DATA = (() => {
  const entries = [
    { id:1,  date:'24 апр', day:'ср', time:'14:20', type:'expense',  name:'Продукты · Перекрёсток', amount:-2350, balance:43100 },
    { id:2,  date:'24 апр', day:'ср', time:'09:12', type:'expense',  name:'Кофе · Surf',            amount:-290,  balance:45450 },
    { id:3,  date:'23 апр', day:'вт', time:'19:05', type:'transfer', name:'В накопления',           amount:-5000, balance:45740 },
    { id:4,  date:'23 апр', day:'вт', time:'13:50', type:'expense',  name:'Обед',                   amount:-450,  balance:50740 },
    { id:5,  date:'22 апр', day:'пн', time:'20:14', type:'expense',  name:'Такси',                  amount:-680,  balance:51190 },
    { id:6,  date:'22 апр', day:'пн', time:'15:30', type:'withdraw', name:'Снятие · банкомат',      amount:-3000, balance:51870 },
    { id:7,  date:'21 апр', day:'вс', time:'18:22', type:'expense',  name:'Магазин · 12',           amount:-1240, balance:54870 },
    { id:8,  date:'20 апр', day:'сб', time:'21:10', type:'expense',  name:'Ресторан',               amount:-3400, balance:56110 },
    { id:9,  date:'18 апр', day:'чт', time:'11:00', type:'income',   name:'Фриланс · проект М',     amount:+18500,balance:59510 },
    { id:10, date:'17 апр', day:'ср', time:'16:45', type:'expense',  name:'Аптека',                 amount:-820,  balance:41010 },
    { id:11, date:'15 апр', day:'пн', time:'10:00', type:'expense',  name:'Связь',                  amount:-650,  balance:41830 },
    { id:12, date:'10 апр', day:'ср', time:'09:01', type:'income',   name:'Зарплата',               amount:+120000,balance:42480 },
    { id:13, date:'10 апр', day:'ср', time:'09:02', type:'expense',  name:'Аренда',                 amount:-45000,balance:-77520 },
  ];
  return { entries };
})();

const hfmt = n => Math.abs(n).toLocaleString('ru-RU');

// ─── Header ──────────────────────────────────────────────────
function HistoryHeader() {
  return (
    <div style={{ padding: '12px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>История</span>
        <div style={{ width: 14, height: 0.5, background: 'var(--ink-55)' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>{HISTORY_DATA.entries.length} операций · апр</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Glyph shape="circle" fill="none" stroke="var(--ink-55)" size={8} sw={1} />
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)' }}>поиск</span>
      </div>
    </div>
  );
}

// ─── Filter chips ────────────────────────────────────────────
function HistoryFilter({ active, onChange, counts }) {
  const chips = [
    { id:'all',       label:'Все',      shape:null },
    { id:'income',    label:'Доход',    shape:'plus',    color:'var(--ink)'  },
    { id:'expense',   label:'Расход',   shape:'minus',   color:'var(--ink)'  },
    { id:'transfer',  label:'Перевод',  shape:'arrow',   color:'var(--blue)' },
    { id:'withdraw',  label:'Снятие',   shape:'square',  color:'var(--ink)'  },
  ];
  return (
    <div style={{ padding: '8px 18px 6px', display: 'flex', gap: 6, overflowX: 'auto' }}>
      {chips.map(c => {
        const on = active === c.id;
        return (
          <button key={c.id} onClick={() => onChange(c.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 9px',
            border: on ? '1px solid var(--ink)' : '0.5px solid var(--ink-35)',
            background: on ? 'var(--ink)' : 'transparent',
            color:      on ? 'var(--paper)' : 'var(--ink-55)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {c.shape === 'plus'   && <svg width="8" height="8" style={{display:'block'}}><line x1="4" y1="1" x2="4" y2="7" stroke={on?'var(--paper)':c.color} strokeWidth="1.2"/><line x1="1" y1="4" x2="7" y2="4" stroke={on?'var(--paper)':c.color} strokeWidth="1.2"/></svg>}
            {c.shape === 'minus'  && <svg width="8" height="8" style={{display:'block'}}><line x1="1" y1="4" x2="7" y2="4" stroke={on?'var(--paper)':c.color} strokeWidth="1.2"/></svg>}
            {c.shape === 'arrow'  && <svg width="8" height="8" style={{display:'block'}}><path d="M 1 4 L 7 4 M 5 2 L 7 4 L 5 6" fill="none" stroke={on?'var(--paper)':c.color} strokeWidth="1"/></svg>}
            {c.shape === 'square' && <Glyph shape="square" fill={on?'var(--paper)':c.color} size={7} />}
            <span className="slab" style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{c.label}</span>
            {counts[c.id] != null && (
              <span className="mono tnum" style={{ fontSize: 8.5, color: on ? 'var(--paper)' : 'var(--ink-35)', marginLeft: 2 }}>{counts[c.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Summary strip ───────────────────────────────────────────
function HistorySummary({ entries }) {
  const income   = entries.filter(e => e.type === 'income').reduce((s,e) => s + e.amount, 0);
  const expense  = entries.filter(e => e.type === 'expense').reduce((s,e) => s + e.amount, 0);
  const transfer = entries.filter(e => e.type === 'transfer').reduce((s,e) => s + e.amount, 0);

  return (
    <div style={{ margin: '4px 18px 6px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '0.5px solid var(--ink-80)' }}>
      <CellH label="доход"    value={'+' + hfmt(income)}   color="var(--ink)" />
      <CellH label="расход"   value={'−' + hfmt(expense)}  color="var(--ink)"  divider />
      <CellH label="перевод"  value={'−' + hfmt(transfer)} color="var(--blue)" divider />
    </div>
  );
}
function CellH({ label, value, color, divider }) {
  return (
    <div style={{ padding: '7px 9px', borderLeft: divider ? '0.5px solid var(--ink-80)' : 'none' }}>
      <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>{label}</div>
      <span className="slab tnum" style={{ fontSize: 12, color }}>{value}</span>
      <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)', marginLeft: 3 }}>₽</span>
    </div>
  );
}

// ─── List ────────────────────────────────────────────────────
function HistoryList({ entries }) {
  // group by date
  const groups = entries.reduce((acc, e) => {
    const key = `${e.date} · ${e.day}`;
    (acc[key] = acc[key] || []).push(e);
    return acc;
  }, {});

  return (
    <div style={{ padding: '2px 18px 8px', flex: 1, overflow: 'auto' }}>
      {Object.entries(groups).map(([k, list]) => (
        <div key={k} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '6px 0 4px', borderBottom: '0.5px solid var(--ink-80)' }}>
            <span className="slab" style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{k}</span>
            <span className="mono tnum" style={{ fontSize: 9, color: 'var(--ink-55)' }}>{list.length} оп.</span>
          </div>
          {list.map((e, i) => <HistoryRow key={e.id} e={e} last={i === list.length - 1} />)}
        </div>
      ))}
    </div>
  );
}

function TypeGlyph({ type }) {
  if (type === 'income')   return <svg width="10" height="10" style={{display:'block'}}><line x1="5" y1="1.5" x2="5" y2="8.5" stroke="var(--ink)" strokeWidth="1.4"/><line x1="1.5" y1="5" x2="8.5" y2="5" stroke="var(--ink)" strokeWidth="1.4"/></svg>;
  if (type === 'expense')  return <svg width="10" height="10" style={{display:'block'}}><line x1="1.5" y1="5" x2="8.5" y2="5" stroke="var(--ink)" strokeWidth="1.4"/></svg>;
  if (type === 'transfer') return <svg width="10" height="10" style={{display:'block'}}><path d="M 1.5 5 L 8.5 5 M 6 3 L 8.5 5 L 6 7" fill="none" stroke="var(--blue)" strokeWidth="1.2"/></svg>;
  if (type === 'withdraw') return <Glyph shape="square" fill="none" stroke="var(--ink)" sw={1.2} size={8} />;
  return null;
}

function HistoryRow({ e, last }) {
  const sign = e.amount > 0 ? '+' : '−';
  const color =
    e.type === 'transfer' ? 'var(--blue)' :
    e.amount > 0          ? 'var(--ink)'  :
                            'var(--ink)';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '14px 36px 1fr auto',
      alignItems: 'center', columnGap: 10, padding: '8px 0',
      borderBottom: last ? 'none' : '0.5px solid var(--hair)',
    }}>
      <TypeGlyph type={e.type} />
      <span className="mono tnum" style={{ fontSize: 9, color: 'var(--ink-55)' }}>{e.time}</span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span className="slab tnum" style={{ fontSize: 12, color }}>{sign}{hfmt(e.amount)} <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-55)' }}>₽</span></span>
        <span className="mono tnum" style={{ fontSize: 8.5, color: 'var(--ink-35)' }}>{hfmt(e.balance)}</span>
      </div>
    </div>
  );
}

// ─── Full screen ─────────────────────────────────────────────
function HiFiHistory() {
  const [active, setActive] = React.useState('all');
  const all = HISTORY_DATA.entries;
  const counts = {
    all:      all.length,
    income:   all.filter(e => e.type === 'income').length,
    expense:  all.filter(e => e.type === 'expense').length,
    transfer: all.filter(e => e.type === 'transfer').length,
    withdraw: all.filter(e => e.type === 'withdraw').length,
  };
  const visible = active === 'all' ? all : all.filter(e => e.type === active);

  return (
    <PhoneFrame h={860}>
      <HistoryHeader />
      <HistoryFilter active={active} onChange={setActive} counts={counts} />
      <HistorySummary entries={visible} />
      <HistoryList entries={visible} />
      <TabBar active={3} />
    </PhoneFrame>
  );
}

Object.assign(window, { HiFiHistory, HISTORY_DATA });
