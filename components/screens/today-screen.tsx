"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import type { DailyCheckDialogMode } from "@/components/daily-check-dialog";
import { Banner, Glyph, HeroNumber, InlineNumber } from "@/components/mfm-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { calculateDailyCheckOutcome, getDailyCheck, stateLabel, stateText } from "@/lib/calculations";
import { addDays, daysBetween, formatShortDate, parseISODate } from "@/lib/dates";
import type {
  CalculationSnapshot,
  DailyCheck,
  DailyCheckReason,
  FinanceState,
  InterfaceState,
  MandatoryPayment
} from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface TodayScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onDailyCheck: (mode: DailyCheckDialogMode) => void;
  onQuickExpense: () => void;
  onConfirmPaycheck: () => void;
  onReserveChange: (amount: number) => void;
}

const RU_DOW = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const RU_MONTH_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек"
];

const REASON_LABELS: Record<DailyCheckReason, string> = {
  food: "еда",
  transport: "транспорт",
  family: "семья",
  health: "здоровье",
  work: "работа",
  "force-majeure": "форс-мажор",
  extra: "лишнее",
  unknown: "неясно",
  other: "другое"
};

type TodayInfoTopic = "spent" | "free" | "reserve" | "pace" | "operational" | "savings" | "day";

function dateBits(iso: string) {
  const d = parseISODate(iso);
  return {
    dow: RU_DOW[d.getDay()],
    day: d.getDate(),
    month: RU_MONTH_SHORT[d.getMonth()]
  };
}

function stateToBannerKind(state: InterfaceState): "warning" | "info" | "notice" | "success" | null {
  switch (state) {
    case "tight":
      return "notice";
    case "cash-risk":
    case "payment-due-tomorrow":
    case "savings-off-track":
      return "warning";
    case "payday-arrived":
      return "info";
    default:
      return null;
  }
}

function dailyStatusText(check?: DailyCheck) {
  if (!check?.morningBalance && check?.morningBalance !== 0) {
    return {
      title: "Утро не внесено",
      note: "Утренний остаток ещё не зафиксирован. Введите остаток, чтобы рассчитать день.",
      kind: "notice" as const
    };
  }
  if (check.eveningBalance === undefined) {
    if (check.calculatedEveningBalance !== undefined) {
      return {
        title: "Расчётный остаток обновлён",
        note: `Расчётный вечерний остаток ${formatMoney(check.calculatedEveningBalance)} ₽. Ручной вечер всё ещё можно внести.`,
        kind: check.status === "risk" ? "warning" as const : "info" as const
      };
    }
    if ((check.creditSpentAmount ?? 0) > 0) {
      return {
        title: "Расход в долг записан",
        note: "Факт дня и долг обновлены. Остаток своих денег не менялся; вечерний остаток внесите вручную.",
        kind: check.status === "risk" ? "warning" as const : "info" as const
      };
    }
    return {
      title: "Ориентир дня зафиксирован",
      note: "Вечером внесите остаток, чтобы закрыть день.",
      kind: "info" as const
    };
  }
  if (check.status === "ok") {
    return {
      title: "День закрыт",
      note: "Расход дня не превысил ориентир.",
      kind: "success" as const
    };
  }
  if (check.status === "warning") {
    return {
      title: "Есть перерасход",
      note: "Расход дня выше ориентира.",
      kind: "notice" as const
    };
  }
  return {
    title: "Риск по маршруту",
    note: "Расход дня сильно выше ориентира. Проверьте обязательства до зарплаты.",
    kind: "warning" as const
  };
}

function percentOf(total: number, value: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function Header({ date, daysToPaycheck }: { date: ReturnType<typeof dateBits>; daysToPaycheck: number }) {
  return (
    <div
      style={{
        padding: "12px var(--pad-x) 10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderBottom: "0.5px solid var(--hair)"
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
          {date.dow}
        </span>
        <span className="slab tnum" style={{ fontSize: 14 }}>
          {date.day}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
          {date.month}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="eyebrow">до зарплаты</span>
        <span className="slab tnum" style={{ fontSize: 13 }}>
          {daysToPaycheck}
        </span>
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          дн.
        </span>
      </div>
    </div>
  );
}

function Hero({
  safeToday,
  operationalBalance,
  availableUntilPaycheck,
  remainingDays
}: {
  safeToday: number;
  operationalBalance: number;
  availableUntilPaycheck: number;
  remainingDays: number;
}) {
  const availableText =
    availableUntilPaycheck < 0
      ? `до безопасного минимума не хватает ${formatMoney(Math.abs(availableUntilPaycheck))} ₽`
      : `до зарплаты свободно ${formatMoney(availableUntilPaycheck)} ₽`;

  return (
    <section
      style={{
        padding: "18px var(--pad-x) 14px",
        display: "grid",
        gridTemplateColumns: "3px 1fr",
        gap: 14,
        alignItems: "stretch"
      }}
    >
      <div style={{ background: "var(--yellow)" }} />
      <div>
        <div className="eyebrow">Можно сегодня</div>
        <div style={{ marginTop: 8 }}>
          <HeroNumber value={formatMoney(safeToday)} />
        </div>
        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 1, background: "var(--ink)" }} />
          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
            оперативный остаток {formatMoney(operationalBalance)} ₽
          </span>
        </div>
        <div className="mono" style={{ marginTop: 8, fontSize: 9.5, color: "var(--ink-55)", lineHeight: 1.35 }}>
          {availableText} · {remainingDays} дн.
        </div>
      </div>
    </section>
  );
}

function BalanceStrip({
  spent,
  free,
  reserve,
  onExplain
}: {
  spent: number;
  free: number;
  reserve: number;
  onExplain: (topic: TodayInfoTopic) => void;
}) {
  const total = Math.max(1, spent + Math.max(0, free) + reserve);
  const spentPct = percentOf(total, spent);
  const reservePct = percentOf(total, reserve);
  const freePct = Math.max(0, 100 - spentPct - reservePct);
  const reserveDominates = Math.max(0, free) <= 0 && reserve > 0;

  return (
    <section style={{ padding: "8px var(--pad-x) 10px", borderTop: "0.5px solid var(--hair)" }}>
      <div style={{ height: 7, display: "flex", border: "0.5px solid var(--ink)" }}>
        <div style={{ width: `${spentPct}%`, background: "var(--ink)" }} />
        <div style={{ width: `${freePct}%`, background: "transparent" }} />
        <div style={{ width: `${reservePct}%`, background: "var(--yellow)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginTop: 7, gap: 8 }}>
        <MiniMetric label="потрачено" value={spent} onClick={() => onExplain("spent")} />
        <MiniMetric label="свободно" value={Math.max(0, free)} onClick={() => onExplain("free")} />
        <MiniMetric label="подушка" value={reserve} onClick={() => onExplain("reserve")} />
      </div>
      {reserveDominates && (
        <div className="mono" style={{ marginTop: 7, fontSize: 8.5, lineHeight: 1.35, color: "var(--ink-55)" }}>
          Жёлтый сегмент — подушка на сегодня. Это часть оперативных денег, которую лучше не трогать.
        </div>
      )}
    </section>
  );
}

function PaceRow({ snapshot, onExplain }: { snapshot: CalculationSnapshot; onExplain: (topic: TodayInfoTopic) => void }) {
  const pace = Math.round(snapshot.monthlySavingPace);
  const hasEnoughHistory = snapshot.savingsMovementCount > 0 && snapshot.savingsPaceDays >= 7;
  return (
    <button
      type="button"
      className="tap-highlight"
      onClick={() => onExplain("pace")}
      style={{
        width: "100%",
        padding: "8px var(--pad-x)",
        display: "grid",
        gridTemplateColumns: "3px auto 1fr auto",
        gap: 9,
        alignItems: "center",
        borderTop: "1.5px solid var(--hair)",
        borderRight: "none",
        borderBottom: "1px solid var(--hair)",
        borderLeft: "none",
        background: "transparent",
        color: "var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left"
      }}
    >
      <div style={{ width: 2, height: 16, background: hasEnoughHistory ? (pace >= 0 ? "var(--blue)" : "var(--red)") : "var(--ink-35)" }} />
      <span className="eyebrow">Темп</span>
      <span className="slab tnum" style={{ fontSize: 12, color: hasEnoughHistory ? (pace >= 0 ? "var(--ink)" : "var(--red)") : "var(--ink-55)" }}>
        {hasEnoughHistory ? (
          <>
            {pace >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(pace))} <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>₽/мес</span>
          </>
        ) : (
          "данных мало"
        )}
      </span>
      <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
        {hasEnoughHistory ? (
          <>
            к +12 мес. <span className="slab" style={{ color: "var(--blue)", fontSize: 12 }}>{formatMoney(Math.round(snapshot.savingsForecastNominal))} ₽</span>
          </>
        ) : snapshot.savingsMovementCount > 0 ? (
          "нужна неделя движений"
        ) : (
          "нет переводов / снятий"
        )}
      </span>
    </button>
  );
}

function TodayCycleAxis({
  snapshot
}: {
  snapshot: CalculationSnapshot;
}) {
  const totalDays = Math.max(1, daysBetween(snapshot.previousPaycheckDate, snapshot.nextPaycheckDate));
  const todayIdx = Math.max(0, Math.min(totalDays, daysBetween(snapshot.previousPaycheckDate, snapshot.today)));
  const labels = Array.from(new Set([0, Math.ceil(totalDays / 4), Math.ceil(totalDays / 2), Math.ceil((totalDays * 3) / 4), totalDays]))
    .filter((idx) => idx >= 0 && idx <= totalDays)
    .sort((a, b) => a - b);

  return (
    <section style={{ padding: "8px var(--pad-x) 10px", borderBottom: "1.5px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="eyebrow eyebrow--ink">Цикл</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          {formatShortDate(snapshot.previousPaycheckDate)} → {formatShortDate(snapshot.nextPaycheckDate)}
        </span>
      </div>
      <div style={{ position: "relative", height: 48, marginTop: 8 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 20, height: 1, background: "var(--ink)" }} />
        {labels.map((idx) => {
          const left = `${(idx / totalDays) * 100}%`;
          const date = addDays(snapshot.previousPaycheckDate, idx);
          return (
            <div key={idx} style={{ position: "absolute", left, top: 13, transform: "translateX(-50%)", textAlign: "center" }}>
              <div style={{ width: 1, height: 15, background: "var(--ink-55)", margin: "0 auto" }} />
              <div className="mono tnum" style={{ marginTop: 5, fontSize: 8.5, color: "var(--ink-55)" }}>
                {parseISODate(date).getDate()}
              </div>
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: `${(todayIdx / totalDays) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
            textAlign: "center"
          }}
        >
          <div className="slab" style={{ fontSize: 8.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            сегодня
          </div>
          <div style={{ width: 3, height: 24, background: "var(--red)", margin: "3px auto 0" }} />
        </div>
      </div>
    </section>
  );
}

function CheckPanel({
  check,
  onDailyCheck
}: {
  check?: DailyCheck;
  onDailyCheck: (mode: DailyCheckDialogMode) => void;
}) {
  return (
    <section style={{ padding: "8px var(--pad-x) 10px", borderTop: "1px solid var(--hair)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "0.5px solid var(--ink)" }}>
        <CheckCell
          label="утро"
          value={check?.morningBalance}
          note={check?.morningAt ? "зафиксировано" : "внести остаток"}
          onClick={() => onDailyCheck("morning-check")}
        />
        <CheckCell
          label="вечер"
          value={check?.eveningBalance ?? check?.calculatedEveningBalance}
          note={
            check?.eveningAt
              ? "день закрыт"
              : check?.calculatedEveningBalance !== undefined
                ? "расчётный остаток"
                : "закрыть день"
          }
          onClick={() => onDailyCheck("evening-check")}
          right
        />
      </div>
    </section>
  );
}

function CheckCell({
  label,
  value,
  note,
  onClick,
  right = false
}: {
  label: string;
  value?: number;
  note: string;
  onClick: () => void;
  right?: boolean;
}) {
  return (
    <button
      type="button"
      className="tap-highlight"
      onClick={onClick}
      style={{
        minHeight: 74,
        padding: "11px 12px",
        border: "none",
        borderLeft: right ? "0.5px solid var(--ink)" : "none",
        background: "transparent",
        color: "var(--ink)",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit"
      }}
    >
      <div className="eyebrow">{label}</div>
      <div className="slab tnum" style={{ marginTop: 8, fontSize: 17 }}>
        {value === undefined ? "—" : formatMoney(value)}
      </div>
      <div className="mono" style={{ marginTop: 4, fontSize: 9, color: "var(--ink-55)" }}>
        {note}
      </div>
    </button>
  );
}

function DaySummary({ check, onExplain }: { check?: DailyCheck; onExplain: (topic: TodayInfoTopic) => void }) {
  if (
    !check ||
    (check.eveningBalance === undefined &&
      (check.quickSpentAmount ?? 0) <= 0 &&
      (check.creditSpentAmount ?? 0) <= 0 &&
      (check.creditPaymentAmount ?? 0) <= 0)
  ) return null;

  const outcome = calculateDailyCheckOutcome(check);
  const totalSpent = outcome.freeSpent ?? check.freeSpent ?? 0;
  const overpay = Math.max(0, totalSpent - check.plannedLimit);
  const eveningLabel = check.eveningBalance === undefined ? "расчётный вечер" : "вечер подтверждён";
  const reasonText = check.reason ? REASON_LABELS[check.reason] : "";
  const noteParts = [
    eveningLabel,
    reasonText ? `причина: ${reasonText}` : "",
    check.note
  ].filter(Boolean);

  return (
    <section style={{ padding: "10px var(--pad-x)", borderTop: "1px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <button
          type="button"
          className="tap-highlight eyebrow eyebrow--ink"
          onClick={() => onExplain("day")}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--ink)",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
            textAlign: "left"
          }}
        >
          Итог дня
        </button>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <button
          type="button"
          className="tap-highlight mono"
          onClick={() => onExplain("day")}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--ink-55)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 9,
            padding: 0,
            textAlign: "right"
          }}
        >
          ?
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 9 }}>
        <Metric label="всего за день" value={totalSpent} />
        <Metric label="переплата" value={overpay} color={overpay > 0 ? "var(--red)" : "var(--ink)"} />
      </div>
      {noteParts.length > 0 && (
        <div className="mono" style={{ marginTop: 8, fontSize: 9.5, color: "var(--ink-55)", lineHeight: 1.45 }}>
          {noteParts.join(" · ")}
        </div>
      )}
    </section>
  );
}

function MiniMetric({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const content = (
    <>
      <div className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
        {label}
      </div>
      <div className="slab tnum" style={{ marginTop: 3, fontSize: 12 }}>
        {formatMoney(value)}
      </div>
    </>
  );
  if (!onClick) return <div>{content}</div>;
  return (
    <button
      type="button"
      className="tap-highlight"
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        color: "var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0,
        textAlign: "left"
      }}
    >
      {content}
    </button>
  );
}

function Metric({
  label,
  value,
  color = "var(--ink)",
  signed = false,
  onClick
}: {
  label: string;
  value: number;
  color?: string;
  signed?: boolean;
  onClick?: () => void;
}) {
  const sign = signed && value > 0 ? "+" : signed && value < 0 ? "−" : "";
  const content = (
    <>
      <div className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
        {label}
      </div>
      <div className="slab tnum" style={{ marginTop: 4, fontSize: 13, color }}>
        {sign}
        {formatMoney(Math.abs(value))}
      </div>
    </>
  );
  if (!onClick) {
    return (
      <div>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="tap-highlight"
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        color: "var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0,
        textAlign: "left"
      }}
    >
      {content}
    </button>
  );
}

function paymentWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "платёж";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "платежа";
  return "платежей";
}

function PaymentLine({
  payments,
  nextPaycheckDate
}: {
  payments: MandatoryPayment[];
  nextPaycheckDate: string;
}) {
  if (payments.length === 0) {
    return (
      <section style={{ padding: "9px var(--pad-x)", borderTop: "1.5px solid var(--hair)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ width: 2, height: 17, background: "var(--ink-35)" }} />
          <span className="eyebrow">ближайший</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
            до зарплаты нет обязательных платежей
          </span>
        </div>
      </section>
    );
  }

  const first = payments[0];
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const isPaydayPayment = first.dueDate === nextPaycheckDate;
  const title =
    payments.length === 1
      ? first.title
      : `${payments.length} ${paymentWord(payments.length)}`;
  const detail =
    payments.length === 1
      ? ""
      : payments
          .slice(0, 2)
          .map((payment) => payment.title)
          .join(", ") + (payments.length > 2 ? "…" : "");

  return (
    <section style={{ padding: "9px var(--pad-x)", borderTop: "1.5px solid var(--hair)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2px auto 1fr auto",
          alignItems: "baseline",
          gap: 8
        }}
      >
        <div style={{ width: 2, height: 18, background: isPaydayPayment ? "var(--yellow)" : "var(--red)", alignSelf: "center" }} />
        <span className="eyebrow">{payments.length > 1 ? "ближайшие" : "ближайший"}</span>
        <div style={{ minWidth: 0 }}>
          <span className="slab" style={{ fontSize: 12 }}>
            {title}
          </span>
          <span className="mono" style={{ marginLeft: 6, fontSize: 9.5, color: "var(--ink-55)" }}>
            · {formatShortDate(first.dueDate)} · {isPaydayPayment ? "в день зарплаты" : "учтён"}
          </span>
          {detail && (
            <div className="mono" style={{ marginTop: 2, fontSize: 8.7, color: "var(--ink-55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {detail}
            </div>
          )}
        </div>
        <InlineNumber value={formatMoney(total)} size={13} color="var(--ink)" />
      </div>
    </section>
  );
}

function FooterSummary({
  state,
  onExplain,
  onReserveEdit
}: {
  state: FinanceState;
  onExplain: (topic: TodayInfoTopic) => void;
  onReserveEdit: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        borderTop: "0.5px solid var(--ink)",
        borderBottom: "0.5px solid var(--ink)"
      }}
    >
      <FooterCell label="оперативный" value={state.operationalBalance} onClick={() => onExplain("operational")} />
      <FooterCell label="подушка" value={state.reserve.amount} onClick={onReserveEdit} />
      <FooterCell label="накопления" value={state.savings.balance} blue onClick={() => onExplain("savings")} />
    </div>
  );
}

function ReserveEditDialog({
  open,
  state,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  state: FinanceState;
  onOpenChange: (open: boolean) => void;
  onSubmit: (amount: number) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("reserve") ?? "").replace(/\s/g, "").replace(",", ".");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onSubmit(Math.round(parsed));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подушка на сегодня</DialogTitle>
          <DialogDescription>
            Это часть оперативных денег, которую ты решил не трогать. Деньги никуда не переводятся.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Input
              name="reserve"
              inputMode="decimal"
              defaultValue={String(state.settings.reserveAmount || state.reserve.amount || "")}
              placeholder="Сумма подушки"
              autoFocus
            />
            <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.45, color: "var(--ink-55)" }}>
              Сейчас защищено {formatMoney(state.reserve.amount)} ₽ из {formatMoney(state.operationalBalance)} ₽
              оперативных денег.
            </div>
            <Button type="submit" variant="primary" style={{ width: "100%" }}>
              Сохранить
            </Button>
          </DialogBody>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FooterCell({
  label,
  value,
  blue = false,
  onClick
}: {
  label: string;
  value: number;
  blue?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tap-highlight"
      onClick={onClick}
      style={{
        minHeight: 62,
        padding: "10px 12px",
        borderRight: "none",
        borderBottom: "none",
        borderLeft: blue ? "0.5px solid var(--ink)" : label === "подушка" ? "0.5px solid var(--ink)" : "none",
        borderTop: blue ? "2px solid var(--blue)" : "none",
        background: "transparent",
        color: "var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left"
      }}
    >
      <div className="eyebrow" style={{ fontSize: 8 }}>
        {label}
      </div>
      <div className="slab tnum" style={{ marginTop: 8, fontSize: 14, color: blue ? "var(--blue)" : "var(--ink)" }}>
        {formatMoney(value)}
      </div>
    </button>
  );
}

function TodayActions({
  onAction,
  onQuickExpense
}: {
  onAction: (action: ActionDialogKind) => void;
  onQuickExpense: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: "0.5px solid var(--ink)" }}>
      <TodayActionButton label="Расход" shape="square" tone="primary" onClick={onQuickExpense} />
      <TodayActionButton label="В накопления" shape="circle" tone="blue" onClick={() => onAction("transfer")} />
      <TodayActionButton label="Доход / премия" shape="bar" tone="ink" onClick={() => onAction("income")} />
    </div>
  );
}

function TodayActionButton({
  label,
  shape,
  onClick,
  tone
}: {
  label: string;
  shape: "circle" | "square" | "bar" | "halfcircle";
  onClick: () => void;
  tone: "primary" | "blue" | "ink";
}) {
  const isPrimary = tone === "primary";
  const color = tone === "blue" ? "var(--blue)" : "var(--ink)";
  return (
    <button
      type="button"
      className="tap-highlight"
      onClick={onClick}
      style={{
        height: 46,
        padding: "9px 6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minWidth: 0,
        background: isPrimary ? "var(--ink)" : "var(--paper)",
        color: isPrimary ? "var(--paper)" : color,
        border: "none",
        borderLeft: isPrimary ? "none" : "0.5px solid var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit"
      }}
    >
      <Glyph
        shape={shape}
        fill={isPrimary ? "var(--paper)" : "none"}
        stroke={isPrimary ? undefined : color}
        size={8}
        sw={1.2}
      />
      <span
        className="slab"
        style={{
          maxWidth: "100%",
          fontSize: 8.5,
          letterSpacing: 0,
          lineHeight: 1.05,
          textAlign: "center",
          textTransform: "uppercase"
        }}
      >
        {label}
      </span>
    </button>
  );
}

function TodayInfoDialog({
  topic,
  state,
  snapshot,
  dailyCheck,
  onOpenChange
}: {
  topic: TodayInfoTopic | null;
  state: FinanceState;
  snapshot: CalculationSnapshot;
  dailyCheck?: DailyCheck;
  onOpenChange: (open: boolean) => void;
}) {
  if (!topic) return null;

  const plannedSavings = snapshot.plannedSavingsTransfersBeforeNextPaycheck;
  const free = Math.round(snapshot.availableUntilNextPaycheck);
  const paceReady = snapshot.savingsMovementCount > 0 && snapshot.savingsPaceDays >= 7;
  const dayOutcome = dailyCheck ? calculateDailyCheckOutcome(dailyCheck) : undefined;
  const dayTotalSpent = dayOutcome?.freeSpent ?? dailyCheck?.freeSpent ?? 0;
  const dayCashSpent = dayOutcome?.grossOutflow ?? dailyCheck?.grossOutflow ?? 0;
  const dayCreditSpent = dailyCheck?.creditSpentAmount ?? 0;
  const dayAccountedOutflow = dailyCheck
    ? Math.max(0, (dailyCheck.transferToSavingsAmount ?? 0) + (dailyCheck.mandatoryPaidAmount ?? 0))
    : 0;
  const dayOverpay = dailyCheck ? Math.max(0, dayTotalSpent - dailyCheck.plannedLimit) : 0;
  const data: Record<TodayInfoTopic, { title: string; description: string; lines: string[] }> = {
    spent: {
      title: "Потрачено в цикле",
      description: "Оценка того, сколько оперативных денег ушло с начала текущего зарплатного цикла.",
      lines: [
        `Старт цикла: ${formatMoney(state.payCycle.openingOperational)} ₽`,
        `+ доходы до зарплаты: ${formatMoney(snapshot.incomeBeforeNextPaycheck)} ₽`,
        `− текущий оперативный остаток: ${formatMoney(state.operationalBalance)} ₽`
      ]
    },
    free: {
      title: free < 0 ? "Почему денег не хватает" : "Останется до зарплаты",
      description:
        free < 0
          ? "Это не долг. Это предупреждение: будущих обязательств больше, чем доступных денег."
          : "Сколько останется после ближайших платежей, плановых накоплений и подушки.",
      lines: [
        `Оперативный остаток: ${formatMoney(state.operationalBalance)} ₽`,
        `+ ожидаемые доходы до зарплаты: ${formatMoney(snapshot.incomeBeforeNextPaycheck)} ₽`,
        `− платежи до зарплаты: ${formatMoney(snapshot.mandatoryPaymentsBeforeNextPaycheck)} ₽`,
        `− подушка на сегодня: ${formatMoney(state.reserve.amount)} ₽`,
        plannedSavings > 0 ? `− плановые переводы в накопления: ${formatMoney(plannedSavings)} ₽` : "− плановые переводы в накопления: 0 ₽",
        `= останется до зарплаты: ${formatMoney(free)} ₽`
      ]
    },
    reserve: {
      title: "Подушка на сегодня",
      description: "Часть оперативных денег, которую ты решил не трогать до зарплаты.",
      lines: [
        `Желаемая подушка в настройках: ${formatMoney(state.settings.reserveAmount)} ₽`,
        `Фактически сейчас защищено: ${formatMoney(state.reserve.amount)} ₽`,
        "Если оперативных денег меньше, МФМ показывает только доступную часть.",
        "Копилка находится в накоплениях. Подушка на сегодня находится в оперативных деньгах."
      ]
    },
    pace: {
      title: "Темп накоплений",
      description: "Это не ручной прогноз из настроек, а средний темп по реальным переводам и снятиям.",
      lines: paceReady
        ? [
            `Движений: ${snapshot.savingsMovementCount}`,
            `Период: ${snapshot.savingsPaceDays} дн.`,
            `Средний темп: ${formatMoney(Math.round(snapshot.monthlySavingPace))} ₽/мес`,
            `Прогноз +12 мес.: ${formatMoney(Math.round(snapshot.savingsForecastNominal))} ₽`
          ]
        : [
            `Движений: ${snapshot.savingsMovementCount}`,
            `Период: ${snapshot.savingsPaceDays} дн.`,
            "Темп не показывается, пока нет хотя бы недели реальных движений."
          ]
    },
    operational: {
      title: "Оперативный остаток",
      description: "Это деньги, которыми можно платить сейчас.",
      lines: [
        `Сейчас: ${formatMoney(state.operationalBalance)} ₽`,
        "Быстрый расход своими деньгами уменьшает это число.",
        "Расход в долг увеличивает долговое обязательство. Погашение уменьшает и оперативный остаток, и долг."
      ]
    },
    savings: {
      title: "Накопления",
      description: "Общий котёл — все накопления. Цели — части этого котла, закреплённые за конкретными задачами.",
      lines: [
        `Всего в котле: ${formatMoney(state.savings.balance)} ₽`,
        `Копилка: ${formatMoney(state.savings.cushion.allocated)} ₽`,
        "Перевод «На цель» увеличивает котёл и сразу закрепляет сумму за выбранной целью."
      ]
    },
    day: {
      title: "Итог дня",
      description: "Переплата — это сколько потрачено сверх ориентира на день.",
      lines: dailyCheck
        ? [
            `Из кармана по остатку: ${formatMoney(dayCashSpent)} ₽`,
            dayAccountedOutflow > 0
              ? `Вне дневного лимита: ${formatMoney(dayAccountedOutflow)} ₽`
              : "Вне дневного лимита: 0 ₽",
            dayCreditSpent > 0 ? `В долг: ${formatMoney(dayCreditSpent)} ₽` : "В долг: 0 ₽",
            `Всего за день: ${formatMoney(dayTotalSpent)} ₽`,
            `Можно было сегодня: ${formatMoney(dailyCheck.plannedLimit)} ₽`,
            `Переплата: ${formatMoney(dayOverpay)} ₽`
          ]
        : ["День ещё не закрыт."]
    }
  };
  const current = data[topic];

  return (
    <Dialog open={Boolean(topic)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mono" style={{ display: "grid", gap: 7, fontSize: 9.5, lineHeight: 1.45, color: "var(--ink-80)" }}>
            {current.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function TodayScreen({
  state,
  snapshot,
  onAction,
  onDailyCheck,
  onQuickExpense,
  onConfirmPaycheck,
  onReserveChange
}: TodayScreenProps) {
  const date = useMemo(() => dateBits(snapshot.today), [snapshot.today]);
  const [infoTopic, setInfoTopic] = useState<TodayInfoTopic | null>(null);
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const dailyCheck = getDailyCheck(state, snapshot.today);
  const dailyStatus = dailyStatusText(dailyCheck);
  const bannerState = snapshot.uiStates.find((s) => s !== "normal");
  const bannerKind = bannerState ? stateToBannerKind(bannerState) : null;
  const safeToday = Math.max(0, Math.round(snapshot.safeToSpendToday));
  const cycleSpent = Math.max(
    0,
    state.payCycle.openingOperational +
      snapshot.incomeBeforeNextPaycheck -
      state.operationalBalance
  );

  return (
    <div
      style={{
        minHeight: "calc(100dvh - env(safe-area-inset-bottom) - var(--tabbar-base))",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Header date={date} daysToPaycheck={snapshot.rawRemainingDays} />

      {bannerState && bannerKind && (
        <Banner
          kind={bannerKind}
          title={stateLabel(bannerState)}
          note={stateText(bannerState, snapshot.nextMandatoryPayment)}
        />
      )}

      <Banner kind={dailyStatus.kind} title={dailyStatus.title} note={dailyStatus.note} />

      {snapshot.uiStates.includes("payday-arrived") && (
        <div style={{ padding: "8px var(--pad-x) 0" }}>
          <Button variant="primary" onClick={onConfirmPaycheck} style={{ width: "100%" }}>
            <Glyph shape="square" fill="var(--paper)" size={8} />
            Подтвердить зарплату
          </Button>
        </div>
      )}

      <Hero
        safeToday={safeToday}
        operationalBalance={state.operationalBalance}
        availableUntilPaycheck={Math.round(snapshot.availableUntilNextPaycheck)}
        remainingDays={snapshot.remainingDays}
      />
      <BalanceStrip
        spent={Math.round(cycleSpent)}
        free={Math.round(snapshot.availableUntilNextPaycheck)}
        reserve={state.reserve.amount}
        onExplain={setInfoTopic}
      />
      <PaceRow snapshot={snapshot} onExplain={setInfoTopic} />
      <TodayCycleAxis snapshot={snapshot} />
      <CheckPanel check={dailyCheck} onDailyCheck={onDailyCheck} />
      <DaySummary check={dailyCheck} onExplain={setInfoTopic} />
      <PaymentLine
        payments={snapshot.nextMandatoryPayments}
        nextPaycheckDate={snapshot.nextPaycheckDate}
      />
      <div style={{ flex: 1, minHeight: 10 }} />
      <FooterSummary
        state={state}
        onExplain={setInfoTopic}
        onReserveEdit={() => setReserveDialogOpen(true)}
      />
      <TodayActions onAction={onAction} onQuickExpense={onQuickExpense} />
      <ReserveEditDialog
        open={reserveDialogOpen}
        state={state}
        onOpenChange={setReserveDialogOpen}
        onSubmit={onReserveChange}
      />
      <TodayInfoDialog
        topic={infoTopic}
        state={state}
        snapshot={snapshot}
        dailyCheck={dailyCheck}
        onOpenChange={(open) => {
          if (!open) setInfoTopic(null);
        }}
      />
    </div>
  );
}
