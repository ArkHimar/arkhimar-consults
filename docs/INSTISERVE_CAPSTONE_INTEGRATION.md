# InstiServe PJM 499 integration

ArkHimar PM publishes signed, server-to-server capstone submission events to InstiServe. Never call the InstiServe webhook directly from browser JavaScript and never expose the shared secret in public configuration.

## ArkHimar server variables

- `INSTISERVE_CAPSTONE_WEBHOOK_URL=https://instiserve.org/api/integrations/arkhimar/capstone-submissions`
- `ARKHIMAR_INSTISERVE_WEBHOOK_SECRET=<same 32+ byte secret configured in InstiServe>`
- `INSTISERVE_INSTITUTION_CODE=TBSC`
- `INSTISERVE_CAPSTONE_COURSE_CODE=PJM 499`
- `INSTISERVE_CAPSTONE_ASSIGNMENT_TITLE=Integrated Capstone Project`
- `ARKHIMAR_PUBLIC_URL=https://arkhimar.com`
- existing Supabase URL, anon key and server-only service-role key

## Student submission

The student must be authenticated and must belong to the selected project's workspace. The client calls `submitCapstoneToInstiServe()` with the complete project snapshot, optional matric number and export links. The server loads authoritative project identity, hashes the snapshot, signs the event and sends it to InstiServe.

Use a review-and-confirm modal before calling the helper. Show:

- exact project title and code
- student email and matric number
- revision number
- completeness/readiness warnings
- deadline and late status
- declaration that the submitted work is the student's own
- Confirm and submit button
- durable success receipt or retryable failure state

Do not mark the capstone submitted until InstiServe returns an accepted receipt. Retrying the same event ID is idempotent. A later intentional submission increments the revision; InstiServe clears an obsolete prior grade and alerts the grader again.

## Security and reliability

HMAC-SHA256 covers timestamp plus the exact raw body. InstiServe enforces a five-minute replay window. Secrets remain server-only. Student identity is matched by matric number or verified email. The InstiServe audit log records the source, request ID, event ID, revision and native submission ID.
