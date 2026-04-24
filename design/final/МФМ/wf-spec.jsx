// Spec document: Product logic, Data model, Formulas, Edge cases, Screen architecture.

function SpecDoc() {
  const sectionStyle = { marginBottom: 56 };
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px 120px', color: 'var(--ink)' }}>
      {/* title */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: 'Caveat', fontSize: 56, fontWeight: 700, lineHeight: 1, letterSpacing: -1 }}>
          Safe to Spend Today
        </div>
        <div style={{ marginTop: 4 }}>
          <Squiggle width={260} color="var(--accent)" h={8} />
        </div>
        <H size={18} color="var(--muted)" style={{ marginTop: 12, display: 'inline-block' }}>
          A decision-support app for the gap between paychecks. One question,
          answered in 10 seconds.
        </H>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Pill>wireframes · v0.1</Pill>
          <Pill color="var(--muted)">2 paychecks / month</Pill>
          <Pill color="var(--accent-2)">b&w + one accent</Pill>
        </div>
      </div>

      {/* A — product logic */}
      <div style={sectionStyle}>
        <SectionHead n="A" title="Product logic" />
        <H size={17} style={{ lineHeight: 1.55 }}>
          The app splits your money into <B>three boxes</B> so one number can answer the question.
        </H>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 18 }}>
          <Box title="1. Operational" accent="var(--ink)">
            <H size={14}>Money for the current pay cycle. Spending and mandatory bills live here. Refilled by each paycheck.</H>
          </Box>
          <Box title="2. Reserve buffer" accent="var(--warn)" highlight="rgba(255,214,92,0.35)">
            <H size={14}>Untouched safety net inside operational. Protects the last days of the cycle. Configurable in Settings.</H>
          </Box>
          <Box title="3. Savings" accent="var(--accent-2)">
            <H size={14}>Separate box. <B>Never</B> counted in daily limit. Grows via transfers and has its own forecast + goals.</H>
          </Box>
        </div>

        <div style={{ marginTop: 28 }}>
          <C size={24}>The core loop</C>
          <ol style={{ fontFamily: 'Kalam', fontSize: 15, lineHeight: 1.6, paddingLeft: 20, marginTop: 8 }}>
            <li>At every paycheck → operational balance is topped up, cycle resets.</li>
            <li>App subtracts upcoming mandatory bills, planned savings transfers, and the reserve.</li>
            <li>What's left ÷ days until next paycheck = <B>Safe to spend today</B>.</li>
            <li>Every expense you add instantly re-divides the remainder over the remaining days.</li>
            <li>Underspend today → tomorrow's number grows. Overspend → tomorrow's number shrinks. Transparent, no guilt.</li>
          </ol>
        </div>

        <div style={{ marginTop: 24 }}>
          <C size={24}>Design principles</C>
          <ul style={{ fontFamily: 'Kalam', fontSize: 15, lineHeight: 1.7, paddingLeft: 20, marginTop: 8 }}>
            <li><B>One answer on the home screen.</B> Everything else is secondary.</li>
            <li><B>Savings are sacred.</B> They never appear in the safe-to-spend math.</li>
            <li><B>Forecast, don't project dreams.</B> Real purchasing power is shown next to the nominal figure.</li>
            <li><B>Minimal charts.</B> Day-by-day bars only where they aid decision-making.</li>
            <li><B>Calm.</B> Color used only to signal state, never for decoration.</li>
          </ul>
        </div>
      </div>

      {/* B — data model */}
      <div style={sectionStyle}>
        <SectionHead n="B" title="Data model" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Entity name="PayCycle" fields={[
            ['id', 'uuid'],
            ['startDate', 'date'],
            ['endDate', 'date  (= next paycheck date − 1)'],
            ['openingOperationalBalance', 'money'],
            ['expectedIncome', 'money'],
          ]}/>
          <Entity name="Income" fields={[
            ['id', 'uuid'],
            ['amount', 'money'],
            ['expectedDate', 'date'],
            ['receivedDate', 'date?'],
            ['kind', "'paycheck' | 'other'"],
          ]}/>
          <Entity name="MandatoryPayment" fields={[
            ['id', 'uuid'],
            ['title', 'string'],
            ['amount', 'money'],
            ['dueDate', 'date'],
            ['recurrence', "'monthly' | 'once'"],
            ['status', "'scheduled' | 'paid' | 'missed'"],
          ]}/>
          <Entity name="VariableExpense" fields={[
            ['id', 'uuid'],
            ['amount', 'money'],
            ['date', 'date'],
            ['category', 'string?'],
            ['note', 'string?'],
          ]}/>
          <Entity name="Reserve" fields={[
            ['amount', 'money'],
            ['policy', "'flat' | 'perCycle'"],
          ]}/>
          <Entity name="Savings" fields={[
            ['balance', 'money'],
            ['openedAt', 'date'],
            ['baselineBalance', 'money'],
          ]}/>
          <Entity name="TransferToSavings" fields={[
            ['id', 'uuid'],
            ['amount', 'money'],
            ['date', 'date'],
            ['planned', 'bool'],
            ['linkedGoalId', 'uuid?'],
          ]}/>
          <Entity name="WithdrawalFromSavings" fields={[
            ['id', 'uuid'],
            ['amount', 'money'],
            ['date', 'date'],
            ['reason', 'string?'],
          ]}/>
          <Entity name="SavingsGoal" fields={[
            ['id', 'uuid'],
            ['title', 'string'],
            ['target', 'money'],
            ['deadline', 'date?'],
            ['priority', 'int'],
          ]}/>
          <Entity name="CalculationSettings" fields={[
            ['payday1', 'int (day of month)'],
            ['payday2', 'int (day of month)'],
            ['typicalPaycheck1', 'money'],
            ['typicalPaycheck2', 'money'],
            ['reserveAmount', 'money'],
            ['purchasingPowerCoef', 'number (default 0.90)'],
            ['rounding', "'day' | 'hour'"],
            ['includeTodayInDivisor', 'bool'],
          ]}/>
        </div>
      </div>

      {/* C — formulas */}
      <div style={sectionStyle}>
        <SectionHead n="C" title="Calculation formulas" />
        <Formula name="availableUntilNextPaycheck">
          {`= currentOperationalBalance
  + sum(Income where expectedDate ≤ nextPaycheckDate and not received)
  - sum(MandatoryPayment where dueDate ≤ nextPaycheckDate and status='scheduled')
  - reserve
  - sum(planned TransferToSavings where date ≤ nextPaycheckDate)`}
        </Formula>

        <Formula name="remainingDays">
          {`= nextPaycheckDate − today        (inclusive of today)
  min = 1                           (never divide by zero)`}
        </Formula>

        <Formula name="safeToSpendToday" highlight>
          {`= max(0, availableUntilNextPaycheck) / remainingDays`}
        </Formula>

        <Formula name="ifISpendNothingToday_tomorrow">
          {`= availableUntilNextPaycheck / max(1, remainingDays − 1)
  // if remainingDays = 1 → defer to next cycle's safe amount`}
        </Formula>

        <Formula name="monthlySavingPace">
          {`= (savings.balance − savings.baselineBalance) / monthsSinceOpened
  // fallback: 3-month rolling average of net transfers`}
        </Formula>

        <Formula name="savingsForecastNominal(targetDate)">
          {`= savings.balance + monthlySavingPace × monthsBetween(today, targetDate)`}
        </Formula>

        <Formula name="savingsForecastRealValue(targetDate)" highlight>
          {`years = daysBetween(today, targetDate) / 365
  realValue = savingsForecastNominal × purchasingPowerCoef ^ years
  // default coef = 0.90  (≈ 10% yearly erosion)`}
        </Formula>

        <Formula name="savingsGoalGap(goal)">
          {`= max(0, goal.target − savings.balance)
  monthsToGoal = goalGap / monthlySavingPace     (∞ if pace = 0)
  onTrack = goal.deadline is null
            OR monthsToGoal ≤ monthsBetween(today, goal.deadline)`}
        </Formula>
      </div>

      {/* D — edge cases */}
      <div style={sectionStyle}>
        <SectionHead n="D" title="Edge cases" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['Available ≤ 0', 'Show "cash-risk" state. Safe-to-spend = $0. Suggest: pause planned savings transfer, review reserve, or move mandatory payment.'],
            ['remainingDays = 0 (payday today)', 'Show "payday-arrived" state. Hide daily figure, prompt to confirm income received → start new cycle.'],
            ['Paycheck late / not received', 'Grace window of 48h using expectedDate. After that, mark Income as missed and recompute with lower balance.'],
            ['Mandatory payment overdue', 'Still subtract from available. Banner on Dashboard. Does not retroactively change past safe-to-spend.'],
            ['Expense added for a past day', 'Recompute current cycle retroactively. Today\'s safe-to-spend absorbs the drift. Show "drift" delta briefly.'],
            ['Expense > safe-to-spend', 'Allow, but confirm with "this leaves $X for the next N days." No blocking.'],
            ['Savings withdrawal', 'Moves into operational. Clearly labeled in History so pace calc excludes it from "saving progress".'],
            ['New user / empty data', 'Onboarding asks for 2 paydays, typical amounts, current balance, reserve. Safe-to-spend available from first save.'],
            ['Pay dates on weekend / short month', 'Shift to nearest prior business day; Feb handled by "last day of month" token for payday=31.'],
            ['Reserve > operational balance', 'Available is negative → cash-risk. Reserve is never drained automatically.'],
            ['Coefficient = 1.0', 'Real value = nominal. Acceptable. Coefficient > 1 rejected in Settings.'],
            ['Savings pace = 0 or negative', 'Forecast shows flat or declining. Label as "no progress" rather than hiding.'],
            ['Goal deadline in past', 'Marked "overdue". Gap still shown; suggest new deadline.'],
            ['Timezone / DST', 'All day math uses local date, not timestamp. "Today" rolls over at local midnight.'],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px dashed var(--thin)' }}>
              <H size={14} weight={700} style={{ minWidth: 180 }}>{k}</H>
              <H size={14} color="var(--muted)">{v}</H>
            </div>
          ))}
        </div>
      </div>

      {/* E — screen architecture */}
      <div style={sectionStyle}>
        <SectionHead n="E" title="Screen architecture" />
        <H size={15} color="var(--muted)" style={{ lineHeight: 1.5 }}>
          Five tabs. Dashboard is the anchor and is opened 90% of the time. Every other
          tab exists to explain or adjust the numbers on the Dashboard.
        </H>

        <div style={{ marginTop: 20 }}>
          <ScreenRow n="1" name="Dashboard" priority="Opens in &lt;1s, readable in 10s">
            Safe-to-spend (hero) · If-nothing-today · Days to payday · Upcoming bill · Quick add expense · Quick move to savings.
          </ScreenRow>
          <ScreenRow n="2" name="Runway / forecast" priority="Day-by-day trust">
            Cycle timeline. Each day a row: date, daily safe amount, mandatory markers, actual so far. Warning dots when tight.
          </ScreenRow>
          <ScreenRow n="3" name="Savings" priority="Long-horizon confidence">
            Saved now (hero) · Average pace · Forecast slider (date) · Real-value twin · Goals with gap and on/off-track.
          </ScreenRow>
          <ScreenRow n="4" name="History" priority="Audit trail">
            Unified feed of income, expenses, transfers, withdrawals. Filter by type. Each item edits its source record.
          </ScreenRow>
          <ScreenRow n="5" name="Settings" priority="One-time + occasional">
            Pay dates · typical amounts · reserve · purchasing-power coefficient · calculation preferences.
          </ScreenRow>
        </div>

        {/* state map */}
        <div style={{ marginTop: 36 }}>
          <C size={24}>Dashboard states</C>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
            <State name="normal" swatch="var(--ok)" desc="Available > 1 day of buffer. Business as usual."/>
            <State name="tight" swatch="var(--warn)" desc="&lt; 3 days remaining of comfortable spend. Soft nudge."/>
            <State name="cash-risk" swatch="var(--risk)" desc="Available ≤ 0. Safe-to-spend = $0. Action required."/>
            <State name="payday-arrived" swatch="var(--accent-2)" desc="Income expected today. Confirm and reset cycle."/>
            <State name="payment-due-tomorrow" swatch="var(--warn)" desc="Mandatory bill tomorrow. Pre-subtracted; banner."/>
            <State name="savings-off-track" swatch="var(--risk)" desc="Pace too low to hit goal by deadline. Shown on Savings tab."/>
          </div>
        </div>
      </div>

      <div style={{ fontFamily: 'Caveat', fontSize: 24, color: 'var(--muted)', textAlign: 'center', marginTop: 50 }}>
        → open the <B>Wireframes</B> tab for 3 directions.
      </div>
    </div>
  );
}

function SectionHead({ n, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
      <div style={{ fontFamily: 'Caveat', fontSize: 52, fontWeight: 700, color: 'var(--accent)', lineHeight: 0.9 }}>{n}</div>
      <div>
        <div style={{ fontFamily: 'Caveat', fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{title}</div>
        <Squiggle width={180} color="var(--ink)" h={5} />
      </div>
    </div>
  );
}

function B({ children }) {
  return <span style={{ fontWeight: 700, backgroundImage: 'linear-gradient(transparent 70%, rgba(232,93,43,0.3) 70%)' }}>{children}</span>;
}

function Box({ title, children, accent = 'var(--ink)', highlight = null }) {
  return (
    <SketchBox seed={title.length} radius={14} highlight={highlight} pad={14}>
      <H size={16} weight={700} style={{ color: accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</H>
      <div style={{ marginTop: 6 }}>{children}</div>
    </SketchBox>
  );
}

function Entity({ name, fields }) {
  return (
    <SketchBox seed={name.length + 3} radius={10} pad={12}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <C size={22}>{name}</C>
        <H size={11} color="var(--muted)">entity</H>
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7 }}>
        {fields.map(([k, t], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: i < fields.length - 1 ? '1px dotted var(--thin)' : 'none', padding: '1px 0' }}>
            <span style={{ fontWeight: 600 }}>{k}</span>
            <span style={{ color: 'var(--muted)' }}>{t}</span>
          </div>
        ))}
      </div>
    </SketchBox>
  );
}

function Formula({ name, children, highlight = false }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <C size={22} color={highlight ? 'var(--accent)' : 'var(--ink)'}>{name}</C>
      </div>
      <SketchBox seed={name.length + 5} radius={8} pad={14}
                 highlight={highlight ? 'rgba(255,214,92,0.35)' : null}>
        <pre style={{
          margin: 0, fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
          color: 'var(--ink)',
        }}>{children}</pre>
      </SketchBox>
    </div>
  );
}

function ScreenRow({ n, name, priority, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, padding: '12px 0', borderBottom: '1px dashed var(--thin)' }}>
      <div style={{ fontFamily: 'Caveat', fontSize: 38, fontWeight: 700, color: 'var(--accent)', width: 40, lineHeight: 0.9 }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <C size={26}>{name}</C>
          <H size={13} color="var(--muted)" style={{ fontStyle: 'italic' }}>{priority}</H>
        </div>
        <H size={14} style={{ lineHeight: 1.5 }}>{children}</H>
      </div>
    </div>
  );
}

function State({ name, swatch, desc }) {
  return (
    <SketchBox seed={name.length + 1} radius={10} pad={10}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 12, height: 12, borderRadius: 12, background: swatch, border: '1.5px solid var(--ink)' }} />
        <H size={14} weight={700}>{name}</H>
      </div>
      <H size={13} color="var(--muted)">{desc}</H>
    </SketchBox>
  );
}

Object.assign(window, { SpecDoc });
