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
import { expenseCategorizer } from "@/lib/expense-categorizer"
import { CreditCard, Plus, ArrowLeft } from 'lucide-react'

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
  const [categoryIcon, setCategoryIcon] = useState<React.ElementType>(CreditCard)
  const [categoryColor, setCategoryColor] = useState<string>("text-primary dark:text-destructive")
  const [categoryName, setCategoryName] = useState<string>("Expense")

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

  // Update category in real-time as user types
  useEffect(() => {
    if (description.trim().length > 0) {
      const category = expenseCategorizer.categorizeExpense(description)
      setCategoryIcon(category.icon)
      setCategoryColor("text-primary dark:text-destructive") // Keep primary color as requested
      setCategoryName(category.name)
    } else {
      setCategoryIcon(CreditCard)
      setCategoryColor("text-primary dark:text-destructive")
      setCategoryName("Expense")
    }
  }, [description])

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
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div className="text-lg text-muted-foreground">Loading...</div>
          </div>
        </div>
      </MaxWidthWrapper>
    )
  }

  if (!user) {
    return null
  }

  const expenseAmount = Number.parseFloat(amount) || 0
  const splitAmounts = distributeAmount(expenseAmount, selectedMembers.length)
  const IconComponent = categoryIcon

  return (
    <MaxWidthWrapper className="py-8">
      <Card className="max-w-2xl mx-auto border border-border">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary">
              <IconComponent className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Add New {categoryName}</CardTitle>
              <CardDescription>Split a new expense among group members</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground">
                Description
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <IconComponent className={`h-5 w-5 ${categoryColor}`} />
                </div>
                <Input
                  id="description"
                  placeholder="e.g., Dinner at restaurant, Gas for trip"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="pl-10 border-border focus:border-primary focus:ring-primary"
                  required
                />
              </div>
              {description.trim().length > 0 && (
                <p className="text-xs text-primary dark:text-destructive flex items-center gap-1 mt-1">
                  <IconComponent className="h-3 w-3" />
                  Categorized as {categoryName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-foreground">
                Amount ($)
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</div>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8 border-border focus:border-primary focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paidBy" className="text-foreground">
                Paid by
              </Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger className="border-border focus:border-primary focus:ring-primary">
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
              <Label className="text-foreground">Split between</Label>
              <Card className="border border-border">
                <CardContent className="p-4 space-y-2">
                  {members.map((member, index) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={member.id}
                          checked={selectedMembers.includes(member.id)}
                          onCheckedChange={() => handleMemberToggle(member.id)}
                          className="border-border text-primary focus:ring-primary"
                        />
                        <Label htmlFor={member.id} className="flex-1 text-foreground cursor-pointer">
                          {member.name}
                        </Label>
                      </div>
                      {selectedMembers.includes(member.id) && amount && (
                        <span className="text-sm font-medium text-primary dark:text-destructive">
                          ${splitAmounts[selectedMembers.indexOf(member.id)]?.toFixed(2) || "0.00"}
                        </span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
              {selectedMembers.length > 0 && amount && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total split amount:</span>
                  <span className="font-medium text-primary dark:text-destructive">${expenseAmount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={loading || selectedMembers.length === 0}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    Adding...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add {categoryName}
                  </div>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                className="border-border text-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </MaxWidthWrapper>
  )
}
