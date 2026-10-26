import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.ts";
import type { Contact, Loan, Payment } from "./balance.ts";

export interface LoansData {
  contacts: Contact[];
  loans: Loan[];
  payments: Payment[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

export function useLoans(): LoansData {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [c, l, p] = await Promise.all([
      supabase.from("contacts").select("id,name,phone,email,notes").order("name"),
      supabase.from("loans").select("id,contact_id,direction,amount,currency,issued_on,due_on,note,account_type,account_name,card_last4,credit_limit,minimum_due,emi_amount,emi_first_on,emi_tenure,interest_rate,statement_amount,statement_on,statement_due_on").order("issued_on", { ascending: false }),
      supabase.from("loan_payments").select("id,loan_id,amount,paid_on,note").order("paid_on"),
    ]);
    const err = c.error ?? l.error ?? p.error;
    setError(err ? err.message : "");
    if (!err) {
      setContacts(c.data as Contact[]);
      const num = (v: unknown) => (v == null ? null : Number(v));
      setLoans((l.data as Loan[]).map((x) => ({
        ...x,
        amount: Number(x.amount),
        credit_limit: num(x.credit_limit),
        minimum_due: num(x.minimum_due),
        emi_amount: num(x.emi_amount),
        emi_tenure: num(x.emi_tenure),
        interest_rate: num(x.interest_rate),
        statement_amount: num(x.statement_amount),
      })));
      setPayments((p.data as Payment[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { contacts, loans, payments, loading, error, reload };
}

