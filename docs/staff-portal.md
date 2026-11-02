# Staff portal

The public homepage's **Staff Login** opens `/login`. Owners and employees sign in
there and continue to `/internal`.

## Database setup

1. Apply the existing `supabase.sql` to your intended Supabase project if it has
   not already been applied.
2. Run `supabase/staff-portal.sql` in that project's SQL editor. It adds employee
   profiles, daily route jobs, employee requests, and private job photo storage.
   Existing bookings are retained. The app does not run SQL automatically.
3. Keep the actual project's URL and server-only service-role key in `.env.local`.
   Keep that file out of GitHub. In a cloud workspace, the project hostname also
   needs to be allowed by the environment's network settings.
4. Keep `INTERNAL_USERNAME`, `INTERNAL_PASSWORD`, and a long random
   `INTERNAL_SESSION_TOKEN` set for the owner account and session signing. Existing
   owner credentials continue to work. Old cookies are replaced at the next login.

## Daily workflow

- Sign in as **Owner** using the configured internal username and password.
- Open **Crew** to create an employee account with a name, email, and initial
  password. Give those credentials to the intended employee outside the app.
- In **Schedule**, choose a service date, customer, and employee to create a route
  job. Assignment is explicit: recurring customer preferences are not
  automatically converted into daily jobs.
- Employees choose **Employee** on the sign-in page and use their email/password.
  They see their assigned jobs, vehicle/contact information, their stats, and
  their requests. Owner data and unassigned customers are not sent to them.
- Employees start a job, upload front and back photos, then submit it for review.
  An absent car can be recorded without claiming a completed cleaning.
- The owner reviews submitted photos and approves the job or requests a redo.
  The displayed $1-per-approved-job amount follows the prototype; it is an
  estimate of earned pay, not a payment or payroll transfer.
- Employees can submit supply requests, questions, and issues. Owners can resolve
  them from **Crew**. The portal refreshes to show changes from other sessions.

## Scope and storage

This integrates the prototype's core owner/employee workflow with persisted data.
It does not import the HTML's sample customers, workers, financial history, or
checklists. The prototype's experimental calculators, SMS automation, GPS pins,
calendar recurrence editor, and payroll transfers are not connected services.
Photos are stored in a private bucket and are read through short-lived authorized
links. All database changes go through authenticated server routes.

The owner sees booking payment status and estimated plan values from the existing
booking model. The public homepage and signup share the advertised pricing. Staff plan values
are estimates at those current prices; historical agreed prices are not stored
in the existing booking model. No existing booking records were changed. Do not treat those estimates as
a transaction ledger or collected revenue.

Changes in this cloud workspace do not automatically update a Mac's local copy.
Use the same local project in Codex on the Mac for automatic localhost updates,
or transfer this project to the Mac and run `npm ci` then `npm run dev` there.
Nothing is pushed to GitHub by running the portal.

## Validation

`npm run test:staff` exercises signed sessions and the HTTP staff workflow against
a local in-memory Supabase fixture with synthetic credentials and records. It
does not change your Supabase project. Stop other Next servers for this checkout
before running it, because Next shares the `.next` output directory. Live
Supabase setup and network access must be verified separately after migration.
