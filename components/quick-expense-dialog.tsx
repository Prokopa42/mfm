"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Credit, CreditEvent, DailyCheck, ExpensePaymentSource, ISODate } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

type QuickExpenseMode = "own" | "credit" | "credit-payment";

export interface QuickExpensePayload {
  date: ISODate;
  amount: number;
  operation: "expense" | "credit-payment";
  paymentSource: ExpensePaymentSource;
  creditId?: string;
  note?: string;
}

interface QuickExpenseDialogProps {
  open: boolean;
  date: ISODate;
  check?: DailyCheck;
  credits: Credit[];
  creditEvents: CreditEvent[];
  availableOperational: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: QuickExpensePayload) => void;
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function creditEventEffect(event: CreditEvent) {
  if (event.kind === "charge") return event.amount;
  if (event.kind === "payment") return -event.amount;
  return event.amount;
}

function creditBalance(credit: Credit, events: CreditEvent[]) {
  return Math.max(
    0,
    credit.openingBalance +
      events
        .filter((event) => event.creditId === credit.id)
        .reduce((sum, event) => sum + creditEventEffect(event), 0)
  );
}

export function QuickExpenseDialog({
  open,
  date,
  check,
  credits,
  creditEvents,
  availableOperational,
  onOpenChange,
  onSubmit
}: QuickExpenseDialogProps) {
  const [formDate, setFormDate] = useState(date);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<QuickExpenseMode>("own");
  const [creditId, setCreditId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeCredits = useMemo(() => credits.filter((credit) => !credit.isClosed), [credits]);
  const selectedCredit = activeCredits.find((credit) => credit.id === creditId) ?? activeCredits[0];
  const selectedCreditDebt = selectedCredit ? creditBalance(selectedCredit, creditEvents) : 0;

  useEffect(() => {
    if (!open) return;
    setFormDate(date);
    setAmount("");
    setMode("own");
    setCreditId(activeCredits[0]?.id ?? "");
    setNote("");
    setError(null);
  }, [activeCredits, date, open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (parsed === null || parsed <= 0) return;
    if ((mode === "credit" || mode === "credit-payment") && !creditId) return;
    if ((mode === "own" || mode === "credit-payment") && parsed > availableOperational) {
      setError(`В оперативном остатке ${formatMoney(availableOperational)} ₽. Нельзя списать больше.`);
      return;
    }
    if (mode === "credit-payment" && parsed > selectedCreditDebt) {
      setError(`Текущий долг ${formatMoney(selectedCreditDebt)} ₽. Платёж не может быть больше долга.`);
      return;
    }

    onSubmit({
      date: formDate,
      amount: parsed,
      operation: mode === "credit-payment" ? "credit-payment" : "expense",
      paymentSource: mode === "credit" ? "credit" : "own",
      creditId: mode === "credit" || mode === "credit-payment" ? creditId : undefined,
      note: note.trim() || undefined
    });
  }

  const quickSpent = check?.quickSpentAmount ?? 0;
  const creditSpent = check?.creditSpentAmount ?? 0;
  const creditPaid = check?.creditPaymentAmount ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Записать расход</DialogTitle>
          <DialogDescription>
            Выберите, что произошло: расход своими деньгами, расход в долг или погашение долга.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <Field label="Дата">
              <Input value={formDate} onChange={(event) => setFormDate(event.currentTarget.value)} type="date" />
            </Field>
            <Field label="Сумма">
              <Input
                value={amount}
                onChange={(event) => {
                  setAmount(event.currentTarget.value);
                  setError(null);
                }}
                inputMode="decimal"
                placeholder="Например, 500"
                autoFocus
              />
            </Field>
            <Field label="Что записать">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: "0.5px solid var(--ink-80)" }}>
                {([
                  ["own", "Свои"],
                  ["credit", "В долг"],
                  ["credit-payment", "Погасить долг"]
                ] as Array<[QuickExpenseMode, string]>).map(([value, label], index) => {
                  const selected = mode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setMode(value);
                        setError(null);
                      }}
                      className="tap-highlight"
                      style={{
                        minHeight: 34,
                        border: "none",
                        borderLeft: index === 0 ? "none" : "0.5px solid var(--ink-80)",
                        background: selected ? "var(--ink)" : "transparent",
                        color: selected ? "var(--paper)" : "var(--ink-55)",
                        cursor: "pointer",
                        fontFamily: "inherit"
                      }}
                    >
                      <span className="slab" style={{ fontSize: 7.8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
            {(mode === "credit" || mode === "credit-payment") && (
              <Field label={mode === "credit-payment" ? "Какой долг погасить" : "Какой долг увеличить"}>
                {activeCredits.length > 0 ? (
                  <select
                    value={creditId}
                    onChange={(event) => {
                      setCreditId(event.currentTarget.value);
                      setError(null);
                    }}
                    required
                    style={{
                      width: "100%",
                      minHeight: 34,
                      border: "0.5px solid var(--ink-55)",
                      borderRadius: 0,
                      background: "var(--paper)",
                      color: "var(--ink)",
                      padding: "0 6px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10
                    }}
                  >
                    {activeCredits.map((credit) => (
                      <option key={credit.id} value={credit.id}>
                        {credit.title} · долг {formatMoney(creditBalance(credit, creditEvents))} ₽
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mono" style={{ fontSize: 9, color: "var(--red)", lineHeight: 1.45 }}>
                    Нет активных долговых обязательств. Сначала добавьте долг на вкладке «Цикл».
                  </div>
                )}
                {mode === "credit-payment" && activeCredits.length > 0 && (
                  <div className="mono" style={{ marginTop: 4, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
                    Погашение уменьшит оперативный остаток и долг.
                  </div>
                )}
              </Field>
            )}
            <Field label="Комментарий">
              <Textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} placeholder="Необязательно" />
            </Field>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
              Свои расходы: {formatMoney(quickSpent)} ₽. Расходы в долг: {formatMoney(creditSpent)} ₽.
              {creditPaid > 0 ? ` Погашение долга: ${formatMoney(creditPaid)} ₽.` : ""}
              {check?.eveningBalance !== undefined
                ? " Ручной вечерний остаток уже остаётся источником правды."
                : mode === "credit"
                  ? " Расход в долг обновит факт дня и долг, но не изменит остаток своих денег."
                  : mode === "credit-payment"
                    ? " Погашение долга уменьшит остаток своих денег и расчётный вечер."
                    : " Если вечерний остаток не внесён, МФМ покажет расчётный вечер."}
            </div>
            {error && (
              <div className="mono" style={{ fontSize: 9, color: "var(--red)", lineHeight: 1.45 }}>
                {error}
              </div>
            )}
          </DialogBody>
          <button
            type="submit"
            className="tap-highlight slab"
            style={{
              width: "100%",
              padding: "13px 14px",
              background: "var(--ink)",
              color: "var(--paper)",
              border: "none",
              borderTop: "1px solid var(--ink)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase"
            }}
          >
            Записать
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}
