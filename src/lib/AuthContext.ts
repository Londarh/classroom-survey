import type { Session } from '@supabase/supabase-js'
import { createContext } from 'react'

export interface AuthContextValue {
  /** The current login, or null when logged out. */
  session: Session | null
  /** True until the stored login (if any) has been checked on page load. */
  loading: boolean
  /** Throws a Supabase auth error if the email or password is wrong. */
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
