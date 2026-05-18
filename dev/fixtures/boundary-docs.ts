import type { BoundaryDoc, BoundaryLabel } from "./generator.ts";

/**
 * Hand-crafted boundary documents. Truth labels follow a strict positional
 * pattern per document so re-reading the docs is verifiable by eye:
 *
 *   resume-1   — header, repeating experience entries, education, skills
 *   invoice-7  — invoice header, bill-to, ship-to, items × N, totals, terms
 *   chat-log-3 — alternating conversation sessions
 *
 * Small variant: 3 × ~15 lines (used by seed-dev /tmp playground).
 * Large variant: 3 × 150 lines = 450 records (committed boundary.jsonl).
 */

// ────────────────────────────────────────────────────────────────────────
// small (legacy seed-dev shape — keeps existing dev launches unchanged)
// ────────────────────────────────────────────────────────────────────────

export const DOC_TEMPLATES_SMALL: BoundaryDoc[] = [
  {
    id: "resume-1",
    lines: [
      { text: "Jane Smith", truth: "ENTRY_START" },
      { text: "San Francisco, CA · jane@example.com", truth: "CONTINUATION" },
      { text: "EXPERIENCE", truth: "SECTION_HEADER" },
      { text: "Staff Engineer at Globex", truth: "ENTRY_START" },
      { text: "Led the storage team rewrite", truth: "CONTINUATION" },
      { text: "Mentored 4 engineers across 2 teams", truth: "CONTINUATION" },
      { text: "Reduced p99 latency by 40%", truth: "CONTINUATION" },
      { text: "Senior Engineer at Initech", truth: "ENTRY_START" },
      { text: "Built the payments ingestion pipeline", truth: "CONTINUATION" },
      { text: "Migrated three services to gRPC", truth: "CONTINUATION" },
      { text: "EDUCATION", truth: "SECTION_HEADER" },
      { text: "BS Computer Science, MIT, 2017", truth: "ENTRY_START" },
      { text: "Coursework: distributed systems, ML", truth: "CONTINUATION" },
      { text: "SKILLS", truth: "SECTION_HEADER" },
      { text: "Go, Rust, TypeScript, SQL", truth: "CONTINUATION" },
    ],
  },
  {
    id: "invoice-7",
    lines: [
      { text: "INVOICE #2026-0042", truth: "ENTRY_START" },
      { text: "Date: 2026-04-12", truth: "CONTINUATION" },
      { text: "Bill To:", truth: "SECTION_HEADER" },
      { text: "Acme Corporation", truth: "ENTRY_START" },
      { text: "123 Market Street, San Francisco, CA 94103", truth: "CONTINUATION" },
      { text: "Items:", truth: "SECTION_HEADER" },
      { text: "1x Engineering audit — $2,400", truth: "ENTRY_START" },
      { text: "2x Code review session — $1,800", truth: "ENTRY_START" },
      { text: "Subtotal: $4,200", truth: "CONTINUATION" },
      { text: "Tax: $360", truth: "CONTINUATION" },
      { text: "Total: $4,560", truth: "CONTINUATION" },
      { text: "Payment Terms:", truth: "SECTION_HEADER" },
      { text: "Net 30, wire transfer preferred", truth: "CONTINUATION" },
    ],
  },
  {
    id: "chat-log-3",
    lines: [
      { text: "[2026-04-12 09:01] standup channel", truth: "SECTION_HEADER" },
      { text: "alice: morning everyone", truth: "ENTRY_START" },
      { text: "bob: morning", truth: "ENTRY_START" },
      { text: "carol: morning, what's on the board today?", truth: "ENTRY_START" },
      { text: "alice: I'm picking up the boundary task slice", truth: "CONTINUATION" },
      { text: "bob: nice. need a review on PR #28", truth: "CONTINUATION" },
      { text: "carol: I'll grab it after lunch", truth: "CONTINUATION" },
      { text: "alice: thanks", truth: "CONTINUATION" },
      { text: "[2026-04-12 14:22] random channel", truth: "SECTION_HEADER" },
      { text: "bob: anyone seen the migration error?", truth: "ENTRY_START" },
      { text: "alice: which one", truth: "CONTINUATION" },
      { text: "bob: 0006 doc-id view", truth: "CONTINUATION" },
      { text: "alice: looking", truth: "CONTINUATION" },
      { text: "alice: lgtm now, was a stale snapshot", truth: "CONTINUATION" },
      { text: "       ", truth: "NOISE" },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────
// large — 3 docs × exactly 150 lines = 450 records
// Builders are positional: truth depends on index, not PRNG.
// ────────────────────────────────────────────────────────────────────────

function buildResume(): BoundaryDoc {
  // Layout: header(5) + EXP(1) + 8 entries × 15(120) + EDU(1) + 2 entries × 5(10)
  //       + SKILLS(1) + 12 skill bullets(12) = 5+1+120+1+10+1+12 = 150
  const lines: { text: string; truth: BoundaryLabel }[] = [];

  // Header — 1 ENTRY_START + 4 CONTINUATION
  lines.push({ text: "Priya Raman", truth: "ENTRY_START" });
  lines.push({ text: "Bangalore, India · priya.raman@example.com", truth: "CONTINUATION" });
  lines.push({ text: "+91-98765-43210 · linkedin.com/in/priyaraman", truth: "CONTINUATION" });
  lines.push({
    text: "Staff Software Engineer with 12+ years across data, infra, and platform.",
    truth: "CONTINUATION",
  });
  lines.push({
    text: "Open to staff/principal roles in payments, search, or developer tools.",
    truth: "CONTINUATION",
  });

  // EXPERIENCE — 1 SECTION_HEADER + 8 entries × 15 lines
  lines.push({ text: "PROFESSIONAL EXPERIENCE", truth: "SECTION_HEADER" });

  const jobs: { title: string; bullets: string[] }[] = [
    {
      title: "Staff Engineer · Globex Payments · 2022 – Present",
      bullets: [
        "Owned the cross-region payments ledger rewrite (Postgres → CockroachDB).",
        "Cut median checkout latency from 380ms to 110ms over four quarters.",
        "Designed the idempotency-key model adopted across 9 services.",
        "Led on-call rotation of 14 engineers; reduced pages 60% via SLO budgets.",
        "Mentored 6 ICs to Senior; ran weekly tech reading group.",
        "Authored 12 internal RFCs covering retries, fencing, and replay.",
        "Spoke at PaymentsCon 2024 on multi-region invariants under network partitions.",
        "Drove migration of 3PB of transaction logs to a columnar store.",
        "Designed a budget-aware queue scheduler that flattened weekend spikes.",
        "Built deterministic replay harness used in every regression run.",
        "Negotiated SLA terms with three upstream issuers, saving $1.4M/yr.",
        "Implemented Two-Phase-Commit fast-path for low-volume corridors.",
        "Drove FedRAMP audit prep across data plane and control plane.",
        "Reduced primary-DB lock contention from 14/min to <1/hr.",
      ],
    },
    {
      title: "Senior Engineer · Initech Risk · 2019 – 2022",
      bullets: [
        "Built the real-time fraud scoring pipeline (Kafka → Flink → Cassandra).",
        "Cut false-positive rate from 7.4% to 2.1% on credit-card chargebacks.",
        "Shipped a multi-tenant model registry adopted by 5 teams.",
        "Owned p99 budget for the decisioning service across three regions.",
        "Designed an exactly-once sink for downstream reporting.",
        "Mentored 4 new-grads through the team's onboarding ladder.",
        "Ran a brown-bag series on observability for ML systems.",
        "Wrote the team's incident review playbook; ran 22 reviews.",
        "Migrated batch jobs from cron to Airflow; cut failures 80%.",
        "Built feature freshness SLOs and dashboards.",
        "Owned tooling for shadow-traffic experiments.",
        "Reviewed ~1200 PRs over three years.",
        "Hosted weekly office hours for the platform org.",
        "Co-authored the team's testing-pyramid guidelines.",
      ],
    },
    {
      title: "Engineer · Stark Industries Data · 2017 – 2019",
      bullets: [
        "Built the warehouse ELT framework still used company-wide.",
        "Authored the dbt-style transformation library in Python.",
        "Reduced nightly batch runtime from 6h to 90 minutes.",
        "Designed schema registry consumed by 40+ services.",
        "Owned the data quality monitoring stack.",
        "Wrote the team's SQL style guide; got it adopted in 4 teams.",
        "Built the data catalog UI and search index.",
        "Hosted weekly SQL clinics for non-engineers.",
        "Ran the data engineering interview loop for two years.",
        "Designed PII tagging conventions later codified in policy.",
        "Migrated 200 legacy reports off the old BI tool.",
        "Built the lineage graph and exposed it as a service.",
        "Authored the warehouse load-test harness.",
        "Standardized timezone handling across all event sources.",
      ],
    },
    {
      title: "Engineer · Acme Cloud Storage · 2016 – 2017",
      bullets: [
        "Worked on the consistent hashing layer for the object store.",
        "Owned the repair worker; cut MTTR from 4h to 25 minutes.",
        "Built the rolling-restart orchestrator used in fleet ops.",
        "Designed the cold-storage tiering policy.",
        "Authored the bucket-policy linter run on every config push.",
        "Owned client SDK for Python; bumped adoption 3×.",
        "Wrote the post-mortem template adopted org-wide.",
        "Built a streaming verification tool for 100GB+ objects.",
        "Reduced cross-zone traffic by 35% via locality hints.",
        "Designed the eviction algorithm for the metadata cache.",
        "Built integration tests for AWS S3 compat mode.",
        "Designed the per-bucket QoS isolation knobs.",
        "Owned the on-call training program.",
        "Wrote a primer on Raft that's still in onboarding docs.",
      ],
    },
    {
      title: "Engineer · Wayne Enterprises Search · 2015 – 2016",
      bullets: [
        "Owned the query-planner cache layer.",
        "Built the typo-tolerance scoring extension.",
        "Designed offline relevance evaluation harness.",
        "Shipped multilingual stemming for Tamil and Hindi.",
        "Owned the index-build orchestrator across 6 clusters.",
        "Wrote the synonym dictionary curation tool.",
        "Built the spellcheck training corpus pipeline.",
        "Designed the canary rollout for ranking changes.",
        "Authored a paper on click-attribution under heavy-tail queries.",
        "Built A/B framework for ranking experiments.",
        "Owned latency budgeting for the autosuggest service.",
        "Reduced cold-start time for the suggest service from 8min to 40s.",
        "Hosted weekly relevance review meetings.",
        "Mentored two interns to full-time hires.",
      ],
    },
    {
      title: "Engineer · Cyberdyne Robotics · 2014 – 2015",
      bullets: [
        "Worked on the path-planning service for warehouse pickers.",
        "Built the kinematic-constraint solver in C++.",
        "Designed the offline simulation harness.",
        "Authored the safety-envelope tests run in CI.",
        "Built the fleet-visualization dashboard.",
        "Owned protocol upgrades for the radio control link.",
        "Designed the geofence editor used by ops.",
        "Built the localization fallback for GPS-degraded zones.",
        "Wrote unit tests for the trajectory smoother.",
        "Built a Python REPL for ad-hoc fleet commands.",
        "Owned hardware-in-the-loop CI for two robot models.",
        "Mentored a junior on motion planning fundamentals.",
        "Built the spare parts inventory linter.",
        "Authored the on-site debug checklist for techs.",
      ],
    },
    {
      title: "SWE Intern · Tyrell Genomics · Summer 2013",
      bullets: [
        "Built the variant-calling pipeline orchestrator.",
        "Wrote the BAM file sharding tool.",
        "Designed the resource estimator for compute jobs.",
        "Authored the bioinformatics SDK Python bindings.",
        "Profiled and optimized the Smith-Waterman implementation 4×.",
        "Built the per-pipeline cost-attribution tool.",
        "Wrote unit tests for the alignment engine.",
        "Owned the demo for the end-of-summer presentation.",
        "Designed the dashboard for genome QC metrics.",
        "Built a CLI for pipeline submission.",
        "Documented the team's onboarding process.",
        "Wrote the user guide for the variant filter DSL.",
        "Built the team's first integration-test harness.",
        "Migrated the team's wiki to Markdown.",
      ],
    },
    {
      title: "SWE Intern · OmniCorp Mobile · Summer 2012",
      bullets: [
        "Built the push-notification scheduler for the mobile app.",
        "Worked on the offline-sync engine for the iOS client.",
        "Designed the conflict-resolution policy for shared notes.",
        "Built the analytics SDK Android module.",
        "Wrote the team's first integration tests on real devices.",
        "Owned the demo for the end-of-summer review.",
        "Designed the push-token rotation policy.",
        "Built the in-app feedback widget.",
        "Wrote the test plan for the next-quarter A/B.",
        "Profiled cold-start time and got it under 1s.",
        "Built the crash-report deduplication tool.",
        "Mentored a returning intern on Android internals.",
        "Documented the team's coding conventions.",
        "Wrote the API client for the loyalty service.",
      ],
    },
  ];
  for (const job of jobs) {
    lines.push({ text: job.title, truth: "ENTRY_START" });
    for (const bullet of job.bullets) {
      lines.push({ text: bullet, truth: "CONTINUATION" });
    }
  }

  // EDUCATION — 1 SECTION_HEADER + 2 entries × 5 lines
  lines.push({ text: "EDUCATION", truth: "SECTION_HEADER" });
  const degrees = [
    {
      title: "MS Computer Science · Stanford University · 2014",
      bullets: [
        "Specialization: distributed systems and databases.",
        "Advisor: Prof. K. Iyengar; thesis on consistent hashing under churn.",
        "Teaching assistant for CS244B (distributed systems) two quarters.",
        "Co-organizer of the Stanford systems reading group.",
      ],
    },
    {
      title: "BTech Computer Science · IIT Madras · 2012",
      bullets: [
        "Graduated with Institute Silver Medal (top 1%).",
        "Captain of the programming team; ICPC regionals top 10.",
        "Undergraduate thesis on cache-oblivious algorithms.",
        "Member of the Robotics Club for three years.",
      ],
    },
  ];
  for (const deg of degrees) {
    lines.push({ text: deg.title, truth: "ENTRY_START" });
    for (const bullet of deg.bullets) {
      lines.push({ text: bullet, truth: "CONTINUATION" });
    }
  }

  // SKILLS — 1 SECTION_HEADER + 12 CONTINUATION
  lines.push({ text: "SKILLS & INTERESTS", truth: "SECTION_HEADER" });
  const skills = [
    "Languages: Go, Rust, TypeScript, Python, SQL",
    "Datastores: Postgres, CockroachDB, Cassandra, Redis, Kafka",
    "Infra: Kubernetes, Terraform, Pulumi, AWS, GCP",
    "Observability: Prometheus, Grafana, OpenTelemetry, Honeycomb",
    "Build/CI: Bazel, Buck2, GitHub Actions, Buildkite",
    "Testing: property-based, fuzzing, chaos engineering",
    "Architecture: event sourcing, CQRS, CRDTs, consensus",
    "Security: threat modeling, key rotation, hardware tokens",
    "Data engineering: dbt, Airflow, Flink, Spark",
    "ML systems: feature stores, model registries, online serving",
    "Languages spoken: English (native), Tamil (native), Hindi (fluent)",
    "Hobbies: long-distance cycling, board games, classical guitar",
  ];
  for (const skill of skills) lines.push({ text: skill, truth: "CONTINUATION" });

  if (lines.length !== 150) {
    throw new Error(`resume builder produced ${lines.length} lines, expected 150`);
  }
  return { id: "resume-1", lines };
}

function buildInvoice(): BoundaryDoc {
  // Layout: header(5) + Bill-To(1+5) + Ship-To(1+5) + Items header(1)
  //       + 14 items × 8(112) + Totals(1+5) + Terms(1+5) + 3 NOISE = 5+6+6+1+112+6+6+3 + 5 = ?
  // 5 + 6 + 6 + 1 + 112 + 6 + 6 + 3 = 145 → need 5 more
  // Add 5-line legal footer (CONTINUATION) → 150
  const lines: { text: string; truth: BoundaryLabel }[] = [];

  // Header
  lines.push({ text: "INVOICE #2026-0042", truth: "ENTRY_START" });
  lines.push({ text: "Issued: 2026-04-12", truth: "CONTINUATION" });
  lines.push({ text: "Due: 2026-05-12 (Net 30)", truth: "CONTINUATION" });
  lines.push({ text: "Vendor: Globex Engineering Services Pvt Ltd", truth: "CONTINUATION" });
  lines.push({ text: "Vendor GSTIN: 29AABCG1234F1Z5", truth: "CONTINUATION" });

  // Bill-To
  lines.push({ text: "BILL TO:", truth: "SECTION_HEADER" });
  lines.push({ text: "Acme Corporation", truth: "CONTINUATION" });
  lines.push({ text: "123 Market Street", truth: "CONTINUATION" });
  lines.push({ text: "San Francisco, CA 94103", truth: "CONTINUATION" });
  lines.push({ text: "United States", truth: "CONTINUATION" });
  lines.push({ text: "Attn: Accounts Payable · ap@acme.example", truth: "CONTINUATION" });

  // Ship-To
  lines.push({ text: "SHIP TO:", truth: "SECTION_HEADER" });
  lines.push({ text: "Acme Engineering Office", truth: "CONTINUATION" });
  lines.push({ text: "200 Brannan Street, Floor 4", truth: "CONTINUATION" });
  lines.push({ text: "San Francisco, CA 94107", truth: "CONTINUATION" });
  lines.push({ text: "Receiving hours: Mon–Fri 09:00–17:00", truth: "CONTINUATION" });
  lines.push({ text: "Contact: Robin Mehra · robin@acme.example", truth: "CONTINUATION" });

  // Items
  lines.push({ text: "ITEMS:", truth: "SECTION_HEADER" });
  const items: { title: string; lines: string[] }[] = [
    {
      title: "Item 1: Architecture Review (24h × $250/h)",
      lines: [
        "Quantity: 24 hours",
        "Unit rate: $250.00",
        "Subtotal: $6,000.00",
        "SKU: PRO-ARCH-REV",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: completed 2026-04-08",
      ],
    },
    {
      title: "Item 2: Performance Audit (16h × $260/h)",
      lines: [
        "Quantity: 16 hours",
        "Unit rate: $260.00",
        "Subtotal: $4,160.00",
        "SKU: PRO-PERF-AUD",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: completed 2026-04-09",
      ],
    },
    {
      title: "Item 3: Code Review Sessions (8 sessions × $400)",
      lines: [
        "Quantity: 8 sessions",
        "Unit rate: $400.00",
        "Subtotal: $3,200.00",
        "SKU: PRO-CR-SESS",
        "Discount: 5%",
        "Tax category: services",
        "Delivery: completed 2026-04-10",
      ],
    },
    {
      title: "Item 4: Incident Postmortem Workshop (4h × $300)",
      lines: [
        "Quantity: 4 hours",
        "Unit rate: $300.00",
        "Subtotal: $1,200.00",
        "SKU: PRO-IR-WS",
        "Discount: 0%",
        "Tax category: training",
        "Delivery: scheduled 2026-04-19",
      ],
    },
    {
      title: "Item 5: Migration Plan Drafting (12h × $280/h)",
      lines: [
        "Quantity: 12 hours",
        "Unit rate: $280.00",
        "Subtotal: $3,360.00",
        "SKU: PRO-MIG-PLAN",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: completed 2026-04-07",
      ],
    },
    {
      title: "Item 6: On-call Coaching Retainer (40h × $200/h)",
      lines: [
        "Quantity: 40 hours",
        "Unit rate: $200.00",
        "Subtotal: $8,000.00",
        "SKU: PRO-OC-COACH",
        "Discount: 10%",
        "Tax category: services",
        "Delivery: in progress",
      ],
    },
    {
      title: "Item 7: Observability Stack Review (20h × $260/h)",
      lines: [
        "Quantity: 20 hours",
        "Unit rate: $260.00",
        "Subtotal: $5,200.00",
        "SKU: PRO-OBS-REV",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: completed 2026-04-11",
      ],
    },
    {
      title: "Item 8: Hiring Loop Calibration (6h × $300/h)",
      lines: [
        "Quantity: 6 hours",
        "Unit rate: $300.00",
        "Subtotal: $1,800.00",
        "SKU: PRO-HIRE-CAL",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: completed 2026-04-05",
      ],
    },
    {
      title: "Item 9: SRE On-call Tooling Build (24h × $260/h)",
      lines: [
        "Quantity: 24 hours",
        "Unit rate: $260.00",
        "Subtotal: $6,240.00",
        "SKU: PRO-SRE-TOOL",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: in progress",
      ],
    },
    {
      title: "Item 10: Postgres Tuning Engagement (32h × $260/h)",
      lines: [
        "Quantity: 32 hours",
        "Unit rate: $260.00",
        "Subtotal: $8,320.00",
        "SKU: PRO-PG-TUNE",
        "Discount: 7%",
        "Tax category: services",
        "Delivery: completed 2026-04-06",
      ],
    },
    {
      title: "Item 11: Kafka Throughput Investigation (18h × $260/h)",
      lines: [
        "Quantity: 18 hours",
        "Unit rate: $260.00",
        "Subtotal: $4,680.00",
        "SKU: PRO-KAFKA-INV",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: completed 2026-04-09",
      ],
    },
    {
      title: "Item 12: GraphQL Federation Migration (10h × $300/h)",
      lines: [
        "Quantity: 10 hours",
        "Unit rate: $300.00",
        "Subtotal: $3,000.00",
        "SKU: PRO-GQL-FED",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: scheduled 2026-04-20",
      ],
    },
    {
      title: "Item 13: SOC2 Pre-audit Walkthrough (6h × $320/h)",
      lines: [
        "Quantity: 6 hours",
        "Unit rate: $320.00",
        "Subtotal: $1,920.00",
        "SKU: PRO-SOC2-PRE",
        "Discount: 0%",
        "Tax category: compliance",
        "Delivery: completed 2026-04-04",
      ],
    },
    {
      title: "Item 14: Capacity Planning Spreadsheet (4h × $260/h)",
      lines: [
        "Quantity: 4 hours",
        "Unit rate: $260.00",
        "Subtotal: $1,040.00",
        "SKU: PRO-CAP-PLAN",
        "Discount: 0%",
        "Tax category: services",
        "Delivery: completed 2026-04-03",
      ],
    },
  ];
  for (const it of items) {
    lines.push({ text: it.title, truth: "ENTRY_START" });
    for (const sub of it.lines) lines.push({ text: sub, truth: "CONTINUATION" });
  }

  // Totals
  lines.push({ text: "TOTALS:", truth: "SECTION_HEADER" });
  lines.push({ text: "Subtotal: $58,120.00", truth: "CONTINUATION" });
  lines.push({ text: "Total discounts: $2,310.00", truth: "CONTINUATION" });
  lines.push({ text: "Net subtotal: $55,810.00", truth: "CONTINUATION" });
  lines.push({ text: "GST (18%): $10,045.80", truth: "CONTINUATION" });
  lines.push({ text: "GRAND TOTAL: $65,855.80", truth: "CONTINUATION" });

  // Terms
  lines.push({ text: "PAYMENT TERMS:", truth: "SECTION_HEADER" });
  lines.push({
    text: "Net 30. Wire transfer preferred. ACH accepted.",
    truth: "CONTINUATION",
  });
  lines.push({ text: "Bank: HDFC Bank · Account: 50100123456789", truth: "CONTINUATION" });
  lines.push({ text: "IFSC: HDFC0000234 · SWIFT: HDFCINBB", truth: "CONTINUATION" });
  lines.push({ text: "Late fee: 1.5% per month on overdue balances.", truth: "CONTINUATION" });
  lines.push({ text: "Disputes must be raised within 14 days of receipt.", truth: "CONTINUATION" });

  // Legal footer (5 CONTINUATION) — covers the 145→150 padding
  lines.push({ text: "This invoice is generated electronically.", truth: "CONTINUATION" });
  lines.push({
    text: "All amounts in USD unless otherwise noted.",
    truth: "CONTINUATION",
  });
  lines.push({ text: "Authorized signatory: Priya Raman", truth: "CONTINUATION" });
  lines.push({
    text: "For queries: invoices@globex-eng.example",
    truth: "CONTINUATION",
  });
  lines.push({ text: "Thank you for your business.", truth: "CONTINUATION" });

  // Trailing noise (3 NOISE)
  lines.push({ text: "       ", truth: "NOISE" });
  lines.push({ text: ".", truth: "NOISE" });
  lines.push({ text: "—", truth: "NOISE" });

  if (lines.length !== 150) {
    throw new Error(`invoice builder produced ${lines.length} lines, expected 150`);
  }
  return { id: "invoice-7", lines };
}

function buildChatLog(): BoundaryDoc {
  // Layout: 15 sessions × 10 lines each.
  // Per session: 1 SECTION_HEADER + 3 turns × 3 messages (ENTRY_START + 2× CONTINUATION).
  // 15 × 10 = 150.
  const lines: { text: string; truth: BoundaryLabel }[] = [];

  type Turn = [string, string, string];
  type Session = { header: string; turns: [Turn, Turn, Turn] };

  const sessions: Session[] = [
    {
      header: "[2026-04-12 09:01] #standup",
      turns: [
        [
          "alice: morning everyone",
          "alice: picking up the boundary slice today",
          "alice: should land by EOD",
        ],
        [
          "bob: morning. need a review on PR #42",
          "bob: small change to the queue parser",
          "bob: low-risk; tests cover the new branches",
        ],
        [
          "carol: morning. on the perf harness today",
          "carol: running large.jsonl against the worker path",
          "carol: will share numbers in #perf later",
        ],
      ],
    },
    {
      header: "[2026-04-12 11:14] #ingest",
      turns: [
        [
          "alice: throughput dropped to 700/sec on prod",
          "alice: started after the 11:00 deploy",
          "alice: rolling back now",
        ],
        [
          "bob: rolled back. throughput back to 1400/sec",
          "bob: looking at the diff between the two builds",
          "bob: suspect the contentHashId path",
        ],
        [
          "carol: confirmed — hashing context_before twice on each row",
          "carol: patch up in a sec",
          "carol: regression test added in PR #58",
        ],
      ],
    },
    {
      header: "[2026-04-12 13:45] #ux",
      turns: [
        [
          "elena: stats screen drilldowns landing now",
          "elena: by-correction targets work end-to-end",
          "elena: ADR 0007 wording will need a small tweak",
        ],
        [
          "frank: love the new banding contrast",
          "frank: works under truecolor and 256",
          "frank: mono falls back cleanly",
        ],
        [
          "grace: candidate-pin should clamp at 0.9",
          "grace: 0.95 pushes footer offscreen at 24-row terminals",
          "grace: filing a small PR for that",
        ],
      ],
    },
    {
      header: "[2026-04-12 15:02] #export",
      turns: [
        [
          "henry: JSONL export shipping today",
          "henry: CSV uses latestEffectiveByRecord for current-state",
          "henry: review-log reads raw reviews per PRD §16.1",
        ],
        [
          "iris: stats markdown looking great",
          "iris: one nit — NULL confidences sort last in the table",
          "iris: matches the queue ordering convention",
        ],
        [
          "jack: tested against medium.jsonl",
          "jack: exports in 1.8s, well within budget",
          "jack: shipping after lunch",
        ],
      ],
    },
    {
      header: "[2026-04-12 16:18] #re-ingest",
      turns: [
        [
          "kim: re-ingest landed in main",
          "kim: three-bucket diff working as designed",
          "kim: orphan bucket excluded from default queues",
        ],
        [
          "leo: tested with --rename across a 5K record set",
          "leo: all reviews preserved, source-path updated",
          "leo: covered in test/e2e/migrate.test.ts",
        ],
        [
          "mia: documenting ADR 0002 amendment now",
          "mia: draft up by tomorrow morning",
          "mia: closes #11",
        ],
      ],
    },
    {
      header: "[2026-04-13 09:00] #standup",
      turns: [
        [
          "alice: morning. fixtures slice today",
          "alice: writing the README + boundary expansion",
          "alice: should be a one-day slice",
        ],
        [
          "bob: morning. signals worker fallout",
          "bob: two small bugs from yesterday's merge",
          "bob: fix going up in an hour",
        ],
        [
          "carol: morning. perf harness done",
          "carol: envelope holds under 1.2× across 10 runs",
          "carol: nothing flaky in the last week",
        ],
      ],
    },
    {
      header: "[2026-04-13 10:30] #signals",
      turns: [
        [
          "bob: low_confidence threshold drifting",
          "bob: median confidence dropped 0.04 since last week",
          "bob: investigating whether ingest changed",
        ],
        [
          "nina: could be the schema-inference path",
          "nina: we sample first 100 records — small fixtures bias the cutoff",
          "nina: medium.jsonl gives a stabler signal",
        ],
        [
          "bob: good point. tests covering this are weak",
          "bob: adding a calibration test against medium.jsonl",
          "bob: will rerun nightly",
        ],
      ],
    },
    {
      header: "[2026-04-13 13:00] #release",
      turns: [
        [
          "olive: cut RC1 of v0.4",
          "olive: smoke matrix passing on macOS arm64 and linux x64",
          "olive: darwin x64 prebuilt skipped per ADR 0006",
        ],
        [
          "peter: SSH path verified manually",
          "peter: banding renders cleanly over mosh too",
          "peter: no regressions vs RC0",
        ],
        [
          "quinn: tagging release tonight",
          "quinn: changelog draft in the doc",
          "quinn: thanks everyone",
        ],
      ],
    },
    {
      header: "[2026-04-13 15:45] #ux",
      turns: [
        [
          "ruth: queue screen counts feel stale on big DBs",
          "ruth: took 2s to refresh on 50K records",
          "ruth: probably the count(*) per built-in queue",
        ],
        [
          "sam: we could batch-count in one query",
          "sam: or memoize for 1s",
          "sam: memoize is the lighter change",
        ],
        [
          "tina: memoize for now",
          "tina: batch-count is a bigger refactor",
          "tina: file the refactor as a follow-up",
        ],
      ],
    },
    {
      header: "[2026-04-13 17:30] #wrap",
      turns: [
        [
          "alice: fixtures slice merged",
          "alice: all 8 sub-tests green, byte-reproducible",
          "alice: boundary fixture validates against task: boundary",
        ],
        [
          "bob: signals fixes shipped",
          "bob: nightly calibration test added",
          "bob: dashboards green",
        ],
        [
          "olive: v0.4 tagged. thanks everyone",
          "olive: celebrate after the deploy lands",
          "olive: see you tomorrow",
        ],
      ],
    },
    {
      header: "[2026-04-14 09:00] #standup",
      turns: [
        [
          "alice: morning. starting on assistant slice (#11)",
          "alice: spec review with team after lunch",
          "alice: light dev work until then",
        ],
        [
          "bob: morning. on doc-view polish today",
          "bob: scroll behavior on long resumes",
          "bob: PR up by EOD",
        ],
        [
          "carol: morning. perf harness extension day",
          "carol: adding the 50K envelope test",
          "carol: should slot in cleanly",
        ],
      ],
    },
    {
      header: "[2026-04-14 11:00] #infra",
      turns: [
        [
          "uma: CI getting slow",
          "uma: typecheck step alone is 90s now",
          "uma: investigating tsconfig project references",
        ],
        [
          "victor: split the test job into 4 shards",
          "victor: wall-clock drops from 9min to 3min",
          "victor: PR #71 has the config",
        ],
        [
          "wendy: also moving lefthook to a single-pass mode",
          "wendy: cuts pre-push from 12s to 4s",
          "wendy: lands tomorrow",
        ],
      ],
    },
    {
      header: "[2026-04-14 13:30] #docs",
      turns: [
        [
          "xena: CONTEXT.md getting out of date",
          "xena: skipped vs pending wording needs ADR 0003 alignment",
          "xena: filing a follow-up",
        ],
        [
          "yusuf: PRD §10.3 needs the where-clause whitelist",
          "yusuf: power-user feature, no doc yet",
          "yusuf: writing a short example block",
        ],
        [
          "zara: README hero needs a refresh",
          "zara: screenshots are pre-banding era",
          "zara: capturing new ones this afternoon",
        ],
      ],
    },
    {
      header: "[2026-04-14 16:00] #data",
      turns: [
        [
          "ana: noticed source-disagreement rate is up",
          "ana: 18% on the latest ingest vs 12% last week",
          "ana: digging into the breakdown by vendor",
        ],
        [
          "ben: could be the new regex.simple build",
          "ben: lower precision on travel and shopping",
          "ben: I'll spot-check 50 records",
        ],
        [
          "ana: spot-check confirms it",
          "ana: travel accuracy dropped from 0.62 to 0.51",
          "ana: filing for a rules-team review",
        ],
      ],
    },
    {
      header: "[2026-04-14 17:45] #wrap",
      turns: [
        [
          "alice: assistant spec sign-off in",
          "alice: starting impl tomorrow",
          "alice: tracer-bullet through pi-ai end-to-end first",
        ],
        [
          "bob: doc-view scroll PR merged",
          "bob: tested on the new 150-line resume",
          "bob: smooth across SSH too",
        ],
        [
          "olive: see you all tomorrow",
          "olive: heads down on the assistant slice",
          "olive: ship it",
        ],
      ],
    },
  ];

  for (const session of sessions) {
    lines.push({ text: session.header, truth: "SECTION_HEADER" });
    for (const turn of session.turns) {
      lines.push({ text: turn[0], truth: "ENTRY_START" });
      lines.push({ text: turn[1], truth: "CONTINUATION" });
      lines.push({ text: turn[2], truth: "CONTINUATION" });
    }
  }

  if (lines.length !== 150) {
    throw new Error(`chat-log builder produced ${lines.length} lines, expected 150`);
  }
  return { id: "chat-log-3", lines };
}

export const DOC_TEMPLATES_LARGE: BoundaryDoc[] = [buildResume(), buildInvoice(), buildChatLog()];
