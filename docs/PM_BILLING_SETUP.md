# ArkHimar PM billing activation

ArkHimar PM uses Paystack hosted checkout. Card details never pass through ArkHimar servers.

## Production activation

1. Apply `supabase/migrations/202610070024_billing_and_privileged_invites.sql` to the production Supabase project.
2. Add `PAYSTACK_SECRET_KEY` to the Vercel Production environment as a secret.
3. Set `PAYSTACK_CURRENCY=USD`, or use `NGN` and configure all four per-seat subunit values listed in `.env.example`.
4. In Paystack, set the webhook URL to `https://www.arkhimar.com/api/v1/billing?action=webhook`.
5. Redeploy production, then complete one Growth test transaction and verify that the workspace subscription becomes `active`.

## Plan behavior

- Free activates without a card.
- Growth and Professional create recurring Paystack subscriptions for the selected billing period and exact seat count.
- Enterprise creates a contact-required subscription request because its published price is custom.
- A workspace with an existing paid subscription cannot start a second, different subscription. Plan and seat changes require review to prevent duplicate charges.

Webhook authenticity is checked with Paystack's SHA-512 signature before any subscription state is changed. Prices are resolved on the server; browser-supplied amounts are ignored.
