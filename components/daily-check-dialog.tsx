"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import type { Credit, CreditEvent, DailyCheck, DailyCheckReason, ISODate } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

export type DailyCheckDialogMode = "morning-check" | "evening-check";

export interface DailyCheckPayload {
  date: ISODate;
  balance: number;
  creditId?: string;
  creditSpentAmount?: number;
  reason?: DailyCheckReason;
  note?: string;
}

interface DailyCheckDialogProps {
  open: boolean;
  mode: DailyCheckDialogMode | null;
  date: ISODate;
  check?: DailyCheck;
  plannedLimit: number;
  credits: Credit[];
  creditEvents: CreditEvent[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (mode: DailyCheckDialogMode, payload: DailyCheckPayload) => void;
}

const REASON_OPTIONS: Array<{ value: DailyCheckReason; label: string }> = [
  { value: "food", label: "Еда" },
  { value: "transport", label: "Транспорт" },
  { value: "family", label: "Семья" },
  { value: "health", label: "Здоровье" },
  { value: "work", label: "Работа" },
  { value: "force-majeure", label: "Форс-мажор" },
  { value: "extra", label: "Лишнее" },
  { value: "unknown", label: "Неясно" },
  { value: "other", label: "Другое" }
];

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

export function DailyCheckDialog({
  open,
  mode,
  date,
  check,
  plannedLimit,
  credits,
  creditEvents,
  onOpenChange,
  onSubmit
}: DailyCheckDialogProps) {
  const [formDate, setFormDate] = useState(date);
  const [balance, setBalance] = useState("");
  const [reason, setReason] = useState<DailyCheckReason>("unknown");
  const [note, setNote] = useState("");
  const [creditId, setCreditId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !mode) return;
    setFormDate(check?.date ?? date);
    const initialBalance =
      mode === "morning-check"
        ? check?.morningBalance
        : check?.eveningBalance ?? check?.morningBalance;
    setBalance(initialBalance === undefined ? "" : String(initialBalance));
    setReason(check?.reason ?? "unknown");
    setNote(check?.note ?? "");
    setCreditId(check?.creditId ?? "");
    setError(null);
  }, [check, date, mode, open]);

  if (!mode) return null;

  const isMorning = mode === "morning-check";
  const title = isMorning ? "Утренний остаток" : "Вечерний остаток";
  const description = isMorning
    ? "Зафиксируйте, сколько денег реально доступно утром. Это станет оперативным остатком."
    : "Зафиксируйте вечерний остаток. МФМ посчитает факт дня и отклонение от плана.";
  const parsedBalance = parseAmount(balance);
  const activeCredits = credits.filter((credit) => !credit.isClosed);
  const needsCredit = !isMorning && parsedBalance !== null && parsedBalance < 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(balance);
    if (amount === null || !mode) return;
    if (isMorning && amount < 0) {
      setError("Утренний оперативный остаток не может быть меньше нуля.");
      return;
    }
    if (!isMorning && amount < 0 && !creditId) return;
    onSubmit(mode, {
      date: formDate,
      balance: amount,
      creditId: !isMorning && amount < 0 ? creditId : undefined,
      creditSpentAmount: !isMorning && amount < 0 ? Math.abs(amount) : undefined,
      reason: isMorning ? undefined : reason,
      note: note.trim() || undefined
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <Field label="Дата">
              <Input value={formDate} onChange={(event) => setFormDate(event.currentTarget.value)} type="date" />
            </Field>
            <Field label="Остаток">
              <Input
                value={balance}
                onChange={(event) => {
                  setBalance(event.currentTarget.value);
                  setError(null);
                }}
                inputMode="decimal"
                placeholder="Например, 42300"
              />
            </Field>
            {!isMorning && (
              <Field label="Причина отклонения">
                <select
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value as DailyCheckReason)}
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
                  {REASON_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {needsCredit && (
              <Field label="Кредитная карта">
                {activeCredits.length > 0 ? (
                  <select
                    value={creditId}
                    onChange={(event) => setCreditId(event.currentTarget.value)}
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
                    <option value="">Выберите карту</option>
                    {activeCredits.map((credit) => (
                      <option key={credit.id} value={credit.id}>
                        {credit.title} · долг {formatMoney(creditBalance(credit, creditEvents))} ₽
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mono" style={{ fontSize: 9, color: "var(--red)", lineHeight: 1.45 }}>
                    Нет активных кредитных карт. Сначала добавьте кредит на вкладке «Цикл».
                  </div>
                )}
                <div className="mono" style={{ marginTop: 4, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
                  Отрицательный вечерний остаток будет сохранён как факт дня. Оперативный остаток станет 0, а долг по
                  выбранной карте увеличится на {formatMoney(Math.abs(parsedBalance ?? 0))} ₽.
                </div>
              </Field>
            )}
            <Field label="Комментарий">
              <Textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} placeholder="Необязательно" />
            </Field>
            {error && (
              <div className="mono" style={{ fontSize: 9, color: "var(--red)", lineHeight: 1.45 }}>
                {error}
              </div>
            )}
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
              План дня: {formatMoney(Math.round(check?.plannedLimit ?? plannedLimit))} ₽. Обязательные платежи не
              наказывают дневной лимит, если они уже учтены в цикле.
            </div>
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
            Сохранить
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
