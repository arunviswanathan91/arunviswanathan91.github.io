import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.ts";
import { CHANGED, changedGroups } from "../../lib/db.ts";
import { affects, peek, put } from "../../lib/pageCache.ts";
import { chargedByLoan, type Charge, type Contact, type Loan, type Payment } from "./balance.ts";

export interface LoansData {
  contacts: Contact[];
  loans: Loan[];
  payments: Payment[];
  /** Card spending recorded in the budget. */
  charges: Charge[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

// Last loaded data, shared by every page that shows loans (Loans, Home, Budget)
// and saved with the other pages (pageCache.ts), so the figures draw at once.
type Snapshot = { contacts: Contact[]; loans: Loan[]; payments: Payment[]; charges: Charge[] };
const KEY = "hook:useLoans";
const MONEY = new Set(["money"]);

export function useLoans(): LoansData {
  const cached = peek(KEY) as Snapshot | undefined;
  const [contacts, setContacts] = useState<Contact[]>(() => cached?.contacts ?? []);
  const [loans, setLoans] = useState<Loan[]>(() => cached?.loans ?? []);
  const [payments, setPayments] = useState<Payment[]>(() => cached?.payments ?? []);
  const [charges, setCharges] = useState<Charge[]>(() => cached?.charges ?? []);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [c, l, p, t] = await Promise.all([
      supabase.from("contacts").select("id,name,phone,email,notes").order("name"),
      supabase.from("loans").select("*").order("issued_on", { ascending: false }),
      supabase.from("loan_payments").select("*").order("paid_on"),
      supabase.from("transactions").select("id,loan_id,kind,description,amount,occurred_on,category_id,for_contact_id").not("loan_id", "is", null).order("occurred_on", { ascending: false }),
    ]);
    const err = c.error ?? l.error ?? p.error ?? t.error;
    setError(err ? err.message : "");
    if (!err) {
      const nextContacts = c.data as Contact[];
      setContacts(nextContacts);
      const num = (v: unknown) => (v == null ? null : Number(v));
      const cardCharges = (t.data as Charge[]).map((x) => ({ ...x, amount: Number(x.amount) }));
      const charged = chargedByLoan(cardCharges);
      setCharges(cardCharges);
      const nextLoans = (l.data as Loan[]).map((x) => ({
        ...x,
        amount: Number(x.amount),
        credit_limit: num(x.credit_limit),
        minimum_due: num(x.minimum_due),
        emi_amount: num(x.emi_amount),
        emi_tenure: num(x.emi_tenure),
        emi_schedule: Array.isArray(x.emi_schedule) && x.emi_schedule.length ? x.emi_schedule.map((e) => ({ on: e.on, amount: Number(e.amount) })) : null,
        interest_rate: num(x.interest_rate),
        draws: Array.isArray(x.draws) && x.draws.length ? x.draws.map((d) => ({ on: d.on, amount: Number(d.amount), note: d.note ?? null })) : null,
        statement_amount: num(x.statement_amount),
        charged: charged[x.id] ?? 0,
      }));
      const nextPayments = (p.data as Payment[]).map((x) => ({ ...x, amount: Number(x.amount) }));
      setLoans(nextLoans);
      setPayments(nextPayments);
      put(KEY, { contacts: nextContacts, loans: nextLoans, payments: nextPayments, charges: cardCharges } satisfies Snapshot);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    // Card spending is entered from the budget too; reload after any money-related save.
    const on = (e: Event) => { if (affects(MONEY, changedGroups(e))) void reload(); };
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, [reload]);

  return { contacts, loans, payments, charges, loading, error, reload };
}

