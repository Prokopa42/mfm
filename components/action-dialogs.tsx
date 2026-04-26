"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/dates";
import type {
  CalculationSnapshot,
  Credit,
  CreditEvent,
  ExpensePaymentSource,
  IncomeKind,
  Rubric,
  RubricScope
} from "@/lib/types";
import { formatMoney, numberFromInput } from "@/lib/utils";

export type ActionDialogKind = "expense" | "income" | "transfer" | "withdraw" | null;

export interface ActionPayload {
  amount: number;
  date: string;
  categoryId?: string;
  category?: string;
  title?: string;
  note?: string;
  planned?: boolean;
  linkedGoalId?: string;
  paymentSource?: ExpensePaymentSource;
  linkedCreditId?: string;
  kind?: IncomeKind;
}

interface ActionDialogsProps {
  active: ActionDialogKind;
  snapshot: CalculationSnapshot;
  rubrics: Rubric[];
  credits: Credit[];
  creditEvents: CreditEvent[];
  onOpenChange: (value: ActionDialogKind) => void;
  onExpense: (payload: ActionPayload) => void;
  onIncome: (payload: ActionPayload) => void;
  onTransfer: (payload: ActionPayload) => void;
  onWithdraw: (payload: ActionPayload) => void;
}

/* ─────────────────────────────────────────────────────────────
   Action dialogs — port to hi-fi primitive layer.
   Same four actions (expense / income / transfer / withdraw),
   same payload shape, same business semantics. Only visuals
   migrate from mid-fi (Button variant="default|blue", native
   <select> + <input type="checkbox">) to the hi-fi system
   (Button-less full-width submit, SegControl, Switch, DialogBody).
   ───────────────────────────────────────────────────────────── */

export function ActionDialogs({
  active,
  snapshot,
  rubrics,
  credits,
  creditEvents,
  onOpenChange,
  onExpense,
  onIncome,
  onTransfer,
  onWithdraw
}: ActionDialogsProps) {
  const close = () => onOpenChange(null);
  const today = todayISO();

  return (
    <>
      <MoneyDialog
        mode="expense"
        open={active === "expense"}
        title="Записать расход"
        description={`На сегодня можно потратить: ${formatMoney(snapshot.safeToSpendToday)} ₽.`}
        defaultTitle=""
        defaultDate={today}
        rubrics={rubrics}
        credits={credits}
        creditEvents={creditEvents}
        submitLabel="Записать расход"
        onOpenChange={(open) => onOpenChange(open ? "expense" : null)}
        onSubmit={(payload) => {
          onExpense(payload);
          close();
        }}
      />
      <MoneyDialog
        mode="income"
        open={active === "income"}
        title="Записать доход"
        description="Ручной ввод дохода. Банковские интеграции в MVP не используются."
        defaultTitle=""
        defaultDate={today}
        rubrics={rubrics}
        credits={credits}
        creditEvents={creditEvents}
        submitLabel="Записать доход"
        showIncomeKind
        onOpenChange={(open) => onOpenChange(open ? "income" : null)}
        onSubmit={(payload) => {
          onIncome(payload);
          close();
        }}
      />
      <MoneyDialog
        mode="transfer"
        open={active === "transfer"}
        title="В накопления"
        description="Перевод уменьшает оперативный остаток и увеличивает накопления."
        defaultTitle="В накопления"
        defaultDate={today}
        rubrics={rubrics}
        credits={credits}
        creditEvents={creditEvents}
        submitLabel="В накопления"
        showPlanned
        onOpenChange={(open) => onOpenChange(open ? "transfer" : null)}
        onSubmit={(payload) => {
          onTransfer(payload);
          close();
        }}
      />
      <MoneyDialog
        mode="withdraw"
        open={active === "withdraw"}
        title="Снять с накоплений"
        description="Снятие переходит в оперативный остаток и видно в истории."
        defaultTitle="Снятие с накоплений"
        defaultDate={today}
        rubrics={rubrics}
        credits={credits}
        creditEvents={creditEvents}
        submitLabel="Снять с накоплений"
        onOpenChange={(open) => onOpenChange(open ? "withdraw" : null)}
        onSubmit={(payload) => {
          onWithdraw(payload);
          close();
        }}
      />
    </>
  );
}

type MoneyDialogMode = "expense" | "income" | "transfer" | "withdraw";

interface MoneyDialogProps {
  mode: MoneyDialogMode;
  open: boolean;
  title: string;
  description: string;
  defaultTitle: string;
  defaultDate: string;
  rubrics: Rubric[];
  credits: Credit[];
  creditEvents: CreditEvent[];
  submitLabel: string;
  showPlanned?: boolean;
  showIncomeKind?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ActionPayload) => void;
}

function MoneyDialog({
  mode,
  open,
  title,
  description,
  defaultTitle,
  defaultDate,
  rubrics,
  credits,
  creditEvents,
  submitLabel,
  showPlanned = false,
  showIncomeKind = false,
  onOpenChange,
  onSubmit
}: MoneyDialogProps) {
  // SegControl + Switch are controlled — keep their state local. Native
  // <input>/<textarea> stay uncontrolled (FormData reads them on submit).
  // Reset both on close so the next open is fresh.
  const [planned, setPlanned] = useState(false);
  const [incomeKind, setIncomeKind] = useState<IncomeKind>("other");
  const scope = modeToScope(mode);
  const rubricOptions = useMemo(() => rubricsForScope(rubrics, scope, false), [rubrics, scope]);
  const [categoryId, setCategoryId] = useState<string | undefined>(rubricOptions[0]?.id);
  const activeCredits = useMemo(
    () =>
      credits
        .filter((credit) => !credit.isClosed)
        .slice()
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru")),
    [credits]
  );
  const [paymentSource, setPaymentSource] = useState<ExpensePaymentSource>("own");
  const [linkedCreditId, setLinkedCreditId] = useState("");

  useEffect(() => {
    if (!open) {
      setPlanned(false);
      setIncomeKind("other");
      setCategoryId(rubricOptions[0]?.id);
      setPaymentSource("own");
      setLinkedCreditId("");
      return;
    }
    setCategoryId((current) => {
      if (current && rubricOptions.some((rubric) => rubric.id === current)) return current;
      return rubricOptions[0]?.id;
    });
    if (mode === "expense" && paymentSource === "credit") {
      setLinkedCreditId((current) => {
        if (current && activeCredits.some((credit) => credit.id === current)) return current;
        return activeCredits[0]?.id ?? "";
      });
    }
  }, [activeCredits, mode, open, paymentSource, rubricOptions]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = numberFromInput(form.get("amount"));
    if (amount <= 0) return;

    onSubmit({
      amount,
      date: String(form.get("date") || defaultDate),
      categoryId,
      title: textFromForm(form.get("title")) || defaultTitle || undefined,
      note: textFromForm(form.get("note")),
      planned: showPlanned ? planned : undefined,
      paymentSource: mode === "expense" ? paymentSource : undefined,
      linkedCreditId:
        mode === "expense" && paymentSource === "credit"
          ? linkedCreditId || activeCredits[0]?.id
          : undefined,
      kind: showIncomeKind ? incomeKind : undefined
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Field id={`${title}-amount`} label="Сумма">
              <Input
                id={`${title}-amount`}
                name="amount"
                inputMode="decimal"
                autoFocus
                required
              />
            </Field>
            <Field id={`${title}-date`} label="Дата">
              <Input
                id={`${title}-date`}
                name="date"
                type="date"
                defaultValue={defaultDate}
                required
              />
            </Field>
            <Field id={`${title}-category`} label="Рубрика">
              {rubricOptions.length > 0 ? (
                <RubricSelect
                  id={`${title}-category`}
                  value={categoryId ?? rubricOptions[0]?.id}
                  rubrics={rubricOptions}
                  onChange={setCategoryId}
                />
              ) : (
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
                  Нет активных рубрик для этого типа.
                </div>
              )}
            </Field>
            {mode === "expense" && (
              <Field id={`${title}-payment-source`} label="Источник оплаты">
                <select
                  id={`${title}-payment-source`}
                  value={paymentSource === "credit" ? linkedCreditId || activeCredits[0]?.id || "own" : "own"}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value === "own") {
                      setPaymentSource("own");
                      setLinkedCreditId("");
                    } else {
                      setPaymentSource("credit");
                      setLinkedCreditId(value);
                    }
                  }}
                  style={{
                    width: "100%",
                    minHeight: 38,
                    border: "0.5px solid var(--ink-80)",
                    borderRadius: 0,
                    background: "var(--paper)",
                    color: "var(--ink)",
                    padding: "0 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11
                  }}
                >
                  <option value="own">Свои деньги</option>
                  {activeCredits.map((credit) => (
                    <option key={credit.id} value={credit.id}>
                      {credit.title} · {formatMoney(calculateCreditBalance(credit, creditEvents))} ₽
                    </option>
                  ))}
                </select>
                <div className="mono" style={{ fontSize: 8.5, lineHeight: 1.45, color: "var(--ink-55)" }}>
                  Кредитный расход попадёт в историю как расход, но не уменьшит оперативный остаток.
                </div>
              </Field>
            )}
            {showIncomeKind && (
              <Field id={`${title}-kind`} label="Тип дохода">
                <IncomeKindControl value={incomeKind} onChange={setIncomeKind} />
              </Field>
            )}
            <Field id={`${title}-title`} label="Название">
              <Input
                id={`${title}-title`}
                name="title"
                defaultValue={defaultTitle}
                placeholder={titlePlaceholder(mode)}
              />
            </Field>
            {showPlanned && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 0",
                  borderTop: "0.5px solid var(--hair)"
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span className="mono" style={{ fontSize: 11, letterSpacing: "-0.005em" }}>
                    Плановый перевод
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 9, color: "var(--ink-55)", marginTop: 2 }}
                  >
                    учитывается в «доступно до зарплаты», но не списывает сейчас
                  </span>
                </div>
                <Switch
                  checked={planned}
                  onCheckedChange={setPlanned}
                  aria-label="Плановый перевод"
                />
              </div>
            )}
            <Field id={`${title}-note`} label="Комментарий">
              <Textarea id={`${title}-note`} name="note" />
            </Field>
          </DialogBody>
          {/* Submit — full-width ink CTA, mirrors CTARow primary button */}
          <button
            type="submit"
            className="tap-highlight slab"
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "var(--ink)",
              color: "var(--paper)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "none",
              borderTop: "1px solid var(--ink)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em"
            }}
          >
            {submitLabel}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function textFromForm(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function modeToScope(mode: MoneyDialogMode): RubricScope {
  const values: Record<MoneyDialogMode, RubricScope> = {
    expense: "expense",
    income: "income",
    transfer: "transfer",
    withdraw: "withdraw"
  };
  return values[mode];
}

function rubricsForScope(rubrics: Rubric[], scope: RubricScope, includeArchived: boolean) {
  return rubrics
    .filter((rubric) => rubric.scope === scope && (includeArchived || !rubric.isArchived))
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));
}

function creditEventEffect(event: CreditEvent) {
  if (event.kind === "charge") return event.amount;
  if (event.kind === "payment") return -event.amount;
  return event.amount;
}

function calculateCreditBalance(credit: Credit, events: CreditEvent[]) {
  return Math.max(
    0,
    credit.openingBalance +
      events
        .filter((event) => event.creditId === credit.id)
        .reduce((sum, event) => sum + creditEventEffect(event), 0)
  );
}

function RubricSelect({
  id,
  value,
  rubrics,
  onChange
}: {
  id: string;
  value: string | undefined;
  rubrics: Rubric[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={id}
      value={value ?? rubrics[0]?.id ?? ""}
      onChange={(event) => onChange(event.currentTarget.value)}
      style={{
        width: "100%",
        minHeight: 38,
        border: "0.5px solid var(--ink-80)",
        borderRadius: 0,
        background: "var(--paper)",
        color: "var(--ink)",
        padding: "0 8px",
        fontFamily: "var(--font-mono)",
        fontSize: 11
      }}
    >
      {rubrics.map((rubric) => (
        <option key={rubric.id} value={rubric.id}>
          {rubric.title}
        </option>
      ))}
    </select>
  );
}

function titlePlaceholder(mode: MoneyDialogMode) {
  const values: Record<MoneyDialogMode, string> = {
    expense: "Например: обед, такси, аптека",
    income: "Например: аванс, премия, подработка",
    transfer: "Например: отпуск, общий котёл",
    withdraw: "Например: ремонт, срочная покупка"
  };
  return values[mode];
}

function IncomeKindControl({
  value,
  onChange
}: {
  value: IncomeKind;
  onChange: (value: IncomeKind) => void;
}) {
  const options: Array<{ id: IncomeKind; label: string }> = [
    { id: "paycheck", label: "Зарплата" },
    { id: "bonus", label: "Премия" },
    { id: "other", label: "Другое" }
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        width: "100%",
        border: "0.5px solid var(--ink-80)"
      }}
    >
      {options.map((option, index) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="tap-highlight"
            style={{
              minWidth: 0,
              padding: "7px 6px",
              background: selected ? "var(--ink)" : "transparent",
              color: selected ? "var(--paper)" : "var(--ink-55)",
              border: "none",
              borderLeft: index === 0 ? "none" : "0.5px solid var(--ink-80)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span
              className="slab"
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 9.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
