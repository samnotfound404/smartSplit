"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import MaxWidthWrapper from "@/components/max-width-wrapper";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Mail, ArrowLeftRight, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { minimizeCashFlow } from "@/lib/cash-flow-minimizer";
import Loader from "@/components/Loader";

interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  balance: number;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  paid_by: string;
  created_at: string;
  split_count: number;
  payer_name?: string;
}

interface Settlement {
  from: string;
  to: string;
  amount: number;
  from_name: string;
  to_name: string;
}

export default function GroupPage() {
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/groups/${params.id}`);
    }
  }, [user, authLoading, router, params.id]);

  // Fetch group data only once when user and params.id are available
  useEffect(() => {
    if (user && params.id && !hasLoadedOnce) {
      fetchGroupData();
      setHasLoadedOnce(true);
    }
  }, [user, params.id, hasLoadedOnce]);

  const fetchGroupData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      console.log("--- Fetching Group Data ---");
      console.log("Current User ID:", user.id);
      console.log("Group ID from params:", params.id);

      // Check if user is a member of this group
      const { data: memberCheck, error: memberCheckError } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", params.id)
        .eq("user_id", user.id)
        .single();

      console.log("Member check result:", { memberCheck, memberCheckError });

      if (memberCheckError || !memberCheck) {
        console.error(
          "Access Denied: User is not a member of this group or error occurred.",
          memberCheckError
        );
        toast({
          title: "Access Denied",
          description: "You are not a member of this group",
          variant: "destructive",
        });
        router.push("/dashboard");
        return;
      }

      setIsAdmin(memberCheck.role === "admin");

      // Fetch group details
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", params.id)
        .single();

      console.log("Group details fetched:", { groupData, groupError });

      if (groupError || !groupData) {
        console.error("Failed to fetch group details:", groupError);
        throw new Error("Failed to fetch group details");
      }
      setGroup(groupData);

      // Fetch members WITHOUT joins - get member IDs first
      const { data: memberIds, error: memberIdsError } = await supabase
        .from("group_members")
        .select("user_id, role")
        .eq("group_id", params.id);

      console.log("Member IDs fetched:", { memberIds, memberIdsError });

      if (memberIdsError || !memberIds) {
        console.error("Error fetching member IDs:", memberIdsError);
        setMembers([]);
      } else {
        // Get profiles and balances for each member
        const membersWithProfiles = await Promise.all(
          memberIds.map(async (member) => {
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("id, name, email")
              .eq("id", member.user_id)
              .single();

            if (profileError || !profile) {
              console.error(
                `Error fetching profile for ${member.user_id}:`,
                profileError
              );
              return {
                id: member.user_id,
                name: "Unknown User",
                email: "",
                role: member.role,
                balance: 0,
              };
            }

            const balance = await calculateMemberBalance(
              member.user_id,
              params.id as string
            );
            return {
              id: member.user_id,
              name: profile.name,
              email: profile.email,
              role: member.role,
              balance: balance,
            };
          })
        );

        setMembers(membersWithProfiles);
        console.log("Members with balances:", membersWithProfiles);

        // Calculate settlements using the cash flow minimization algorithm
        const calculatedSettlements = minimizeCashFlow(membersWithProfiles);
        setSettlements(calculatedSettlements);
        console.log("Calculated settlements:", calculatedSettlements);
      }

      // Fetch expenses WITHOUT joins
      const { data: expensesData, error: expensesError } = await supabase
        .from("expenses")
        .select("id, description, amount, paid_by, created_at, split_count")
        .eq("group_id", params.id)
        .order("created_at", { ascending: false });

      console.log("Expenses data fetched:", { expensesData, expensesError });

      if (expensesError) {
        console.error(
          "Expenses fetch error:",
          expensesError,
          JSON.stringify(expensesError, null, 2)
        );
        setExpenses([]);
      } else {
        // Get payer names separately
        const expensesWithPayerNames = await Promise.all(
          (expensesData || []).map(async (expense) => {
            const { data: payerProfile } = await supabase
              .from("profiles")
              .select("name")
              .eq("id", expense.paid_by)
              .single();

            return {
              ...expense,
              payer_name: payerProfile?.name || "Unknown User",
            };
          })
        );

        setExpenses(expensesWithPayerNames);
        console.log(
          "Expenses loaded:",
          expensesWithPayerNames?.length || 0
        );
      }
    } catch (error: any) {
      console.error("Error fetching group data:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load group data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      console.log("--- Finished Fetching Group Data ---");
    }
  };

  const calculateMemberBalance = async (
    userId: string,
    groupId: string
  ): Promise<number> => {
    // Get all expenses paid by this user
    const { data: paidExpenses } = await supabase
      .from("expenses")
      .select("amount")
      .eq("group_id", groupId)
      .eq("paid_by", userId);

    const totalPaid =
      paidExpenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0;

    // Get all expense splits for this user
    const { data: expenseSplits } = await supabase
      .from("expense_splits")
      .select("amount")
      .eq("user_id", userId)
      .in(
        "expense_id",
        (
          await supabase
            .from("expenses")
            .select("id")
            .eq("group_id", groupId)
        ).data?.map((e) => e.id) || []
      );

    const totalOwed =
      expenseSplits?.reduce((sum, split) => sum + split.amount, 0) || 0;

    return Math.round((totalPaid - totalOwed) * 100) / 100;
  };

  const inviteMember = async () => {
    if (!user) return;

    const email = prompt("Enter the email address to invite:");
    if (!email) return;

    try {
      const response = await fetch("/api/groups/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId: params.id,
          email: email,
          inviterName: user.user_metadata?.name || user.email,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Success",
          description: "Invitation sent successfully!",
        });
      } else {
        throw new Error(data.error || "Failed to send invitation");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <MaxWidthWrapper className="py-8">
        <Loader />
      </MaxWidthWrapper>
    );
  }

  if (!user) {
    return null;
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
    );
  }

  return (
    <MaxWidthWrapper className="py-8">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{group.name}</h1>
            <p className="text-muted-foreground mt-2">
              {group.description}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setHasLoadedOnce(false);
                fetchGroupData();
              }}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={inviteMember} variant="outline">
              <Mail className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
            <Link href={`/groups/${group.id}/expense/create`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-5 w-5" />
                Members ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          member.role === "admin" ? "default" : "secondary"
                        }
                      >
                        {member.role}
                      </Badge>
                      <div
                        className={`text-sm font-medium ${
                          member.balance > 0
                            ? "text-green-600"
                            : member.balance < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        ${Math.abs(member.balance).toFixed(2)}
                        {member.balance > 0
                          ? " owed"
                          : member.balance < 0
                          ? " owes"
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ArrowLeftRight className="mr-2 h-5 w-5" />
                Suggested Settlements
              </CardTitle>
              <CardDescription>
                Optimized payments to settle all debts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settlements.length === 0 ? (
                <p className="text-muted-foreground">
                  All settled up! 🎉
                </p>
              ) : (
                <div className="space-y-3">
                  {settlements.map((settlement, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {settlement.from_name} → {settlement.to_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Payment suggestion
                        </p>
                      </div>
                      <div className="text-lg font-bold text-primary">
                        ${settlement.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  No expenses yet.
                </p>
                <Link href={`/groups/${group.id}/expense/create`}>
                  <Button>Add First Expense</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {expense.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Paid by {expense.payer_name} • Split{" "}
                        {expense.split_count} ways
                      </p>
                    </div>
                    <div className="text-lg font-bold">
                      ${expense.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MaxWidthWrapper>
  );
}
