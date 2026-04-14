/**
 * Pre-built company blueprints for Paperclip deployment.
 *
 * Each blueprint defines a team of AgenticFlow agents that can be
 * deployed to Paperclip as a ready-made company. Agents are sourced
 * from the AF marketplace templates or the user's existing agents.
 */

export interface AgentSlot {
  /** Paperclip role */
  role: string;
  /** What this slot does */
  title: string;
  /** Human description */
  description: string;
  /** Suggested AF agent name to search for (from marketplace) */
  suggestedTemplate?: string;
  /** Allow user to skip this slot */
  optional?: boolean;
}

export interface CompanyBlueprint {
  /** Short slug */
  id: string;
  /** Display name */
  name: string;
  /** What this company does */
  description: string;
  /** Company goal */
  goal: string;
  /** Starter tasks */
  starterTasks: Array<{ title: string; description: string; assigneeRole: string; priority: string }>;
  /** Agent slots to fill */
  agents: AgentSlot[];
}

export const BLUEPRINTS: Record<string, CompanyBlueprint> = {
  "dev-shop": {
    id: "dev-shop",
    name: "Software Dev Shop",
    description: "A lean engineering team that builds and ships software products.",
    goal: "Build and ship high-quality software products",
    agents: [
      { role: "ceo", title: "CEO / Tech Lead", description: "Strategic direction, delegation, project oversight" },
      { role: "engineer", title: "Senior Engineer", description: "Core development, architecture, code implementation" },
      { role: "designer", title: "UX Designer", description: "UI/UX design, user research, visual design", optional: true },
      { role: "qa", title: "QA Engineer", description: "Testing, bug finding, quality assurance", optional: true },
    ],
    starterTasks: [
      { title: "Define product roadmap", description: "Create a 3-month product roadmap with milestones and deliverables.", assigneeRole: "ceo", priority: "high" },
      { title: "Set up project architecture", description: "Design the technical architecture and set up the development environment.", assigneeRole: "engineer", priority: "high" },
    ],
  },
  "marketing-agency": {
    id: "marketing-agency",
    name: "Marketing Agency",
    description: "A full-service marketing team for content, social media, SEO, and campaigns.",
    goal: "Drive brand awareness and customer acquisition through multi-channel marketing",
    agents: [
      { role: "ceo", title: "Agency Director", description: "Strategy, client relations, campaign oversight" },
      { role: "cmo", title: "Content Strategist", description: "Content planning, blog posts, newsletters", suggestedTemplate: "Content Writer" },
      { role: "designer", title: "Visual Designer", description: "Graphics, social media visuals, brand assets", suggestedTemplate: "Visual designer" },
      { role: "researcher", title: "Market Researcher", description: "Competitive analysis, trend research", suggestedTemplate: "Ari, the Market Researcher", optional: true },
    ],
    starterTasks: [
      { title: "Develop content calendar", description: "Create a 4-week content calendar covering blog posts, social media, and email newsletters.", assigneeRole: "cmo", priority: "high" },
      { title: "Create brand guidelines", description: "Define color palette, typography, logo usage, and visual style for all marketing materials.", assigneeRole: "designer", priority: "high" },
      { title: "Competitive landscape report", description: "Research top 5 competitors and summarize their positioning, pricing, and marketing strategies.", assigneeRole: "researcher", priority: "medium" },
    ],
  },
  "sales-team": {
    id: "sales-team",
    name: "Sales Team",
    description: "A sales operation with outreach, research, and customer management.",
    goal: "Generate qualified leads and close deals",
    agents: [
      { role: "ceo", title: "Sales Director", description: "Pipeline management, strategy, team coordination" },
      { role: "researcher", title: "Sales Researcher", description: "Lead research, company profiling, ICP matching", suggestedTemplate: "Olivia, the Sales Strategist" },
      { role: "general", title: "SDR / Outreach", description: "Email outreach, follow-ups, scheduling", suggestedTemplate: "Rachel, the Support Agent" },
    ],
    starterTasks: [
      { title: "Define ICP and target list", description: "Create ideal customer profile and build a list of 50 target companies.", assigneeRole: "researcher", priority: "high" },
      { title: "Write outreach sequences", description: "Draft 3-step email sequences for cold outreach, follow-up, and re-engagement.", assigneeRole: "general", priority: "high" },
    ],
  },
  "content-studio": {
    id: "content-studio",
    name: "Content Studio",
    description: "A creative content production team for video, social, and written content.",
    goal: "Produce high-quality content across video, social media, and written formats",
    agents: [
      { role: "ceo", title: "Creative Director", description: "Content strategy, quality control, brand voice" },
      { role: "cmo", title: "Social Media Manager", description: "Social media scheduling, engagement, analytics", suggestedTemplate: "Mason, the Social Media Manager" },
      { role: "engineer", title: "Content Writer", description: "Blog posts, articles, scripts, copy", suggestedTemplate: "Content Writer" },
      { role: "designer", title: "Visual Creator", description: "Graphics, thumbnails, social visuals", suggestedTemplate: "Visual designer", optional: true },
    ],
    starterTasks: [
      { title: "Create content pillars", description: "Define 3-5 content themes/pillars that align with the brand and audience.", assigneeRole: "ceo", priority: "high" },
      { title: "Write 5 blog posts", description: "Draft 5 blog posts of 800-1200 words each on the defined content pillars.", assigneeRole: "engineer", priority: "high" },
      { title: "Design social media templates", description: "Create reusable templates for Instagram, Twitter, and LinkedIn posts.", assigneeRole: "designer", priority: "medium" },
    ],
  },
  "support-center": {
    id: "support-center",
    name: "Customer Support Center",
    description: "A customer support team with triage, resolution, and escalation.",
    goal: "Provide fast, helpful customer support and maintain high satisfaction",
    agents: [
      { role: "ceo", title: "Support Manager", description: "Escalation handling, SLA monitoring, team coordination" },
      { role: "general", title: "Support Agent", description: "Ticket triage, first response, common issue resolution", suggestedTemplate: "Rachel, the Support Agent" },
      { role: "researcher", title: "Knowledge Base Manager", description: "FAQ maintenance, documentation, self-service content", optional: true },
    ],
    starterTasks: [
      { title: "Set up support playbook", description: "Create a support playbook with common issues, resolution steps, and escalation criteria.", assigneeRole: "ceo", priority: "high" },
      { title: "Draft FAQ document", description: "Write an FAQ with the top 20 most common customer questions and answers.", assigneeRole: "researcher", priority: "medium" },
    ],
  },
  "amazon-seller": {
    id: "amazon-seller",
    name: "Amazon Seller Team",
    description: "An AI team for Amazon Singapore sellers — listing optimization, PPC campaigns, review analysis, competitor monitoring, pricing, and customer support.",
    goal: "Maximize Amazon Singapore sales through optimized listings, smart advertising, and excellent customer experience",
    agents: [
      { role: "ceo", title: "Amazon Business Manager", description: "Overall Amazon business strategy, P&L oversight, launch coordination", suggestedTemplate: "Strategist" },
      { role: "cmo", title: "Listing & SEO Specialist", description: "Product listing optimization, keyword research, A+ content", suggestedTemplate: "Content Writer" },
      { role: "engineer", title: "PPC Campaign Manager", description: "Sponsored Products/Brands/Display campaign management, bid optimization", suggestedTemplate: "Ecommerce" },
      { role: "researcher", title: "Market & Competitor Analyst", description: "Competitor monitoring, pricing intelligence, market trends", suggestedTemplate: "Market Researcher" },
      { role: "general", title: "Customer Support Agent", description: "Buyer message responses, review management, Q&A", suggestedTemplate: "Support Agent", optional: true },
    ],
    starterTasks: [
      { title: "Optimize top 3 product listings", description: "Audit and optimize the title, bullets, description, and backend keywords for our top 3 ASINs. Use Singapore-specific keywords including Mandarin and Malay terms. IMPORTANT: Ask the seller for actual product specs before writing — do not fabricate specifications.", assigneeRole: "cmo", priority: "high" },
      { title: "Set up PPC campaigns for main product", description: "Create Sponsored Products campaigns (Auto + Manual Exact + Manual Broad) for our best-selling ASIN. Include Sponsored Brands if brand registered. Budget: SGD 500/month. Target ACoS: 25%. Include negative keyword list and weekly optimization schedule.", assigneeRole: "engineer", priority: "high" },
      { title: "Competitive analysis report", description: "Analyze top 5 competitors in our product category. For each competitor: price point (SGD), star rating, review count, listing quality score, key selling points, weaknesses. Produce a comparison table and identify 3 gaps we can exploit. Use only information provided by the seller — do not fabricate ASINs or data.", assigneeRole: "researcher", priority: "high" },
      { title: "Draft responses to recent negative reviews", description: "Draft 5 professional response templates for common complaint categories: product quality, shipping damage, expectation mismatch, missing accessories, and battery/charging issues. Each response must be Amazon ToS compliant — never offer off-platform contact, never incentivize review changes, always direct to Amazon resolution process.", assigneeRole: "general", priority: "medium" },
      { title: "Quarterly pricing strategy", description: "Develop pricing strategy for the next quarter. Include: cost breakdown (product cost, shipping to FBA, referral fee by category, FBA fulfillment fee, storage fee), margin analysis at current price, promotional pricing for upcoming Singapore events (check actual calendar — Hari Raya, Mother's Day, 6.6, 7.7, GSS, National Day, 9.9, 11.11, 12.12 depending on quarter), bundle pricing options, and minimum price floor.", assigneeRole: "ceo", priority: "medium" },
    ],
  },
  "tutor": {
    id: "tutor",
    name: "Tutoring Business Team",
    description: "An AI team for tutoring businesses and education professionals — curriculum design, assessments, progress tracking, parent communication, and business operations. Absorbed from the legacy tutor-pack in CLI v1.7.0.",
    goal: "Run a sustainable tutoring practice with consistent curriculum, clear student progress, and strong parent engagement",
    agents: [
      { role: "ceo", title: "Tutor Business Manager", description: "Practice operations, scheduling, pricing, and overall strategy", suggestedTemplate: "Strategist" },
      { role: "cmo", title: "Parent Communication Specialist", description: "Parent updates, enrollment comms, quarterly progress reports, retention outreach", suggestedTemplate: "Support Agent" },
      { role: "engineer", title: "Curriculum Designer", description: "Lesson plans, learning objectives, pacing guides aligned to student goals and exam boards", suggestedTemplate: "Content Writer" },
      { role: "researcher", title: "Student Progress Tracker", description: "Learning analytics, weak-area detection, intervention recommendations from assessment data", suggestedTemplate: "Market Researcher" },
      { role: "general", title: "Quiz & Assessment Creator", description: "Formative + summative assessments, answer keys, difficulty calibration", suggestedTemplate: "Content Writer", optional: true },
    ],
    starterTasks: [
      { title: "Design a 4-week curriculum for a new student", description: "Given a student's current level, target goal (exam, grade, topic mastery), and weekly lesson frequency, produce a 4-week plan with weekly objectives, concrete lesson activities, and a mid-point checkpoint assessment. Ask the tutor for actual student details — do not fabricate.", assigneeRole: "engineer", priority: "high" },
      { title: "Draft first parent progress report template", description: "Create a parent-facing monthly progress report template: current level, this month's wins, areas still developing, specific practice suggestions for the home, next month's focus. Tone: warm, specific, actionable — never generic.", assigneeRole: "cmo", priority: "high" },
      { title: "Build a 10-question diagnostic quiz", description: "For the student's subject and level, generate a 10-question diagnostic covering the core prerequisite skills. Include answer key, common-misconception notes per question, and suggested remediation if the student misses each item.", assigneeRole: "general", priority: "medium" },
      { title: "Quarterly business review", description: "Given the tutor's current enrollment, monthly retention, hourly rate, and typical hours/week, compute: revenue run-rate, gross margin if they hire a contract tutor, and 3 concrete growth levers (pricing, referrals, group sessions) ranked by expected impact vs effort.", assigneeRole: "ceo", priority: "medium" },
    ],
  },
  "freelancer": {
    id: "freelancer",
    name: "Freelancer Operations Team",
    description: "An AI team for freelancers, consultants, and independent professionals — client research, proposals, contracts, invoicing, status updates, and business development. Absorbed from the legacy freelancer-pack in CLI v1.7.0.",
    goal: "Let a solo freelancer operate like a staffed agency: consistent proposals, on-time invoicing, proactive client updates, and a steady pipeline",
    agents: [
      { role: "ceo", title: "Business Development Manager", description: "Pipeline health, proposal strategy, positioning, pricing decisions", suggestedTemplate: "Strategist" },
      { role: "cmo", title: "Client Communication Agent", description: "Weekly status updates, scope-change comms, onboarding and offboarding touchpoints", suggestedTemplate: "Support Agent" },
      { role: "engineer", title: "Project Scope Writer", description: "Statements of work, deliverables definition, acceptance criteria, assumptions and exclusions", suggestedTemplate: "Content Writer" },
      { role: "researcher", title: "Client Research Analyst", description: "Pre-outreach research on target companies + decision-makers; discovery-call prep briefs", suggestedTemplate: "Market Researcher" },
      { role: "general", title: "Invoice & Contract Generator", description: "MSA / SOW / invoice drafting from a deal brief; payment-terms consistency", suggestedTemplate: "Content Writer", optional: true },
    ],
    starterTasks: [
      { title: "Draft a Statement of Work for a new engagement", description: "From a one-paragraph deal brief (client, scope, timeline, budget), produce a complete SOW: deliverables with acceptance criteria, milestones with payment triggers, assumptions, exclusions, change-request process, IP ownership, and termination clause. Flag any missing information the freelancer should confirm before sending.", assigneeRole: "engineer", priority: "high" },
      { title: "Write a weekly client status email", description: "From a short brief of what was done this week + blockers + next-week focus, draft a client-facing status email: brief, specific, outcome-oriented, no jargon. Ends with one clear ask (approval, blocker, or check-in). Max 200 words.", assigneeRole: "cmo", priority: "high" },
      { title: "Pre-meeting research brief for a prospect", description: "For a named target company and decision-maker, produce a 1-page discovery-call brief: company recent news, likely pain points aligned to the freelancer's service, the decision-maker's background, and 5 discovery questions ranked by signal value. Use only information the freelancer provides or publicly searchable facts — do not fabricate.", assigneeRole: "researcher", priority: "medium" },
      { title: "Quarterly business review", description: "Given bookings, utilisation, AR aging, and pipeline, produce a quarterly review: revenue vs target, utilisation delta, top 3 pipeline risks, and 3 concrete actions for next quarter (positioning, pricing, ops) ranked by impact vs effort.", assigneeRole: "ceo", priority: "medium" },
    ],
  },
};

export function listBlueprints(): CompanyBlueprint[] {
  return Object.values(BLUEPRINTS);
}

export function getBlueprint(id: string): CompanyBlueprint | null {
  return BLUEPRINTS[id] ?? null;
}
