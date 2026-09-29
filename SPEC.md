# Fyndue — Product & Technical Specification

> Personal Finance, Debt & Expense Tracker  
> Version: 1.0  
> Product name: **Fyndue**  
> Repository: `fyndue`  
> Primary currency: UZS  
> Primary timezone: Asia/Tashkent

---

## 1. Product Vision

Fyndue is a modern personal finance application focused on four core problems:

1. Prevent missed loan and installment payments.
2. Track all debts and repayment progress in one place.
3. Understand where money is being spent.
4. Forecast how much money will remain after mandatory obligations.

Fyndue is not just an expense tracker. The product combines debt tracking, repayment schedules, expense and income tracking, accounts, budgeting, Telegram reminders, analytics and cash-flow forecasting.

**Main principle:** No missed payments. No financial chaos. One clear picture of your money.

---

## 2. Core Questions

The dashboard must answer:

- How much money do I currently have?
- How much do I owe?
- How much have I already repaid?
- What percentage of each debt is completed?
- What is my next payment?
- How many days remain until it?
- How much must I pay this month?
- Which payments are overdue?
- How much have I spent this month?
- Where is my money going?
- How much of my income goes toward debt?
- How much money is safe to spend?
- What will my balance approximately be at the end of the month?

---

## 3. MVP Scope

The first production-ready MVP must include:

- Authentication
- Multi-user data isolation
- Dashboard
- Accounts
- Income
- Expenses
- Categories
- Transfers
- Debts
- Differential loans
- Interest-free installments
- Manual repayment schedules
- Real payment schedules
- Partial payments
- Early repayment
- Debt progress
- Payment calendar
- Upcoming payments
- Telegram reminders
- Analytics
- Monthly summary
- Budgets
- PWA support
- Dark mode
- Responsive mobile-first UI

Architecture must allow future public registration, bank integrations, automatic imports, OCR, shared family budgets, exports and native apps.

---

## 4. Current Real Data for Development

### Debt A — Differential Loan

- Type: Credit
- Repayment model: Differential
- Original principal: **85,800,000 UZS**
- Exact interest rate, term, start date and current balance will be entered later.

The app must support generation of a differential repayment schedule.

### Debt B — Interest-Free Car Installment

- Type: Car Installment
- Original amount: **163,593,696 UZS**
- Already paid: **49,986,962.63 UZS**
- Remaining: **113,606,733.37 UZS**
- Interest: **0%**

Calculation:

`49,986,962.63 / 163,593,696 × 100 ≈ 30.56%`

So:

- Paid: **30.56%**
- Remaining: **69.44%**

Use this as seed data for UI and calculation tests.

---

## 5. Branding

Product name: **Fyndue**

The brand should feel like a serious modern fintech product, not a hobby project.

---

## 6. Design Direction

Visual references:

- Revolut
- Wise
- Linear
- Stripe Dashboard
- Mercury
- Ramp
- Raycast

The interface should feel premium, calm, clean, modern, precise, financial, data-focused and mobile-first.

Avoid the look of classic accounting software, generic admin templates, crypto dashboards and gaming interfaces.

---

## 7. Design System

Support Light, Dark and System themes.

Use semantic colors:

- Primary: blue/indigo
- Success: green
- Warning: amber/orange
- Danger: red
- Neutral: slate/zinc
- Info: blue

Critical state must never be communicated only with color. Example: `red + Overdue`.

Typography: Geist preferred, with Inter or Manrope acceptable.

Use tabular numeric font features for financial values.

---

## 8. Navigation

### Desktop Sidebar

- Overview
- Transactions
- Debts
- Payments
- Calendar
- Accounts
- Budgets
- Analytics
- Settings

Bottom:

- Profile
- Theme
- Logout

### Mobile Bottom Navigation

- Home
- Transactions
- Add
- Debts
- More

---

## 9. Dashboard

Route: `/dashboard`

Header:

- Greeting
- Current month
- Current date
- Quick Add
- Notifications

Example:

`Good evening, Said`

Financial overview cards:

- Available Balance
- Income This Month
- Expenses This Month
- Debt Payments This Month

If enough history exists, show comparison with the previous month.

---

## 10. Total Debt Widget

Show:

- Original total debt
- Total paid
- Remaining principal
- Paid percentage
- Remaining percentage

If available, also show:

- Remaining principal
- Expected future interest
- Planned future total payments

Never mix principal and future interest without clear labels.

---

## 11. Debt Progress

Each debt must show:

- Original amount
- Paid amount
- Remaining amount
- Percentage paid
- Percentage remaining
- Payments completed
- Payments remaining
- Next payment
- Days until next payment
- Projected payoff date

Formula:

`paid_percentage = paid_principal / original_principal × 100`

For zero-interest installment:

`paid_percentage = paid_amount / original_amount × 100`

---

## 12. Upcoming Payments

Display mandatory payments ordered by due date.

Each item:

- Debt name
- Lender
- Amount
- Due date
- Days remaining
- Status
- Mark as Paid action

Supported statuses:

- Scheduled
- Upcoming
- Due Soon
- Due Today
- Partially Paid
- Paid
- Overdue
- Rescheduled
- Skipped

Suggested status logic:

- Upcoming: more than 7 days
- Due Soon: 3–7 days
- Urgent: 1–2 days
- Due Today: 0 days
- Overdue: due date passed and not fully paid

Thresholds should later be configurable.

---

## 13. Safe to Spend

Dashboard indicator:

`Safe to Spend`

Basic formula:

`available account balance - mandatory payments due before next expected income`

If expected income is not configured, use remaining mandatory payments inside the selected month.

This is informational only and must not be presented as financial advice.

---

## 14. Cash Flow Forecast

Formula:

`current balance + expected income - planned expenses - scheduled debt payments = projected balance`

Display as **Projected balance**, never **Guaranteed balance**.

Expected income must remain separate from actual income until confirmed.

---

## 15. Debts Module

Route: `/debts`

Tabs:

- Active
- Paid Off
- Archived

Supported debt types:

- Credit
- Car Loan
- Installment
- Microloan
- Credit Card
- Mortgage
- Personal Debt
- Other

Supported repayment models:

- Differential
- Annuity
- Interest-Free Installment
- Manual Schedule
- Custom

---

## 16. Debt Creation Wizard

Use a guided wizard instead of a giant form.

1. Debt type
2. Basic information: name, lender, currency
3. Amount: original principal, current principal, already paid, optional fees
4. Repayment model
5. Terms: annual rate, start date, end date, term, payment day
6. Schedule: generate automatically / enter manually / import later
7. Review
8. Save

Persist debt and generated schedule atomically.

---

## 17. Differential Loan Logic

Standard monthly model:

`principal_part = original_principal / number_of_payments`

`interest = remaining_principal × annual_rate / 12`

`payment = principal_part + interest`

However, Fyndue must not assume every bank uses this exact method.

Banks may use:

- Actual/365
- Actual/360
- Daily interest
- Fees
- Insurance
- Custom rounding
- Non-standard periods

Therefore support:

- Manual editing
- Bank schedule override
- Importing actual schedule
- Custom payment values

Actual bank schedule always overrides generated estimates.

---

## 18. Annuity Logic

Standard formula:

`A = P × [r(1+r)^n] / [(1+r)^n - 1]`

Where:

- A = payment
- P = principal
- r = monthly rate
- n = number of periods

This calculation must live in the financial calculation layer, not in React components.

---

## 19. Interest-Free Installment

Interest = 0.

Support:

- Original amount
- Already paid
- Remaining amount
- Number of installments
- Irregular payment amounts
- Different dates
- Manual schedule editing

For the existing car installment:

- Original: 163,593,696 UZS
- Paid: 49,986,962.63 UZS
- Remaining: 113,606,733.37 UZS
- Progress: 30.56%

---


## 19A. Microloans, Fees & Real Cash Outflow

Fyndue must support microloans where the contractual principal, the amount actually received by the user, and the amount actually debited during repayment can differ because of commissions and fees.

Example:

```text
Borrowed principal: 2,000,000 UZS
Service fee: 100,000 UZS
Total repayment: 2,100,000 UZS
```

The application must keep these values separate instead of hiding the fee inside the principal.

### Required Microloan Fields

- Contract / Requested Principal
- Net Amount Received
- Interest
- Origination / Service Fee
- Other Fees
- Penalty
- Planned Repayment Amount
- Payment Processing / Transfer Fee
- Actual Account Debit
- Due Date
- Optional lender notes

### Supported Fee Modes

#### ADDED_ON_TOP

Example:

```text
Principal: 2,000,000 UZS
Fee: 100,000 UZS
Total to repay: 2,100,000 UZS
```

The user receives the full principal and repays the principal plus the fee.

#### DEDUCTED_FROM_DISBURSEMENT

Example:

```text
Contract principal: 2,000,000 UZS
Fee withheld immediately: 100,000 UZS
Net amount received: 1,900,000 UZS
Debt principal: 2,000,000 UZS
```

Fyndue must show contract principal, fee withheld and net received separately.

#### FINANCED_INTO_DEBT

Example:

```text
Requested principal: 2,000,000 UZS
Fee: 100,000 UZS
Financed debt basis: 2,100,000 UZS
```

Use this mode only when explicitly selected by the user or confirmed by the lender schedule.

#### CUSTOM

Allow a fully manual structure when the lender uses a non-standard fee model.

### Payment Processing Fee

A repayment may itself have a separate card, transfer or payment-processing fee.

Example:

```text
Amount applied to loan: 2,100,000 UZS
Payment processing fee: 15,000 UZS
Actual amount debited from Uzcard/Visa: 2,115,000 UZS
```

In this case:

- Debt payment applied to the debt = 2,100,000 UZS
- Payment processing fee = 15,000 UZS
- Actual account debit = 2,115,000 UZS

The account balance must decrease by the real `actualAccountDebit`.

### Payment Breakdown

Every debt payment must be able to separate:

- Principal
- Interest
- Origination / Service Fee
- Payment Processing / Transfer Fee
- Penalty
- Other Fees

Never merge all fees into one ambiguous value if the source data provides the breakdown.

### Total Cost of Debt

Add informational analytics:

```text
Total Cost Above Principal =
interest paid
+ origination/service fees paid
+ payment processing fees paid
+ penalties paid
+ other fees paid
```

Also track:

```text
Total Cash Outflow
```

which is the actual total amount debited from the user's accounts for that debt.

Do not confuse:

- principal remaining
- total contractual repayment
- total cost above principal
- actual cash outflow

### Known Total Repayment Mode

For microloans, allow the user to choose:

`I know the exact total repayment amount`

This is required when an MFO gives a final amount due but does not provide a clear internal split between interest and fees.

In this mode Fyndue must allow a manual contractual schedule and must not invent an interest formula.

### Accounting Rule

The debt engine and account engine must remain conceptually separate.

The debt engine tracks how much of the payment goes to principal, interest, fees and penalties.

The account engine tracks how much money actually left the selected account.

Therefore:

`actualAccountDebit` may be greater than `amountAppliedToDebt`.

This is valid and expected when there is a payment-processing fee.

---

## 20. Repayment Schedule

Desktop columns:

| # | Due Date | Opening Principal | Principal | Interest | Fees | Planned Payment | Actual Payment | Closing Principal | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|

Mobile should use cards or expandable rows.

---

## 21. Debt Detail Page

Route: `/debts/[id]`

Header:

- Debt name
- Lender
- Current balance
- Progress
- Next payment
- Status

Tabs:

- Overview
- Schedule
- Payments
- Analytics
- Documents
- Settings

---

## 22. Mark Payment as Paid

Open dialog/bottom sheet with:

- Amount
- Date
- Account
- Principal
- Interest
- Penalty
- Fees
- Note

After confirmation:

1. Validate the complete payment breakdown.
2. Create DebtPayment.
3. Create the linked account Transaction.
4. Reduce the selected account by `actualAccountDebit`.
5. Update the schedule item.
6. Reduce debt principal only by the principal component.
7. Recalculate debt progress.
8. Recalculate fee and debt-cost analytics.
9. Create an audit log entry.
10. Commit all changes in one database transaction.

For a standard repayment with no lender-specific adjustment:

```text
actualAccountDebit =
principalAmount
+ interestAmount
+ originationFeeAmount
+ paymentProcessingFeeAmount
+ penaltyAmount
+ otherFeeAmount
```

---

## 23. Partial Payment

If actual payment is less than expected payment, status becomes `Partially Paid`.

Display:

- Expected
- Paid
- Remaining

A later payment can complete the same schedule item.

---

## 24. Early Repayment

Support `Extra Principal Payment`.

Default strategy: **Reduce Term**.

Flow:

1. User enters extra amount.
2. Select account.
3. Confirm.
4. Reduce principal.
5. Regenerate future schedule.
6. Keep original schedule snapshot/history.
7. Show projected new payoff date.

Display:

- Old payoff date
- New projected payoff date
- Months reduced
- Principal reduced

For interest-bearing loans, generated savings remain estimates until confirmed against the bank schedule.

---

## 25. Payment Reversal

Do not simply delete paid financial records.

Implement `Reverse Payment`.

After reversal:

- Restore account balance
- Restore debt principal
- Reopen schedule item
- Regenerate future schedule if required
- Reverse linked transaction
- Create audit log
- Store reversal reason

---

## 26. Transactions Module

Route: `/transactions`

Transaction types:

- Expense
- Income
- Transfer
- Debt Payment
- Balance Adjustment

Quick expense flow:

1. Press +
2. Choose Expense
3. Amount autofocus
4. Select category
5. Select account
6. Optional note
7. Save

A normal expense should be recordable in a few seconds.

---

## 27. Categories

Default categories:

- Fuel
- Taxi
- Groceries
- Restaurants
- Shopping
- Car
- Home
- Utilities
- Internet
- Mobile
- Entertainment
- Travel
- Health
- Education
- Subscriptions
- Gifts
- Debt Payments
- Other

User can:

- Create
- Rename
- Reorder
- Archive
- Assign icon
- Assign optional color

---

## 28. Income

Income is variable, not fixed.

Support:

- Salary
- Freelance
- Bonus
- Cash
- Refund
- Other

Fields:

- Amount
- Account
- Source/category
- Date
- Note
- Actual / Expected

Expected income does not count as actual until confirmed.

---

## 29. Accounts

Supported account types:

- Bank Card
- Cash
- Savings
- Deposit
- Digital Wallet
- Other

Initial examples:

- Uzcard
- Visa
- Cash UZS
- Cash USD

Fields:

- Name
- Type
- Currency
- Opening balance
- Current balance
- Include in total balance
- Bank
- Icon
- Archived

---

## 30. Account Balance Logic

- Income: +
- Expense: -
- Debt payment: -
- Transfer outgoing: -
- Transfer incoming: +
- Balance adjustment: explicit reconciliation adjustment

Transfers between own accounts are not income or expenses and must not appear in spending analytics.

---

## 31. Calendar

Route: `/calendar`

Show:

- Debt payments
- Expected income
- Recurring expenses
- Subscriptions
- Other obligations

Support:

- Month view
- List/timeline view

When selecting a date, open side sheet or bottom sheet with events and actions.

---

## 32. Financial Timeline

Example:

```text
Today
↓
5 Oct — Internet — 150,000
↓
10 Oct — Microloan — 850,000
↓
15 Oct — Car Installment — 3,500,000
↓
22 Oct — Credit — 2,480,000
```

---

## 33. Telegram Integration

Telegram reminders are a core feature.

Connection flow:

1. User opens Settings → Notifications.
2. Clicks Connect Telegram.
3. Backend generates one-time connection code.
4. User opens Telegram bot.
5. User sends `/start CODE`.
6. Backend validates code.
7. Telegram Chat ID is linked to the app user.
8. Code expires after use or timeout.

Default reminders:

- 7 days before
- 3 days before
- 1 day before
- Due date
- After overdue

Intervals must be configurable.

---

## 34. Telegram Examples

Upcoming:

```text
🚘 Car Installment

Payment in 3 days

3,500,000 UZS

Due:
15 October

Remaining debt:
113,606,733.37 UZS
```

Overdue:

```text
⚠️ Payment overdue

Credit

Expected payment:
2,480,000 UZS

Due date:
22 October

Overdue:
1 day
```

Avoid spam through deduplication and rate limiting.

Initial commands:

- /start
- /today
- /upcoming
- /debts
- /month

Future:

- /expense
- /income
- /paid

---

## 35. Notification Engine

Notifications must run server-side.

Possible implementations:

- Vercel Cron
- Supabase scheduled functions
- Trigger.dev
- Dedicated worker

The implementation must be idempotent.

Running the notification job twice must not send duplicate messages.

Notification log stores:

- userId
- debtId
- scheduleItemId
- type
- channel
- scheduledAt
- sentAt
- status
- externalMessageId
- failureReason
- deduplicationKey

---

## 36. Analytics

Route: `/analytics`

Date filters:

- This Month
- Last Month
- 3 Months
- 6 Months
- Year
- Custom

Expense analytics:

- Expenses by category
- Monthly spending
- Income vs expenses
- Debt payments
- Cash flow
- Spending trend

Debt analytics:

- Original principal
- Principal paid
- Principal remaining
- Interest paid
- Interest remaining estimate
- Penalties paid
- Fees paid
- Debt progress
- Monthly debt payments
- Projected payoff date

---

## 37. Debt-to-Income Ratio

Formula:

`monthly debt payments / monthly actual income × 100`

If income is zero, display `N/A`.

Never divide by zero.

This metric is informational only.

---

## 38. Budgets

Route: `/budgets`

Support:

- Overall monthly budget
- Category budgets

Example:

`Fuel — 800,000 / 1,500,000 — 53%`

---

## 39. Monthly Summary

Display:

- Income
- Expenses
- Debt payments
- Net cash flow
- Debt reduction
- Largest expense category
- Total remaining debt
- Ending balance

Historical summaries should remain reproducible from source transactions.

---

## 40. Search & Command Palette

Global search shortcut:

- CMD + K
- CTRL + K

Search:

- Transactions
- Debts
- Accounts
- Categories
- Pages

Commands:

- Add Expense
- Add Income
- Add Debt
- Record Payment
- Transfer Money
- Open Calendar
- Open Analytics

---

## 41. Documents

Prepare architecture for private storage.

Supported formats:

- PDF
- JPG
- PNG

Types:

- Loan Agreement
- Payment Receipt
- Bank Schedule
- Other

Files must be private and authorized by userId.

---

## 42. Authentication

Recommended:

- Supabase Auth
- Auth.js

MVP:

- Email/password
- Optional Google login

Do not implement custom password storage.

---

## 43. Multi-User Architecture

Every user-owned entity must contain `userId`.

Never authorize resources only by object ID.

Every server query must conceptually enforce:

`resource.id = requestedId AND resource.userId = authenticatedUser.id`

---

## 44. Security Requirements

Implement:

- Server-side authentication
- Server-side authorization
- User data isolation
- Secure sessions
- HTTP-only secure cookies where applicable
- Input validation
- CSRF protection where applicable
- XSS prevention
- Rate limiting
- Secure headers
- Audit logging
- Private document access
- Error sanitization
- No sensitive financial data in public logs

---

## 45. Money Precision

Never use standard JavaScript floating point for critical financial calculations.

Use:

- PostgreSQL NUMERIC/DECIMAL
- Prisma Decimal
- decimal.js where appropriate

Amounts such as `49,986,962.63` must remain exact.

---

## 46. Currency

Primary currency: UZS.

Also support:

- USD
- EUR
- RUB

Do not combine balances from different currencies without explicit conversion.

Do not invent exchange rates.

MVP may use manual exchange rates.

---

## 47. Timezone

Default timezone: `Asia/Tashkent`.

Store server timestamps consistently.

Debt due dates must be interpreted in the user timezone so UTC conversion cannot accidentally move a due date by one day.

---

## 48. Recommended Stack

Frontend:

- Next.js
- React
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui
- Lucide
- Recharts
- React Hook Form
- Zod
- date-fns

Backend:

- Next.js Server Actions and/or Route Handlers

Database:

- PostgreSQL

ORM:

- Prisma

Authentication:

- Supabase Auth or Auth.js

Storage:

- Supabase Storage or S3-compatible storage

Telegram:

- Telegram Bot API

---

## 49. Recommended Project Structure

```text
app/
  (auth)/
  (dashboard)/
    dashboard/
    transactions/
    debts/
    payments/
    calendar/
    accounts/
    budgets/
    analytics/
    settings/

components/
  ui/
  dashboard/
  debts/
  transactions/
  accounts/
  analytics/

lib/
  auth/
  db/
  finance/
  notifications/
  telegram/
  validations/
  utils/

prisma/
  schema.prisma
  seed.ts

docs/
  architecture.md
  database.md
  debt-engine.md
  telegram.md
  security.md
  roadmap.md
```

---

## 50. Financial Calculation Layer

Financial formulas must not exist in React components.

Create:

```text
lib/finance/
  money.ts
  differential.ts
  annuity.ts
  installment.ts
  early-repayment.ts
  schedule.ts
  cash-flow.ts
  debt-progress.ts
  budget.ts
```

---

## 51. Core Database Entities

Minimum:

- User
- UserSettings
- Account
- Category
- Transaction
- Debt
- DebtScheduleItem
- DebtPayment
- DebtScheduleVersion
- Budget
- RecurringTransaction
- NotificationPreference
- NotificationLog
- TelegramConnection
- Document
- AuditLog

---

## 52. Conceptual Models

### User

```text
id
email
name
baseCurrency
timezone
createdAt
updatedAt
```

### UserSettings

```text
id
userId
theme
locale
defaultAccountId
weekStartsOn
createdAt
updatedAt
```

### Account

```text
id
userId
name
type
currency
openingBalance
currentBalance
includeInTotal
bank
icon
isArchived
createdAt
updatedAt
```

### Category

```text
id
userId
name
type
icon
color
isDefault
isArchived
sortOrder
createdAt
updatedAt
```

### Transaction

```text
id
userId
accountId
categoryId?
debtId?
debtPaymentId?
type
amount
currency
transactionDate
merchant?
note?
transferGroupId?
createdAt
updatedAt
```

The `Transaction.amount` for a debt payment must represent the real account movement. If `2,100,000 UZS` is applied to the loan and the processor charges `15,000 UZS`, the linked account transaction must represent `2,115,000 UZS`, while the debt breakdown remains stored in `DebtPayment`.

### Debt

```text
id
userId
name
lender
type
repaymentType
currency
originalPrincipal
currentPrincipal
alreadyPaid
netAmountReceived?
annualInterestRate?
originationFeeAmount?
feeMode?
contractTotalRepayment?
startDate
endDate?
paymentDay?
originalTermMonths?
currentProjectedEndDate?
status
notes?
createdAt
updatedAt
```

### DebtScheduleItem

```text
id
userId
debtId
scheduleVersionId
installmentNumber
dueDate
openingPrincipal
plannedPrincipal
plannedInterest
plannedFees
plannedTotal
closingPrincipal
status
createdAt
updatedAt
```

### DebtPayment

```text
id
userId
debtId
scheduleItemId?
accountId
paymentDate
amountAppliedToDebt
actualAccountDebit
principalAmount
interestAmount
originationFeeAmount
paymentProcessingFeeAmount
penaltyAmount
otherFeeAmount
isEarlyRepayment
note?
reversedAt?
createdAt
updatedAt
```

### DebtScheduleVersion

```text
id
userId
debtId
version
reason
createdAt
```

Reasons:

- Initial
- Manual edit
- Bank schedule import
- Early repayment
- Restructure
- Correction

Never destroy historical schedules when recalculating.

### Budget

```text
id
userId
categoryId?
month
year
amount
currency
createdAt
updatedAt
```

### NotificationPreference

```text
id
userId
telegramEnabled
inAppEnabled
notifyDaysBefore
notifyOnDueDate
notifyWhenOverdue
quietHoursStart?
quietHoursEnd?
createdAt
updatedAt
```

### TelegramConnection

```text
id
userId
telegramChatId
telegramUsername?
connectionCode?
connectionCodeExpiresAt?
connectedAt?
status
createdAt
updatedAt
```

### NotificationLog

```text
id
userId
debtId?
scheduleItemId?
type
channel
deduplicationKey
scheduledAt
sentAt?
status
externalMessageId?
failureReason?
createdAt
```

### Document

```text
id
userId
debtId?
type
name
storageKey
mimeType
size
createdAt
```

### AuditLog

```text
id
userId
action
entityType
entityId
metadata
createdAt
```

Important actions:

- DebtCreated
- DebtEdited
- ScheduleRegenerated
- PaymentRecorded
- PaymentReversed
- EarlyRepayment
- AccountAdjusted
- TelegramConnected

---

## 53. Data Integrity

Prevent:

- Negative payment values
- Principal below zero
- Invalid date ranges
- Schedule without debt
- Cross-user resource access
- Invalid currency combinations
- Broken transfer pairs
- Duplicate Telegram notification sending
- Actual account debit inconsistent with the validated payment breakdown
- Applying service or processing fees to principal accidentally
- Double-counting fees in both debt and expense analytics
- Treating net amount received as the same value as contract principal

Use database transactions for:

- Mark Payment Paid
- Reverse Payment
- Transfer
- Early Repayment
- Schedule regeneration

---

## 54. Onboarding

Flow:

```text
Welcome
↓
Choose currency
↓
Create accounts
↓
Add debts
↓
Configure Telegram
↓
Dashboard
```

Each step must support `Skip for now`.

---

## 55. Mobile & PWA

Fyndue must feel close to a native mobile fintech app.

Implement:

- iPhone safe areas
- Bottom navigation
- Large touch targets
- Bottom sheets
- Sticky quick add
- Responsive charts
- Mobile debt cards
- PWA standalone mode
- Web app manifest
- App icons
- Theme color

Do not promise offline financial writes unless conflict-safe synchronization exists.

---

## 56. Reusable UI Components

Create reusable components such as:

- Money
- MoneyInput
- AccountCard
- DebtCard
- DebtProgress
- UpcomingPayment
- PaymentStatusBadge
- TransactionRow
- CategoryIcon
- BudgetProgress
- EmptyState
- FinancialMetricCard
- DateRangePicker
- MobileBottomSheet
- QuickAdd
- CommandPalette

---

## 57. UX Quality

Use:

- Skeleton loading
- Clear server errors
- Disabled duplicate-submit states
- Restrained animation
- Smooth progress updates
- Accessible dialogs
- Visible focus states
- Text equivalents for charts

Avoid:

- Confetti for normal actions
- Excessive gradients
- Glassmorphism everywhere
- Neon colors
- 3D icons
- Huge hero sections
- Overloaded dashboards

---

## 58. Performance

Use:

- Server Components where useful
- Pagination
- Database indexes
- Lazy chart loading
- Query optimization
- Selective optimistic UI
- Minimal client global state

Do not store the entire app in one giant React Context.

Recommended indexes:

```text
Transaction(userId, transactionDate)
Transaction(userId, accountId)
Debt(userId, status)
DebtScheduleItem(userId, dueDate, status)
DebtPayment(userId, paymentDate)
NotificationLog(deduplicationKey)
Budget(userId, year, month)
```

---

## 59. Testing Strategy

Implement unit, integration and critical E2E tests.

Critical financial tests:

- Differential loan
- Annuity loan
- Zero-interest installment
- Microloan with fee added on top
- Microloan with fee deducted from disbursement
- Microloan with fee financed into debt
- Microloan with known total repayment
- Payment processing / transfer fee
- Actual account debit greater than amount applied to debt
- Separate fee analytics
- Partial payment
- Early repayment
- Payment reversal
- Overdue payment
- Leap year
- Month boundary
- Decimal precision
- Fully paid debt

Authorization tests:

- User A cannot read User B account.
- User A cannot update User B debt.
- User A cannot access User B documents.
- Resource IDs cannot bypass ownership checks.

Notification tests:

- Reminder sends once.
- Cron retry does not duplicate.
- Paid payment cancels future reminder.
- Overdue reminder triggers correctly.
- Quiet hours work.

---

## 60. Development Seed Data

Development-only seed:

Accounts:

- Uzcard
- Visa
- Cash UZS

Debt A:

- 85,800,000 UZS
- Differential

Debt B:

- 163,593,696 UZS
- Interest-Free Installment
- Paid: 49,986,962.63
- Remaining: 113,606,733.37

Demo Microloan:

- Principal: 2,000,000 UZS
- Fee mode: Added on Top
- Service fee: 100,000 UZS
- Total repayment: 2,100,000 UZS
- Example payment processing fee: 15,000 UZS
- Example actual account debit: 2,115,000 UZS

Demo expenses:

- Fuel
- Taxi
- Groceries

Never seed fake data into production.

---

## 61. Development Phases

### Phase 0 — Planning

Before coding:

1. Read this specification completely.
2. Produce architecture proposal.
3. Define route structure.
4. Define database schema.
5. Define design system.
6. Define financial calculation architecture.
7. Create implementation roadmap.

Do not begin by randomly generating pages.

### Phase 1 — Foundation

Implement:

- Next.js project
- TypeScript strict mode
- Tailwind
- shadcn/ui
- Design tokens
- Layout
- Authentication
- PostgreSQL
- Prisma
- User model
- User isolation
- Accounts
- Categories
- Transactions

### Phase 2 — Debt Engine

Implement:

- Debt CRUD
- Differential loans
- Annuity loans
- Interest-free installments
- Manual schedules
- Debt schedules
- Payment recording
- Partial payments
- Early repayment
- Payment reversal
- Schedule versioning
- Debt progress

This phase requires strong automated tests.

### Phase 3 — Dashboard

Connect real database data:

- Balance
- Income
- Expenses
- Debt payments
- Total debt
- Upcoming payments
- Safe to Spend
- Projected balance
- Recent transactions

No hardcoded dashboard data.

### Phase 4 — Calendar & Analytics

Implement:

- Calendar
- Timeline
- Expense analytics
- Debt analytics
- Budgets
- Monthly summary

### Phase 5 — Telegram

Implement:

- Bot
- User connection flow
- Connection tokens
- Notification worker
- Cron
- Notification log
- Deduplication
- Retry handling
- Commands

### Phase 6 — Documents

Implement:

- Private storage
- Loan agreements
- Receipts
- Bank schedules
- Access control

### Phase 7 — PWA & Polish

Implement:

- PWA
- Mobile optimization
- Dark mode
- Error states
- Loading states
- Empty states
- Accessibility
- Performance improvements

---

## 62. Required Documentation

Create and maintain:

```text
README.md
docs/architecture.md
docs/database.md
docs/debt-engine.md
docs/telegram.md
docs/security.md
docs/roadmap.md
```

---

## 63. Claude Code Working Rules

1. Read `SPEC.md` before implementing major features.
2. Do not attempt to build the full project in one huge pass.
3. Work phase by phase.
4. Maintain clean commits.
5. Do not hardcode real user financial data into production code.
6. Keep financial calculations separate from UI.
7. Add tests before modifying debt calculation logic.
8. Never use floating point for money.
9. Keep authorization server-side.
10. Maintain documentation when architecture changes.

---

## 64. First Claude Code Prompt

After placing this specification in the repository, give Claude Code this instruction:

```text
Read SPEC.md completely.

Do not implement the full application yet.

First create a technical implementation plan for Fyndue.

I want you to:

1. Propose the final project architecture.
2. Define the Next.js route structure.
3. Design the Prisma database schema.
4. Design the financial calculation layer.
5. Explain how debt schedule versioning will work.
6. Explain how payment recording and reversal will remain transaction-safe.
7. Define the authentication and authorization approach.
8. Define the Telegram notification architecture.
9. Define the design system and reusable UI component architecture.
10. Break implementation into small development milestones.

Create or update:

docs/architecture.md
docs/database.md
docs/debt-engine.md
docs/security.md
docs/roadmap.md

Do not begin Phase 2 or Telegram implementation yet.

Once the architecture is prepared, start Phase 1 only.
```

---

## 65. Product Principle

Every product decision should reinforce:

> **Fyndue should make complicated personal finances feel simple, visible and under control.**

The user should never need to manually calculate:

- what is due
- what was paid
- what remains
- what changed
- what is overdue
- where money went

Fyndue should calculate and present this clearly.

---

## 66. Final Quality Standard

Fyndue must not feel like:

- a tutorial app
- a generic admin panel
- a student project
- a spreadsheet clone

It should feel like a real fintech product that can later be released publicly.

The MVP must already have:

- consistent design system
- robust financial calculations
- secure multi-user architecture
- reliable payment tracking
- precise decimal arithmetic
- responsive UI
- production-quality code organization
