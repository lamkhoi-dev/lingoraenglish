import { useServerFn } from "@tanstack/react-start";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getCurrentUser, signOut as signOutFn } from "@/lib/auth.functions";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  english_level: string;
  target_level: string;
  learning_goal: string;
  ui_language: string;
  streak_days: number;
  last_practice_on: string | null;
  practice_minutes: number;
  interface_language: string;
  english_only_mode: boolean;
};

type CurrentUser = { id: string; email: string };

type AuthValue = {
  user: CurrentUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const getCurrentUserFn = useServerFn(getCurrentUser);
  const signOutFnCall = useServerFn(signOutFn);

  const refresh = useCallback(async () => {
    const current = await getCurrentUserFn();
    if (!current) {
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setUser({ id: current.id, email: current.email });
    setProfile(current.profile);
    setIsAdmin(current.isAdmin);
    setLoading(false);
  }, [getCurrentUserFn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      profile,
      isAdmin,
      loading,
      refreshProfile: refresh,
      signOut: async () => {
        await signOutFnCall();
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
      },
    }),
    [user, profile, isAdmin, loading, refresh, signOutFnCall],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
