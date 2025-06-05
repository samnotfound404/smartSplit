"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import MaxWidthWrapper from "@/components/max-width-wrapper";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, TrendingUp, Bell, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import Loader from "@/components/Loader";

interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

interface PendingInvitation {
  id: string;
  group_id: string;
  group_name: string;
  token: string;
  invited_by: string;
  expires_at: string;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [balanceSummary, setBalanceSummary] = useState({ owed: 0, owing: 0 });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/dashboard");
    }
  }, [user, loading, router]);

  // Only fetch data on first mount (when user becomes available)
  useEffect(() => {
    if (user && !hasLoadedOnce) {
      fetchUserData();
      setHasLoadedOnce(true);
    }
  }, [user, hasLoadedOnce]);

  const ensureUserProfile = async () => {
    if (!user) return false;

    try {
      console.log("=== ENSURING USER PROFILE ===");
      console.log("User ID:", user.id);

      const { data: existingProfile, error: profileCheckError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      console.log("Profile check result:", { existingProfile, profileCheckError });

      if (profileCheckError) {
        console.error("Error checking profile:", profileCheckError);
        return false;
      }

      if (!existingProfile) {
        console.log("Profile doesn't exist, creating...");

        const { error: upsertError } = await supabase.from("profiles").upsert(
          {
            id: user.id,
            name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
            email: user.email!,
          },
          {
            onConflict: "id",
          }
        );

        if (upsertError) {
          if (upsertError.code === "23505") {
            console.log("Profile already exists (race condition), continuing...");
            return true;
          }

          console.error("Failed to create profile:", upsertError);
          return false;
        }
      } else {
        console.log("Profile already exists");
      }

      return true;
    } catch (error) {
      console.error("Error ensuring user profile:", error);
      return false;
    }
  };

  const fetchUserData = async () => {
    if (!user) return;

    try {
      console.log("=== FETCHING USER DATA ===");

      const profileExists = await ensureUserProfile();
      if (!profileExists) {
        console.error("Failed to ensure user profile exists");
        toast({
          title: "Profile Error",
          description: "There was an issue with your user profile. Please try refreshing the page.",
          variant: "destructive",
        });
        return;
      }

      await Promise.all([fetchGroups(), fetchBalanceSummary(), fetchPendingInvitations()]);
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const fetchPendingInvitations = async () => {
    if (!user) return;

    try {
      setLoadingInvitations(true);
      console.log("=== FETCHING PENDING INVITATIONS ===");
      console.log("User email:", user.email);

      const { data, error } = await supabase
        .from("group_invitations")
        .select("*")
        .eq("email", user.email)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString());

      console.log("Invitations query result:", { data, error });

      if (error) {
        console.error("Error fetching pending invitations:", error);
        setPendingInvitations([]);
        return;
      }

      setPendingInvitations(data || []);
      console.log("Pending invitations loaded:", data?.length || 0);
    } catch (error) {
      console.error("Error in fetchPendingInvitations:", error);
      setPendingInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const acceptInvitationQuick = async (invitation: PendingInvitation) => {
    if (!user) return;

    try {
      console.log("=== QUICK ACCEPTING INVITATION ===");
      console.log("Invitation:", invitation.id);

      const profileExists = await ensureUserProfile();
      if (!profileExists) {
        throw new Error("Failed to create user profile");
      }

      const { data: existingMember, error: memberCheckError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", invitation.group_id)
        .eq("user_id", user.id)
        .single();

      console.log("Member check result:", { existingMember, memberCheckError });

      if (existingMember) {
        toast({
          title: "Already a Member",
          description: "You're already a member of this group!",
        });
        await supabase.from("group_invitations").update({ used: true }).eq("id", invitation.id);
        fetchPendingInvitations();
        fetchGroups();
        return;
      }

      const { data: newMember, error: memberError } = await supabase
        .from("group_members")
        .insert({
          group_id: invitation.group_id,
          user_id: user.id,
          role: "member",
        })
        .select()
        .single();

      console.log("Member creation result:", { newMember, memberError });

      if (memberError) {
        console.error("Error adding member:", memberError);
        throw new Error("Failed to join group");
      }

      await supabase.from("group_invitations").update({ used: true }).eq("id", invitation.id);

      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "group_joined",
        title: "Welcome to the group!",
        message: `You've successfully joined "${invitation.group_name}"`,
        data: { group_id: invitation.group_id },
      });

      toast({
        title: "Success!",
        description: `You've joined "${invitation.group_name}"`,
      });

      fetchPendingInvitations();
      fetchGroups();
    } catch (error: any) {
      console.error("Error accepting invitation:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept invitation",
        variant: "destructive",
      });
    }
  };

  const fetchGroups = async () => {
    if (!user) return;

    try {
      setLoadingGroups(true);
      console.log("=== FETCHING GROUPS ===");

      const { data: memberData, error: memberError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      console.log("Member data result:", { memberData, memberError });

      if (memberError) {
        console.error("Error fetching group memberships:", memberError);
        setGroups([]);
        return;
      }

      if (!memberData || memberData.length === 0) {
        console.log("No group memberships found");
        setGroups([]);
        return;
      }

      const groupIds = memberData.map((item) => item.group_id);
      console.log("Group IDs:", groupIds);

      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .select("*")
        .in("id", groupIds);

      console.log("Groups data result:", { groupsData, groupsError });

      if (groupsError) {
        console.error("Error fetching groups:", groupsError);
        setGroups([]);
        return;
      }

      if (!groupsData) {
        setGroups([]);
        return;
      }

      const groupsWithCounts = await Promise.all(
        groupsData.map(async (group) => {
          try {
            const { count } = await supabase
              .from("group_members")
              .select("*", { count: "exact", head: true })
              .eq("group_id", group.id);

            return {
              ...group,
              member_count: count || 0,
            };
          } catch (error) {
            console.error(`Error getting member count for group ${group.id}:`, error);
            return {
              ...group,
              member_count: 0,
            };
          }
        })
      );

      setGroups(groupsWithCounts);
      console.log("Groups loaded:", groupsWithCounts.length);
    } catch (error) {
      console.error("Error in fetchGroups:", error);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchBalanceSummary = async () => {
    if (!user) return;

    try {
      console.log("=== FETCHING BALANCE SUMMARY ===");

      const { data: paidExpenses, error: paidError } = await supabase
        .from("expenses")
        .select("amount")
        .eq("paid_by", user.id);

      const { data: expenseSplits, error: splitsError } = await supabase
        .from("expense_splits")
        .select("amount")
        .eq("user_id", user.id);

      if (paidError || splitsError) {
        console.error("Error fetching balance data:", { paidError, splitsError });
        return;
      }

      const totalPaid = paidExpenses?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0;
      const totalOwed = expenseSplits?.reduce((sum, split) => sum + Number(split.amount), 0) || 0;

      const netBalance = totalPaid - totalOwed;

      setBalanceSummary({
        owed: netBalance > 0 ? netBalance : 0,
        owing: netBalance < 0 ? Math.abs(netBalance) : 0,
      });

      console.log("Balance summary:", { totalPaid, totalOwed, netBalance });
    } catch (error) {
      console.error("Error in fetchBalanceSummary:", error);
    }
  };

  if (loading) {
    return (
      <MaxWidthWrapper className="py-8">
        <Loader/>
      </MaxWidthWrapper>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <MaxWidthWrapper className="py-8">
      <div className="space-y-8">
        <div className="flex flex-row items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Welcome back, {user.user_metadata?.name || user.email}!
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your expense groups and track your spending
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setHasLoadedOnce(false);
                fetchUserData();
              }}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link href="/groups/create">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Group
              </Button>
            </Link>
          </div>
        </div>

        {/* Pending Invitations */}
        {loadingInvitations ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center">Loading invitations...</div>
            </CardContent>
          </Card>
        ) : pendingInvitations.length > 0 ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center text-primary">
                <Bell className="mr-2 h-5 w-5" />
                Pending Group Invitations ({pendingInvitations.length})
              </CardTitle>
              <CardDescription>
                You have group invitations waiting for your response
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-background border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{invitation.group_name}</h4>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                          New
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Invited by <strong>{invitation.invited_by}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-0 ml-0 sm:ml-4 w-full sm:w-auto">
                      <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => acceptInvitationQuick(invitation)}
                      >
                        Accept & Join
                      </Button>
                      <Link href={`/invite/${invitation.token}`} className="w-full sm:w-auto">
                        <Button size="sm" variant="outline" className="w-full sm:w-auto">
                          <ExternalLink className="h-4 w-4 mr-1" />
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

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{groups.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingInvitations.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">You Owe</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                ${balanceSummary.owing.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">You're Owed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                ${balanceSummary.owed.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Groups</CardTitle>
            <CardDescription>Manage your expense groups</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingGroups ? (
              <div className="text-center py-8">Loading groups...</div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">You haven't joined any groups yet.</p>
                <Link href="/groups/create">
                  <Button>Create Your First Group</Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => (
                  <Link href={`/groups/${group.id}`} key={group.id} className="w-full">
                    <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                      <CardHeader>
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                        <CardDescription>{group.description || "No description"}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Users className="mr-1 h-4 w-4" />
                          {group.member_count} members
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
    </MaxWidthWrapper>
  );
}
