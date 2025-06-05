"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import MaxWidthWrapper from "@/components/max-width-wrapper"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Users, Mail, ArrowLeftRight, RefreshCw, Crown, TrendingUp, TrendingDown, DollarSign, Calendar, Receipt, Sparkles, Target, BarChart3, PieChart, MoreVertical, X, Send } from 'lucide-react'
import { supabase } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"
import { minimizeCashFlow } from "@/lib/cash-flow-minimizer"
import Loader from "@/components/Loader"
import { expenseCategorizer } from "@/lib/expense-categorizer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface Group {
  id: string
  name: string
  description: string | null
  created_at: string
  created_by: string
}

interface Member {
  id: string
  name: string
  email: string
  role: string
  balance: number
}

interface Expense {
  id: string
  description: string
  amount: number
  paid_by: string
  created_at: string
  split_count: number
  payer_name?: string
}

interface Settlement {
  from: string
  to: string
  amount: number
  from_name: string
  to_name: string
}

export default function GroupPage() {
  const params = useParams()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [showMembersDialog, setShowMembersDialog] = useState(false)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteMessage, setInviteMessage] = useState("")
  const [inviting, setInviting] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/groups/${params.id}`)
    }
  }, [user, authLoading, router, params.id])

  // Fetch group data only once when user and params.id are available
  useEffect(() => {
    if (user && params.id && !hasLoadedOnce) {
      fetchGroupData()
      setHasLoadedOnce(true)
    }
  }, [user, params.id, hasLoadedOnce])

  const fetchGroupData = async () => {
    if (!user) return

    try {
      setLoading(true)
      console.log("--- Fetching Group Data ---")
      console.log("Current User ID:", user.id)
      console.log("Group ID from params:", params.id)

      // Check if user is a member of this group
      const { data: memberCheck, error: memberCheckError } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", params.id)
        .eq("user_id", user.id)
        .single()

      console.log("Member check result:", { memberCheck, memberCheckError })

      if (memberCheckError || !memberCheck) {
        console.error("Access Denied: User is not a member of this group or error occurred.", memberCheckError)
        toast({
          title: "Access Denied",
          description: "You are not a member of this group",
          variant: "destructive",
        })
        router.push("/dashboard")
        return
      }

      setIsAdmin(memberCheck.role === "admin")

      // Fetch group details
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", params.id)
        .single()

      console.log("Group details fetched:", { groupData, groupError })

      if (groupError || !groupData) {
        console.error("Failed to fetch group details:", groupError)
        throw new Error("Failed to fetch group details")
      }
      setGroup(groupData)

      // Fetch members WITHOUT joins - get member IDs first
      const { data: memberIds, error: memberIdsError } = await supabase
        .from("group_members")
        .select("user_id, role")
        .eq("group_id", params.id)

      console.log("Member IDs fetched:", { memberIds, memberIdsError })

      if (memberIdsError || !memberIds) {
        console.error("Error fetching member IDs:", memberIdsError)
        setMembers([])
      } else {
        // Get profiles and balances for each member
        const membersWithProfiles = await Promise.all(
          memberIds.map(async (member) => {
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("id, name, email")
              .eq("id", member.user_id)
              .single()

            if (profileError || !profile) {
              console.error(`Error fetching profile for ${member.user_id}:`, profileError)
              return {
                id: member.user_id,
                name: "Unknown User",
                email: "",
                role: member.role,
                balance: 0,
              }
            }

            const balance = await calculateMemberBalance(member.user_id, params.id as string)
            return {
              id: member.user_id,
              name: profile.name,
              email: profile.email,
              role: member.role,
              balance: balance,
            }
          }),
        )

        setMembers(membersWithProfiles)
        console.log("Members with balances:", membersWithProfiles)

        // Calculate settlements using the cash flow minimization algorithm
        const calculatedSettlements = minimizeCashFlow(membersWithProfiles)
        setSettlements(calculatedSettlements)
        console.log("Calculated settlements:", calculatedSettlements)
      }

      // Fetch expenses WITHOUT joins
      const { data: expensesData, error: expensesError } = await supabase
        .from("expenses")
        .select("id, description, amount, paid_by, created_at, split_count")
        .eq("group_id", params.id)
        .order("created_at", { ascending: false })

      console.log("Expenses data fetched:", { expensesData, expensesError })

      if (expensesError) {
        console.error("Expenses fetch error:", expensesError, JSON.stringify(expensesError, null, 2))
        setExpenses([])
      } else {
        // Get payer names separately
        const expensesWithPayerNames = await Promise.all(
          (expensesData || []).map(async (expense) => {
            const { data: payerProfile } = await supabase
              .from("profiles")
              .select("name")
              .eq("id", expense.paid_by)
              .single()

            return {
              ...expense,
              payer_name: payerProfile?.name || "Unknown User",
            }
          }),
        )

        setExpenses(expensesWithPayerNames)
        console.log("Expenses loaded:", expensesWithPayerNames?.length || 0)
      }
    } catch (error: any) {
      console.error("Error fetching group data:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to load group data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      console.log("--- Finished Fetching Group Data ---")
    }
  }

  const calculateMemberBalance = async (userId: string, groupId: string): Promise<number> => {
    // Get all expenses paid by this user
    const { data: paidExpenses } = await supabase
      .from("expenses")
      .select("amount")
      .eq("group_id", groupId)
      .eq("paid_by", userId)

    const totalPaid = paidExpenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0

    // Get all expense splits for this user
    const { data: expenseSplits } = await supabase
      .from("expense_splits")
      .select("amount")
      .eq("user_id", userId)
      .in(
        "expense_id",
        (await supabase.from("expenses").select("id").eq("group_id", groupId)).data?.map((e) => e.id) || [],
      )

    const totalOwed = expenseSplits?.reduce((sum, split) => sum + split.amount, 0) || 0

    return Math.round((totalPaid - totalOwed) * 100) / 100
  }

  const inviteMember = async () => {
    if (!user || !inviteEmail.trim()) return

    try {
      setInviting(true)
      const response = await fetch("/api/groups/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId: params.id,
          email: inviteEmail.trim(),
          inviterName: user.user_metadata?.name || user.email,
          message: inviteMessage.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: "Invitation sent successfully!",
        })
        setInviteEmail("")
        setInviteMessage("")
        setShowInviteDialog(false)
      } else {
        throw new Error(data.error || "Failed to send invitation")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      })
    } finally {
      setInviting(false)
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

  // Calculate expense statistics
  const expenseStats =
    expenses.length > 0
      ? expenseCategorizer.analyzeSpending(
          expenses.map((expense) => ({
            description: expense.description,
            amount: expense.amount,
            date: expense.created_at,
          })),
        )
      : []

  const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  if (authLoading || loading) {
    return (
      <MaxWidthWrapper className="py-8">
        <Loader />
      </MaxWidthWrapper>
    )
  }

  if (!user) {
    return null
  }

  if (!group) {
    return (
      <MaxWidthWrapper className="py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Group not found</h1>
          <Button onClick={() => router.push("/dashboard")} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </MaxWidthWrapper>
    )
  }

  return (
    <MaxWidthWrapper className="py-8">
      <div className="space-y-8">
        {/* Clean White Header Section */}
        <div className="relative overflow-hidden rounded-xl bg-background p-6 border border-border">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary">
                  <Users className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-foreground">{group.name}</h1>
                  <p className="text-muted-foreground mt-1">
                    {members.length} members • ${totalSpent.toFixed(2)} total spent
                  </p>
                </div>
              </div>
              {group.description && <p className="text-muted-foreground max-w-2xl">{group.description}</p>}
            </div>
            <div className="flex gap-3 items-center">
              <Button
                onClick={() => {
                  setHasLoadedOnce(false)
                  fetchGroupData()
                }}
                variant="outline"
                size="sm"
                className="border-border"
              >
                <RefreshCw className="mr-2 h-4 w-4 text-primary" />
                Refresh
              </Button>
              <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-border">
                    <Mail className="mr-2 h-4 w-4 text-primary" />
                    Invite
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Invite Member</DialogTitle>
                    <DialogDescription>
                      Send an invitation to join the {group.name} group
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter email address"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message">Message (optional)</Label>
                      <Textarea
                        id="message"
                        placeholder="Add a personal message..."
                        value={inviteMessage}
                        onChange={(e) => setInviteMessage(e.target.value)}
                        className="border-border"
                      />
                    </div>
                  </div>
                  <DialogFooter className="sm:justify-between">
                    <DialogClose asChild>
                      <Button variant="outline" className="border-border">
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      onClick={inviteMember}
                      disabled={!inviteEmail.trim() || inviting}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {inviting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                          Sending...
                        </div>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Invitation
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Link href={`/groups/${group.id}/expense/create`}>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
              </Link>

              {/* Group Details Dropdown */}
              <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="border-border">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Group Options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DialogTrigger asChild>
                      <DropdownMenuItem>
                        <Users className="mr-2 h-4 w-4 text-primary" />
                        <span>View Members ({members.length})</span>
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DropdownMenuItem>
                      <Crown className="mr-2 h-4 w-4 text-primary" />
                      <span>Group Settings</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Members Dialog */}
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Group Members</DialogTitle>
                    <DialogDescription>
                      {members.length} members in {group.name}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-10 w-10 ring-1 ring-border">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`} />
                            <AvatarFallback className={`${getAvatarColor(member.name)} text-primary-foreground font-semibold`}>
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground">{member.name}</p>
                              {member.role === "admin" && (
                                <Badge className="bg-primary text-primary-foreground border-0 text-xs">
                                  <Crown className="w-3 h-3 mr-1" />
                                  Admin
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {member.balance > 0 ? (
                            <div className="flex items-center gap-1 text-primary dark:text-destructive">
                              <TrendingUp className="h-4 w-4" />
                              <span className="text-sm font-medium">+${Math.abs(member.balance).toFixed(2)}</span>
                            </div>
                          ) : member.balance < 0 ? (
                            <div className="flex items-center gap-1 text-destructive dark:text-primary">
                              <TrendingDown className="h-4 w-4" />
                              <span className="text-sm font-medium">-${Math.abs(member.balance).toFixed(2)}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <DollarSign className="h-4 w-4" />
                              <span className="text-sm font-medium">$0.00</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        {expenses.length > 0 && (
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border border-border bg-background">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                    <p className="text-3xl font-bold text-foreground">{expenses.length}</p>
                  </div>
                  <div className="p-3 rounded-full bg-primary">
                    <Receipt className="h-6 w-6 text-primary-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border bg-background">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Spent</p>
                    <p className="text-3xl font-bold text-foreground">${totalSpent.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-full bg-primary">
                    <DollarSign className="h-6 w-6 text-primary-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border bg-background">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Categories</p>
                    <p className="text-3xl font-bold text-foreground">{expenseStats.length}</p>
                  </div>
                  <div className="p-3 rounded-full bg-primary">
                    <PieChart className="h-6 w-6 text-primary-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-2">
          {/* Settlements Card */}
          <Card className="border border-border bg-background">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center text-xl">
                <div className="p-2 rounded-lg bg-primary mr-3">
                  <ArrowLeftRight className="h-5 w-5 text-primary-foreground" />
                </div>
                Suggested Settlements
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                AI-optimized payments to settle all debts efficiently
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settlements.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-2xl">🎉</span>
                  </div>
                  <p className="text-xl font-medium text-foreground mb-2">All settled up!</p>
                  <p className="text-muted-foreground">No outstanding balances between members</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {settlements.map((settlement, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-lg bg-background border border-border"
                      style={{
                        animationDelay: `${index * 150}ms`,
                        animation: "fadeInUp 0.5s ease-out forwards",
                      }}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8 ring-1 ring-border">
                            <AvatarImage
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${settlement.from_name}`}
                            />
                            <AvatarFallback
                              className={`${getAvatarColor(settlement.from_name)} text-primary-foreground text-xs font-semibold`}
                            >
                              {getInitials(settlement.from_name)}
                            </AvatarFallback>
                          </Avatar>
                          <ArrowLeftRight className="h-4 w-4 text-primary dark:text-destructive" />
                          <Avatar className="h-8 w-8 ring-1 ring-border">
                            <AvatarImage
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${settlement.to_name}`}
                            />
                            <AvatarFallback
                              className={`${getAvatarColor(settlement.to_name)} text-primary-foreground text-xs font-semibold`}
                            >
                              {getInitials(settlement.to_name)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {settlement.from_name} → {settlement.to_name}
                          </p>
                          <p className="text-sm text-primary dark:text-destructive flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            Optimized payment suggestion
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-primary dark:text-destructive">
                          ${settlement.amount.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">Settlement amount</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          {expenseStats.length > 0 && (
            <Card className="border border-border bg-background">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  <div className="p-2 rounded-lg bg-primary mr-3">
                    <PieChart className="h-5 w-5 text-primary-foreground" />
                  </div>
                  Spending by Category
                </CardTitle>
                <CardDescription className="text-muted-foreground">AI-powered expense analysis and insights</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {expenseStats.slice(0, 6).map(({ category, total, count }, index) => {
                    const IconComponent = category.icon
                    const percentage = (total / totalSpent) * 100

                    return (
                      <div
                        key={category.id}
                        className="p-4 rounded-lg bg-background border border-border"
                        style={{
                          animationDelay: `${index * 100}ms`,
                          animation: "fadeInUp 0.5s ease-out forwards",
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-muted">
                              <IconComponent className="h-5 w-5 text-primary dark:text-destructive" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{category.name}</p>
                              <p className="text-xs text-muted-foreground">{count} expenses</p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-foreground">${total.toFixed(2)}</span>
                            <span className="text-sm text-muted-foreground">{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-primary dark:bg-destructive h-2 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Enhanced Expenses Card with AI Categorization */}
        <Card className="border border-border bg-background">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center text-xl">
                <div className="p-2 rounded-lg bg-primary mr-3">
                  <Sparkles className="h-5 w-5 text-primary-foreground" />
                </div>
                Recent Expenses with AI Categorization
              </div>
              {expenses.length > 0 && (
                <Badge className="bg-primary text-primary-foreground border-0">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  {expenseStats.length} Categories
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Automatically categorized expenses with smart icon recommendations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                  <Receipt className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-xl font-medium text-foreground mb-2">No expenses yet</p>
                <p className="text-muted-foreground mb-8">Start by adding your first expense with AI-powered categorization</p>
                <Link href={`/groups/${group.id}/expense/create`}>
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-6 py-2">
                    <Plus className="mr-2 h-5 w-5" />
                    Add First Expense
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {expenses.map((expense, index) => {
                  const category = expenseCategorizer.categorizeExpense(expense.description)
                  const IconComponent = category.icon

                  return (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-background border border-border"
                      style={{
                        animationDelay: `${index * 100}ms`,
                        animation: "fadeInUp 0.5s ease-out forwards",
                      }}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="p-3 rounded-lg bg-muted">
                          <IconComponent className="h-5 w-5 text-primary dark:text-destructive" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-medium text-foreground text-lg">{expense.description}</p>
                            <Badge variant="outline" className="border-border">
                              {category.name}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Avatar className="h-4 w-4">
                                <AvatarImage
                                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${expense.payer_name}`}
                                />
                                <AvatarFallback className="text-xs bg-muted">
                                  {expense.payer_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              Paid by {expense.payer_name}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              Split {expense.split_count} ways
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(expense.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-primary dark:text-destructive">
                          ${expense.amount.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          ${(expense.amount / expense.split_count).toFixed(2)} per person
                        </p>
                      </div>
                    </div>
                  )
                })}
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
