import type { ReactNode } from "react";

const fieldClass =
  "w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60";

export const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
      {label}
    </span>
    {children}
    {hint ? <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">{hint}</span> : null}
  </label>
);

export const TextInput = (props: {
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
}) => (
  <input
    name={props.name}
    type={props.type ?? "text"}
    step={props.step}
    required={props.required}
    placeholder={props.placeholder}
    defaultValue={props.defaultValue ?? ""}
    className={fieldClass}
  />
);

export const TextArea = (props: {
  name: string;
  defaultValue?: string | null;
  rows?: number;
  placeholder?: string;
  required?: boolean;
}) => (
  <textarea
    name={props.name}
    rows={props.rows ?? 4}
    required={props.required}
    placeholder={props.placeholder}
    defaultValue={props.defaultValue ?? ""}
    className={`${fieldClass} font-mono`}
  />
);

export const Select = (props: {
  name: string;
  options: readonly string[];
  defaultValue?: string;
  labelFor?: (value: string) => string;
}) => (
  <select name={props.name} defaultValue={props.defaultValue} className={fieldClass}>
    {props.options.map((option) => (
      <option key={option} value={option}>
        {props.labelFor ? props.labelFor(option) : option}
      </option>
    ))}
  </select>
);

export const CheckboxRow = (props: {
  name: string;
  options: readonly string[];
  selected: readonly string[];
  labelFor?: (value: string) => string;
}) => (
  <div className="flex flex-wrap gap-3">
    {props.options.map((option) => (
      <label key={option} className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input
          type="checkbox"
          name={props.name}
          value={option}
          defaultChecked={props.selected.includes(option)}
          className="h-4 w-4"
        />
        {props.labelFor ? props.labelFor(option) : option}
      </label>
    ))}
  </div>
);

export const Toggle = (props: { name: string; label: string; defaultChecked: boolean }) => (
  <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
    <input type="checkbox" name={props.name} defaultChecked={props.defaultChecked} className="h-4 w-4" />
    {props.label}
  </label>
);

export const FormError = ({ message }: { message: string | null }) =>
  message === null ? null : (
    <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      <pre className="whitespace-pre-wrap font-sans">{message}</pre>
    </div>
  );

export const SubmitButton = ({ children }: { children: ReactNode }) => (
  <button
    type="submit"
    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
  >
    {children}
  </button>
);
