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
};

export function listBlueprints(): CompanyBlueprint[] {
  return Object.values(BLUEPRINTS);
}

export function getBlueprint(id: string): CompanyBlueprint | null {
  return BLUEPRINTS[id] ?? null;
}
