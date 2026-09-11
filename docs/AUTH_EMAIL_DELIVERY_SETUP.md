# ArkHimar PM authentication email setup

## Why users see “email rate limit exceeded”

ArkHimar PM currently has two separate email paths:

1. The workspace invitation is sent by the ArkHimar API through Resend.
2. Account confirmation and password-reset emails are sent by Supabase Auth.

If Supabase Auth is still using its built-in demonstration mail service, the whole Supabase project can send only a very small number of authentication emails. Repeated signup, resend and reset requests share that allowance. The invitation can therefore arrive successfully while creation of the invited account fails at the verification-email step.

This is an infrastructure limit, not an invalid password or an expired workspace invitation.

## Required production configuration

Configure the existing transactional email provider as Supabase Auth's custom SMTP service. Do not store SMTP credentials in this repository.

1. In Resend, verify the ArkHimar sending domain and create a restricted transactional SMTP credential.
2. In the ArkHimar Supabase project, open **Authentication → Emails → SMTP Settings**.
3. Enable custom SMTP and enter:
   - Sender name: `ArkHimar PM`
   - Sender email: a verified ArkHimar transactional address
   - Host: `smtp.resend.com`
   - Port: `465` for implicit TLS or `587` for STARTTLS
   - Username: `resend`
   - Password: the Resend SMTP/API credential
4. Save the settings and send one confirmation email to an internal test account.
5. Open **Authentication → Rate Limits** and set an email limit appropriate for the private beta. Start conservatively, monitor delivery and abuse, and increase only when needed.
6. Confirm that the Site URL is `https://www.arkhimar.com` and that `https://www.arkhimar.com/pm/login/` is an allowed redirect URL.
7. Keep email confirmation enabled. Do not bypass ownership verification merely to avoid rate limits.

## Invitation acceptance test

Use two addresses: one with an existing ArkHimar PM account and one never used before.

1. Invite both addresses to a test workspace as ordinary members.
2. Existing user: open the invitation, choose **Sign in**, and confirm that no confirmation email is sent.
3. New user: open the invitation, choose **New user**, create an account once, and verify the received confirmation email.
4. Return to the same browser or reopen the original invitation link, sign in, and confirm the invited workspace is selected.
5. Confirm both users can see the intended project and only the permissions allowed by their roles.
6. Review Supabase Auth logs and Resend delivery logs for successful handoff and delivery.

## Support response

If the limit is reached before custom SMTP is enabled:

- Existing users should choose **Sign in** instead of creating another account.
- New users should stop retrying and wait for the email allowance to recover.
- Their invitation token remains stored in the original browser; they can also reopen the original invitation email after verification.
- An owner should not repeatedly resend the workspace invitation, because that revokes the previous invitation link.
