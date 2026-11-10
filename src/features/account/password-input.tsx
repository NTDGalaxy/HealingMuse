"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  newPassword = false,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  newPassword?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-control">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={newPassword ? "new-password" : "password"}
          type={visible ? "text" : "password"}
          autoComplete={newPassword ? "new-password" : "current-password"}
          minLength={newPassword ? 15 : undefined}
          maxLength={newPassword ? 128 : undefined}
          required
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoCapitalize="none"
          spellCheck={false}
        />
        <button
          type="button"
          className="icon-button password-visibility"
          aria-label={t(visible ? "hidePassword" : "showPassword")}
          aria-pressed={visible}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
