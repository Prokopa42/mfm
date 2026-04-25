"use client";

import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { SegControl } from "@/components/mfm-ui";
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
import type { CalculationSnapshot } from "@/lib/types";
import { formatMoney, numberFromInput } from "@/lib/utils";

export type ActionDialogKind = "expense" | "income" | "transfer" | "withdraw" | null;

export interface ActionPayload {
  amount: number;
  date: string;
  title?: string;
  note?: string;
  planned?: boolean;
  kind?: "paycheck" | "other";
}

interface ActionDialogsProps {
  active: ActionDialogKind;
  snapshot: CalculationSnapshot;
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
        open={active === "expense"}
        title="Записать расход"
        description={`Сейчас можно потратить сегодня: ${formatMoney(snapshot.safeToSpendToday)} ₽.`}
        defaultTitle="Расход"
        defaultDate={today}
        submitLabel="Записать расход"
        onOpenChange={(open) => onOpenChange(open ? "expense" : null)}
        onSubmit={(payload) => {
          onExpense(payload);
          close();
        }}
      />
      <MoneyDialog
        open={active === "income"}
        title="Записать доход"
        description="Ручной ввод дохода. Банковские интеграции в MVP не используются."
        defaultTitle="Доход"
        defaultDate={today}
        submitLabel="Записать доход"
        showIncomeKind
        onOpenChange={(open) => onOpenChange(open ? "income" : null)}
        onSubmit={(payload) => {
          onIncome(payload);
          close();
        }}
      />
      <MoneyDialog
        open={active === "transfer"}
        title="В накопления"
        description="Перевод уменьшает оперативный остаток и увеличивает накопления."
        defaultTitle="В накопления"
        defaultDate={today}
        submitLabel="В накопления"
        showPlanned
        onOpenChange={(open) => onOpenChange(open ? "transfer" : null)}
        onSubmit={(payload) => {
          onTransfer(payload);
          close();
        }}
      />
      <MoneyDialog
        open={active === "withdraw"}
        title="Снять с накоплений"
        description="Снятие переходит в оперативный остаток и видно в истории."
        defaultTitle="Причина"
        defaultDate={today}
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

type IncomeKind = "other" | "paycheck";

interface MoneyDialogProps {
  open: boolean;
  title: string;
  description: string;
  defaultTitle: string;
  defaultDate: string;
  submitLabel: string;
  showPlanned?: boolean;
  showIncomeKind?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ActionPayload) => void;
}

function MoneyDialog({
  open,
  title,
  description,
  defaultTitle,
  defaultDate,
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

  useEffect(() => {
    if (!open) {
      setPlanned(false);
      setIncomeKind("other");
    }
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = numberFromInput(form.get("amount"));
    if (amount <= 0) return;

    onSubmit({
      amount,
      date: String(form.get("date") || defaultDate),
      title: String(form.get("title") || defaultTitle),
      note: String(form.get("note") || ""),
      planned: showPlanned ? planned : undefined,
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
            <Field id={`${title}-title`} label="Название">
              <Input id={`${title}-title`} name="title" defaultValue={defaultTitle} />
            </Field>
            {showIncomeKind && (
              <Field id={`${title}-kind`} label="Тип дохода">
                <SegControl<IncomeKind>
                  value={incomeKind}
                  onChange={setIncomeKind}
                  options={[
                    { id: "other", label: "Доход" },
                    { id: "paycheck", label: "Зарплата" }
                  ]}
                />
              </Field>
            )}
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

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
