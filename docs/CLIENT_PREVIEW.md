# Temporary client preview

The Vercel configuration enables CLIENT_PREVIEW=true and builds with npm run build.
This deliberately overrides the dashboard migration command: no migration or seed runs for this preview.

The existing homepage uses synthetic program data. A separate preview route presents student,
teacher, guardian and administration examples without sessions or database queries.
Other navigation destinations show an explicitly labelled design placeholder.
Registration, newsletter submission, writes and API access are disabled.
Quran reading, live classes, AI, certificates and real account workflows are not connected.

All preview responses are marked noindex. This is not access control: anyone with the URL can view
the synthetic demonstration.

To restore the full application after provisioning a compatible PostgreSQL database:
remove CLIENT_PREVIEW from vercel.json (or set it to false), configure owner and restricted-role
connections, apply migrations and import/approve content, then redeploy and verify real workflows.
Do not remove or bypass the RLS migration to make the demonstration run.

Validation: run CLIENT_PREVIEW=true npm run build, then start with CLIENT_PREVIEW=true.
Check home, program detail, dashboards, English, mobile navigation, and API denial.
