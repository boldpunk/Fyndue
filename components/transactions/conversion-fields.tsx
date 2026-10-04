"use client";
import { MoneyInput } from "@/components/finance/money-input";
import type { AccountOption } from "@/components/transactions/types";
import { Field } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/input";
import { convertViaUzs } from "@/lib/finance/fx";
import { formatMoney, money, parseMoneyInput, toMoneyString } from "@/lib/finance/money";

export type ConversionValues = { counterpartAccountId: string; counterpartAmount: string };

/**
 * The other side of a conversion or transfer: which account the money came
 * from (IN) or went to (OUT), and how much it was in that account's currency,
 * with the Central Bank estimate one click away and the resulting rate shown.
 */
export function ConversionFields({
  accounts,
  currency,
  amount,
  direction,
  fxRates,
  value,
  onChange,
  errors = {},
}: {
  /** Other accounts (this one excluded). */
  accounts: AccountOption[];
  /** This account's currency and the amount that arrived/left here. */
  currency: string;
  amount: string;
  direction: "IN" | "OUT";
  fxRates: Record<string, string>;
  value: ConversionValues;
  onChange: (value: ConversionValues) => void;
  errors?: Partial<Record<keyof ConversionValues, string>>;
}) {
  const other = accounts.find((a) => a.id === value.counterpartAccountId);
  const cross = other && other.currency !== currency;
  const suggestion = cross && money(amount).gt(0) ? convertViaUzs(amount, currency, other.currency, fxRates) : null;
  const typed = cross ? parseMoneyInput(value.counterpartAmount) : null;
  // Rate as "1 USD = 12 650 UZS": the foreign currency per sum, whichever side it is on.
  const rate =
    cross && typed && typed.gt(0) && money(amount).gt(0)
      ? currency === "UZS"
        ? { unit: other.currency, uzs: money(amount).div(typed) }
        : other.currency === "UZS"
          ? { unit: currency, uzs: typed.div(money(amount)) }
          : null
      : null;

  return (
    <div className="grid gap-4">
      <Field label={direction === "IN" ? "С какого счёта пришли деньги" : "На какой счёт ушли деньги"} htmlFor="conv-account" error={errors.counterpartAccountId}>
        <NativeSelect id="conv-account" value={value.counterpartAccountId} onChange={(e) => onChange({ counterpartAccountId: e.target.value, counterpartAmount: "" })}>
          <option value="">Выберите счёт</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {cross ? (
        <Field
          label={direction === "IN" ? `Сколько списалось с ${other.name}` : `Сколько пришло на ${other.name}`}
          htmlFor="conv-amount"
          error={errors.counterpartAmount}
          hint={
            <>
              {suggestion ? (
                <>
                  По курсу ЦБ ≈ {formatMoney(toMoneyString(suggestion), other.currency)}.{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => onChange({ ...value, counterpartAmount: formatMoney(toMoneyString(suggestion), "", { hideCurrency: true }) })}
                  >
                    Подставить
                  </button>{" "}
                </>
              ) : null}
              Банк меняет по своему курсу — лучше указать сумму из выписки.
              {rate ? <span className="block">Курс обмена: 1 {rate.unit} = {formatMoney(toMoneyString(rate.uzs), "UZS")}</span> : null}
            </>
          }
        >
          <MoneyInput id="conv-amount" currency={other.currency} value={value.counterpartAmount} onChange={(x) => onChange({ ...value, counterpartAmount: x })} />
        </Field>
      ) : null}
    </div>
  );
}
