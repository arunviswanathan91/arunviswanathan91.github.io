import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.ts";
import { CHANGED } from "../../lib/db.ts";
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

export function useLoans(): LoansData {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [c, l, p, t] = await Promise.all([
      supabase.from("contacts").select("id,name,phone,email,notes").order("name"),
      supabase.from("loans").select("id,contact_id,direction,amount,currency,issued_on,due_on,note,account_type,account_name,card_last4,credit_limit,minimum_due,emi_amount,emi_first_on,emi_tenure,emi_schedule,interest_rate,statement_amount,statement_on,statement_due_on").order("issued_on", { ascending: false }),
      supabase.from("loan_payments").select("id,loan_id,amount,paid_on,note").order("paid_on"),
      supabase.from("transactions").select("id,loan_id,kind,description,amount,occurred_on").not("loan_id", "is", null).order("occurred_on", { ascending: false }),
    ]);
    const err = c.error ?? l.error ?? p.error ?? t.error;
    setError(err ? err.message : "");
    if (!err) {
      setContacts(c.data as Contact[]);
      const num = (v: unknown) => (v == null ? null : Number(v));
      const cardCharges = (t.data as Charge[]).map((x) => ({ ...x, amount: Number(x.amount) }));
      const charged = chargedByLoan(cardCharges);
      setCharges(cardCharges);
      setLoans((l.data as Loan[]).map((x) => ({
        ...x,
        amount: Number(x.amount),
        credit_limit: num(x.credit_limit),
        minimum_due: num(x.minimum_due),
        emi_amount: num(x.emi_amount),
        emi_tenure: num(x.emi_tenure),
        emi_schedule: Array.isArray(x.emi_schedule) && x.emi_schedule.length ? x.emi_schedule.map((e) => ({ on: e.on, amount: Number(e.amount) })) : null,
        interest_rate: num(x.interest_rate),
        statement_amount: num(x.statement_amount),
        charged: charged[x.id] ?? 0,
      })));
      setPayments((p.data as Payment[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    // Card spending is entered from the budget too; reload when any workspace record changes.
    const on = () => void reload();
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, [reload]);

  return { contacts, loans, payments, charges, loading, error, reload };
}

