# Implementation Prompt: ArkHimar CarCare Feedback Website

Use this prompt with a coding agent when recreating, reviewing, or extending the CarCare website.

---

## Role

Act as a senior product engineer and product designer working in the `arkhimar-consults` repository. Build a production-minded customer feedback experience at:

```text
https://www.arkhimar.com/carcare
```

The site is the web front door for an n8n reputation and feedback intelligence workflow used by a multi-location car-care and auto-repair business.

Do not create a separate framework or application. Follow the repository's existing static-site build and Vercel serverless API conventions. Keep the implementation focused, accessible, responsive, and easy to demonstrate.

## Product outcome

The website must support two journeys:

1. **Customer feedback**
   - A customer opens a feedback link received after a completed visit.
   - Visit fields are prefilled from query parameters when available.
   - The customer chooses a 1–5 rating and writes a detailed comment.
   - The browser submits to an ArkHimar same-origin serverless API.
   - The API validates and forwards the request to the private n8n feedback webhook.
   - The customer receives a clear success or retry message.

2. **Staff job completion**
   - A staff member enters the job, customer, email, location, and staff access key.
   - The browser submits to a separate same-origin serverless API.
   - The API validates the staff key and forwards the visit to the private n8n job-completed webhook.
   - n8n sends the feedback request email.

## Architectural boundary

Use this flow:

```text
Browser
  -> /api/carcare/job-completed OR /api/carcare/feedback
  -> server-side validation and abuse controls
  -> n8n production webhook with X-Workflow-Secret
  -> AI analysis, history lookup, deterministic routing
  -> Airtable dashboard and optional Resend manager alert
```

Never expose these in HTML or browser JavaScript:

- n8n webhook URLs
- workflow secret
- OpenAI key
- Airtable token
- Resend key
- staff access key

## AI recommendation

Do not use a free-roaming agent to make routing decisions. Use one constrained OpenAI model call through the Responses API with Structured Outputs.

Recommended default:

```text
Model: gpt-5.6-luna
Reasoning: low
Temperature: default
Output: strict JSON schema
```

This is a high-volume, well-defined classification and drafting task. The model should analyze language and create a proposed reply; deterministic n8n rules should make the business decision.

Required AI output:

```json
{
  "sentiment_label": "positive | negative | unclear",
  "sentiment_score": -1.0,
  "severity": 0,
  "confidence": 0.0,
  "summary": "Short factual summary",
  "draft_response": "Specific proposed response, or empty for positive feedback"
}
```

Constraints:

- `sentiment_score`: number from -1 to +1.
- `severity`: integer from 0 to 10.
- `confidence`: number from 0 to 1.
- Use `unclear` when a confident interpretation is not possible.
- Drafts must acknowledge the customer's actual concern.
- Drafts must not promise compensation, claim an investigation is complete, or admit legal liability.
- No AI-generated response is sent automatically.

## Deterministic routing rules

Apply rules in this order after the AI response is validated:

1. `confidence < 0.70` or `sentiment_label = unclear` -> `human_review`.
2. Confident positive with `sentiment_score >= 0.20` -> `ready_to_post`.
3. Current negative plus any prior negative from the same `customer_id` or normalized email -> `manager_escalation`.
4. Current negative plus `severity >= 7` or `sentiment_score <= -0.70` -> `manager_escalation`.
5. Every other negative -> `private_queue`.

For every negative route, store the AI draft response. For manager escalation, save the record first and then send the manager alert.

## Website requirements

### Page structure

Build `/carcare/` with:

- ArkHimar CarCare header and clear navigation.
- Hero statement focused on listening and service recovery.
- An original, lightweight car/diagnostic visual made with inline SVG and CSS.
- Customer feedback form.
- A four-step explanation of what happens next.
- Protected staff job-completion form.
- Human-control statement in the footer.

### Visual direction

Create a distinctive car-care sub-brand that still feels connected to ArkHimar:

- Deep green-black foundation.
- Warm paper background.
- Bright lime for action and confidence.
- Teal for intelligence and successful states.
- Coral for urgency.
- Syne display typography, Inter body typography, DM Mono for system labels.
- Editorial spacing, thin technical lines, restrained motion, and data-card details.
- Avoid generic SaaS gradients, stock dashboard screenshots, or decorative clutter.

### Customer form fields

```text
job_id            required, maximum 80
customer_id       optional, maximum 80
customer_name     required, maximum 120
customer_email    required valid email, maximum 254
location          required, maximum 120
rating            required integer 1–5
feedback          required, 8–4,000 characters
website           hidden honeypot
```

Read safe prefills from:

```text
?job_id=...
&customer_id=... or &customer_key=...
&customer_name=...
&customer_email=...
&location=...
```

Do not use `innerHTML` for query-string values. Assign them through input `.value` or `textContent` and enforce maximum lengths.

### Staff form fields

Use the visit fields above plus:

```text
access_key        required, server-validated
```

The access key is submitted over HTTPS and compared server-side with constant-time equality. It is never embedded in client code.

## Serverless API requirements

Create:

```text
POST /api/carcare/job-completed
POST /api/carcare/feedback
```

Both endpoints must:

- Accept POST only.
- Enforce a small JSON body limit.
- Validate the same-origin browser request when an Origin header is present.
- Apply a small per-instance, IP-derived burst limit.
- Use a honeypot that returns a generic accepted response without forwarding.
- Validate with Zod.
- Return concise JSON and never expose internal provider responses or secrets.
- Forward only to a configured HTTPS URL, except localhost during development.
- Abort the upstream request after 15 seconds.

The staff endpoint must additionally validate `CARCARE_STAFF_ACCESS_KEY` with constant-time comparison. After authentication, it generates a new cryptographically random `job_id` for every submission and a stable, non-reversible `customer_id` from the normalized customer email. Staff must not enter either ID manually. Keep `CARCARE_ID_SECRET` stable so returning customers continue to receive the same Customer ID.

Forward to n8n with:

```http
Content-Type: application/json
X-Workflow-Secret: <CARCARE_WEBHOOK_SECRET>
```

## Environment variables

```text
CARCARE_JOB_WEBHOOK_URL=https://your-n8n.example/webhook/reputation/job-completed
CARCARE_FEEDBACK_WEBHOOK_URL=https://your-n8n.example/webhook/reputation/feedback
CARCARE_WEBHOOK_SECRET=<same value as WORKFLOW_WEBHOOK_SECRET in n8n>
CARCARE_STAFF_ACCESS_KEY=<separate long random staff key>
CARCARE_ID_SECRET=<stable random server-only customer identity secret>
```

Set the n8n workflow's customer-form variable to:

```text
FEEDBACK_FORM_URL=https://www.arkhimar.com/carcare
```

Use production webhook URLs only after activating the n8n workflow.

## Accessibility and usability

- Use semantic landmarks, labels, fieldsets, and legends.
- Provide a skip link.
- Support keyboard-only rating selection.
- Maintain visible focus states.
- Announce submission status through `role=status` and `aria-live=polite`.
- Do not rely on color alone for success or failure.
- Respect `prefers-reduced-motion`.
- Maintain a single-column mobile layout without horizontal scrolling.

## Repository integration

- Add `carcare` to `scripts/build.mjs` static-copy entries.
- Add CarCare source and API files to `scripts/check.mjs`.
- Add `/carcare` to `seo/config.mjs` and the existing-route map in `seo/render.mjs`.
- Add the four CarCare variables to `.env.example`.
- Add `/carcare/` to the README route list.
- Add automated handler tests without making real network requests.
- Do not edit generated `dist/` files directly.

## Acceptance tests

1. `npm run check` passes.
2. `npm test` passes.
3. `npm run build` produces `dist/carcare/index.html`, CSS, and JavaScript.
4. Customer form rejects missing/invalid fields.
5. Staff endpoint rejects a wrong access key.
6. Valid requests forward to the configured webhook with the secret header.
7. Webhook/provider details are absent from the browser bundle.
8. The page is usable at desktop and mobile widths.
9. Positive, first-negative, repeat-negative, and unclear demo cases visibly reach different downstream routes in Airtable.
10. No public review or draft response is automatically published or sent.

## Completion report

At completion, report:

- Files changed.
- API and security behavior.
- Checks run and their results.
- Required Vercel environment variables.
- Remaining external setup: n8n import/activation, Airtable configuration, Resend verification, and live demo data.

---

The implementation must remain honest about its boundary: the website collects and securely forwards events; n8n performs analysis and routing; Airtable provides the management dashboard; a human approves every external response and public review.
