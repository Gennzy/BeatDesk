"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { AuthPrompt } from "@/components/posts/auth-prompt";
import { usePathname } from "next/navigation";

type Action = "like" | "reply" | "post";

type ContextValue = {
  /** Показать плашку вместо действия, если человек не вошёл. */
  requireAuth: (action: Action, username?: string | null) => void;
  loggedIn: boolean;
};

const AuthPromptContext = createContext<ContextValue | null>(null);

export function AuthPromptProvider({ loggedIn, children }: { loggedIn: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [request, setRequest] = useState<{ action: Action; username?: string | null } | null>(null);

  const requireAuth = useCallback(
    (action: Action, username?: string | null) => {
      if (loggedIn) return;
      setRequest({ action, username });
    },
    [loggedIn],
  );

  const value = useMemo(() => ({ requireAuth, loggedIn }), [requireAuth, loggedIn]);

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      {request ? <AuthPrompt nextPath={pathname} username={request.username} action={request.action} /> : null}
    </AuthPromptContext.Provider>
  );
}

export function useAuthPrompt(): ContextValue {
  const context = useContext(AuthPromptContext);

  // Без провайдера ничего не ломаем: компоненты просто работают как раньше.
  return context ?? { requireAuth: () => undefined, loggedIn: true };
}
