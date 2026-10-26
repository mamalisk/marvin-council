"use client";
import {createContext, useContext, useEffect, useState, type ReactNode} from "react";
export type UserIdentity = {id: string; login: string; name: string};
type AuthState = {ready: boolean; mode: "demo" | "github"; user: UserIdentity | null; error?: string};
const Context = createContext<AuthState>({ready: false, mode: "github", user: null});
export function AuthProvider({children}: {children: ReactNode}) {
  const [auth, setAuth] = useState<AuthState>({ready: false, mode: "github", user: null});
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", {cache: "no-store"}).then(async response => {
      const data = await response.json();
      if (live) setAuth({ready: true, mode: data.mode === "demo" ? "demo" : "github", user: response.ok ? data.user : null, error: data.error});
    }).catch(() => { if (live) setAuth({ready: true, mode: "github", user: null, error: "Could not check your session."}); });
    return () => {live = false;};
  }, []);
  return <Context.Provider value={auth}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
