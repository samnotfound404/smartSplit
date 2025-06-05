"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import MaxWidthWrapper from "@/components/max-width-wrapper"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Plus,
  Users,
  Bell,
  ExternalLink,
  RefreshCw,
  Crown,
  Calendar,
  Gift,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"

interface Group {
  id: string
  name: string
  description: string | null
  created_at: string
  member_count: number
}

interface PendingInvitation {
  id: string
  group_id: string
  group_name: string
  token: string
  invited_by: string
  expires_at: string
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [groups, setGroups] = useState<Group[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingInvitations, setLoadingInvitations] = useState(true)
  const [balanceSummary, setBalanceSummary] = useState({ owed: 0, owing: 0 })
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/dashboard")
    }
  }, [user, loading, router])

  // Only fetch data on first mount (when user becomes available)
  useEffect(() => {
    if (user && !hasLoadedOnce) {
      fetchUserData()
      setHasLoadedOnce(true)
    }
  }, [user, hasLoadedOnce])

  const ensureUserProfile = async () => {
    if (!user) return false

    try {
      console.log("=== ENSURING USER PROFILE ===")
      console.log("User ID:", user.id)

      const { data: existingProfile, error: profileCheckError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle()

      console.log("Profile check result:", { existingProfile, profileCheckError })

      if (profileCheckError) {
        console.error("Error checking profile:", profileCheckError)
        return false
      }

      if (!existingProfile) {
        console.log("Profile doesn't exist, creating...")

        const { error: upsertError } = await supabase.from("profiles").upsert(
          {
            id: user.id,
            name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
            email: user.email!,
          },
          {
            onConflict: "id",
          },
        )

        if (upsertError) {
          if (upsertError.code === "23505") {
            console.log("Profile already exists (race condition), continuing...")
            return true
          }

          console.error("Failed to create profile:", upsertError)
          return false
        }
      } else {
        console.log("Profile already exists")
      }

      return true
    } catch (error) {
      console.error("Error ensuring user profile:", error)
      return false
    }
  }

  const fetchUserData = async () => {
    if (!user) return

    try {
      console.log("=== FETCHING USER DATA ===")

      const profileExists = await ensureUserProfile()
      if (!profileExists) {
        console.error("Failed to ensure user profile exists")
        toast({
          title: "Profile Error",
          description: "There was an issue with your user profile. Please try refreshing the page.",
          variant: "destructive",
        })
        return
      }

      await Promise.all([fetchGroups(), fetchBalanceSummary(), fetchPendingInvitations()])
    } catch (error) {
      console.error("Error fetching user data:", error)
    }
  }

  const fetchPendingInvitations = async () => {
    if (!user) return

    try {
      setLoadingInvitations(true)
      console.log("=== FETCHING PENDING INVITATIONS ===")
      console.log("User email:", user.email)

      const { data, error } = await supabase
        .from("group_invitations")
        .select("*")
        .eq("email", user.email)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())

      console.log("Invitations query result:", { data, error })

      if (error) {
        console.error("Error fetching pending invitations:", error)
        setPendingInvitations([])
        return
      }

      setPendingInvitations(data || [])
      console.log("Pending invitations loaded:", data?.length || 0)
    } catch (error) {
      console.error("Error in fetchPendingInvitations:", error)
      setPendingInvitations([])
    } finally {
      setLoadingInvitations(false)
    }
  }

  const acceptInvitationQuick = async (invitation: PendingInvitation) => {
    if (!user) return

    try {
      console.log("=== QUICK ACCEPTING INVITATION ===")
      console.log("Invitation:", invitation.id)

      const profileExists = await ensureUserProfile()
      if (!profileExists) {
        throw new Error("Failed to create user profile")
      }

      const { data: existingMember, error: memberCheckError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", invitation.group_id)
        .eq("user_id", user.id)
        .single()

      console.log("Member check result:", { existingMember, memberCheckError })

      if (existingMember) {
        toast({
          title: "Already a Member",
          description: "You're already a member of this group!",
        })
        await supabase.from("group_invitations").update({ used: true }).eq("id", invitation.id)
        fetchPendingInvitations()
        fetchGroups()
        return
      }

      const { data: newMember, error: memberError } = await supabase
        .from("group_members")
        .insert({
          group_id: invitation.group_id,
          user_id: user.id,
          role: "member",
        })
        .select()
        .single()

      console.log("Member creation result:", { newMember, memberError })

      if (memberError) {
        console.error("Error adding member:", memberError)
        throw new Error("Failed to join group")
      }

      await supabase.from("group_invitations").update({ used: true }).eq("id", invitation.id)

      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "group_joined",
        title: "Welcome to the group!",
        message: `You've successfully joined "${invitation.group_name}"`,
        data: { group_id: invitation.group_id },
      })

      toast({
        title: "Success!",
        description: `You've joined "${invitation.group_name}"`,
      })

      fetchPendingInvitations()
      fetchGroups()
    } catch (error: any) {
      console.error("Error accepting invitation:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to accept invitation",
        variant: "destructive",
      })
    }
  }

  const fetchGroups = async () => {
    if (!user) return

    try {
      setLoadingGroups(true)
      console.log("=== FETCHING GROUPS ===")

      const { data: memberData, error: memberError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)

      console.log("Member data result:", { memberData, memberError })

      if (memberError) {
        console.error("Error fetching group memberships:", memberError)
        setGroups([])
        return
      }

      if (!memberData || memberData.length === 0) {
        console.log("No group memberships found")
        setGroups([])
        return
      }

      const groupIds = memberData.map((item) => item.group_id)
      console.log("Group IDs:", groupIds)

      const { data: groupsData, error: groupsError } = await supabase.from("groups").select("*").in("id", groupIds)

      console.log("Groups data result:", { groupsData, groupsError })

      if (groupsError) {
        console.error("Error fetching groups:", groupsError)
        setGroups([])
        return
      }

      if (!groupsData) {
        setGroups([])
        return
      }

      const groupsWithCounts = await Promise.all(
        groupsData.map(async (group) => {
          try {
            const { count } = await supabase
              .from("group_members")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id)

            return {
              ...group,
              member_count: count || 0,
            }
          } catch (error) {
            console.error(`Error getting member count for group ${group.id}:`, error)
            return {
              ...group,
              member_count: 0,
            }
          }
        }),
      )

      setGroups(groupsWithCounts)
      console.log("Groups loaded:", groupsWithCounts.length)
    } catch (error) {
      console.error("Error in fetchGroups:", error)
      setGroups([])
    } finally {
      setLoadingGroups(false)
    }
  }

  const fetchBalanceSummary = async () => {
    if (!user) return

    try {
      console.log("=== FETCHING BALANCE SUMMARY ===")

      const { data: paidExpenses, error: paidError } = await supabase
        .from("expenses")
        .select("amount")
        .eq("paid_by", user.id)

      const { data: expenseSplits, error: splitsError } = await supabase
        .from("expense_splits")
        .select("amount")
        .eq("user_id", user.id)

      if (paidError || splitsError) {
        console.error("Error fetching balance data:", { paidError, splitsError })
        return
      }

      const totalPaid = paidExpenses?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0
      const totalOwed = expenseSplits?.reduce((sum, split) => sum + Number(split.amount), 0) || 0

      const netBalance = totalPaid - totalOwed

      setBalanceSummary({
        owed: netBalance > 0 ? netBalance : 0,
        owing: netBalance < 0 ? Math.abs(netBalance) : 0,
      })

      console.log("Balance summary:", { totalPaid, totalOwed, netBalance })
    } catch (error) {
      console.error("Error in fetchBalanceSummary:", error)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-gradient-to-br from-primary to-primary/80",
      "bg-gradient-to-br from-primary/90 to-primary/70",
      "bg-gradient-to-br from-primary/80 to-primary/60",
      "bg-gradient-to-br from-primary/70 to-primary/50",
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  if (loading) {
    return (
      <MaxWidthWrapper className="py-8">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div className="text-lg text-foreground/70">Loading...</div>
          </div>
        </div>
      </MaxWidthWrapper>
    )
  }

  if (!user) {
    return null
  }

  const userName = user.user_metadata?.name || user.email?.split("@")[0] || "User"

  return (
    <MaxWidthWrapper className="py-8">
      <div className="space-y-8">
        {/* Header Section */}
        <div className="relative overflow-hidden rounded-xl bg-background p-6 border border-border">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}`} />
                <AvatarFallback className={`${getAvatarColor(userName)} text-white text-xl font-bold`}>
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Welcome back, {userName}!</h1>
                <p className="text-muted-foreground mt-1">Manage your expense groups and track your spending</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setHasLoadedOnce(false)
                  fetchUserData()
                }}
                variant="outline"
                size="sm"
                className="border-border"
              >
                <RefreshCw className="mr-2 h-4 w-4 text-primary" />
                Refresh
              </Button>
              <Link href="/groups/create">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Group
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Pending Invitations */}
        {loadingInvitations ? (
          <Card className="border border-border bg-background">
            <CardContent className="py-8">
              <div className="text-center flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-muted-foreground">Loading invitations...</span>
              </div>
            </CardContent>
          </Card>
        ) : pendingInvitations.length > 0 ? (
          <Card className="border border-border bg-background">
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <div className="p-2 rounded-lg bg-primary mr-3">
                  <Bell className="h-5 w-5 text-primary-foreground" />
                </div>
                Pending Group Invitations ({pendingInvitations.length})
              </CardTitle>
              <CardDescription>You have group invitations waiting for your response</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingInvitations.map((invitation, index) => (
                  <div
                    key={invitation.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-muted/30 rounded-lg border border-border"
                    style={{
                      animationDelay: `${index * 100}ms`,
                      animation: "fadeInUp 0.5s ease-out forwards",
                    }}
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Gift className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="font-bold text-lg text-foreground">{invitation.group_name}</h4>
                          <Badge variant="default" className="text-xs">
                            New
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <Crown className="h-3 w-3 text-amber-500" />
                          Invited by <strong>{invitation.invited_by}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-0 ml-0 sm:ml-4 w-full sm:w-auto">
                      <Button
                        size="sm"
                        className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={() => acceptInvitationQuick(invitation)}
                      >
                        <Gift className="mr-2 h-4 w-4" />
                        Accept & Join
                      </Button>
                      <Link href={`/invite/${invitation.token}`} className="w-full sm:w-auto">
                        <Button size="sm" variant="outline" className="w-full sm:w-auto border-border">
                          <ExternalLink className="h-4 w-4 mr-2 text-primary" />
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats Cards */}
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border border-border bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Groups</CardTitle>
              <div className="p-2 rounded-lg bg-primary">
                <Users className="h-4 w-4 text-primary-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{groups.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Active groups</p>
            </CardContent>
          </Card>

          <Card className="border border-border bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Pending Invites</CardTitle>
              <div className="p-2 rounded-lg bg-primary">
                <Bell className="h-4 w-4 text-primary-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{pendingInvitations.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting response</p>
            </CardContent>
          </Card>

          <Card className="border border-border bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">You Owe</CardTitle>
              <div className="p-2 rounded-lg bg-destructive/80 dark:bg-destructive">
                <TrendingDown className="h-4 w-4 text-destructive-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive dark:text-destructive">
                ${balanceSummary.owing.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Outstanding debt</p>
            </CardContent>
          </Card>

          <Card className="border border-border bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">You're Owed</CardTitle>
              <div className="p-2 rounded-lg bg-primary">
                <TrendingUp className="h-4 w-4 text-primary-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">${balanceSummary.owed.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Money to collect</p>
            </CardContent>
          </Card>
        </div>

        {/* Groups Card */}
        <Card className="border border-border bg-background">
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <div className="p-2 rounded-lg bg-primary mr-3">
                <Users className="h-5 w-5 text-primary-foreground" />
              </div>
              Your Groups
            </CardTitle>
            <CardDescription>Manage your expense groups and track spending</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingGroups ? (
              <div className="text-center py-12 flex items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                <span className="text-muted-foreground">Loading groups...</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-xl font-medium text-foreground mb-2">No groups yet</p>
                <p className="text-muted-foreground mb-8">Create your first group to start tracking expenses</p>
                <Link href="/groups/create">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-6 py-2">
                    <Plus className="mr-2 h-5 w-5" />
                    Create Your First Group
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {groups.map((group, index) => (
                  <Link href={`/groups/${group.id}`} key={group.id} className="w-full group">
                    <Card
                      className="cursor-pointer border border-border bg-background hover:bg-muted/50 transition-colors duration-200 h-full"
                      style={{
                        animationDelay: `${index * 100}ms`,
                        animation: "fadeInUp 0.5s ease-out forwards",
                      }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg font-bold text-foreground">{group.name}</CardTitle>
                          <Badge variant="outline" className="text-xs">
                            <BarChart3 className="h-3 w-3 mr-1" />
                            {group.member_count} members
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2">
                          {group.description || "No description provided"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-sm text-muted-foreground">
                            <div className="p-1.5 rounded-lg bg-primary/10 mr-2">
                              <Users className="h-3 w-3 text-primary" />
                            </div>
                            {group.member_count} members
                          </div>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(group.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </MaxWidthWrapper>
  )
}
