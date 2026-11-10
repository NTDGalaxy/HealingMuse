"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/** Offers the browser's install prompt when it has one, and manual instructions otherwise. */
export function InstallSection() {
  const t = useTranslations();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  return (
    <section className="panel settings-install" data-part="settings-install">
      <h2>{t("settings.install")}</h2>
      <p>{t("settings.installText")}</p>
      {install ? (
        <Button
          onClick={async () => {
            await install.prompt();
            await install.userChoice;
            setInstall(null);
          }}
        >
          {t("settings.installButton")}
        </Button>
      ) : (
        <p className="muted small">{t("settings.installManual")}</p>
      )}
    </section>
  );
}
