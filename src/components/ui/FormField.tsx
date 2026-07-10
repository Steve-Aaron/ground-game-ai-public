import { cn } from "@/lib/utils";

// Shared form-control primitives — one source for the field styling that was
// previously copy-pasted across every upload/manage form.

const FIELD_BASE =
  "bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5 placeholder:text-zinc-600";

const LABEL_CLASS = "block text-[0.5rem] uppercase tracking-wider text-zinc-500 mb-1";

interface WithLabel {
  /** Optional micro-label rendered above the control. */
  label?: string;
}

function Labelled({ label, children }: { label?: string; children: React.ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <label className="block">
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  label,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & WithLabel) {
  return (
    <Labelled label={label}>
      <input
        data-component="formField"
        data-field-kind={rest.type ?? "text"}
        className={cn("w-full", FIELD_BASE, className)}
        {...rest}
      />
    </Labelled>
  );
}

export function DateInput({
  label,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & WithLabel) {
  return (
    <Labelled label={label}>
      <input
        type="date"
        data-component="formField"
        data-field-kind="date"
        className={cn("w-full [color-scheme:dark]", FIELD_BASE, className)}
        {...rest}
      />
    </Labelled>
  );
}

export function Select({
  label,
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & WithLabel) {
  return (
    <Labelled label={label}>
      <select
        data-component="formField"
        data-field-kind="select"
        className={cn("w-full", FIELD_BASE, className)}
        {...rest}
      >
        {children}
      </select>
    </Labelled>
  );
}

export function TextArea({
  label,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & WithLabel) {
  return (
    <Labelled label={label}>
      <textarea
        data-component="formField"
        data-field-kind="textarea"
        className={cn("w-full", FIELD_BASE, className)}
        {...rest}
      />
    </Labelled>
  );
}

export function FileInput({
  label,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & WithLabel) {
  return (
    <Labelled label={label}>
      <input
        type="file"
        data-component="formField"
        data-field-kind="file"
        className={cn(
          "block w-full text-[0.611rem] text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:border-0 file:bg-muted file:text-foreground file:text-[0.611rem] file:uppercase file:tracking-wider hover:file:bg-muted/70",
          className
        )}
        {...rest}
      />
    </Labelled>
  );
}

/** Inline form error — renders nothing when message is empty. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p data-component="formError" className="text-[0.611rem] text-red-400">
      {message}
    </p>
  );
}
