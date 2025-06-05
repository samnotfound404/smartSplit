"use client"
import { useState, useEffect } from "react"
import type React from "react"

import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import MaxWidthWrapper from "@/components/max-width-wrapper"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

interface Member {
  id: string
  name: string
  email: string
}

export default function CreateExpensePage() {
  const params = useParams()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [paidBy, setPaidBy] = useState("")
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/groups/${params.id}/expense/create`)
    }
  }, [user, authLoading, router, params.id])

  useEffect(() => {
    if (user && params.id) {
      checkGroupMembership()
    }
  }, [user, params.id])

  const checkGroupMembership = async () => {
    if (!user) return

    try {
      // Check if user is a member of this group
      const { data: memberCheck, error: memberCheckError } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", params.id)
        .eq("user_id", user.id)
        .single()

      if (memberCheckError) {
        // User is not a member of this group
        toast({
          title: "Access Denied",
          description: "You are not a member of this group",
          variant: "destructive",
        })
        router.push("/dashboard")
        return
      }

      fetchMembers()
    } catch (error) {
      console.error("Error checking group membership:", error)
      router.push("/dashboard")
    }
  }

  const fetchMembers = async () => {
    try {
      // Get member IDs first
      const { data: memberIds, error: memberIdsError } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", params.id)

      if (memberIdsError) throw memberIdsError

      // Get profiles for each member separately
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
            }
          }

          return {
            id: member.user_id,
            name: profile.name,
            email: profile.email,
          }
        }),
      )

      setMembers(membersWithProfiles)
      setPaidBy(user?.id || "")
      setSelectedMembers(membersWithProfiles.map((m) => m.id))
    } catch (error) {
      console.error("Error fetching members:", error, JSON.stringify(error, null, 2))
      toast({
        title: "Error",
        description: "Failed to load group members",
        variant: "destructive",
      })
    } finally {
      setPageLoading(false)
    }
  }

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers((prev) => (prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]))
  }

  // Function to calculate split amount with proper decimal handling
  const calculateSplitAmount = (totalAmount: number, memberCount: number): number => {
    if (memberCount === 0) return 0
    // Use Math.round to handle floating point precision issues
    return Math.round((totalAmount / memberCount) * 100) / 100
  }

  // Function to distribute amount evenly with proper rounding
  const distributeAmount = (totalAmount: number, memberCount: number): number[] => {
    if (memberCount === 0) return []

    const baseAmount = Math.floor((totalAmount * 100) / memberCount) / 100
    const remainder = Math.round((totalAmount * 100) % memberCount)

    const amounts = new Array(memberCount).fill(baseAmount)

    // Distribute the remainder cents to the first few members
    for (let i = 0; i < remainder; i++) {
      amounts[i] += 0.01
    }

    return amounts.map((amount) => Math.round(amount * 100) / 100)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || selectedMembers.length === 0) return

    setLoading(true)

    try {
      const expenseAmount = Number.parseFloat(amount)

      // Get the payer's name
      const payer = members.find((m) => m.id === paidBy)
      const payerName = payer?.name || "Unknown User"

      // Create the expense - Remove paid_by_name field since it's causing schema issues
      const { data: expense, error: expenseError } = await supabase
        .from("expenses")
        .insert({
          group_id: params.id,
          description,
          amount: expenseAmount,
          paid_by: paidBy,
          split_count: selectedMembers.length,
        })
        .select()
        .single()

      if (expenseError) throw expenseError

      // Calculate proper split amounts
      const splitAmounts = distributeAmount(expenseAmount, selectedMembers.length)

      // Create expense splits with proper amounts
      const splits = selectedMembers.map((memberId, index) => ({
        expense_id: expense.id,
        user_id: memberId,
        amount: splitAmounts[index],
      }))

      const { error: splitsError } = await supabase.from("expense_splits").insert(splits)

      if (splitsError) throw splitsError

      toast({
        title: "Success",
        description: "Expense added successfully!",
      })

      router.push(`/groups/${params.id}`)
    } catch (error: any) {
      console.error("Error creating expense:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create expense",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || pageLoading) {
    return (
      <MaxWidthWrapper className="py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading...</div>
        </div>
      </MaxWidthWrapper>
    )
  }

  if (!user) {
    return null
  }

  const expenseAmount = Number.parseFloat(amount) || 0
  const splitAmounts = distributeAmount(expenseAmount, selectedMembers.length)

  return (
    <MaxWidthWrapper className="py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Add New Expense</CardTitle>
          <CardDescription>Split a new expense among group members</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g., Dinner at restaurant, Gas for trip"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paidBy">Paid by</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Select who paid" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Split between</Label>
              <div className="space-y-2">
                {members.map((member, index) => (
                  <div key={member.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={member.id}
                      checked={selectedMembers.includes(member.id)}
                      onCheckedChange={() => handleMemberToggle(member.id)}
                    />
                    <Label htmlFor={member.id} className="flex-1">
                      {member.name}
                    </Label>
                    {selectedMembers.includes(member.id) && amount && (
                      <span className="text-sm text-muted-foreground">
                        ${splitAmounts[selectedMembers.indexOf(member.id)]?.toFixed(2) || "0.00"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading || selectedMembers.length === 0}>
                {loading ? "Adding..." : "Add Expense"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </MaxWidthWrapper>
  )
}
