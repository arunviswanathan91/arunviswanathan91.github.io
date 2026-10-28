import type { InputHTMLAttributes } from "react";
import { longDate } from "../../extended/lib/dates";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { type?: "date" | "datetime-local" };

/**
 * A date box with the chosen date written out underneath ("Wednesday, 8 April 2026").
 * The box itself shows the browser's numeric format, which a page cannot change.
 */
export function DateInput({ type = "date", ...props }: Props) {
  const words = typeof props.value === "string" ? longDate(props.value) : "";
  return (
    <span className="date-field">
      <input type={type} {...props} />
      {words && <small className="date-words" aria-hidden>{words}</small>}
    </span>
  );
}
