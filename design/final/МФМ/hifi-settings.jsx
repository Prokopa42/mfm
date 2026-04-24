// ─── HI-FI · 05/05 · SETTINGS SCREEN ─────────────────────────
// Staged editing: edits are drafted, then "Applied" explicitly.

const SETTINGS_DATA_DEFAULT = {
  // Cycle
  payday_day: 10,
  payday_amount: 120000,
  pay_frequency: 'monthly',           // monthly | twice | weekly
  // Cushion
  cushion_months: 3.0,
  cushion_from: 'discretionary',      // discretionary | top-up
  cushion_priority: 'balanced',       // balanced | strict | off
  // Savings
  savings_auto_pct: 15,
  savings_round_up: true,
  // Calculation
  limit_mode: 'smooth',               // smooth | strict
  inflation_rate: 8.5,
  counted_window_days: 14,
};

function deepEq(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

function diffKeys(a, b) {
  return Object.keys(a).filter(k => a[k] !== b[k]);
}

// ─── Header ──────────────────────────────────────────────────
function SettingsHeader({ dirtyCount }) {
  return (
    <div style={{ padding: '12px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Настройки</span>
        <div style={{ width: 14, height: 0.5, background: 'var(--ink-55)' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>{dirtyCount > 0 ? `черновик · ${dirtyCount} правок` : 'без изменений'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ width: 4, height: 4, background: dirtyCount > 0 ? 'var(--red)' : 'var(--ink-35)' }} />
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{dirtyCount > 0 ? 'не применено' : 'синхронизировано'}</span>
      </div>
    </div>
  );
}

// ─── Staged banner ───────────────────────────────────────────
function StagedBanner({ dirtyCount }) {
  return (
    <div style={{ margin: '10px 18px 0', border: '0.5px solid var(--ink-80)', display: 'grid', gridTemplateColumns: '3px auto 1fr', alignItems: 'stretch' }}>
      <div style={{ background: dirtyCount > 0 ? 'var(--red)' : 'var(--ink-35)' }} />
      <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center' }}>
        <Glyph shape="circle" fill="none" stroke="var(--ink)" size={8} sw={1} />
      </div>
      <div style={{ padding: '7px 10px 7px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="slab" style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Правки вносятся в черновик</span>
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)', marginTop: 2, lineHeight: 1.4 }}>
          Сначала вы редактируете значения, затем нажимаете «Применить» — пересчёт произойдёт одним шагом.
        </div>
      </div>
    </div>
  );
}

// ─── Group ───────────────────────────────────────────────────
function Group({ title, note, children }) {
  return (
    <div style={{ padding: '14px 18px 4px', borderTop: '0.5px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="eyebrow eyebrow--ink">{title}</span>
        {note && <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)' }}>{note}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Rows ────────────────────────────────────────────────────
function Row({ label, value, dirty, hint, children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      padding: '9px 0',
      borderTop: '0.5px solid var(--hair)',
      columnGap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {dirty && <div style={{ width: 3, height: 3, background: 'var(--red)', flexShrink: 0 }} />}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '-0.005em' }}>{label}</span>
          {hint && <span className="mono" style={{ fontSize: 9, color: 'var(--ink-55)', marginTop: 2 }}>{hint}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {children ? children : (
          <span className="slab tnum" style={{ fontSize: 11, color: 'var(--ink)' }}>{value}</span>
        )}
      </div>
    </div>
  );
}

function StepControl({ value, onChange, min, max, step = 1, suffix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '0.5px solid var(--ink-80)' }}>
      <button onClick={() => onChange(Math.max(min, value - step))} style={{ padding: '3px 8px', background: 'transparent', border: 'none', borderRight: '0.5px solid var(--ink-80)', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span className="slab" style={{ fontSize: 11 }}>−</span>
      </button>
      <span className="slab tnum" style={{ fontSize: 11, padding: '3px 10px', minWidth: 46, textAlign: 'center' }}>{value}{suffix}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} style={{ padding: '3px 8px', background: 'transparent', border: 'none', borderLeft: '0.5px solid var(--ink-80)', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span className="slab" style={{ fontSize: 11 }}>+</span>
      </button>
    </div>
  );
}

function SegControl({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', border: '0.5px solid var(--ink-80)' }}>
      {options.map((o, i) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            padding: '4px 9px',
            background: on ? 'var(--ink)' : 'transparent',
            color:      on ? 'var(--paper)' : 'var(--ink-55)',
            border: 'none',
            borderLeft: i === 0 ? 'none' : '0.5px solid var(--ink-80)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span className="slab" style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 28, height: 14, border: '0.5px solid var(--ink-80)',
      background: value ? 'var(--ink)' : 'transparent',
      position: 'relative', cursor: 'pointer', padding: 0,
    }}>
      <div style={{
        position: 'absolute', top: 1.5, left: value ? 14 : 1.5,
        width: 10, height: 10, background: value ? 'var(--paper)' : 'var(--ink)',
        transition: 'left .1s',
      }} />
    </button>
  );
}

// ─── CTA ─────────────────────────────────────────────────────
function SettingsCTA({ dirty, onApply, onDiscard }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '0.5px solid var(--ink)' }}>
      <button disabled={!dirty} onClick={onDiscard} style={{
        padding: '12px 14px',
        background: 'var(--paper)',
        color: dirty ? 'var(--ink)' : 'var(--ink-35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', cursor: dirty ? 'pointer' : 'default', fontFamily: 'inherit',
      }}>
        <Glyph shape="circle" fill="none" stroke={dirty ? 'var(--ink)' : 'var(--ink-35)'} size={8} sw={1.2} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Отменить</span>
      </button>
      <button disabled={!dirty} onClick={onApply} style={{
        padding: '12px 14px',
        background: dirty ? 'var(--ink)' : 'var(--ink-18)',
        color: dirty ? 'var(--paper)' : 'var(--ink-35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: 'none', borderLeft: '0.5px solid var(--ink)',
        cursor: dirty ? 'pointer' : 'default', fontFamily: 'inherit',
      }}>
        <Glyph shape="square" fill={dirty ? 'var(--paper)' : 'var(--ink-35)'} size={8} />
        <span className="slab" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Применить</span>
      </button>
    </div>
  );
}

// ─── Full screen ─────────────────────────────────────────────
function HiFiSettings() {
  const [applied, setApplied] = React.useState(SETTINGS_DATA_DEFAULT);
  const [draft, setDraft]     = React.useState(SETTINGS_DATA_DEFAULT);
  const dirtyKeys = diffKeys(applied, draft);
  const isDirty = (k) => dirtyKeys.includes(k);
  const setK = (k, v) => setDraft(prev => ({ ...prev, [k]: v }));

  return (
    <PhoneFrame h={960}>
      <SettingsHeader dirtyCount={dirtyKeys.length} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <StagedBanner dirtyCount={dirtyKeys.length} />

        <Group title="Цикл зарплаты" note="cycle">
          <Row label="День зарплаты" dirty={isDirty('payday_day')} hint="число месяца">
            <StepControl value={draft.payday_day} onChange={v => setK('payday_day', v)} min={1} max={28} suffix="" />
          </Row>
          <Row label="Сумма зарплаты" dirty={isDirty('payday_amount')}>
            <StepControl value={draft.payday_amount} onChange={v => setK('payday_amount', v)} min={10000} max={500000} step={1000} suffix="₽" />
          </Row>
          <Row label="Частота" dirty={isDirty('pay_frequency')}>
            <SegControl value={draft.pay_frequency} onChange={v => setK('pay_frequency', v)} options={[
              { id:'monthly', label:'1/мес' },
              { id:'twice',   label:'2/мес' },
              { id:'weekly',  label:'1/нед' },
            ]} />
          </Row>
        </Group>

        <Group title="Подушка" note="system reserve">
          <Row label="Размер, мес. расходов" dirty={isDirty('cushion_months')} hint="от среднего расхода за 3 мес.">
            <StepControl value={draft.cushion_months} onChange={v => setK('cushion_months', Math.round(v*10)/10)} min={0} max={12} step={0.5} suffix="" />
          </Row>
          <Row label="Источник пополнения" dirty={isDirty('cushion_from')}>
            <SegControl value={draft.cushion_from} onChange={v => setK('cushion_from', v)} options={[
              { id:'discretionary', label:'свободные' },
              { id:'top-up',        label:'доплата'   },
            ]} />
          </Row>
          <Row label="Приоритет" dirty={isDirty('cushion_priority')}>
            <SegControl value={draft.cushion_priority} onChange={v => setK('cushion_priority', v)} options={[
              { id:'strict',   label:'строгий' },
              { id:'balanced', label:'баланс'  },
              { id:'off',      label:'выкл'    },
            ]} />
          </Row>
        </Group>

        <Group title="Накопления" note="goals & auto-save">
          <Row label="Автоотчисления от зарплаты" dirty={isDirty('savings_auto_pct')} hint="% сразу в котёл">
            <StepControl value={draft.savings_auto_pct} onChange={v => setK('savings_auto_pct', v)} min={0} max={50} suffix="%" />
          </Row>
          <Row label="Округление расходов" dirty={isDirty('savings_round_up')} hint="сдачу — в котёл">
            <Toggle value={draft.savings_round_up} onChange={v => setK('savings_round_up', v)} />
          </Row>
        </Group>

        <Group title="Расчёт" note="calculation">
          <Row label="Режим лимита" dirty={isDirty('limit_mode')} hint="как считается «можно сегодня»">
            <SegControl value={draft.limit_mode} onChange={v => setK('limit_mode', v)} options={[
              { id:'smooth', label:'сглаж.' },
              { id:'strict', label:'строго' },
            ]} />
          </Row>
          <Row label="Инфляция, %/год" dirty={isDirty('inflation_rate')} hint="для «в сегодняшних ₽»">
            <StepControl value={draft.inflation_rate} onChange={v => setK('inflation_rate', Math.round(v*10)/10)} min={0} max={30} step={0.5} suffix="%" />
          </Row>
          <Row label="Окно «учтён в лимите»" dirty={isDirty('counted_window_days')} hint="за сколько дней вперёд">
            <StepControl value={draft.counted_window_days} onChange={v => setK('counted_window_days', v)} min={0} max={30} suffix=" д." />
          </Row>
        </Group>

        <div style={{ height: 14 }} />
      </div>
      <SettingsCTA dirty={dirtyKeys.length > 0} onApply={() => setApplied(draft)} onDiscard={() => setDraft(applied)} />
      <TabBar active={4} />
    </PhoneFrame>
  );
}

Object.assign(window, { HiFiSettings });
