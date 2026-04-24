"use client";

import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { RotateCcw } from "lucide-react";
import { InfoHint, Panel, SectionTitle } from "@/components/mfm-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { todayISO } from "@/lib/dates";
import type { CalculationSettings, FinanceState, MandatoryPayment } from "@/lib/types";
import { formatMoney, numberFromInput } from "@/lib/utils";

interface SettingsScreenProps {
  state: FinanceState;
  setState: Dispatch<SetStateAction<FinanceState>>;
  onAddMandatoryPayment: (payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onReset: () => void;
}

interface SettingsDraft {
  settings: CalculationSettings;
  operationalBalance: number;
  savingsBalance: number;
}

export function SettingsScreen({
  state,
  setState,
  onAddMandatoryPayment,
  onReset
}: SettingsScreenProps) {
  const [draft, setDraft] = useState<SettingsDraft>(() => createSettingsDraft(state));
  const [dirty, setDirty] = useState(false);
  const hasChanges = !isSettingsDraftEqual(draft, state);

  useEffect(() => {
    if (!dirty) {
      setDraft(createSettingsDraft(state));
    }
  }, [dirty, state]);

  function updateDraft(updater: (previous: SettingsDraft) => SettingsDraft) {
    setDirty(true);
    setDraft(updater);
  }

  function updateSettingsDraft(patch: Partial<CalculationSettings>) {
    updateDraft((previous) => ({
      ...previous,
      settings: { ...previous.settings, ...patch }
    }));
  }

  function applyDraft() {
    if (!hasChanges) return;
    setState((previous) => {
      const settings = { ...draft.settings };
      return {
        ...previous,
        operationalBalance: draft.operationalBalance,
        settings,
        reserve: {
          ...previous.reserve,
          amount: settings.reserveAmount
        },
        savings: {
          ...previous.savings,
          balance: draft.savingsBalance
        }
      };
    });
    setDirty(false);
  }

  function cancelDraft() {
    setDraft(createSettingsDraft(state));
    setDirty(false);
  }

  function handleResetDemo() {
    onReset();
    setDirty(false);
  }

  function updateOperationalBalance(value: number) {
    updateDraft((previous) => ({ ...previous, operationalBalance: value }));
  }

  function updateSavingsBalance(value: number) {
    updateDraft((previous) => ({ ...previous, savingsBalance: Math.max(0, value) }));
  }

  function updateReserveAmount(value: number) {
    updateSettingsDraft({ reserveAmount: Math.max(0, value) });
  }

  function updatePurchasingPowerCoef(value: number) {
    updateSettingsDraft({ purchasingPowerCoef: Math.min(1, Math.max(0, value)) });
  }

  function updateRounding() {
    updateSettingsDraft({ rounding: draft.settings.rounding === "day" ? "hour" : "day" });
  }

  function updatePayday1(value: number) {
    updateSettingsDraft({ payday1: clampDay(value) });
  }

  function updatePayday2(value: number) {
    updateSettingsDraft({ payday2: clampDay(value) });
  }

  function updatePaycheck1(value: number) {
    updateSettingsDraft({ typicalPaycheck1: Math.max(0, value) });
  }

  function updatePaycheck2(value: number) {
    updateSettingsDraft({ typicalPaycheck2: Math.max(0, value) });
  }

  function updateIncludeToday(checked: boolean) {
    updateSettingsDraft({ includeTodayInDivisor: checked });
  }

  function updateAutoSubtractSavings(checked: boolean) {
    updateSettingsDraft({ autoSubtractPlannedSavings: checked });
  }

  function handleApplyClick() {
    applyDraft();
  }

  function handleCancelClick() {
    cancelDraft();
  }

  function handleResetClick() {
    handleResetDemo();
  }

  function paymentStatusLabel(status: MandatoryPayment["status"]) {
    const labels: Record<MandatoryPayment["status"], string> = {
      scheduled: "запланирован",
      paid: "оплачен",
      missed: "просрочен"
    };

    return labels[status];
  }

  function paymentRecurrenceLabel(recurrence: MandatoryPayment["recurrence"]) {
    return recurrence === "monthly" ? "ежемесячно" : "разово";
  }

  function draftNotice() {
    return hasChanges ? "Есть изменения. Расчёты обновятся после применения." : "Расчёты обновляются только после кнопки Применить.";
  }

  function applyDisabled() {
    return !hasChanges;
  }

  function cancelDisabled() {
    return !dirty && !hasChanges;
  }

  function getSettings() {
    return draft.settings;
  }

  function getOperationalBalance() {
    return draft.operationalBalance;
  }

  function getSavingsBalance() {
    return draft.savingsBalance;
  }

  function handleMandatorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "Обязательный платёж");
    const amount = numberFromInput(form.get("amount"));
    const dueDate = String(form.get("dueDate") || todayISO());
    if (amount <= 0) return;
    onAddMandatoryPayment({
      title,
      amount,
      dueDate,
      recurrence: form.get("recurrence") === "once" ? "once" : "monthly"
    });
    event.currentTarget.reset();
  }

  const settings = getSettings();

  return (
    <div className="grid gap-4">
      <SectionTitle title="Настройки" eyebrow="Даты, подушка и расчёт" />

      <Panel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Изменения настроек</div>
          <div className="slab text-lg uppercase leading-none">{hasChanges ? "Нужно применить" : "Настройки применены"}</div>
          <div className="mt-1 text-sm text-[var(--muted-ink)]">{draftNotice()}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={handleCancelClick} disabled={cancelDisabled()}>
            Отменить
          </Button>
          <Button variant="default" onClick={handleApplyClick} disabled={applyDisabled()}>
            Применить
          </Button>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-4">
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Даты зарплаты</div>
          <h2 className="slab text-lg uppercase leading-none">2 даты зарплаты</h2>
          <div className="mt-2 text-sm text-[var(--muted-ink)]">
            Эти суммы используются для расчёта цикла и при подтверждении зарплаты.
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="День 1-й зарплаты"
            min={1}
            max={31}
            value={settings.payday1}
            onChange={updatePayday1}
          />
          <NumberField
            label="День 2-й зарплаты"
            min={1}
            max={31}
            value={settings.payday2}
            onChange={updatePayday2}
          />
          <NumberField
            label="Сумма 1-й зарплаты"
            value={settings.typicalPaycheck1}
            onChange={updatePaycheck1}
          />
          <NumberField
            label="Сумма 2-й зарплаты"
            value={settings.typicalPaycheck2}
            onChange={updatePaycheck2}
          />
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-4">
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Деньги</div>
          <h2 className="slab text-lg uppercase leading-none">Остатки и коэффициент</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Оперативный остаток"
            info="Деньги в текущем контуре: карта, наличные или счёт для жизни до зарплаты."
            value={getOperationalBalance()}
            onChange={(value) => updateOperationalBalance(value)}
          />
          <NumberField
            label="Подушка"
            info="Защитный запас внутри расчёта. Он вычитается из свободного остатка до зарплаты."
            value={settings.reserveAmount}
            onChange={updateReserveAmount}
          />
          <NumberField
            label="Накопления"
            info="Отдельный контур денег на цели и будущее. Это не подушка текущего цикла."
            value={getSavingsBalance()}
            onChange={updateSavingsBalance}
          />
          <NumberField
            label="Коэффициент покупательной силы"
            step="0.01"
            min={0}
            max={1}
            value={settings.purchasingPowerCoef}
            onChange={updatePurchasingPowerCoef}
          />
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-4">
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Предпочтения расчёта</div>
          <h2 className="slab text-lg uppercase leading-none">Формулы MVP</h2>
        </div>
        <div className="grid gap-3">
          <SwitchRow
            label="Учитывать сегодня в делителе"
            description="Включено: remainingDays = max(1, nextPaycheckDate - today)."
            checked={settings.includeTodayInDivisor}
            onCheckedChange={updateIncludeToday}
          />
          <SwitchRow
            label="Автовычитать плановые переводы"
            description="Плановые переводы в накопления уменьшают доступно до зарплаты."
            checked={settings.autoSubtractPlannedSavings}
            onCheckedChange={updateAutoSubtractSavings}
          />
          <div className="grid gap-2 border-2 border-[var(--ink)] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <div className="text-sm font-black uppercase">Округление расчёта</div>
              <div className="text-xs text-[var(--muted-ink)]">В MVP используется дневной расчёт.</div>
            </div>
            <Button
              variant={settings.rounding === "day" ? "secondary" : "outline"}
              onClick={updateRounding}
            >
              {settings.rounding === "day" ? "День" : "Час"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-4">
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Обязательные платежи</div>
          <h2 className="slab text-lg uppercase leading-none">Шаблоны</h2>
        </div>
        <form className="grid gap-3 border-2 border-[var(--ink)] p-3" onSubmit={handleMandatorySubmit}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="payment-title">Название</Label>
              <Input id="payment-title" name="title" defaultValue="Обязательный платёж" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-amount">Сумма</Label>
              <Input id="payment-amount" name="amount" inputMode="decimal" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-date">Дата</Label>
              <Input id="payment-date" name="dueDate" type="date" defaultValue={todayISO()} required />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="payment-recurrence">Повтор</Label>
              <select
                id="payment-recurrence"
                name="recurrence"
                className="h-10 border-2 border-[var(--ink)] bg-[var(--paper)] px-3 text-sm"
                defaultValue="monthly"
              >
                <option value="monthly">Ежемесячно</option>
                <option value="once">Разово</option>
              </select>
            </div>
            <Button type="submit" variant="secondary">
              Добавить платёж
            </Button>
          </div>
        </form>

        <div className="mt-4 grid gap-2">
          {state.mandatoryPayments.map((payment) => (
            <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 border-b-2 border-dashed border-[var(--thin)] py-2 last:border-b-0">
              <div>
                <div className="slab text-sm uppercase">{payment.title}</div>
                <div className="text-xs text-[var(--muted-ink)]">
                  {payment.dueDate} · {paymentStatusLabel(payment.status)} · {paymentRecurrenceLabel(payment.recurrence)}
                </div>
              </div>
              <div className="slab text-sm uppercase">{formatMoney(payment.amount)} ₽</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Данные</div>
          <div className="text-sm text-[var(--muted-ink)]">
            Всё хранится локально в браузере. Банковские интеграции не подключены.
          </div>
        </div>
        <Button variant="danger" onClick={handleResetClick}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Сбросить демо
        </Button>
      </Panel>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "1",
  info
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: string;
  info?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className="inline-flex items-center gap-1">
        {label}
        {info ? <InfoHint text={info} /> : null}
      </Label>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value || 0))}
      />
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid gap-3 border-2 border-[var(--ink)] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="text-sm font-black uppercase">{label}</div>
        <div className="text-xs text-[var(--muted-ink)]">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function clampDay(value: number) {
  return Math.min(31, Math.max(1, Math.round(value || 1)));
}

function createSettingsDraft(state: FinanceState): SettingsDraft {
  return {
    settings: { ...state.settings },
    operationalBalance: state.operationalBalance,
    savingsBalance: state.savings.balance
  };
}

function isSettingsDraftEqual(draft: SettingsDraft, state: FinanceState) {
  const settings = draft.settings;
  const current = state.settings;

  return (
    draft.operationalBalance === state.operationalBalance &&
    draft.savingsBalance === state.savings.balance &&
    settings.payday1 === current.payday1 &&
    settings.payday2 === current.payday2 &&
    settings.typicalPaycheck1 === current.typicalPaycheck1 &&
    settings.typicalPaycheck2 === current.typicalPaycheck2 &&
    settings.reserveAmount === current.reserveAmount &&
    settings.purchasingPowerCoef === current.purchasingPowerCoef &&
    settings.rounding === current.rounding &&
    settings.includeTodayInDivisor === current.includeTodayInDivisor &&
    settings.autoSubtractPlannedSavings === current.autoSubtractPlannedSavings
  );
}
