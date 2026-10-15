"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Headphones, Heart, Pause, Play, Square, Waves } from "lucide-react";
import { modes, frequencies, presetId, type BinauralMode } from "@/lib/binaural/config";
import { clock } from "@/lib/audio";
import type { CatalogPage } from "@/lib/types";
import { useBinaural } from "./binaural-provider";
import { BinauralCatalogue } from "./binaural-catalogue";

export function BinauralPage({ initialCatalogue }: { initialCatalogue: CatalogPage }) {
  const t = useTranslations("binaural");
  const locale = useLocale();
  const session = useBinaural();
  const { initialize } = session;
  const [customDuration, setCustomDuration] = useState(false);
  const [durationError, setDurationError] = useState(false);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  const { config, state } = session;
  const hz = frequencies(config);
  const mode = modes[config.mode];
  const isPreset = (mode.presets as readonly number[]).includes(config.beatHz);
  const selectedPreset = presetId(config.mode, config.beatHz);
  const durationOptions = [5, 10, 15, 20, 30, 45, 60];
  const playing = state.status === "playing";
  const paused = state.status === "paused" || state.status === "interrupted";
  const busy = ["starting", "pausing", "stopping"].includes(state.status);
  const [durationDraft, setDurationDraft] = useState<{ seconds: number; text: string } | null>(
    null,
  );
  const durationText =
    durationDraft?.seconds === config.durationSeconds
      ? durationDraft.text
      : String(config.durationSeconds / 60);
  const volume = (key: "masterVolume" | "toneVolume" | "backgroundVolume", label: string) => (
    <label className="binaural-volume" htmlFor={`binaural-${key}`}>
      <span>
        {label}
        <output htmlFor={`binaural-${key}`}>{Math.round(config[key] * 100)}%</output>
      </span>
      <input
        id={`binaural-${key}`}
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(config[key] * 100)}
        onChange={(event) => session.update({ [key]: Number(event.target.value) / 100 })}
      />
    </label>
  );
  return (
    <div className={`binaural-page binaural-${config.mode}`}>
      <header className="page-heading binaural-heading">
        <span className="binaural-eyebrow">
          <Headphones size={18} aria-hidden="true" />
          {t("eyebrow")}
        </span>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </header>
      <noscript>
        <p className="info-panel">
          {t("noJavaScript")} <Link href={`/${locale}/explore`}>{t("ordinaryMusic")}</Link>
        </p>
      </noscript>
      <fieldset className="binaural-modes">
        <legend className="sr-only">{t("chooseMode")}</legend>
        {(Object.keys(modes) as BinauralMode[]).map((name) => (
          <label
            className={`binaural-mode mode-${name} ${config.mode === name ? "selected" : ""}`}
            key={name}
          >
            <input
              type="radio"
              name="binaural-mode"
              value={name}
              checked={config.mode === name}
              onChange={() => session.update({ mode: name, beatHz: modes[name].presets[1] })}
            />
            <span>
              <strong>{t(`modes.${name}.title`)}</strong>
              <small>
                {modes[name].min}-{modes[name].max} Hz
              </small>
              <span>{t(`modes.${name}.purpose`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <section
        className="binaural-player reading-surface"
        aria-labelledby="binaural-player-heading"
        data-state={state.status}
      >
        <div className="binaural-player-top">
          <div>
            <p className="binaural-eyebrow">{t("yourSession")}</p>
            <h2 id="binaural-player-heading">{t(`modes.${config.mode}.purpose`)}</h2>
          </div>
          <div className="binaural-visualizer" aria-hidden="true">
            <i />
            <i />
            <i />
            <Waves size={32} />
          </div>
        </div>
        <p className="binaural-state" role="status">
          {t(`states.${state.status}`)}
        </p>
        <div className="binaural-buttons">
          <button
            type="button"
            className="button"
            disabled={
              !session.ready || busy || (!playing && (session.backgroundLoading || durationError))
            }
            onClick={playing ? session.pause : session.start}
          >
            {playing ? (
              <Pause size={20} aria-hidden="true" />
            ) : (
              <Play size={20} aria-hidden="true" />
            )}
            {playing ? t("pause") : paused ? t("resume") : t("start")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              !["playing", "paused", "interrupted", "starting", "pausing"].includes(state.status)
            }
            onClick={session.stop}
          >
            <Square size={18} aria-hidden="true" />
            {t("stop")}
          </button>
        </div>
        <div className="binaural-preset-row">
          <label htmlFor="binaural-preset">
            {t("preset")}
            <select
              id="binaural-preset"
              value={isPreset ? config.beatHz : "custom"}
              onChange={(event) => {
                if (event.target.value !== "custom")
                  session.update({ beatHz: Number(event.target.value) });
              }}
            >
              {mode.presets.map((frequency, index) => (
                <option key={frequency} value={frequency}>
                  {t(`modes.${config.mode}.preset${index}`)} · {frequency} Hz
                </option>
              ))}
              {!isPreset && <option value="custom">{t("customFrequency")}</option>}
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={t("favoritePreset")}
            aria-pressed={session.favorites.includes(selectedPreset)}
            disabled={!isPreset}
            onClick={() => session.toggleFavorite(selectedPreset)}
          >
            <Heart
              size={22}
              fill={session.favorites.includes(selectedPreset) ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        </div>
        <dl className="binaural-frequencies">
          <div>
            <dt>{t("leftEar")}</dt>
            <dd>
              {hz.left} <small>Hz</small>
            </dd>
          </div>
          <div>
            <dt>{t("difference")}</dt>
            <dd>
              {hz.difference} <small>Hz</small>
            </dd>
          </div>
          <div>
            <dt>{t("rightEar")}</dt>
            <dd>
              {Number(hz.right.toFixed(1))} <small>Hz</small>
            </dd>
          </div>
        </dl>
        <div className="binaural-session-options">
          <label htmlFor="binaural-duration">
            {t("duration")}
            <select
              id="binaural-duration"
              value={
                customDuration || !durationOptions.includes(config.durationSeconds / 60)
                  ? "custom"
                  : config.durationSeconds / 60
              }
              onChange={(event) => {
                const custom = event.target.value === "custom";
                setCustomDuration(custom);
                setDurationError(false);
                setDurationDraft(null);
                if (!custom) session.update({ durationSeconds: Number(event.target.value) * 60 });
              }}
            >
              {durationOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("minutes", { minutes })}
                </option>
              ))}
              <option value="custom">{t("customDuration")}</option>
            </select>
          </label>
          {(customDuration || !durationOptions.includes(config.durationSeconds / 60)) && (
            <label htmlFor="binaural-custom-duration">
              {t("customMinutes")}
              <input
                id="binaural-custom-duration"
                type="number"
                min={1}
                max={120}
                step={1}
                value={durationText}
                aria-invalid={durationError}
                aria-describedby="binaural-duration-hint"
                onChange={(event) => {
                  const minutes = Number(event.target.value);
                  const invalid = !Number.isInteger(minutes) || minutes < 1 || minutes > 120;
                  setDurationDraft({
                    seconds: invalid ? config.durationSeconds : minutes * 60,
                    text: event.target.value,
                  });
                  setDurationError(invalid);
                  if (!invalid) session.update({ durationSeconds: minutes * 60 });
                }}
              />
              <small id="binaural-duration-hint">{t("durationHint")}</small>
            </label>
          )}
        </div>
        <div className="binaural-progress">
          <progress
            aria-label={t("progress")}
            max={config.durationSeconds}
            value={Math.min(config.durationSeconds, state.elapsedSeconds)}
          />
          <span>{t("remaining", { time: clock(Math.ceil(state.remainingSeconds)) })}</span>
        </div>
        {!session.ready && !session.engineUnavailable && <p role="status">{t("loadingEngine")}</p>}
        {session.engineUnavailable && (
          <div className="info-panel">
            <p role="alert">{t("engineError")}</p>
            <button className="text-button" type="button" onClick={() => void session.initialize()}>
              {t("retryEngine")}
            </button>{" "}
            <Link href={`/${locale}/explore`}>{t("ordinaryMusic")}</Link>
          </div>
        )}
        {session.backgroundLoading && (
          <div className="info-panel">
            <p role="status">{t("loadingMusic")}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => session.chooseBackground(null)}
            >
              {t("tonesOnly")}
            </button>
          </div>
        )}
        {durationError && <p role="alert">{t("durationHint")}</p>}
        {state.status === "unsupported" && (
          <p className="error" role="alert">
            {t("unsupported")} <Link href={`/${locale}/explore`}>{t("ordinaryMusic")}</Link>
          </p>
        )}
        {session.backgroundUnavailable && (
          <div className="info-panel" role="status">
            <p>{t("backgroundError")}</p>
            <button type="button" className="text-button" onClick={session.retryBackground}>
              {t("retryMusic")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => session.chooseBackground(null)}
            >
              {t("tonesOnly")}
            </button>
          </div>
        )}
        <div className="binaural-volumes">
          {volume("masterVolume", t("masterVolume"))}
          {volume("toneVolume", t("toneVolume"))}
          {volume("backgroundVolume", t("backgroundVolume"))}
        </div>
        <p className="binaural-headphone-note">
          <Headphones size={19} aria-hidden="true" />
          {t("headphones")}
        </p>
        <p className="small muted">{t("pausePolicy")}</p>
        <details className="binaural-advanced">
          <summary>{t("advanced")}</summary>
          <label className="binaural-volume" htmlFor="binaural-carrier">
            <span>
              {t("carrier")}
              <output htmlFor="binaural-carrier">{config.carrierHz} Hz</output>
            </span>
            <input
              id="binaural-carrier"
              type="range"
              min={100}
              max={500}
              step={1}
              value={config.carrierHz}
              onChange={(event) => session.update({ carrierHz: Number(event.target.value) })}
            />
          </label>
          <label className="binaural-volume" htmlFor="binaural-difference">
            <span>
              {t("difference")}
              <output htmlFor="binaural-difference">{config.beatHz} Hz</output>
            </span>
            <input
              id="binaural-difference"
              type="range"
              min={mode.min}
              max={mode.max}
              step={0.1}
              value={config.beatHz}
              onChange={(event) => session.update({ beatHz: Number(event.target.value) })}
            />
          </label>
          <p className="small muted">{t("frequencyExplanation")}</p>
        </details>
      </section>
      {session.favorites.length > 0 && (
        <section className="binaural-favorites" aria-label={t("favorites")}>
          <h2>{t("favorites")}</h2>
          <div>
            {session.favorites.map((id) => {
              const [name, value] = id.split(":");
              return (
                <button
                  type="button"
                  className="filter-chip"
                  key={id}
                  onClick={() =>
                    session.update({ mode: name as BinauralMode, beatHz: Number(value) })
                  }
                >
                  {t(`modes.${name}.title`)} · {value} Hz
                </button>
              );
            })}
          </div>
        </section>
      )}
      <BinauralCatalogue initial={initialCatalogue} />
      <section
        className="binaural-preferences reading-surface"
        aria-labelledby="binaural-preferences-heading"
      >
        <h2 id="binaural-preferences-heading">{t("preferences")}</h2>
        <label className="check-row">
          <input
            type="checkbox"
            checked={session.remember}
            onChange={(event) => session.setRemember(event.target.checked)}
          />
          {t("remember")}
        </label>
        <p className="small muted">{t("privacy")}</p>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setCustomDuration(false);
            setDurationError(false);
            setDurationDraft(null);
            session.reset();
          }}
        >
          {t("reset")}
        </button>
        {session.storageUnavailable && <p role="status">{t("storageUnavailable")}</p>}
      </section>
      <section
        className="binaural-education reading-surface"
        aria-labelledby="binaural-guide-heading"
      >
        <h2 id="binaural-guide-heading">{t("guideTitle")}</h2>
        <p>{t("explanation")}</p>
        <p>{t("research")}</p>
        <p className="small muted">{t("visualizerNote")}</p>
        <h3>{t("safetyTitle")}</h3>
        <ul>
          <li>{t("safetyVolume")}</li>
          <li>{t("safetyAttention")}</li>
          <li>{t("safetyDiscomfort")}</li>
          <li>{t("safetyAdvice")}</li>
        </ul>
        <p>{t("notTreatment")}</p>
        <div className="binaural-references">
          <a
            href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023"
            target="_blank"
            rel="noreferrer"
          >
            {t("researchReference")}
          </a>
          <a
            href="https://www.who.int/news-room/questions-and-answers/item/deafness-and-hearing-loss-safe-listening"
            target="_blank"
            rel="noreferrer"
          >
            {t("safetyReference")}
          </a>
        </div>
      </section>
    </div>
  );
}
