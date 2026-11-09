"use client";
import { useTranslations } from "next-intl";
import { CloudRain, Cloud, CloudSun, SunMedium, Sun } from "lucide-react";

/** The five-step mood scale used by the check-ins before and after listening. */
export function MoodScores({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("mood");
  return (
    <fieldset className="mood-scores">
      <legend>{t("selectScore")}</legend>
      {[CloudRain, Cloud, CloudSun, SunMedium, Sun].map((Icon, index) => {
        const score = index + 1;
        return (
          <label key={score} className={score === value ? "selected" : ""}>
            <input
              type="radio"
              name="mood-score"
              value={score}
              checked={score === value}
              onChange={() => onChange(score)}
            />
            <span className="mood-symbol" aria-hidden="true">
              <Icon size={28} />
            </span>
            <span>{t(`score${score}`)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
