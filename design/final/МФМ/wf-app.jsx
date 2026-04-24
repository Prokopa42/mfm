// App shell: top tabs (Spec / Wireframes), Wireframes has 3 Dashboard dirs + 4 other screens.
// Tweaks panel: state variant.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "state": "normal",
  "focus": "all"
}/*EDITMODE-END*/;

function App() {
  const [tab, setTab] = React.useState('wires'); // 'spec' | 'wires'
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [state, setState] = React.useState(TWEAK_DEFAULTS.state);
  const [focus, setFocus] = React.useState(TWEAK_DEFAULTS.focus);

  // Edit-mode protocol
  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const setKey = (k, v) => {
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'rgba(251,250,246,0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1.5px solid var(--ink)',
        padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div>
          <div style={{ fontFamily: 'Caveat', fontSize: 32, fontWeight: 700, lineHeight: 0.9 }}>
            Safe to Spend
          </div>
          <H size={11} color="var(--muted)">wireframes · product spec</H>
        </div>
        <div style={{ flex: 1 }} />
        <TopTabs tab={tab} setTab={setTab} />
      </header>

      {tab === 'spec' ? <SpecDoc /> : <Wires state={state} focus={focus} />}

      {tweaksOpen && (
        <TweaksPanel
          state={state}
          setState={(v) => { setState(v); setKey('state', v); }}
          focus={focus}
          setFocus={(v) => { setFocus(v); setKey('focus', v); }}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </div>
  );
}

function TopTabs({ tab, setTab }) {
  const btn = (id, label) => (
    <div onClick={() => setTab(id)} style={{
      fontFamily: 'Caveat', fontSize: 22, fontWeight: 700,
      padding: '4px 16px', borderRadius: 20, cursor: 'pointer',
      background: tab === id ? 'var(--ink)' : 'transparent',
      color: tab === id ? 'var(--paper)' : 'var(--ink)',
      border: '1.5px solid var(--ink)',
    }}>{label}</div>
  );
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {btn('spec', 'A–E  Spec')}
      {btn('wires', 'F  Wireframes')}
    </div>
  );
}

// ─── Wires grid ─────────────────────────────────────────────
function Wires({ state, focus }) {
  const stateLabel = state.replace(/-/g, ' ');

  const showDash = focus === 'all' || focus === 'dash';
  const showOther = focus === 'all' || focus === 'other';

  return (
    <div style={{ padding: '36px 48px 120px', maxWidth: 1400, margin: '0 auto' }}>
      {/* intro */}
      <div style={{ marginBottom: 28 }}>
        <C size={38}>F. Wireframes</C>
        <Squiggle width={180} color="var(--accent)" h={6} />
        <H size={14} color="var(--muted)" style={{ display: 'block', marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
          Three distinct directions for the Dashboard — each answers the same question
          with different visual emphasis. Flip between six states using the Tweaks
          toggle (top toolbar) to stress-test edge cases.
        </H>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill>state: {stateLabel}</Pill>
          <Pill color="var(--accent)">tip: turn on Tweaks →</Pill>
        </div>
      </div>

      {showDash && (
        <section style={{ marginBottom: 50 }}>
          <SectionTitle n="F.1" title="Dashboard — three directions" />
          <div style={{ display: 'flex', gap: 36, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
            <DirectionCard
              label="A. Single Answer"
              tagline="Hero number, nothing else. Max calm."
              pros={['least noise', 'fast scanning', 'beginner-friendly']}
              cons={['no visual context for the cycle']}
            >
              <Phone label="A · Single Answer" seed={11}>
                <DashSingleAnswer state={state} />
              </Phone>
            </DirectionCard>
            <DirectionCard
              label="B. Runway Bars"
              tagline="Hero + 11-day bar runway, trust at a glance."
              pros={['see the whole cycle', 'mandatory markers visible', 'spot tight days']}
              cons={['denser', 'learn curve']}
            >
              <Phone label="B · Runway Bars" seed={12}>
                <DashRunwayBars state={state} />
              </Phone>
            </DirectionCard>
            <DirectionCard
              label="C. Two Envelopes"
              tagline="Physical metaphor — separation made visible."
              pros={['savings feel sealed', 'reserve split is obvious', 'tactile']}
              cons={['more real estate per element']}
            >
              <Phone label="C · Two Envelopes" seed={13}>
                <DashTwoEnvelopes state={state} />
              </Phone>
            </DirectionCard>
          </div>
        </section>
      )}

      {showOther && (
        <section>
          <SectionTitle n="F.2" title="The other four screens" />
          <div style={{ display: 'flex', gap: 36, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
            <Phone label="2 · Runway" seed={14}>
              <ScreenRunway />
            </Phone>
            <Phone label="3 · Savings" seed={15} state={state === 'savings-off-track' ? 'off-track' : null}>
              <ScreenSavings state={state} />
            </Phone>
            <Phone label="4 · History" seed={16}>
              <ScreenHistory />
            </Phone>
            <Phone label="5 · Settings" seed={17}>
              <ScreenSettings />
            </Phone>
          </div>
        </section>
      )}

      <div style={{ marginTop: 60, padding: 20, borderTop: '1px dashed var(--thin)', maxWidth: 820, margin: '60px auto 0' }}>
        <C size={24}>Next steps</C>
        <ul style={{ fontFamily: 'Kalam', fontSize: 14, lineHeight: 1.65, paddingLeft: 18, color: 'var(--ink-2)' }}>
          <li>Pick a Dashboard direction (A, B, or C) — or propose a hybrid.</li>
          <li>Confirm whether the reserve should be user-named (e.g. "safety cushion") or stay as "reserve".</li>
          <li>Decide if the "if I spend nothing today" number stays on the hero or becomes a tap-to-reveal.</li>
          <li>Lock onboarding: paydays, reserve, typical amounts, savings baseline.</li>
          <li>Once chosen, move to hi-fi prototype with real typography and color.</li>
        </ul>
      </div>
    </div>
  );
}

function SectionTitle({ n, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <div style={{ fontFamily: 'Caveat', fontSize: 36, fontWeight: 700, color: 'var(--accent)', lineHeight: 0.9 }}>{n}</div>
      <div>
        <C size={30}>{title}</C>
        <Squiggle width={140} color="var(--ink)" h={4} />
      </div>
    </div>
  );
}

function DirectionCard({ label, tagline, pros = [], cons = [], children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 320 }}>
      {children}
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <H size={13} color="var(--muted)" style={{ fontStyle: 'italic' }}>{tagline}</H>
      </div>
      <div style={{ display: 'flex', gap: 10, fontFamily: 'Kalam', fontSize: 12 }}>
        <div>
          <H size={11} color="var(--ok)" weight={700}>+ pros</H>
          <ul style={{ margin: 0, paddingLeft: 14 }}>
            {pros.map((p, i) => <li key={i}><H size={11} color="var(--ink-2)">{p}</H></li>)}
          </ul>
        </div>
        <div>
          <H size={11} color="var(--risk)" weight={700}>− cons</H>
          <ul style={{ margin: 0, paddingLeft: 14 }}>
            {cons.map((p, i) => <li key={i}><H size={11} color="var(--ink-2)">{p}</H></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Tweaks panel ───────────────────────────────────────────
function TweaksPanel({ state, setState, focus, setFocus, onClose }) {
  const states = ['normal', 'tight', 'cash-risk', 'payday-arrived', 'payment-due-tomorrow', 'savings-off-track'];
  const focuses = [['all', 'all screens'], ['dash', 'dashboards only'], ['other', 'other screens']];

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 100,
      width: 260, background: '#fff', border: '1.5px solid var(--ink)', borderRadius: 14,
      padding: 14, boxShadow: '4px 6px 0 var(--ink), 0 20px 40px rgba(0,0,0,0.12)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <C size={22}>Tweaks</C>
        <div onClick={onClose} style={{ cursor: 'pointer', fontFamily: 'Caveat', fontSize: 20, color: 'var(--muted)' }}>×</div>
      </div>

      <H size={10} color="var(--muted)" weight={700} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>State</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, marginBottom: 12 }}>
        {states.map((s) => (
          <div key={s} onClick={() => setState(s)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
            background: state === s ? 'rgba(232,93,43,0.15)' : 'transparent',
            border: state === s ? '1.3px solid var(--accent)' : '1.3px solid transparent',
          }}>
            <Check on={state === s} />
            <H size={12}>{s.replace(/-/g, ' ')}</H>
          </div>
        ))}
      </div>

      <H size={10} color="var(--muted)" weight={700} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Focus</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
        {focuses.map(([k, label]) => (
          <div key={k} onClick={() => setFocus(k)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
            background: focus === k ? 'rgba(31,111,235,0.10)' : 'transparent',
            border: focus === k ? '1.3px solid var(--accent-2)' : '1.3px solid transparent',
          }}>
            <Check on={focus === k} />
            <H size={12}>{label}</H>
          </div>
        ))}
      </div>
    </div>
  );
}

// mount
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
