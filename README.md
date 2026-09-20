# CounterFlow

> **Break serverless workflows before production does — then show the exact event sequence that violated a business rule.**

CounterFlow is an AWS-native correctness-testing tool for event-driven and serverless workflows.

It injects reproducible failures into a simulated checkout workflow, records the resulting execution trace, evaluates business invariants deterministically, identifies the first failing trace prefix, and reruns the exact same stored fault against a fixed implementation.

The primary demonstration exposes a classic distributed-systems failure:

> A payment side effect commits successfully, but the acknowledgement is lost.  
> The workflow retries.  
> Without idempotency, the customer is charged twice.

CounterFlow makes that failure visible, reproducible, measurable, and comparable against the fix.

---

## Live deployment

**Frontend:**  
http://counterflow-demo-web-618042349623.s3-website-us-east-1.amazonaws.com

**API:**  
https://1wmhwskvlk.execute-api.us-east-1.amazonaws.com/dev/

**AWS stack:** `counterflow-demo`  
**Region:** `us-east-1`

### Public judging access

The hackathon deployment is currently running in **public demo mode**, so judges can execute the complete CounterFlow workflow without credentials or setup.

The public deployment is intentionally constrained:

- simulated payment and inventory data only
- predefined `buggy` and `fixed` workflow versions
- allowlisted `payment-ack-lost-v1` fault plan
- strict request validation
- API Gateway throttling
- DynamoDB TTL cleanup
- no arbitrary Lambda execution
- no arbitrary workflow execution

CounterFlow also supports a protected mode using the `X-Demo-Token` authentication mechanism included in the codebase.

### Try the live demo

1. Select **Buggy**
2. Keep **Payment acknowledgement lost** selected
3. Click **Run resilience test**
4. Observe `COMPLETED` but `VIOLATED`
5. Verify `1 ORDER → 2 CHARGES`
6. Observe the ₹999 overcharge
7. Click **Compare with Fixed**
8. Verify the same stored fault was replayed
9. Observe `PaymentReused`
10. Verify `1 ORDER → 1 CHARGE` and ₹0 overcharge

The previous workshop deployment was intentionally left untouched while the permanent deployment was verified.

---

## Demo scenario

### Buggy implementation

```text
1 ORDER → 2 CHARGES

Expected:    ₹999
Charged:   ₹1,998
Overcharge:  ₹999

ChargeAtMostOnce: FAILED
```

Execution sequence:

```text
PaymentCharged
      ↓
ACK lost / timeout injected
      ↓
Retry
      ↓
PaymentCharged again
      ↓
Invariant violation
```

### Fixed implementation

The exact same stored fault plan is replayed against an idempotent payment implementation.

```text
1 ORDER → 1 CHARGE

Charged:      ₹999
Overcharge:     ₹0

ChargeAtMostOnce: PASSED
```

Execution sequence:

```text
PaymentCharged
      ↓
ACK lost / timeout injected
      ↓
Retry
      ↓
PaymentReused
      ↓
No second side effect
```

---

## Why CounterFlow exists

Retries are a normal part of serverless and event-driven systems.

A function can:

1. perform a business side effect,
2. fail before returning success,
3. be retried by the orchestrator,
4. perform the same side effect again.

Infrastructure may report that the workflow eventually completed successfully while the resulting business state is already incorrect.

CounterFlow tests the **business guarantee**, not just whether the workflow reached a terminal success state.

For the checkout demo, the core invariant is:

```text
ChargeAtMostOnce
```

For an order that has not yet been confirmed:

```text
committed payment charges <= 1
```

Once the order reaches `CONFIRMED`:

```text
committed payment charges == 1
```

The invariant checker is deterministic application code. An LLM does **not** decide whether a run passes or fails.

---

## Architecture

The following diagram shows how CounterFlow launches resilience experiments, orchestrates the checkout workflow, records evidence, evaluates invariants, and compares Buggy and Fixed implementations.

![CounterFlow AWS Architecture](./docs/counterflow-architecture.png)

### Execution flow

1. The React + Vite frontend starts a resilience test through Amazon API Gateway.
2. The Control API validates the request, applies the configured access mode, and resolves an allowlisted fault plan.
3. AWS Step Functions orchestrates the checkout workflow and retry behavior.
4. Lambda functions execute the business workflow: `CreateOrder → ReserveInventory → ChargePayment → ConfirmOrder`.
5. DynamoDB stores business state, trace evidence, fault-plan snapshots, and invariant-related data.
6. The deterministic Invariant Checker evaluates `ChargeAtMostOnce` and identifies the first failing prefix.
7. The Control API returns the evidence to the frontend and can rerun the exact same stored fault against the Fixed implementation.

### Checkout workflow

```text
CreateOrder
    ↓
ReserveInventory
    ↓
ChargePayment
    ↓
ConfirmOrder
    ↓
InvariantChecker
```

Amazon Step Functions controls orchestration and retry behavior.

Amazon DynamoDB acts as the simulated business-state and evidence store.

---

## Fault model

The primary fault profile is:

```text
payment-ack-lost-v1
```

Fault type:

```text
AFTER_SIDE_EFFECT_TIMEOUT
```

Target:

```text
ChargePayment
```

Attempt:

```text
1
```

Behavior:

```text
ChargePayment writes PaymentCharged
        ↓
CounterFlow records the committed side effect
        ↓
Injected timeout occurs
        ↓
Step Functions retries ChargePayment
```

The original run stores the full resolved fault-plan snapshot and its canonical SHA-256 hash.

The Fixed comparison run reuses the exact same stored snapshot and hash rather than resolving the named profile again.

This ensures that the comparison changes the **implementation**, not the **experiment**.

---

## Buggy vs Fixed

### Buggy

The Buggy payment implementation creates a new charge identity on each invocation.

```text
Attempt 1
charge_A → committed

timeout

Attempt 2
charge_B → committed
```

Result:

```text
2 committed charges
ChargeAtMostOnce FAILED
```

### Fixed

The Fixed implementation uses an order-scoped deterministic payment identity and a DynamoDB conditional write.

```text
Attempt 1
charge_<orderId> → committed

timeout

Attempt 2
same charge identity
conditional write prevents another committed charge
PaymentReused recorded
```

Result:

```text
1 committed charge
ChargeAtMostOnce PASSED
```

The retry still occurs.

The difference is that the Fixed implementation is idempotent under the tested fault.

---

## First failing prefix

CounterFlow does not simply report that an invariant failed.

It identifies the earliest observed trace prefix at which the business invariant becomes false.

For the duplicate-payment demonstration:

```text
Sequence 6  PaymentCharged
Sequence 7  InjectedFailure
Sequence 8  ChargePayment retry
Sequence 9  PaymentCharged   ← FIRST VIOLATION
```

The frontend receives the first-failing-prefix information from the backend.

It does not independently recalculate invariant correctness in the browser.

---

## Evidence model

Each trace entry contains structured fields such as:

```text
runId
sequence
timestamp
component
operation
orderId
eventId
attempt
phase
outcome
evidence
```

Example operations include:

```text
OrderCreated
InventoryReserved
PaymentCharged
InjectedFailure
PaymentReused
OrderConfirmed
```

Execution attempts and committed business side effects are intentionally represented separately.

That distinction is essential for showing why a retry can be operationally successful while still producing an incorrect business state.

---

## API

### Start a run

```http
POST /runs
```

Example request:

```json
{
  "workflowVersion": "buggy",
  "faultPlanId": "payment-ack-lost-v1"
}
```

In the public hackathon deployment, no authentication header is required.

Protected deployments require:

```http
X-Demo-Token: <demo-token>
```

The Control API validates the workflow version and fault-plan ID before starting execution.

### Get a run

```http
GET /runs/{runId}
```

Returns information including:

- workflow execution status
- ordered trace evidence
- invariant result
- fault-plan information
- first-failing-prefix analysis
- business-impact data

### Get the trace

```http
GET /runs/{runId}/trace
```

Returns the ordered evidence trace for the run.

### Compare against Fixed

```http
POST /runs/{runId}/compare
```

Example request:

```json
{
  "clientRequestToken": "compare-request-001"
}
```

The comparison:

- uses the exact stored source fault plan
- preserves the canonical fault-plan hash
- runs the Fixed implementation
- uses the client request token for idempotency

Repeated compare requests using the same source run and client request token identify the same comparison run.

---

## Frontend

The UI is designed as a forensic execution viewer rather than a generic cloud dashboard.

The primary flow is:

```text
Launcher
    ↓
Live execution trace
    ↓
Buggy verdict
    ↓
Run same fault against Fixed
    ↓
Side-by-side comparison
    ↓
Fixed verdict
```

### Visual semantics

```text
Ice / neutral → normal execution
Amber         → deliberately injected fault
Violet        → retry / replay / reuse
Red           → invariant violation
Green         → passed invariant
```

The Buggy result prioritizes:

```text
1 ORDER → 2 CHARGES

₹999 overcharge

first failing sequence
```

The comparison prioritizes:

```text
SAME FAULT. DIFFERENT IMPLEMENTATION.
```

The Fixed path makes `PaymentReused` visible so the user can see why the retry did not create another committed payment.

---

## AWS services used

CounterFlow uses the following AWS services.

| AWS service | Purpose |
|---|---|
| Amazon API Gateway | REST API for starting, reading, tracing, and comparing runs |
| AWS Lambda | Control API, invariant checker, and checkout business handlers |
| AWS Step Functions | Checkout orchestration and retry behavior |
| Amazon DynamoDB | Simulated business state, execution evidence, payment records, and fault-plan data |
| Amazon CloudWatch | Lambda logs and operational visibility |
| AWS CloudFormation / AWS SAM | Infrastructure as code and deployment |
| Amazon S3 static website hosting | Permanent React/Vite frontend hosting |
| AWS IAM | Scoped permissions between serverless components |

Infrastructure is defined in:

```text
template.yaml
```

Workflow definition:

```text
statemachines/checkout.asl.json
```

---

## Security and operational safeguards

CounterFlow supports two access modes.

### Protected mode

Protected deployments use the `X-Demo-Token` authentication mechanism implemented by the Control API.

When:

```text
PUBLIC_DEMO_MODE=false
```

requests require the configured demo token.

If protected mode is enabled without a configured token, the API fails closed.

### Public demo mode

The permanent hackathon judging deployment is intentionally running in public demo mode so judges can test CounterFlow without shared credentials.

Public access is constrained by:

- allowlisted fault profiles
- strict workflow-version validation
- predefined test scenarios
- API Gateway throttling
- DynamoDB TTL for temporary records
- 7-day Lambda CloudWatch log retention
- read-only DynamoDB access for the invariant checker
- scoped IAM permissions
- no arbitrary Lambda execution
- no arbitrary workflow execution
- simulated payment and inventory data only

No AWS credentials or authentication secrets are stored in the frontend.

Public demo mode is intended only for the constrained hackathon judging environment and can be disabled for protected deployments.

---

## Testing

The project currently contains:

```text
33 automated tests
```

Coverage includes:

- Buggy checkout without an injected fault
- Buggy checkout with the retry fault
- Fixed checkout without an injected fault
- Fixed checkout with the same retry fault
- deterministic invariant evaluation
- confirmed-order payment postcondition
- first failing prefix
- business-impact calculation
- Fixed `PaymentReused` behavior
- POST `/runs` contracts
- GET run contracts
- trace endpoint behavior
- compare-run contracts
- fault-plan snapshot/hash preservation
- compare idempotency
- allowlisted fault-plan validation
- request validation
- protected demo-token authentication
- protected-mode fail-closed behavior
- public-demo anonymous access

Run the full test suite:

```bash
python -m pytest -q
```

Expected:

```text
33 passed
```

Validate the SAM template:

```bash
sam validate --lint --region us-east-1
```

Build the backend:

```bash
sam build
```

Build the frontend:

```bash
cd web
npm install
npm run build
```

Current verified release status:

```text
33/33 tests passing
SAM template valid
SAM build successful
Frontend production build successful
Permanent AWS deployment verified
Anonymous Buggy run verified
Anonymous polling verified
Anonymous Buggy → Fixed comparison verified
Fixed PaymentReused behavior verified
Browser Buggy → Fixed comparison verified
```

---

## Engineering evidence

CounterFlow includes additional documentation covering both the team's learning process and the final deployed-system verification.

- 📘 [What We Learned in 4 Days](docs/LEARNINGS.md)  
  Our four-day engineering retrospective covering AWS, retries, idempotency, observability, deployment, and team ownership.

- ✅ [Permanent Deployment Acceptance Evidence](docs/ACCEPTANCE_EVIDENCE.md)  
  Final deployed-run evidence including Buggy and Fixed results, trace verification, shared fault hash, compare idempotency, and security checks.

---

## Local setup

### Prerequisites

- Python 3.12+
- Node.js and npm
- AWS CLI
- AWS SAM CLI
- Git

Clone the repository:

```bash
git clone https://github.com/devaganesh-source/counterflow.git
cd counterflow
```

### Python environment

Create and activate a virtual environment.

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the project/test dependencies required by the repository.

For the current test suite:

```bash
python -m pip install pytest boto3
```

Run tests:

```bash
python -m pytest -q
```

### Frontend

```bash
cd web
npm install
npm run dev
```

The Vite development server will print the local frontend URL.

---

## Deployment

Build the application:

```bash
sam build
```

Deploy:

```bash
sam deploy --guided
```

Recommended region:

```text
us-east-1
```

CounterFlow supports two access configurations.

### Protected deployment

Use:

```text
PublicDemoMode=false
DemoToken=<strong temporary secret>
```

Protected mode requires `X-Demo-Token`.

If `PublicDemoMode=false` and no valid token is configured, the Control API rejects the request.

For the frontend:

```text
VITE_PUBLIC_DEMO_MODE=false
```

### Public demo deployment

For a constrained demonstration environment:

```text
PublicDemoMode=true
```

No demo token is required in this mode.

For the frontend production build:

```text
VITE_PUBLIC_DEMO_MODE=true
```

Do **not** embed AWS credentials, permanent secrets, or reusable access tokens in the frontend.

After backend deployment, use the CloudFormation `ApiUrl` output as:

```text
VITE_API_BASE_URL=<ApiUrl>
```

Then rebuild and deploy the frontend.

The permanent demo frontend is hosted as an Amazon S3 static website.

---

## Permanent deployment acceptance results

Permanent deployment acceptance testing completed successfully.

**Stack**

```text
counterflow-demo
```

**Region**

```text
us-east-1
```

### Verified routes

```text
POST /runs
GET  /runs/{runId}
GET  /runs/{runId}/trace
POST /runs/{runId}/compare
```

### Public judging acceptance matrix

| Scenario | Expected | Measured result |
|---|---|---|
| Anonymous Buggy run | Starts without credentials | ✅ Verified |
| Anonymous run polling | Returns execution evidence | ✅ Verified |
| Buggy / payment ACK lost | 2 committed charges, FAIL | ✅ 2 charges, FAILED |
| Buggy business impact | ₹999 overcharge | ✅ ₹999 overcharge |
| First failing prefix | second payment localized | ✅ Sequence 9 |
| Anonymous compare | Fixed run starts without credentials | ✅ Verified |
| Fault-plan comparison | identical stored fault hash | ✅ Verified |
| Fixed / same stored fault | 1 committed charge, PASS | ✅ 1 charge, PASSED |
| Fixed retry behavior | `PaymentReused` | ✅ Verified |
| Fixed business impact | ₹0 overcharge | ✅ ₹0 overcharge |
| Browser Buggy → Fixed flow | completes end-to-end | ✅ Verified |

Protected authentication behavior is covered separately by the automated test suite.

### Latest public-demo acceptance evidence

**Anonymous Buggy run**

```text
cfc3b501-655d-4fa8-a703-0ea45200324c
```

Measured result:

```text
Workflow: SUCCEEDED
ChargeAtMostOnce: FAILED
Committed charges: 2
Expected amount: ₹999
Actual charged: ₹1,998
Overcharge: ₹999
First failing sequence: 9
```

**Anonymous Fixed comparison run**

```text
7cd7da50-60c4-50b3-8f3f-370d3122a6a8
```

Measured result:

```text
ChargeAtMostOnce: PASSED
Committed charges: 1
Actual charged: ₹999
Overcharge: ₹0
PaymentReused: attempt 2
```

**Shared fault SHA-256**

```text
cc60363731e5ec0d7754ea6504579a6154639736830674be41f17249a3ea5329
```

The same stored fault snapshot/hash was reused for the Fixed comparison.

---

## Deployment acceptance fixes

Browser and cloud acceptance testing exposed several deployment-specific issues that were corrected:

1. API Gateway CORS needed `X-Demo-Token` in `AllowHeaders` for protected deployments.
2. Frontend polling needed consistent authentication support when protected mode is enabled.
3. S3 static HTTP hosting did not reliably expose `crypto.randomUUID()`, so compare-token generation uses a compatibility fallback.
4. A configurable public demo mode was added so hackathon judges can execute the constrained demo without shared credentials.

The final judging flow was verified from a fresh browser session:

```text
Open live deployment
        ↓
Run Buggy workflow
        ↓
Workflow completes
        ↓
Invariant FAILED
        ↓
1 ORDER → 2 CHARGES
        ↓
Compare with Fixed
        ↓
Same stored fault verified
        ↓
PaymentReused
        ↓
Invariant PASSED
        ↓
1 ORDER → 1 CHARGE
```

The backend was also independently verified without authentication headers for run creation, polling, comparison, and Fixed-result retrieval.

---

## Cost considerations

CounterFlow is designed for short-lived hackathon/demo workloads.

Cost-control decisions include:

- DynamoDB `PAY_PER_REQUEST`
- DynamoDB TTL for temporary records
- short-lived Lambda invocations
- API Gateway throttling
- 7-day Lambda CloudWatch log retention
- no always-running application compute
- no required Bedrock dependency

Actual cost depends on region, execution volume, logging volume, and deployment duration.

---

## Limitations

CounterFlow intentionally demonstrates a narrow correctness problem rather than claiming to solve every distributed-systems failure.

Current limitations include:

- one primary checkout workflow
- one primary injected fault profile
- one production invariant
- simulated payments and inventory instead of external providers
- no exhaustive exploration of distributed-system state space
- no automatic discovery of arbitrary business invariants
- no Bedrock dependency in the correctness path
- protected mode uses a lightweight demo-token mechanism rather than a full production identity system
- the public judging deployment is intentionally constrained and is not a production authentication model
- the current S3 static website frontend uses HTTP

A passing result means:

> **The tested invariant survived the tested fault plan.**

It does **not** mean the entire system is bug-free or universally safe.

---

## AI-tool disclosure

AI-assisted development tools were used during implementation for activities such as:

- brainstorming
- code review
- debugging assistance
- documentation drafting
- test-case suggestions
- UI/design iteration

All correctness decisions used by the running product are implemented by deterministic application code.

AI output does not determine invariant PASS/FAIL results.

All generated or suggested implementation changes were reviewed and tested by the team before inclusion.

---

## Team

### Deva Ganesh — Builder A, correctness and backend

Primary responsibilities:

- workflow correctness logic
- run and fault-plan model
- fault injection behavior
- Buggy and Fixed payment implementations
- deterministic invariant checker
- first failing prefix
- Control API
- backend request validation
- comparison semantics
- automated tests
- backend security and PRD hardening
- technical architecture explanation
- project coordination and final demo direction

### Siddharth — Builder B, delivery and experience

Primary responsibilities:

- AWS SAM infrastructure and deployment support
- frontend implementation
- live execution timeline
- Buggy/Fixed comparison UI
- invariant/result visualization
- forensic visual system
- demo interaction flow
- permanent deployment
- deployment verification
- final UI polish

### Shared responsibilities

- architecture decisions
- security review
- end-to-end testing
- README and evaluation
- final deployment validation
- demo rehearsal
- submission packaging

---

## Repository structure

```text
counterflow/
├── docs/
│   ├── counterflow-architecture.png
│   ├── LEARNINGS.md
│   └── ACCEPTANCE_EVIDENCE.md
│
├── services/
│   ├── create_order/
│   ├── reserve_inventory/
│   ├── charge_payment/
│   ├── confirm_order/
│   ├── invariant_checker/
│   └── control_api/
│
├── shared/
│   └── ledger.py
│
├── statemachines/
│   └── checkout.asl.json
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── web/
│   ├── src/
│   └── .env.production
│
├── template.yaml
└── README.md
```

---

## Final product claim

CounterFlow is built to support one precise claim:

> We injected a reproducible failure after a simulated payment side effect. The Buggy workflow retried and produced two committed charges. CounterFlow's deterministic invariant checker identified the first failing trace prefix. After adding an idempotent conditional write, the exact same stored fault plan produced one committed charge and passed the invariant.

The retry stayed.

The duplicate charge didn't.

---

## Links

**Live demo:**  
http://counterflow-demo-web-618042349623.s3-website-us-east-1.amazonaws.com

**API:**  
https://1wmhwskvlk.execute-api.us-east-1.amazonaws.com/dev/

**Repository:**  
https://github.com/devaganesh-source/counterflow

**Demo video:**  
https://youtu.be/gf7Z9jkUyX0?feature=shared

---

## Status

```text
Core implementation:             COMPLETE
PRD hardening:                   COMPLETE
Frontend polish:                 COMPLETE
Public judging access:           COMPLETE
Automated tests:                 33/33 PASS
SAM validation:                  PASS
SAM build:                       PASS
Frontend production build:       PASS
Permanent deployment:            COMPLETE
Anonymous backend acceptance:    PASS
Acceptance testing:              PASS
Browser Buggy → Fixed flow:      PASS
README / architecture:           COMPLETE
Learning documentation:          COMPLETE
Acceptance evidence:             COMPLETE
Demo recording:                  COMPLETE
```