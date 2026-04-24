// ─── HI-FI APP ───────────────────────────────────────────────

function PageHead() {
  return (
    <header style={{ marginBottom: 48, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: 40, borderBottom: '1px solid var(--ink)', paddingBottom: 22 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
          <span className="slab" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>МФМ</span>
          <div style={{ width: 28, height: 0.5, background: 'var(--ink-55)' }} />
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Hi-fi · 01 · Главный</span>
        </div>
        <h1 className="slab" style={{ fontSize: 40, lineHeight: 1.02, letterSpacing: '-0.015em', maxWidth: 780 }}>
          Главный экран. Гибрид из F.1 — на чистовую.
        </h1>
        <p className="mono" style={{ fontSize: 12, color: 'var(--ink-55)', marginTop: 14, maxWidth: 680, lineHeight: 1.55 }}>
          Структура зафиксирована в каркасах. Здесь — тоньше типографика, чище линии, точнее ритм. Цвета работают как сигналы, а не как заливка. Два состояния: <b style={{ color: 'var(--ink)' }}>norma</b> и <b style={{ color: 'var(--red)' }}>цель отстаёт</b>.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['01', '02', '03', '04', '05'].map((n, i) => (
            <div key={i} style={{
              padding: '5px 9px',
              border: i === 0 ? '1px solid var(--ink)' : '0.5px solid var(--ink-35)',
              background: i === 0 ? 'var(--ink)' : 'transparent',
              color:      i === 0 ? 'var(--paper)' : 'var(--ink-55)',
            }}>
              <span className="slab" style={{ fontSize: 9, letterSpacing: '0.14em' }}>{n}</span>
            </div>
          ))}
        </div>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)', letterSpacing: '0.08em' }}>СЕЙЧАС · ЦИКЛ · НАКОП. · ИСТОРИЯ · НАСТРОЙКИ</span>
      </div>
    </header>
  );
}

// Annotation callout — used next to phones
function Callout({ n, title, items, side = 'right' }) {
  return (
    <div style={{ maxWidth: 280 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.14em' }}>{n}</span>
        <div style={{ flex: 1, height: 0.5, background: 'var(--ink)' }} />
      </div>
      <div className="slab" style={{ fontSize: 16, lineHeight: 1.25, marginBottom: 14, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 8 }}>
        {items.map(([k, v], i) => (
          <React.Fragment key={i}>
            <span className="eyebrow" style={{ paddingTop: 2, fontSize: 8.5 }}>{k}</span>
            <span className="mono" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--ink-80)' }}>{v}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// Phone caption — sits below each device
function PhoneCaption({ n, label, sublabel, accent }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="slab" style={{ fontSize: 10, letterSpacing: '0.18em' }}>{n}</span>
        <div style={{ width: 12, height: 1, background: 'var(--ink)' }} />
        <span className="slab" style={{ fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
        {accent && <div style={{ width: 8, height: 8, background: accent }} />}
      </div>
      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)', letterSpacing: '0.02em' }}>{sublabel}</span>
    </div>
  );
}

// Spec row — typography / color / motion
function SpecRow() {
  const typeSpecs = [
    ['HERO',    'Archivo Black', '64 / 0.88', 'tnum'],
    ['INLINE №','Archivo Black', '14 / 1.0',  'tnum'],
    ['EYEBROW', 'Archivo Black', '9 · 18% sp.', 'UPPER'],
    ['MICRO',   'JB Mono',       '9.5 / 1.4',   'tnum'],
  ];
  const colorSpecs = [
    ['ink',     '#14120d', 'текст, каркас, CTA primary'],
    ['ink-55',  '#6a6557', 'вторичный текст, ₽, eyebrow'],
    ['hair',    '#d9d3bc', 'hairlines, ticks'],
    ['yellow',  '#eccc3a', 'ось hero · подушка'],
    ['blue',    '#0e4fb0', 'накопления · темп (ok)'],
    ['red',     '#c42a2a', 'платёж · off-track'],
  ];
  const lineSpecs = [
    ['HAIR',    '0.5 px · ink-55/hair',  'деления, тики, подписи'],
    ['REG',     '1 px · ink',            'рамки экранов, границы секций'],
    ['HEAVY',   '1.5 px · ink',          '«сегодня», рамка телефона'],
    ['ACCENT',  '2 px · yellow/red/blue', 'hero axis, маркеры рядов'],
  ];
  return (
    <section style={{ marginTop: 80, paddingTop: 28, borderTop: '0.5px solid var(--ink-35)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Система</span>
        <div style={{ flex: 1, height: 0.5, background: 'var(--ink-35)' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>типографика · цвет · линии</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
        {/* TYPE */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Типографика</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', columnGap: 12, rowGap: 6, alignItems: 'baseline' }}>
            {typeSpecs.map(([k, f, s, x], i) => (
              <React.Fragment key={i}>
                <span className="slab" style={{ fontSize: 9, letterSpacing: '0.14em' }}>{k}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>{f}</span>
                <span className="mono tnum" style={{ fontSize: 10 }}>{s}</span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--ink-35)' }}>{x}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* COLOR */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Цвет — только сигнал</div>
          <div style={{ display: 'grid', gridTemplateColumns: '14px auto 1fr', columnGap: 10, rowGap: 6, alignItems: 'center' }}>
            {colorSpecs.map(([k, hex, use], i) => (
              <React.Fragment key={i}>
                <div style={{ width: 14, height: 14, background: hex, border: '0.5px solid var(--ink-35)' }} />
                <span className="slab" style={{ fontSize: 9, letterSpacing: '0.14em' }}>{k}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>{use}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* LINES */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Линии</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', columnGap: 12, rowGap: 6, alignItems: 'center' }}>
            {lineSpecs.map(([k, v, use], i) => (
              <React.Fragment key={i}>
                <span className="slab" style={{ fontSize: 9, letterSpacing: '0.14em' }}>{k}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-55)' }}>{v}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-80)' }}>{use}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function App() {
  return (
    <>
      <PageHead />

      {/* Phones row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) auto auto minmax(220px, 280px)', gap: 48, alignItems: 'start', justifyContent: 'center' }}>
        {/* Left annotations */}
        <div style={{ paddingTop: 40, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <Callout n="01" title="Плашка с числом"
            items={[
              ['AXIS',    '3 px жёлтая полоса слева — единственная большая заливка цвета на экране'],
              ['NUMBER',  '64 / 0.88, Archivo Black, tabular figures'],
              ['TICK',    '36 px ink-линия + ≈ ₽/день — даёт масштаб «сколько это»'],
              ['TOMORROW','«если не трачу — завтра 1 240 ₽ +110» одной строкой'],
            ]} />
          <Callout n="02" title="Баланс-полоса"
            items={[
              ['PROP',  'Ширины пропорциональны: потрачено · свободно · подушка'],
              ['FILL',  'Только по краям: ink и мягкий жёлтый — центр пустой'],
              ['LABEL', 'Колонки подписаны и слева, и справа — числа снизу'],
            ]} />
        </div>

        {/* Phone 1 — normal */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <HiFiDashboard variant="normal" />
          <PhoneCaption n="01" label="Normal" sublabel="день посреди цикла · 1 130 ₽ до зарплаты" accent="var(--yellow)" />
        </div>

        {/* Phone 2 — off-track */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <HiFiDashboard variant="offTrack" />
          <PhoneCaption n="02" label="Goal off-track" sublabel="тот же день · темп накоплений просел" accent="var(--red)" />
        </div>

        {/* Right annotations */}
        <div style={{ paddingTop: 40, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <Callout n="03" title="Темп + ось цикла"
            items={[
              ['PACE',   'Тонкая sparkline 6 недель, точка «сейчас» ink / red — если off-track'],
              ['CYCLE',  'Заголовок отдельной строкой с 12 px отступом до оси — лейбл «СЕГОДНЯ» не пересекается'],
              ['TICKS',  'Дни — 0.5 px ink-55, сверху оси; даты — каждый 2-й, снизу'],
              ['TODAY',  '1.5 px ink вертикаль + 2 px кружок на базовой линии'],
              ['PAY',    'Засечки под осью: 0.8 px ink для обычных, 1.2 px red + точка для ближайшего'],
            ]} />
          <Callout n="04" title="Футер"
            items={[
              ['STRIPS', '3 колонки балансов, 1 px разделитель сверху, 0.5 px между'],
              ['ACCENT', 'Накопления получают цветную полосу 1.5 px сверху — синюю в norme, красную в off-track'],
              ['CTA',    'Primary: ink / paper, Secondary: outline blue — без заливок'],
              ['TABS',   'Hairline 0.5 px ink сверху, активная — 2 px ink сверху колонки'],
            ]} />
        </div>
      </section>

      {/* Delta callout — what's different in off-track */}
      <section style={{ marginTop: 64, display: 'grid', gridTemplateColumns: '2px 1fr', gap: 20, alignItems: 'start', maxWidth: 1000, marginInline: 'auto' }}>
        <div style={{ background: 'var(--red)', alignSelf: 'stretch' }} />
        <div>
          <div className="eyebrow eyebrow--ink" style={{ marginBottom: 8 }}>01 → 02 · Что меняется при off-track</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 12 }}>
            {[
              ['BANNER',     'Под шапкой появляется outline-баннер: «Цель отстаёт · темп ниже плана на 7 %»'],
              ['ТЕМП',       'Цвет ряда и прогноза с blue → red, sparkline показывает рост (плохо)'],
              ['ДЕЛЬТА',     'Добавляется micro-строка «−4 500 к цели» правым краем'],
              ['ФУТЕР',      'Акцентная полоса «Накоплений» меняется с синей на красную — без других заливок'],
            ].map(([k, v], i) => (
              <div key={i}>
                <div className="slab" style={{ fontSize: 9, letterSpacing: '0.14em' }}>{k}</div>
                <div style={{ marginTop: 6, height: 0.5, background: 'var(--ink)' }} />
                <p className="mono" style={{ fontSize: 10.5, color: 'var(--ink-80)', marginTop: 8, lineHeight: 1.5 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SpecRow />

      <footer style={{ marginTop: 72, paddingTop: 20, borderTop: '0.5px solid var(--ink-35)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)', letterSpacing: '0.08em' }}>МФМ · Hi-fi · 01/05 · Главный экран</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-55)', letterSpacing: '0.08em' }}>DRAFT · 24.04.26</span>
      </footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
