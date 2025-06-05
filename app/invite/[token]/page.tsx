"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import MaxWidthWrapper from "@/components/max-width-wrapper"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import Link from "next/link"

interface Invitation {
  id: string
  group_id: string
  group_name: string
  email: string
  invited_by: string
  expires_at: string
  used: boolean
}

export default function InvitePage() {
  const params = useParams()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (params.token) {
      fetchInvitation()
    }
  }, [params.token])

  const fetchInvitation = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log("=== FETCHING INVITATION ===")
      console.log("Token:", params.token)

      // Query directly from group_invitations table
      const { data, error } = await supabase.from("group_invitations").select("*").eq("token", params.token).single()

      console.log("Raw Supabase response:", { data, error })

      if (error) {
        console.error("Supabase error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        setError("Invitation not found or invalid. Please check the link.")
        return
      }

      if (!data) {
        console.log("No data returned")
        setError("Invitation not found.")
        return
      }

      console.log("Invitation data:", data)

      // Check if invitation is valid
      if (data.used) {
        setError("This invitation has already been used.")
        return
      }

      if (new Date(data.expires_at) < new Date()) {
        setError("This invitation has expired.")
        return
      }

      setInvitation(data)
      console.log("Invitation loaded successfully")
    } catch (error) {
      console.error("Unexpected error:", error)
      setError("An unexpected error occurred while loading the invitation.")
    } finally {
      setLoading(false)
    }
  }

  const ensureUserProfile = async () => {
    if (!user) {
      console.log("No user found")
      return false
    }

    try {
      console.log("=== ENSURING USER PROFILE ===")
      console.log("User ID:", user.id)
      console.log("User email:", user.email)

      // Check if profile exists
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle()

      console.log("Profile check result:", { existingProfile, profileCheckError })

      if (profileCheckError) {
        console.error("Error checking profile:", profileCheckError)
        return false
      }

      if (!existingProfile) {
        console.log("Creating new profile...")

        const profileData = {
          id: user.id,
          name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
          email: user.email!,
        }

        console.log("Profile data to insert:", profileData)

        // Use upsert instead of insert
        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .upsert(profileData, { onConflict: "id" })
          .select()
          .single()

        console.log("Profile creation result:", { newProfile, createError })

        if (createError) {
          // If it's a duplicate key error, the profile was created in a race condition
          if (createError.code === "23505") {
            console.log("Profile already exists (race condition), continuing...")
            return true
          }

          console.error("Failed to create profile:", createError)
          throw new Error(`Failed to create user profile: ${createError.message}`)
        }

        console.log("Profile created successfully")
      } else {
        console.log("Profile already exists")
      }

      return true
    } catch (error) {
      console.error("Error in ensureUserProfile:", error)
      return false
    }
  }

  const acceptInvitation = async () => {
    if (!invitation || !user) {
      toast({
        title: "Error",
        description: "Please sign in to accept this invitation",
        variant: "destructive",
      })
      return
    }

    setAccepting(true)

    try {
      console.log("=== ACCEPTING INVITATION ===")
      console.log("Invitation ID:", invitation.id)
      console.log("Group ID:", invitation.group_id)
      console.log("User ID:", user.id)

      // Step 1: Ensure user profile exists
      const profileCreated = await ensureUserProfile()
      if (!profileCreated) {
        throw new Error("Failed to create or verify user profile")
      }

      // Step 2: Check if user is already a member
      const { data: existingMember, error: memberCheckError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", invitation.group_id)
        .eq("user_id", user.id)
        .single()

      console.log("Member check result:", { existingMember, memberCheckError })

      if (existingMember) {
        console.log("User is already a member")
        toast({
          title: "Already a Member",
          description: "You're already a member of this group!",
        })

        // Mark invitation as used
        await supabase.from("group_invitations").update({ used: true }).eq("id", invitation.id)

        router.push(`/groups/${invitation.group_id}`)
        return
      }

      // Step 3: Add user to group
      console.log("Adding user to group...")

      const memberData = {
        group_id: invitation.group_id,
        user_id: user.id,
        role: "member",
      }

      console.log("Member data to insert:", memberData)

      const { data: newMember, error: memberError } = await supabase
        .from("group_members")
        .insert(memberData)
        .select()
        .single()

      console.log("Member creation result:", { newMember, memberError })

      if (memberError) {
        console.error("Failed to add member:", memberError)
        throw new Error(`Failed to join group: ${memberError.message}`)
      }

      console.log("Successfully added to group")

      // Step 4: Mark invitation as used
      const { error: updateError } = await supabase
        .from("group_invitations")
        .update({ used: true })
        .eq("id", invitation.id)

      if (updateError) {
        console.error("Failed to mark invitation as used:", updateError)
      }

      // Step 5: Create notification
      const { error: notificationError } = await supabase.from("notifications").insert({
        user_id: user.id,
        type: "group_joined",
        title: "Welcome to the group!",
        message: `You've successfully joined "${invitation.group_name}"`,
        data: { group_id: invitation.group_id },
      })

      if (notificationError) {
        console.error("Failed to create notification:", notificationError)
      }

      toast({
        title: "Success!",
        description: `You've successfully joined "${invitation.group_name}"`,
      })

      console.log("Redirecting to group page...")
      router.push(`/groups/${invitation.group_id}`)
    } catch (error: any) {
      console.error("Error accepting invitation:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to accept invitation. Please try again.",
        variant: "destructive",
      })
    } finally {
      setAccepting(false)
    }
  }

  // Debug information
  console.log("=== COMPONENT STATE ===")
  console.log("Auth loading:", authLoading)
  console.log("Page loading:", loading)
  console.log("User:", user?.id)
  console.log("Invitation:", invitation?.id)
  console.log("Error:", error)

  if (authLoading || loading) {
    return (
      <MaxWidthWrapper className="py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading invitation...</div>
        </div>
      </MaxWidthWrapper>
    )
  }

  if (error || !invitation) {
    return (
      <MaxWidthWrapper className="py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Invitation Issue</CardTitle>
            <CardDescription>{error || "This invitation link is invalid."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>Possible reasons:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>The invitation link is invalid or malformed</li>
                <li>The invitation has already been used</li>
                <li>The invitation has expired</li>
                <li>There was a database connection issue</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Button onClick={fetchInvitation} variant="outline" className="w-full">
                Try Again
              </Button>
              <Link href="/dashboard">
                <Button className="w-full">Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </MaxWidthWrapper>
    )
  }

  return (
    <MaxWidthWrapper className="py-8">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Group Invitation</CardTitle>
          <CardDescription>You've been invited to join "{invitation.group_name}"</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <h3 className="font-semibold text-lg">{invitation.group_name}</h3>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>Invited by:</strong> {invitation.invited_by}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Invitation expires:</strong> {new Date(invitation.expires_at).toLocaleDateString()}
            </p>
          </div>

          {user ? (
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Signed in as:</p>
                <p className="font-medium">{user.user_metadata?.name || user.email}</p>
              </div>
              <Button onClick={acceptInvitation} disabled={accepting} className="w-full" size="lg">
                {accepting ? "Joining Group..." : "Accept Invitation & Join Group"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                You need to sign in to accept this invitation.
              </p>
              <div className="space-y-2">
                <Link href={`/login?redirect=/invite/${params.token}`}>
                  <Button className="w-full" size="lg">
                    Sign In to Accept
                  </Button>
                </Link>
                <Link href={`/signup?redirect=/invite/${params.token}`}>
                  <Button variant="outline" className="w-full" size="lg">
                    Create Account & Accept
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </MaxWidthWrapper>
  )
}
