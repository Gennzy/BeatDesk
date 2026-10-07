"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";
import type { Platform } from "@/lib/platforms/registry";

type Props = {
  platform: Platform;
  busy?: boolean;
  onConnect: (platform: Platform, meta: Record<string, string>) => void;
};

/** Поля подключения площадки. Используется и в панели публикации, и в настройках связей. */
export function ConnectForm({ platform, busy = false, onConnect }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      {(platform.fields ?? []).map((field) => (
        <label key={field.key} className="flex flex-col gap-1.5">
          <span className="label text-paper">{field.label}</span>
          <Input
            scale="sm"
            value={values[field.key] ?? ""}
            onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
            className="mono"
          />
          {field.hint ? <span className="text-[11px] text-mute">{field.hint}</span> : null}
        </label>
      ))}

      <Button type="button" variant="ink" size="sm" disabled={busy} onClick={() => onConnect(platform, values)}>
        {busy ? t("publish.saving") : t("publish.connect")}
      </Button>
    </div>
  );
}
