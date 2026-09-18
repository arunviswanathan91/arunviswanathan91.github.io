import type { SelectOption } from "../components/ui/SelectMenu";

// Modern browsers expose the complete ISO-4217 list. The fallback keeps the
// selector useful on older engines without tying currency to residence.
const FALLBACK_CODES = [
 "AED", "AUD", "BDT", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR",
 "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "JPY", "KRW", "LKR", "MXN",
 "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SAR", "SEK", "SGD", "THB",
 "TRY", "TWD", "USD", "VND", "ZAR",
] as const;

const supportedValuesOf = (Intl as typeof Intl & {
 supportedValuesOf?: (key: "currency") => string[];
}).supportedValuesOf;

const names = typeof Intl.DisplayNames === "function"
 ? new Intl.DisplayNames(undefined, { type: "currency" }) : null;

const codes = [...new Set((supportedValuesOf?.("currency") ?? [...FALLBACK_CODES])
 .map(code => code.toUpperCase()).filter(code => /^[A-Z]{3}$/.test(code)))];

export const CURRENCY_OPTIONS: readonly SelectOption[] = codes
 .map(value => ({ value, label: `${value} — ${names?.of(value) ?? value}` }))
 .sort((a, b) => a.value === "INR" ? -1 : b.value === "INR" ? 1 : a.label.localeCompare(b.label));

