# TermsWatch Plan

## Summary
TermsWatch will be planned as a **consumer-front, B2B-monetized** hackathon product: a user pastes two policy links or two blocks of text, the AI compares the versions, highlights what changed, flags risk, and explains the changes in plain English. The plan should be **hackathon-led but detailed enough to grow into a fuller product spec later**, with one strict guardrail: everything supports a **single polished comparison workflow**.

The write-up should optimize for **both Bolt.new and SilkFlo**. For Bolt.new, we emphasize the visible AI workflow, good UX, and a working demo. For SilkFlo, we frame the same product as a compliance/legal-ops time saver with quantifiable review-cost reduction. Sponsor/social tactics should be included directly in the plan, not treated as an afterthought.

## Key Changes
- Position the product as **TermsWatch**, with a consumer-friendly brand and messaging, but keep the commercial story grounded in compliance, legal ops, procurement, and vendor-risk teams.
- Define the core workflow as:
  1. User inputs two versions via **URL or pasted text**
  2. System fetches/extracts/normalizes content
  3. AI performs clause-aware comparison
  4. AI classifies changed clauses by risk type
  5. AI produces plain-English summaries and why-it-matters explanations
  6. UI shows **diff + summary + risk flags** in one polished flow
- Treat **URL and pasted text as supported inputs**, but explicitly state **paste-text fallback** if live fetch/extraction fails during the demo.
- Keep AI central to the product story:
  - Detect changed sections
  - Classify materiality/risk
  - Explain impact in plain English
  - Avoid claiming legal advice
- Public-facing outputs the plan must require:
  - Side-by-side or inline change view
  - 3-5 bullet summary
  - Risk labels / material-change flags
  - “Why this matters” explanations
  - Clear disclaimer that outputs are informational, not legal advice
- Include sponsor-specific planning in the document:
  - **Bolt.new**: visible step-by-step AI run, polished UX, strong demo reliability, integration story where sensible
  - **SilkFlo**: quantified manual-review pain, team/volume/time/cost assumptions, reduction in review effort
  - **SLG/social**: dual messaging assets for both consumer-rights hook and enterprise ROI hook
- Keep monitoring, alerts, saved history, and next-step drafting out of the committed build scope; they can appear only as short roadmap notes or future hooks.

## Interfaces / Product Commitments
- Product name in plan: **TermsWatch**
- Primary input modes:
  - Two URLs
  - Two pasted text blocks
- Primary user-facing outputs:
  - Diffed clauses/sections
  - Risk-tagged changes
  - Plain-English explanation
  - Overall change/risk summary
- Commercial framing:
  - Consumer-facing demo and brand
  - B2B monetization path through compliance / legal ops / vendor-risk review

## Test Plan
- URL comparison works on a known example pair.
- Pasted-text comparison works end-to-end and is reliable enough to serve as the demo fallback.
- AI output correctly distinguishes added, removed, and modified sections.
- Risk tags appear on the most important changed clauses.
- Summary is understandable to a non-lawyer.
- Demo still works if live scraping fails.
- Sponsor package is complete:
  - Bolt demo script
  - SilkFlo ROI narrative with numbers
  - Consumer-facing social post angle
  - Enterprise-facing social/judge angle

## Assumptions
- The final document is a **hybrid, hackathon-led plan**, not a pure long-term product spec.
- The plan should aim to “do it all” only in the sense of including the **full submission package**, not by expanding the shipped build into multiple workflows.
- The main demo should use a recognisable consumer-policy example, but the plan should clearly pivot that into enterprise scale and ROI.
- The product should explicitly avoid overclaiming; it surfaces change intelligence and risk signals, not legal advice.
