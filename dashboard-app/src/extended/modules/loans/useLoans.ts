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
      supabase.from("loans").select("id,contact_id,direction,amount,currency,issued_on,due_on,note").order("issued_on", { ascending: false }),
      supabase.from("loan_payments").select("id,loan_id,amount,paid_on,note").order("paid_on"),
    ]);
    const err = c.error ?? l.error ?? p.error;
    setError(err ? err.message : "");
    if (!err) {
      setContacts(c.data as Contact[]);
      setLoans((l.data as Loan[]).map((x) => ({ ...x, amount: Number(x.amount) })));
      setPayments((p.data as Payment[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { contacts, loans, payments, loading, error, reload };
}

