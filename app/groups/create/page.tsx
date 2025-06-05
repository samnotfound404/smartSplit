"use client"

import { useState, useEffect } from "react"
import type React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import MaxWidthWrapper from "@/components/max-width-wrapper"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { Users, Plus, ArrowLeft, Sparkles, CheckCircle, Car, Utensils, ShoppingBag, Home, Plane, Film, Heart, Gift, MapPin } from 'lucide-react'

export default function CreateGroupPage() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/groups/create")
    }
  }, [user, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a group",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      // Ensure user profile exists
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single()

      if (profileError && profileError.code === "PGRST116") {
        // Create profile if it doesn't exist
        const { error: createProfileError } = await supabase.from("profiles").insert({
          id: user.id,
          name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
          email: user.email!,
        })

        if (createProfileError) {
          console.error("Error creating profile:", createProfileError)
          throw new Error("Failed to create user profile")
        }
      }

      // Create the group
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          created_by: user.id,
        })
        .select()
        .single()

      if (groupError) {
        console.error("Group creation error:", groupError)
        throw groupError
      }

      // Add the creator as an admin member
      const { error: memberError } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: user.id,
        role: "admin",
      })

      if (memberError) {
        console.error("Member creation error:", memberError)
        throw memberError
      }

      toast({
        title: "Success",
        description: "Group created successfully!",
      })

      router.push(`/groups/${group.id}`)
    } catch (error: any) {
      console.error("Error creating group:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create group. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
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

  const expenseCategories = [
    { icon: Car, label: "Transportation", color: "text-primary dark:text-destructive" },
    { icon: Utensils, label: "Food & Dining", color: "text-primary dark:text-destructive" },
    { icon: ShoppingBag, label: "Shopping", color: "text-primary dark:text-destructive" },
    { icon: Home, label: "Utilities", color: "text-primary dark:text-destructive" },
    { icon: Plane, label: "Travel", color: "text-primary dark:text-destructive" },
    { icon: Film, label: "Entertainment", color: "text-primary dark:text-destructive" },
    { icon: Heart, label: "Healthcare", color: "text-primary dark:text-destructive" },
    { icon: Gift, label: "Gifts", color: "text-primary dark:text-destructive" },
  ]

  return (
    <MaxWidthWrapper className="py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="p-4 rounded-full bg-primary">
              <Users className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-foreground">Create New Group</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start a new expense group to split costs with friends, family, or colleagues. Track expenses with smart
            categorization and beautiful insights.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <Card className="border border-border bg-background">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center text-2xl">
                  <div className="p-2 rounded-lg bg-primary mr-3">
                    <Plus className="h-5 w-5 text-primary-foreground" />
                  </div>
                  Group Details
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Provide basic information about your expense group
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="name" className="text-sm font-semibold text-foreground">
                      Group Name *
                    </Label>
                    <Input
                      id="name"
                      placeholder="e.g., Trip to Paris, Roommates, Office Lunch"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={1}
                      maxLength={100}
                      className="h-12 border-border focus:border-primary focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">Choose a descriptive name for your group</p>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="description" className="text-sm font-semibold text-foreground">
                      Description (Optional)
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Brief description of the group purpose, trip details, or any important notes..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      maxLength={500}
                      className="border-border focus:border-primary focus:ring-primary resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      {description.length}/500 characters - Help members understand the group's purpose
                    </p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Button
                      type="submit"
                      disabled={loading || !name.trim()}
                      className="flex-1 h-12 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                          Creating...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Create Group
                        </div>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.back()}
                      className="h-12 border-border"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Smart Categorization Preview */}
            <Card className="border border-border bg-background">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 rounded-lg bg-primary mr-3">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  Smart Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground">Automatic Expense Categorization</h4>
                  <p className="text-sm text-muted-foreground">
                    Our AI automatically categorizes expenses with appropriate icons and colors for better organization.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {expenseCategories.map((category, index) => (
                    <div
                      key={category.label}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 transition-all duration-200 hover:bg-muted hover:scale-105"
                      style={{
                        animationDelay: `${index * 100}ms`,
                        animation: "fadeInUp 0.5s ease-out forwards",
                      }}
                    >
                      <category.icon className={`h-4 w-4 ${category.color}`} />
                      <span className="text-xs font-medium text-foreground">{category.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tips Card */}
            <Card className="border border-border bg-background">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-lg">
                  <div className="p-2 rounded-lg bg-primary mr-3">
                    <MapPin className="h-4 w-4 text-primary-foreground" />
                  </div>
                  Pro Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Invite members</strong> after creating the group to start splitting expenses
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Add expenses</strong> with photos and receipts for better tracking
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Use categories</strong> to organize expenses and get insights
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
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
