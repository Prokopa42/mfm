"use client";

import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/dates";
import { CalculationSnapshot } from "@/lib/types";
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
}: {
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
}) {
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
      planned: form.get("planned") === "on",
      kind: form.get("kind") === "paycheck" ? "paycheck" : "other"
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor={`${title}-amount`}>Сумма</Label>
            <Input id={`${title}-amount`} name="amount" inputMode="decimal" autoFocus required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${title}-date`}>Дата</Label>
            <Input id={`${title}-date`} name="date" type="date" defaultValue={defaultDate} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${title}-title`}>Название</Label>
            <Input id={`${title}-title`} name="title" defaultValue={defaultTitle} />
          </div>
          {showIncomeKind ? (
            <div className="grid gap-2">
              <Label htmlFor={`${title}-kind`}>Тип дохода</Label>
              <select
                id={`${title}-kind`}
                name="kind"
                className="h-10 border-2 border-[var(--ink)] bg-[var(--paper)] px-3 text-sm"
                defaultValue="other"
              >
                <option value="other">Доход</option>
                <option value="paycheck">Зарплата</option>
              </select>
            </div>
          ) : null}
          {showPlanned ? (
            <label className="flex items-center gap-2 text-sm">
              <input name="planned" type="checkbox" className="h-4 w-4 accent-[var(--ink)]" />
              Плановый перевод
            </label>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor={`${title}-note`}>Комментарий</Label>
            <Textarea id={`${title}-note`} name="note" />
          </div>
          <Button type="submit" variant={title === "В накопления" ? "blue" : "default"}>
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
