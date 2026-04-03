
## Worker Application & Onboarding Flow

### Phase 1: Database Schema
- Create `job_applications` table with fields: first_name, last_name, phone, email, worker_type, city, availability, can_drive, document_url, ssn_last4, status (pending/reviewing/approved/rejected), company_id, reference_code, notes, reviewed_by, reviewed_at
- RLS: public insert (no auth needed), company-scoped read/update for admins

### Phase 2: Public Applicant Flow (6 screens)
- Route: `/apply/:companySlug` — mobile-first, no auth required
- Step 1: Welcome (company logo + name + CTA)
- Step 2: Basic info (name, phone, email)
- Step 3: Worker type selector (visual cards)
- Step 4: Location & availability
- Step 5: Verification (document upload, optional SSN last 4)
- Step 6: Confirmation with reference number

### Phase 3: Admin Approval Panel
- Route: `/app/applications`
- Tab view: Pending / Reviewing / Approved / Rejected
- Table with avatar, name, type, status, date
- Detail drawer with tabs (Summary, Info, Documents, History)
- Approve/Reject actions that can optionally create an employee record

### Phase 4: Integration
- Add nav item for admin sidebar
- On approval → auto-create employee record + send invitation
- Detect existing users by phone/email

### Key Decisions Needed
1. Should approved applicants auto-become employees, or require a separate step?
2. Document storage: use existing `employee-documents` bucket?
3. SSN field: follow existing policy (last 4 only)?
