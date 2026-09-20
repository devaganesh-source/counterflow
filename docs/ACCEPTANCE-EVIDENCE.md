# CounterFlow Acceptance Evidence

This document records the final acceptance results from the permanent AWS deployment of CounterFlow.

---

## Permanent deployment

- **Stack:** `counterflow-demo`
- **Region:** `us-east-1`
- **API:** `https://1wmhwskvlk.execute-api.us-east-1.amazonaws.com/dev/`
- **Frontend:** `http://counterflow-demo-web-618042349623.s3-website-us-east-1.amazonaws.com`

---

## Verified routes

The following API routes were verified on the permanent deployment:

- `POST /runs`
- `GET /runs/{runId}`
- `GET /runs/{runId}/trace`
- `POST /runs/{runId}/compare`

---

## Verified Buggy run

**Run ID**

```text
3c497ed7-9051-4a5e-a6f0-3eb1e8fa9021