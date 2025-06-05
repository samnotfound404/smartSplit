import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://flowfinesse.vercel.app"

export async function POST(request: NextRequest) {
  try {
    const { groupId, email, inviterName } = await request.json()

    console.log("=== INVITATION API REQUEST ===")
    console.log("Group ID:", groupId)
    console.log("Email:", email)
    console.log("Inviter:", inviterName)
    console.log("App URL:", APP_URL)

    if (!groupId || !email || !inviterName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = createServerClient()

    // Get group details
    const { data: group, error: groupError } = await supabase.from("groups").select("*").eq("id", groupId).single()

    console.log("Group query result:", { group, groupError })

    if (groupError || !group) {
      console.error("Error fetching group:", groupError)
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    // Check if user already exists
    const { data: existingUser, error: userError } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .single()

    console.log("User check result:", { existingUser, userError })

    if (existingUser) {
      // Check if already a member
      const { data: existingMember, error: memberError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId)
        .eq("user_id", existingUser.id)
        .single()

      console.log("Member check result:", { existingMember, memberError })

      if (existingMember) {
        return NextResponse.json({ error: "User is already a member of this group" }, { status: 400 })
      }

      // Create in-app notification for existing user
      const { data: notification, error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: existingUser.id,
          type: "group_invitation",
          title: "New Group Invitation",
          message: `${inviterName} invited you to join "${group.name}"`,
          data: { group_id: groupId, inviter_name: inviterName },
        })
        .select()
        .single()

      console.log("Notification creation result:", { notification, notificationError })
    }

    // Create invitation token
    const inviteToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

    console.log("Creating invitation with token:", inviteToken)

    // Insert invitation
    const invitationData = {
      group_id: groupId,
      group_name: group.name,
      email: email,
      token: inviteToken,
      expires_at: expiresAt.toISOString(),
      invited_by: inviterName,
      used: false,
    }

    console.log("Invitation data to insert:", invitationData)

    const { data: invitation, error: invitationError } = await supabase
      .from("group_invitations")
      .insert(invitationData)
      .select()
      .single()

    console.log("Invitation creation result:", { invitation, invitationError })

    if (invitationError) {
      console.error("Error creating invitation:", invitationError)
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 })
    }

    // Send email if SendGrid is configured
    const inviteUrl = `${APP_URL}/invite/${inviteToken}`
    console.log("Invitation URL:", inviteUrl)

    if (SENDGRID_API_KEY && SENDGRID_FROM_EMAIL) {
      try {
        console.log("Sending email via SendGrid...")

        const emailData = {
          personalizations: [
            {
              to: [{ email: email }],
              subject: `You're invited to join "${group.name}" on Flow Finesse`,
            },
          ],
          from: { email: SENDGRID_FROM_EMAIL },
          content: [
            {
              type: "text/html",
              value: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #22c55e;">You're invited to Flow Finesse!</h2>
                  <p>Hi there!</p>
                  <p><strong>${inviterName}</strong> has invited you to join the expense group "<strong>${group.name}</strong>" on Flow Finesse.</p>
                  ${group.description ? `<p><em>${group.description}</em></p>` : ""}
                  <p>Flow Finesse makes it easy to split expenses and track shared costs with friends and family.</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteUrl}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a>
                  </div>
                  <p>This invitation will expire in 7 days.</p>
                  <p>If you don't have an account yet, you'll be able to create one when you accept the invitation.</p>
                  <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                  <p style="color: #666; font-size: 14px;">
                    If you didn't expect this invitation, you can safely ignore this email.
                  </p>
                </div>
              `,
            },
          ],
        }

        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SENDGRID_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailData),
        })

        console.log("SendGrid response status:", response.status)

        if (!response.ok) {
          const errorText = await response.text()
          console.error("SendGrid error:", errorText)
        } else {
          console.log("Email sent successfully")
        }
      } catch (emailError) {
        console.error("Email sending failed:", emailError)
      }
    } else {
      console.log("SendGrid not configured, skipping email")
    }

    return NextResponse.json({
      success: true,
      message: existingUser
        ? "Invitation sent! The user will receive an in-app notification and email."
        : "Invitation sent! They'll receive an email with the invitation link.",
      inviteUrl: inviteUrl,
    })
  } catch (error) {
    console.error("=== INVITATION API ERROR ===", error)
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 })
  }
}
