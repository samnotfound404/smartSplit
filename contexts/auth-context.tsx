"use client"
import { createContext, useEffect, useState } from "react"
import type React from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, name: string) => Promise<any>
  signIn: (email: string, password: string) => Promise<any>
  logout: () => Promise<void>
}

// Export the context
export const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (mounted) {
          if (error) {
            console.error("Error getting auth session:", error)
          } else if (data?.session) {
            setSession(data.session)
            setUser(data.session.user)
          }
          setLoading(false)
        }
      } catch (error) {
        console.error("Auth initialization error:", error)
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (mounted) {
        setSession(currentSession)
        setUser(currentSession?.user ?? null)
        setLoading(false)

        if (event === "SIGNED_OUT") {
          router.push("/")
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router])

const signUp = async (email: string, password: string, name: string) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name, // Ensure the key matches the one used in your trigger
        },
      },
    });

    if (error) throw error;

    // Optionally, create a profile immediately if the user is confirmed
    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          name: name,
          email: email,
        },
        { onConflict: "id" }
      );

      if (profileError) {
        console.error("Error creating profile:", profileError);
      }
    }

    return { data, error: null };
  } catch (error) {
    console.error("Sign up error:", error);
    return { data: null, error };
  }
};

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Ensure profile exists
      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle()

        if (!profile) {
          // Use upsert instead of insert
          await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              name: data.user.user_metadata?.name || data.user.email?.split("@")[0] || "User",
              email: data.user.email!,
            },
            {
              onConflict: "id",
            },
          )
        }
      }

      return { data, error: null }
    } catch (error) {
      console.error("Sign in error:", error)
      return { data: null, error }
    }
  }

  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
