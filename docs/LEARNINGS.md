# What We Learned in 4 Days — CounterFlow

CounterFlow was built during the AWS x WeMakeDevs First Commit hackathon by:

- **Deva Ganesh — Builder A**
- **Siddharth Varma Mantena — Builder B**

Over four days, we went from a basic checkout workflow to a deployed AWS-native resilience-testing system that can inject a real retry failure, identify the first business invariant violation, and replay the exact same fault against a fixed implementation.

This document captures what we learned while building it.

---

## Day 1 — Building the serverless foundation

### What we built

We started by defining the basic checkout workflow:

```text
CreateOrder
    ↓
ReserveInventory
    ↓
ChargePayment
    ↓
ConfirmOrder
```

We created the AWS SAM infrastructure for:

- AWS Lambda
- AWS Step Functions
- Amazon DynamoDB
- Amazon API Gateway
- IAM permissions
- shared trace/evidence storage

### What Deva learned

I learned how a serverless workflow is actually orchestrated rather than simply calling functions one after another.

Working with Step Functions helped me understand:

- how state-machine execution works,
- how Lambda payloads move between states,
- how retries are configured,
- and how a workflow can technically succeed even when its business state is wrong.

I also learned that distributed-system correctness requires thinking about **side effects**, not only function return values.

### What Siddharth learned

Siddharth worked heavily on the infrastructure and deployment side.

He learned:

- how to define Lambda functions with AWS SAM,
- how Step Functions reference Lambda ARNs,
- how DynamoDB tables and TTL are configured through CloudFormation,
- how IAM permissions affect serverless workflows,
- and how to build and deploy a multi-service AWS application.

One practical lesson was that infrastructure configuration is part of the application itself. Small errors in packaging, permissions, or state-machine configuration can stop an otherwise correct system from running.

---

## Day 2 — Reproducing the real failure

The main failure we wanted to reproduce was:

```text
Payment succeeds
      ↓
acknowledgement is lost
      ↓
workflow believes payment failed
      ↓
workflow retries
      ↓
customer is charged again
```

We implemented:

```text
AFTER_SIDE_EFFECT_TIMEOUT
```

for `ChargePayment`.

The payment side effect is committed first, and only then do we inject the failure.

### What Deva learned

This was the most important distributed-systems lesson for me:

> **A failed function invocation does not necessarily mean its side effect failed.**

The payment can already exist even though the orchestrator sees a timeout.

That changed the way I thought about retries.

Before this project, retry logic looked like a reliability feature.

During CounterFlow, I learned that:

> **Retrying successfully is not the same as recovering correctly.**

If an operation is not idempotent, a retry can make the system more incorrect.

I also learned to model attempts separately from committed side effects.

For example:

```text
Attempt 1 → PaymentCharged
Attempt 1 → InjectedFailure
Attempt 2 → PaymentCharged
```

That distinction became the foundation of CounterFlow's evidence model.

### What Siddharth learned

Siddharth connected the frontend to the real deployed API and built the live-run experience.

He learned:

- how a React frontend communicates with API Gateway,
- how to poll asynchronous Step Functions executions,
- how to represent execution state clearly in the UI,
- and how frontend behavior changes when the backend is asynchronous rather than request/response based.

This was also where the frontend stopped being a static interface and became a visualization of real AWS execution data.

---

## Day 3 — From detecting the bug to proving the fix

Detecting the duplicate charge was only half the problem.

We needed to answer:

> Where did correctness first break?

and:

> Does the fix survive the exact same failure?

### Deterministic invariant checking

We implemented the invariant:

```text
ChargeAtMostOnce
```

For an active order:

```text
committed charges <= 1
```

For a confirmed order:

```text
committed charges == 1
```

The invariant checker is deterministic application logic.

No LLM decides whether a run passes or fails.

### First failing prefix

Instead of only returning:

```text
FAILED
```

CounterFlow identifies the earliest trace event where the invariant becomes false.

In our Buggy run:

```text
PaymentCharged        ← first committed charge
InjectedFailure
PaymentCharged        ← first invariant violation
```

### What Deva learned

I learned that observability becomes far more useful when it explains **business correctness**, not only infrastructure health.

Finding the first failing prefix forced me to think about traces as evidence rather than logs.

I also learned how to design APIs around reproducible experiments.

For Buggy vs Fixed comparison, we store the resolved fault-plan snapshot and calculate a SHA-256 hash.

The Fixed run then reuses that same stored fault instead of resolving the fault definition again.

That taught me an important experimental-design principle:

> **If you want to compare two implementations, keep the test conditions fixed.**

### Building the Fixed implementation

The Fixed payment handler uses an order-scoped payment identity and a DynamoDB conditional write.

The behavior becomes:

```text
Attempt 1
PaymentCharged

InjectedFailure

Attempt 2
PaymentReused
```

instead of:

```text
Attempt 2
PaymentCharged again
```

I learned how idempotency can turn retries from dangerous behavior into safe recovery.

### What Siddharth learned

Siddharth turned this backend evidence into a visual comparison experience.

He worked on:

- first-failing-prefix visualization,
- Buggy vs Fixed comparison,
- `PaymentReused` visualization,
- invariant result cards,
- execution timelines,
- and forensic color semantics.

One major UI lesson was that technical systems become easier to understand when the interface shows **why** something happened instead of just displaying raw events.

The final UI intentionally separates:

```text
Workflow execution
```

from:

```text
Business correctness
```

because they are not the same thing.

---

## Day 4 — Turning a prototype into a deployed product

The final day taught us that successful local code is very different from a reliable deployed system.

We moved CounterFlow into a permanent AWS deployment and performed end-to-end acceptance testing.

### Deployment hardening

We added:

- API request validation
- allowlisted fault plans
- API Gateway throttling
- DynamoDB TTL
- 7-day CloudWatch log retention
- mutation-route demo-token protection
- scoped IAM permissions
- dedicated trace endpoint
- comparison request idempotency

### Real deployment problems we discovered

Acceptance testing exposed several issues that did not appear during local testing.

#### CORS

API Gateway had to explicitly allow:

```text
X-Demo-Token
```

in CORS headers.

#### Authenticated polling

Our frontend mutation requests were authenticated, but deployed polling also needed to send the demo token.

#### Browser compatibility

The S3 HTTP-hosted frontend could not always rely on:

```text
crypto.randomUUID()
```

so we added a compatibility fallback for comparison request tokens.

These issues taught us that:

> **Deployment is part of testing.**

A project is not finished when the code works locally.

It is finished when the real browser, real API, real AWS workflow, and real deployment all work together.

---

## What we learned about AWS

Before CounterFlow, we had used parts of AWS independently.

During this project, we learned how the services work together as one system.

### AWS Step Functions

We learned how Step Functions:

- orchestrates distributed workflow steps,
- handles retries,
- carries state between Lambda functions,
- and exposes execution state.

Most importantly, we learned that orchestration success does not automatically guarantee business correctness.

### AWS Lambda

We learned how to build small business handlers while keeping execution evidence outside the functions themselves.

### Amazon DynamoDB

We used DynamoDB for:

- simulated business state,
- payment records,
- execution trace evidence,
- fault snapshots,
- TTL cleanup,
- and conditional writes for idempotency.

The conditional-write behavior became central to the Fixed implementation.

### Amazon API Gateway

We learned about:

- route configuration,
- CORS,
- throttling,
- mutation protection,
- and exposing an asynchronous backend through a REST interface.

### AWS SAM and CloudFormation

We learned that infrastructure can and should be version-controlled alongside application code.

Our entire backend deployment is reproducible from:

```text
template.yaml
```

---

## What we learned about correctness

The biggest technical takeaway from CounterFlow is:

> **Successful execution and correct business state are different properties.**

A workflow can report:

```text
SUCCEEDED
```

while the real-world result is:

```text
1 ORDER → 2 CHARGES
```

That is why CounterFlow evaluates business invariants independently.

We also learned that the useful question is not only:

> Did something fail?

but:

> At what exact side effect did the system first become incorrect?

---

## What we learned about product design

We originally thought the execution trace itself would be enough.

It wasn't.

A judge, developer, or operator should not need to read raw logs to understand the problem.

We therefore designed the UI around the story:

```text
Workflow completed
        ↓
Business invariant violated
        ↓
1 order → 2 charges
        ↓
First failing side effect
        ↓
Replay same fault
        ↓
Fixed implementation reuses payment
        ↓
1 order → 1 charge
```

The final interface uses consistent semantics:

```text
Amber  → injected fault
Red    → invariant violation
Violet → retry / reuse
Green  → preserved invariant
```

This taught us that good developer tooling needs both strong backend evidence and clear presentation.

---

## Team ownership

### Deva Ganesh — Builder A

I focused primarily on correctness and backend behavior:

- fault injection model
- Buggy and Fixed payment behavior
- trace/evidence model
- deterministic invariant checking
- first failing prefix
- Control API
- comparison semantics
- same-fault snapshot/hash verification
- request validation
- automated tests
- PRD and security hardening

### Siddharth Varma Mantena — Builder B

Siddharth focused primarily on delivery and product experience:

- AWS SAM infrastructure
- cloud deployment
- frontend implementation
- live execution screen
- result visualization
- Buggy vs Fixed comparison
- first-failing-prefix visualization
- UI polish
- permanent AWS deployment
- browser acceptance testing

### Shared work

We collaborated on:

- architecture decisions
- debugging
- AWS integration
- end-to-end testing
- security decisions
- acceptance testing
- project documentation
- demo preparation

---

## Final result

At the end of the four days, CounterFlow could demonstrate:

### Buggy

```text
1 ORDER → 2 CHARGES
₹999 expected
₹1,998 charged
₹999 overcharge
ChargeAtMostOnce FAILED
```

### Fixed

```text
1 ORDER → 1 CHARGE
₹999 charged
₹0 overcharge
PaymentReused
ChargeAtMostOnce PASSED
```

Both runs use the exact same stored fault plan.

The retry remains.

The duplicate charge does not.

---

## Our biggest takeaway

If we had to summarize the four days in one sentence:

> **Reliability is not only about recovering from failures — it is about recovering without violating the business rules that matter.**

That is the idea behind CounterFlow.