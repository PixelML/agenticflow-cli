/**
 * Pre-built AgenticFlow blueprints — the composition ladder.
 *
 * AgenticFlow building blocks COMPOSE from simple to complex. Each blueprint
 * picks a rung and assembles the right resources.
 *
 * **Composition ladder** (bottom → top, simpler → more complex):
 *
 *   Rung 0: WORKFLOW MINIMAL     trigger → llm → output             (hello world)
 *   Rung 1: WORKFLOW CHAINED     llm_plan → llm_execute → llm_format (sequential reasoning)
 *   Rung 2: WORKFLOW ENRICHED    web_retrieval → llm_summarize       (deterministic + real data)
 *   Rung 3: AGENT + NODE PLUGINS  agent with [web_search, api_call] (flexible tool-use)
 *   Rung 4: AGENT + WORKFLOW TOOL agent calls workflow as a tool    (flexible + deterministic body)
 *   Rung 5: AGENT + SUB-AGENTS    triage calls specialist agents    (lite multi-agent, agent-driven)
 *   Rung 6: WORKFORCE (DAG)       explicit multi-agent coordination (graph-driven MAS)
 *
 * Deploy verbs map 1:1 to `kind`:
 *   kind: "workflow"  → `af workflow init --blueprint <id>`    (rungs 0-2)
 *   kind: "agent"     → `af agent init --blueprint <id>`        (rungs 3-5)
 *   kind: "workforce" → `af workforce init --blueprint <id>`    (rung 6)
 *
 * Legacy `tier` field still exists for backward compat:
 *   tier 1 = kind "agent" + complexity 3
 *   tier 3 = kind "workforce" + complexity 6
 */

export interface AgentPluginSpec {
  /** Node type name (e.g. "web_search", "agenticflow_generate_image"). */
  nodeTypeName: string;
  /** Optional pre-set input values (reduces what the LLM has to decide). */
  input?: Record<string, { value: unknown; description?: string }>;
  /** Whether the plugin needs a connection. If omitted, the CLI auto-discovers. */
  connectionCategory?: "pixelml" | "none";
}

export interface AgentSlot {
  /** Paperclip role (ceo | engineer | etc.). */
  role: string;
  /** What this slot does */
  title: string;
  /** Human description */
  description: string;
  /** Suggested AF agent name to search for (from marketplace) */
  suggestedTemplate?: string;
  /** Allow user to skip this slot */
  optional?: boolean;
  /** Built-in AgenticFlow plugins to attach to this agent. Used in Tier 1 blueprints. */
  plugins?: AgentPluginSpec[];
  /**
   * If true, this slot is the workforce's SYNTHESIZER / aggregator:
   *   - non-synthesizer workers feed INTO it (instead of back to coordinator)
   *   - it feeds the output node (instead of the coordinator)
   *   - default input template joins every worker's last_message with separators
   * Only one synthesizer per blueprint. Enables fan-out → fan-in topologies
   * (e.g. parallel-research: coordinator → 2 researchers → synthesizer → output).
   */
  isSynthesizer?: boolean;
}

/**
 * Workflow node spec used by workflow-kind blueprints. Mirrors the backend
 * `WorkflowNodeCreateDTO` shape but only the fields a blueprint needs to
 * preset at deploy time.
 */
export interface WorkflowNodeSpec {
  /** Stable handle for wiring (node names in input_config templates). */
  name: string;
  /** Node type (e.g. "llm", "web_retrieval", "api_call"). */
  nodeType: string;
  /** Human-readable title shown in the UI. */
  title?: string;
  /** What this node does — shown on hover in the builder. */
  description?: string;
  /** Input config passed to the node runner. Values may use `{{trigger.X}}` or `{{nodes.Y.output.Z}}` templates. */
  inputConfig?: Record<string, unknown>;
  /** Optional output mapping. Usually unset — defaults work. */
  outputMapping?: Record<string, unknown> | null;
  /** Optional grid position — auto-assigned if omitted. */
  position?: { x: number; y: number };
}

/** Explicit edge between two workflow nodes. */
export interface WorkflowEdgeSpec {
  sourceName: string;
  targetName: string;
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
  /**
   * Blueprint kind — the deploy verb:
   *   "workflow"  → af workflow init --blueprint <id>   (pure deterministic flow)
   *   "agent"     → af agent init --blueprint <id>      (single agent, may have plugins/tools/sub-agents)
   *   "workforce" → af workforce init --blueprint <id>  (multi-agent DAG)
   * Defaults by tier for backward compat: tier 1 → "agent", tier 3 → "workforce".
   */
  kind?: "workflow" | "agent" | "workforce";
  /**
   * Position on the composition ladder (0-6). Higher = more complex.
   * Rungs 0-2 are workflow, 3-5 are agent, 6 is workforce. Surfaced in
   * `af bootstrap` and `af blueprints list` so operators can sort/filter
   * by complexity without reading descriptions.
   */
  complexity?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Legacy blueprint tier — maps onto kind:
   *   1 = kind "agent" + complexity 3 (agent + plugins)
   *   2 = kind "agent" + complexity 4 (agent + workflow tool)
   *   3 = kind "workforce" + complexity 6 (workforce DAG)
   * Prefer `kind` + `complexity` for new blueprints.
   */
  tier?: 1 | 2 | 3;
  /**
   * Per-user-facing use cases this blueprint supports. Surfaced in `af bootstrap` so
   * an AI operator can pick the right blueprint without reading descriptions.
   */
  useCases?: string[];
  /** Starter tasks (relevant for workforce kind; ignored for workflow/agent). */
  starterTasks: Array<{ title: string; description: string; assigneeRole: string; priority: string }>;
  /** Agent slots to fill (for kind "agent" and "workforce"). */
  agents: AgentSlot[];
  /** Workflow-kind blueprints define nodes directly (no agent slots). */
  workflowNodes?: WorkflowNodeSpec[];
  /** Workflow-kind blueprints may specify explicit edges (otherwise sequential wiring is assumed). */
  workflowEdges?: WorkflowEdgeSpec[];
  /** Workflow-kind blueprints may expose named input fields to the trigger. */
  workflowInputSchema?: {
    title?: string;
    fields: Array<{ name: string; title?: string; description?: string; required?: boolean; defaultValue?: unknown }>;
  };
}

/**
 * Resolve the canonical `kind` of a blueprint. New blueprints set it explicitly;
 * legacy ones fall back to tier mapping. Safe for all existing blueprints.
 */
export function blueprintKind(b: CompanyBlueprint): "workflow" | "agent" | "workforce" {
  if (b.kind) return b.kind;
  if (b.tier === 1 || b.tier === 2) return "agent";
  return "workforce";
}

/**
 * Resolve complexity rung (0-6) for a blueprint. New blueprints set it
 * explicitly; legacy ones fall back to a sensible default by tier.
 */
export function blueprintComplexity(b: CompanyBlueprint): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (b.complexity != null) return b.complexity;
  if (b.tier === 1) return 3;
  if (b.tier === 2) return 4;
  return 6;
}

export const BLUEPRINTS: Record<string, CompanyBlueprint> = {
  // ═══════════════════════════════════════════════════════════════════════
  // RUNGS 0-2 — Workflow blueprints (deterministic, node-chained)
  // Require an LLM-provider connection in the workspace (straico, openai,
  // anthropic, etc.). `af workflow init --blueprint <id>` auto-discovers.
  // ═══════════════════════════════════════════════════════════════════════
  "llm-hello": {
    id: "llm-hello",
    kind: "workflow",
    complexity: 0,
    name: "LLM Hello",
    description: "The simplest possible workflow: one LLM node that answers a question. Demonstrates rung 0 of the composition ladder — deterministic single-node flow.",
    goal: "Answer a question with a single LLM call",
    useCases: [
      "learning the workflow model",
      "minimum-viable custom workflow",
      "one-off Q&A without setting up an agent",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Question",
      fields: [
        {
          name: "question",
          title: "Your question",
          description: "What do you want the LLM to answer?",
          required: true,
        },
      ],
    },
    workflowNodes: [
      {
        name: "answer",
        nodeType: "llm",
        title: "Answer",
        description: "Single LLM call that answers the user's question.",
        inputConfig: {
          model: "DeepSeek V3",
          temperature: 0.5,
          human_message: "{{question}}",
          system_message:
            "You are a concise, helpful assistant. Answer the user's question directly. Keep responses under 200 words unless the question requires more detail.",
          chat_history_id: null,
        },
      },
    ],
  },
  "llm-chain": {
    id: "llm-chain",
    kind: "workflow",
    complexity: 1,
    name: "LLM Chain",
    description: "Two LLM nodes chained sequentially: the first breaks the question into steps (plan); the second executes against the plan. Demonstrates rung 1 — deterministic multi-step reasoning. Each node's output feeds the next via `{{node.content}}` template refs.",
    goal: "Answer a question by planning + executing in two separate LLM passes",
    useCases: [
      "questions that benefit from a plan-then-execute approach",
      "demonstrating node-to-node chaining in a workflow",
      "structured reasoning without an agent's flexibility",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Chained question",
      fields: [
        {
          name: "question",
          title: "Your question",
          description: "The question to plan around and then answer.",
          required: true,
        },
      ],
    },
    workflowNodes: [
      {
        name: "plan",
        nodeType: "llm",
        title: "Plan",
        description: "Break the question into 3-5 concrete steps before answering.",
        inputConfig: {
          model: "DeepSeek V3",
          temperature: 0.3,
          human_message:
            "Break down this question into 3-5 concrete steps someone would take to answer it thoroughly:\n\n{{question}}\n\nOutput the steps as a numbered list. No preamble.",
          system_message:
            "You are a planning agent. Produce concrete, sequential steps — never general advice.",
          chat_history_id: null,
        },
      },
      {
        name: "execute",
        nodeType: "llm",
        title: "Execute",
        description: "Answer the question using the plan from the first node.",
        inputConfig: {
          model: "DeepSeek V3",
          temperature: 0.5,
          human_message:
            "Answer this question by following the plan below.\n\nQUESTION: {{question}}\n\nPLAN:\n{{plan.content}}\n\nProvide a clear, structured answer that follows the plan's steps.",
          system_message:
            "You are an execution agent. Follow the given plan step by step and produce a final answer.",
          chat_history_id: null,
        },
      },
    ],
  },
  "summarize-url": {
    id: "summarize-url",
    kind: "workflow",
    complexity: 2,
    name: "Summarize URL",
    description: "Fetches a webpage via web_retrieval, then summarizes the content with an LLM. Demonstrates rung 2 — a deterministic workflow enriched with real-world data. web_retrieval is connection-less (no provider needed), the LLM step auto-uses the workspace's LLM connection.",
    goal: "Turn a URL into a 3-bullet summary",
    useCases: [
      "digesting an article or blog post",
      "quickly summarizing a news URL",
      "a deterministic pipeline you can trigger programmatically",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "URL to summarize",
      fields: [
        {
          name: "url",
          title: "URL",
          description: "The webpage URL to fetch and summarize.",
          required: true,
        },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "web_retrieval",
        title: "Fetch Page",
        description: "Retrieve the full page content from the given URL.",
        inputConfig: {
          prompt: "Fetch and return the full content of this URL: {{url}}",
          include_google_search: false,
        },
      },
      {
        name: "summarize",
        nodeType: "llm",
        title: "Summarize",
        description: "Produce a 3-bullet summary of the fetched content.",
        inputConfig: {
          model: "DeepSeek V3",
          temperature: 0.4,
          human_message:
            "Summarize the following webpage content in EXACTLY 3 bullet points. Each bullet ≤ 25 words. Capture the main idea, not minor details.\n\nURL: {{url}}\n\nCONTENT:\n{{fetch.result}}",
          system_message:
            "You are a concise summarizer. Output only bulleted points — no preamble, no conclusion.",
          chat_history_id: null,
        },
      },
    ],
  },
  "n8n-converter": {
    id: "n8n-converter",
    kind: "workflow",
    complexity: 2,
    name: "n8n → AgenticFlow Converter",
    description: "Converts an n8n workflow JSON into a valid AgenticFlow workflow JSON. Three-node chain: analyse the n8n graph → produce the AgenticFlow JSON → generate a connections setup guide so the user can create any required App Connections before deploying.",
    goal: "Turn a pasted n8n workflow JSON into a deployable AgenticFlow workflow JSON, with a step-by-step guide for any connections the workflow needs",
    useCases: [
      "migrating n8n automations to AgenticFlow",
      "bulk-converting n8n workflow exports",
      "learning the AgenticFlow workflow schema by example",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "n8n Workflow",
      fields: [
        {
          name: "n8n_workflow_json",
          title: "n8n Workflow JSON",
          description: "Paste the full n8n workflow JSON here (export from n8n → Download → JSON).",
          required: true,
        },
        {
          name: "project_id",
          title: "AgenticFlow Project ID",
          description: "The AgenticFlow project_id to embed in the output workflow.",
          required: true,
        },
      ],
    },
    workflowNodes: [
      {
        name: "analyze",
        nodeType: "llm",
        title: "Analyse n8n Workflow",
        description: "Parse the n8n workflow, identify every non-sticky node, and produce a conversion plan mapping each n8n node to its AgenticFlow equivalent using the priority rules.",
        inputConfig: {
          model: "agenticflow/glm-4.5-air",
          temperature: 0.2,
          system_message: `You are an expert at converting n8n workflows to AgenticFlow format.

NODE SELECTION PRIORITY (always pick the highest available tier):
- Tier 1 (no connection): llm, agenticflow_generate_image, api_call, send_email, json_to_google_sheet, run_javascript, web_scraping, web_search, web_retrieval, url_to_markdown, echo, variable_set, variable_get, get_current_datetime, drive_get_item_by_path
- Tier 2 (pixelml connection): pml_llm, generate_image, run_python, text_to_speech, google_search, text_extract, render_video, describe_image
- Tier 3 (vendor connection, last resort): openai_ask_chat_gpt, google_gen_ai_ask_gemini, telegram_send_message, tavily_search, firecrawl_scrape, groq_chat, replicate_run_model, fal_run_model

KEY MAPPING RULES:
- ALL LLM/AI/chain/agent nodes → llm (Tier 1), model: "agenticflow/glm-4.5-air"
- Image generation → agenticflow_generate_image (Tier 1), fallback: generate_image (Tier 2), last resort: openai_generate_image (Tier 3)
- httpRequest / REST integrations → api_call (Tier 1)
- emailSend / gmail / sendGrid → send_email (Tier 1)
- googleSheets → json_to_google_sheet (Tier 1)
- googleDrive → drive_get_item_by_path (Tier 1)
- googleSearch → google_search (Tier 2, pixelml)
- code / function → run_javascript (Tier 1)
- executeCommand → run_python (Tier 2, pixelml)
- extractFromFile → text_extract (Tier 2, pixelml)
- telegram → telegram_send_message (Tier 3, last resort)
- ALL trigger nodes → removed; their fields become input_schema properties
- if/switch → use llm with routing instruction, or split into separate workflows
- merge/aggregate/splitOut → use run_javascript

Output a structured plan with: (1) list of every n8n node and its mapped AgenticFlow node_type + tier, (2) list of input_schema fields from trigger nodes, (3) data-flow: how each node's output connects to the next node's input_config, (4) warnings for any unmappable nodes or patterns.`,
          human_message: "Analyse this n8n workflow and produce a conversion plan:\n\n{{n8n_workflow_json}}",
          chat_history_id: null,
        },
      },
      {
        name: "convert",
        nodeType: "llm",
        title: "Generate AgenticFlow JSON",
        description: "Using the conversion plan, produce the final AgenticFlow workflow JSON.",
        inputConfig: {
          model: "agenticflow/glm-4.5-air",
          temperature: 0.1,
          system_message: `You are an expert at producing valid AgenticFlow workflow JSON.

STRICT OUTPUT RULES — output ONLY the JSON object, no markdown fences, no explanation:

1. Top-level fields: name, description, project_id, public_runnable (false), public_clone (false), input_schema, nodes, output_mapping
2. input_schema: every property MUST have "ui_metadata": {"type": "short_text"}
3. nodes[].input_config: include ALL fields (required + optional); set unused optional fields to null, NEVER to "" or omit them
4. Node names: snake_case, unique, no spaces
5. Data references: {{field_name}} for input_schema fields, {{node_name.output_field}} for node outputs
6. Execution order: nodes array is top-to-bottom sequential
7. CONNECTION FIELD: nodes that require a connection (Tier 2 pixelml, Tier 3 vendor) MUST include "connection": "<ConnectionName>" at the top level of the node object (sibling of name/node_type_name/input_config). Use a descriptive placeholder like "My PixelML", "My Telegram", "My OpenAI". The connection field is REQUIRED for those nodes — without it the workflow will fail at runtime.

Connection categories by node type:
- pml_llm, generate_image, run_python, text_to_speech, google_search, text_extract, render_video, describe_image → category: "pixelml"
- telegram_send_message → category: "telegram"
- openai_ask_chat_gpt, openai_generate_image → category: "openai"
- google_gen_ai_ask_gemini → category: "google_gen_ai"
- tavily_search → category: "tavily"
- firecrawl_scrape → category: "firecrawl"
- groq_chat → category: "groq"

llm node input_config template (ALL fields required, NO connection field):
{"model": "agenticflow/glm-4.5-air", "human_message": "...", "system_message": "..." or null, "chat_history_id": null, "temperature": null}

api_call node input_config template (NO connection field):
{"url": "...", "method": "GET", "headers": {}, "body_type": "none", "body": null, "raw_body": null, "files": null, "timeout": null, "response_type": null, "upload_response": null}

send_email node input_config template (NO connection field):
{"recipient_emails": ["..."], "cc_emails": null, "bcc_emails": null, "subject": "...", "body": "...", "body_html": null}

agenticflow_generate_image node input_config template (NO connection field):
{"prompt": "...", "width": null, "height": null, "num_images": null}

json_to_google_sheet node input_config template (NO connection field):
{"title": "...", "data": "...", "share_with": null, "role": null, "prem_type": null}

telegram_send_message node example (connection field REQUIRED):
{"name": "send_reply", "node_type_name": "telegram_send_message", "connection": "My Telegram", "input_config": {"chat_id": "...", "text": "...", "business_connection_id": null, "message_thread_id": null, "parse_mode": null, "entities": null, "link_preview_options": null, "disable_notification": null, "protect_content": null, "allow_paid_broadcast": null, "message_effect_id": null, "reply_parameters": null, "reply_markup": null}}

Output ONLY the raw JSON.`,
          human_message: "Conversion plan:\n{{analyze.content}}\n\nOriginal n8n workflow:\n{{n8n_workflow_json}}\n\nproject_id: {{project_id}}\n\nProduce the AgenticFlow workflow JSON now.",
          chat_history_id: null,
        },
      },
      {
        name: "connections_guide",
        nodeType: "llm",
        title: "Connections Setup Guide",
        description: "Scan the converted workflow JSON for nodes that require App Connections and produce a step-by-step setup guide the user must complete before deploying.",
        inputConfig: {
          model: "agenticflow/glm-4.5-air",
          temperature: 0.1,
          system_message: `You are a deployment assistant for AgenticFlow.

Your job: read the converted AgenticFlow workflow JSON and check every node for a "connection" field.

If NO nodes have a "connection" field → output exactly:
"✅ No connections required. Deploy with: agenticflow workflow create --body @workflow.json --json"

If ANY nodes have a "connection" field → output a setup guide in this format:

## Connections required before deploying

| Node | Connection name | Category | Credentials needed |
|---|---|---|---|
(one row per unique connection: node name, connection placeholder name, category, what credential is needed)

Credential keys per category:
- pixelml → api_key
- telegram → bot_token
- openai → api_key
- google_gen_ai → api_key
- tavily → api_key
- firecrawl → api_key
- groq → api_key
- replicate → api_key
- fal → api_key

## How to create connections

**Option A — Web UI (recommended, keeps credentials out of terminal history):**
1. Go to AgenticFlow → Settings → App Connections
2. Click "New Connection"
3. Select the category, enter the name exactly as shown in the table above, paste the credential value
4. Repeat for each row in the table

**Option B — Let the assistant create them for you:**
Provide the required credential values and the assistant will run the CLI commands on your behalf.
Share only what is needed — credentials will not be stored beyond the current session.

## After all connections are created

agenticflow workflow create --body @workflow.json --json

Use the exact connection names from the table — they must match the "connection" field values in the workflow JSON.`,
          human_message: "Converted workflow JSON:\n{{convert.content}}\n\nScan for required connections and produce the setup guide.",
          chat_history_id: null,
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RUNG 2 — Workflow blueprints converted from n8n (internal / email-out)
  // All connection-free: llm, web_retrieval, api_call, send_email,
  // url_to_markdown, run_javascript, get_current_datetime, web_search.
  // ═══════════════════════════════════════════════════════════════════════

  "email-to-structured": {
    id: "email-to-structured",
    kind: "workflow",
    complexity: 1,
    name: "Email → Structured Data",
    description: "Paste raw unstructured email text and get back clean JSON fields: sender intent, urgency, category, key entities, and a one-line summary. Converted from n8n #10086. Rung 1 — single LLM extraction pass.",
    goal: "Extract structured fields from unstructured email text",
    useCases: [
      "triaging support email queues",
      "extracting order details from customer emails",
      "categorising inbound messages without reading each one",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Email to parse",
      fields: [
        { name: "email_text", title: "Email text", description: "Paste the raw email body here.", required: true },
        { name: "context", title: "Business context (optional)", description: "E.g. 'SaaS support inbox', 'e-commerce orders'.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "extract",
        nodeType: "llm",
        title: "Extract structured data",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.1,
          system_message: "You are a data-extraction assistant. Always respond with valid JSON only — no prose, no markdown fences.",
          human_message: `Extract structured data from the email below. Return ONLY a JSON object with these fields:
{
  "sender_intent": "string — what the sender wants (request / complaint / inquiry / feedback / other)",
  "urgency": "low | medium | high",
  "category": "string — short topic label",
  "entities": ["list of named entities: people, companies, products, dates, order IDs"],
  "summary": "string — one sentence, ≤20 words",
  "suggested_action": "string — what a human agent should do next"
}

Business context: {{context}}

EMAIL:
{{email_text}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "rss-digest-email": {
    id: "rss-digest-email",
    kind: "workflow",
    complexity: 2,
    name: "RSS Digest → Email",
    description: "Fetches an RSS feed URL, summarises the top items with an LLM, and sends a digest email. Converted from n8n #10007. Rung 2 — web_retrieval enriches the LLM pass; send_email delivers the output.",
    goal: "Turn an RSS feed into a curated digest email",
    useCases: [
      "daily tech news digest",
      "team newsletter from a curated RSS source",
      "monitoring a topic feed and emailing highlights",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "RSS digest",
      fields: [
        { name: "rss_url", title: "RSS feed URL", description: "e.g. https://feeds.feedburner.com/TechCrunch", required: true },
        { name: "recipient_email", title: "Recipient email", description: "Who gets the digest.", required: true },
        { name: "topic", title: "Topic label", description: "Used in the email subject, e.g. 'AI News'.", required: false, defaultValue: "News" },
        { name: "max_items", title: "Max items to summarise", description: "Number of feed items to include (default 5).", required: false, defaultValue: "5" },
      ],
    },
    workflowNodes: [
      {
        name: "fetch_feed",
        nodeType: "web_retrieval",
        title: "Fetch RSS feed",
        inputConfig: {
          prompt: "Fetch and return the full content of this RSS feed URL. Return all visible text and titles: {{rss_url}}",
          include_google_search: false,
        },
      },
      {
        name: "summarise",
        nodeType: "llm",
        title: "Summarise top items",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.3,
          system_message: "You are a newsletter editor. Write in clear, concise English.",
          human_message: `You received this RSS feed content. Pick the top {{max_items}} most interesting items and write a digest.

For each item output:
**[Title]** — one sentence summary (≤20 words). Source: [URL if available]

End with a one-line "Editor's pick" — the single most important story and why.

Topic focus: {{topic}}

FEED CONTENT:
{{fetch_feed.result}}`,
          chat_history_id: null,
        },
      },
      {
        name: "send",
        nodeType: "send_email",
        title: "Send digest email",
        inputConfig: {
          recipient_emails: ["{{recipient_email}}"],
          cc_emails: [],
          bcc_emails: [],
          subject: "{{topic}} Digest — {{rss_url}}",
          body: "{{summarise.content}}",
          body_html: null,
        },
      },
    ],
  },

  "competitor-url-snapshot": {
    id: "competitor-url-snapshot",
    kind: "workflow",
    complexity: 2,
    name: "Competitor URL Snapshot",
    description: "Fetches a competitor's homepage or landing page and runs an LLM analysis: positioning, key claims, pricing signals, weaknesses, and 3 actionable counter-moves. Converted from n8n #10002. Rung 2 — web_retrieval + LLM analysis.",
    goal: "Understand a competitor's public positioning from their URL in one run",
    useCases: [
      "quick competitor intelligence before a sales call",
      "tracking how a competitor's messaging changes over time",
      "briefing a sales or marketing team on a new entrant",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Competitor analysis",
      fields: [
        { name: "competitor_url", title: "Competitor URL", description: "Homepage or landing page to analyse.", required: true },
        { name: "your_product", title: "Your product / service (optional)", description: "Brief description — used to tailor counter-move suggestions.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "web_retrieval",
        title: "Fetch competitor page",
        inputConfig: {
          prompt: "Fetch the complete text content of this webpage including all headings, copy, pricing, and CTAs: {{competitor_url}}",
          include_google_search: false,
        },
      },
      {
        name: "analyse",
        nodeType: "llm",
        title: "Analyse positioning",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.3,
          system_message: "You are a competitive intelligence analyst. Be specific — cite exact phrases from the page.",
          human_message: `Analyse this competitor's page and produce a structured report:

## Positioning
One paragraph — how do they position themselves? Who's the target customer?

## Key claims (top 5)
Bullet list of their strongest marketing claims, with exact quotes.

## Pricing signals
What pricing info is visible? Tiers, price anchors, free trial offers?

## Weaknesses
3 gaps or weaknesses visible from the page (missing features, vague claims, poor UX copy).

## Counter-moves (3)
Specific actions our product ({{your_product}}) should take to differentiate, ordered by impact.

COMPETITOR URL: {{competitor_url}}

PAGE CONTENT:
{{fetch.result}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "job-app-package": {
    id: "job-app-package",
    kind: "workflow",
    complexity: 2,
    name: "Job Application Package",
    description: "Paste a job description + your CV; the workflow scores your fit, drafts a tailored cover letter, then emails the full package to you. 3-node pipeline: llm fit-score → llm cover-letter → send_email. Rung 1-2 — multi-step LLM chaining with email delivery.",
    goal: "Turn a job description + your CV into a fit score + tailored cover letter delivered by email",
    useCases: [
      "quickly assessing fit before applying for a role",
      "generating a first-draft cover letter from a job posting",
      "batch-screening multiple job listings against your CV",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Job application",
      fields: [
        { name: "job_description_text", title: "Job description text", description: "Paste the full job description text here (copy from the job posting page).", required: true },
        { name: "job_url", title: "Job posting URL (optional)", description: "For reference in the email subject.", required: false },
        { name: "cv_text", title: "Your CV / resume text", description: "Paste the plain-text version of your CV.", required: true },
        { name: "your_name", title: "Your name", required: true },
        { name: "recipient_email", title: "Your email", description: "Where to send the package.", required: true },
        { name: "tone", title: "Cover letter tone", description: "e.g. formal, confident, conversational", required: false, defaultValue: "confident" },
      ],
    },
    workflowNodes: [
      {
        name: "score_fit",
        nodeType: "llm",
        title: "Score fit",
        description: "Compare the CV against the job description and produce a structured fit report.",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.1,
          system_message: "You are a senior recruiter and career coach. Be honest and specific — cite exact phrases from both the JD and CV.",
          human_message: `Compare this candidate's CV against the job posting.

## Fit Score: X/10

## Role Summary
Job title, company, and one-sentence description of what the role does.

## Strengths (what matches)
Bullet list — specific skills, experience, or achievements from the CV that directly match the JD requirements. Quote both the JD requirement and the CV evidence.

## Gaps (what's missing or weak)
Bullet list — required or preferred qualifications from the JD that are absent or undersold in the CV. Be specific.

## Keywords to add to CV
5 exact keywords or phrases from the JD that should appear in the CV but don't.

## Recommendation
One sentence: Apply / Apply with adjustments / Skip — and why.

JOB DESCRIPTION:
{{job_description_text}}

CV:
{{cv_text}}`,
          chat_history_id: null,
        },
      },
      {
        name: "write_cover_letter",
        nodeType: "llm",
        title: "Write cover letter",
        description: "Draft a tailored cover letter using the fit analysis and the job posting.",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.5,
          system_message: "You are an expert cover letter writer. Write in first person. Never use hollow phrases like 'I am excited to apply' or 'I am a team player'. Lead with impact.",
          human_message: `Write a tailored cover letter for {{your_name}} applying to the role described below.

Tone: {{tone}}
Max length: 300 words (3 paragraphs)

Rules:
- Paragraph 1: Lead with the strongest match between the candidate's background and the role's core need. Name the company and role.
- Paragraph 2: One specific achievement from the CV that directly proves value for the top requirement. Use numbers if present in the CV.
- Paragraph 3: Why this company/role specifically (use something concrete from the JD — mission, product, challenge). Close with a clear call to action.
- Never list skills — show evidence instead.
- Do NOT include date, address block, or "Dear Hiring Manager" — output body only.

FIT ANALYSIS:
{{score_fit.content}}

JOB DESCRIPTION:
{{job_description_text}}

CV:
{{cv_text}}`,
          chat_history_id: null,
        },
      },
      {
        name: "send",
        nodeType: "send_email",
        title: "Email application package",
        description: "Send the fit score + cover letter to the applicant.",
        inputConfig: {
          recipient_emails: ["{{recipient_email}}"],
          cc_emails: [],
          bcc_emails: [],
          subject: "Job Application Package — {{your_name}}",
          body: `## Fit Analysis\n\n{{score_fit.content}}\n\n---\n\n## Cover Letter Draft\n\n{{write_cover_letter.content}}`,
          body_html: null,
        },
      },
    ],
  },

  "meeting-notes-email": {
    id: "meeting-notes-email",
    kind: "workflow",
    complexity: 1,
    name: "Meeting Notes → Email Summary",
    description: "Paste raw meeting notes and send a formatted recap email: decisions, action items, owners, and next steps. Rung 1 — single LLM pass + send_email. Zero external connections needed.",
    goal: "Convert raw meeting notes into a clean recap email with action items",
    useCases: [
      "post-meeting follow-up emails",
      "async team standups",
      "project kick-off recap for stakeholders",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Meeting recap",
      fields: [
        { name: "notes", title: "Raw meeting notes", description: "Paste your unformatted notes here.", required: true },
        { name: "meeting_title", title: "Meeting title", description: "e.g. Q2 Planning", required: true },
        { name: "recipient_email", title: "Recipient email", description: "Who gets the recap email.", required: true },
        { name: "attendees", title: "Attendees (optional)", description: "Comma-separated names.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "structure",
        nodeType: "llm",
        title: "Structure notes",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.2,
          system_message: "You are an executive assistant. Produce clean, professional meeting recaps.",
          human_message: `Structure these raw meeting notes into a professional recap for: {{meeting_title}}
Attendees: {{attendees}}

Format:

## Meeting Recap — {{meeting_title}}

**Date:** [extract from notes or omit if absent]
**Attendees:** {{attendees}}

### Key Decisions
- [bullet per decision]

### Action Items
| # | Action | Owner | Due |
|---|--------|-------|-----|
[one row per action item]

### Next Steps
[2-3 sentences on what happens next]

RAW NOTES:
{{notes}}`,
          chat_history_id: null,
        },
      },
      {
        name: "send",
        nodeType: "send_email",
        title: "Send recap email",
        inputConfig: {
          recipient_emails: ["{{recipient_email}}"],
          cc_emails: [],
          bcc_emails: [],
          subject: "Meeting Recap: {{meeting_title}}",
          body: "{{structure.content}}",
          body_html: null,
        },
      },
    ],
  },

  "lead-qualifier": {
    id: "lead-qualifier",
    kind: "workflow",
    complexity: 2,
    name: "Lead Qualifier",
    description: "Given a company name and URL, fetches their public web presence and runs an LLM qualification pass: fit score, budget signals, pain-point alignment, and a recommended next action. Rung 2 — web_retrieval + LLM scoring.",
    goal: "Score and qualify a B2B lead from their public web presence",
    useCases: [
      "pre-call lead qualification",
      "prioritising inbound demo requests",
      "sales team lead scoring at scale",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Lead qualification",
      fields: [
        { name: "company_url", title: "Company URL", description: "Homepage or about page.", required: true },
        { name: "company_name", title: "Company name", required: true },
        { name: "your_product", title: "Your product/service", description: "Brief description of what you sell.", required: true },
        { name: "icp", title: "Ideal Customer Profile (optional)", description: "e.g. 'Series A+ SaaS, 50-500 employees, US/EU'.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "web_retrieval",
        title: "Fetch company page",
        inputConfig: {
          prompt: "Fetch and return all visible text from this company's website including about, pricing, team, and product pages: {{company_url}}",
          include_google_search: false,
        },
      },
      {
        name: "qualify",
        nodeType: "llm",
        title: "Qualify lead",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.2,
          system_message: "You are a B2B sales qualification expert. Be specific and evidence-based — cite signals from the page.",
          human_message: `Qualify {{company_name}} as a lead for: {{your_product}}
ICP: {{icp}}

Produce:

## Fit Score: X/10
One sentence rationale.

## Company Snapshot
- Industry:
- Est. size:
- Stage:
- Geo:

## Pain-Point Alignment
Top 3 problems they likely have that {{your_product}} solves, with evidence from the page.

## Budget Signals
Any pricing page, enterprise mentions, funding, or hiring patterns that suggest budget.

## Red Flags
Any signals they're a poor fit (competitor product, wrong size, bad timing).

## Recommended Next Action
Specific outreach angle in 1-2 sentences.

COMPANY URL: {{company_url}}

PAGE CONTENT:
{{fetch.result}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "job-description-writer": {
    id: "job-description-writer",
    kind: "workflow",
    complexity: 1,
    name: "Job Description Writer",
    description: "Provide a role title, seniority, and key responsibilities; receive a polished JD with requirements, nice-to-haves, and a company blurb slot. Rung 1 — single LLM generation pass.",
    goal: "Generate a publish-ready job description from a role brief",
    useCases: [
      "HR posting a new role quickly",
      "startup founders hiring their first engineers",
      "agencies writing JDs for client roles",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Job description",
      fields: [
        { name: "role_title", title: "Role title", description: "e.g. Senior Backend Engineer", required: true },
        { name: "seniority", title: "Seniority level", description: "e.g. Junior / Mid / Senior / Staff / Director", required: true },
        { name: "responsibilities", title: "Key responsibilities", description: "Bullet points or free text.", required: true },
        { name: "stack_or_skills", title: "Required skills / stack", description: "e.g. Python, Postgres, AWS", required: false },
        { name: "company_blurb", title: "Company blurb (optional)", description: "1-2 sentences about your company.", required: false },
        { name: "location", title: "Location / remote policy", description: "e.g. Remote-first, Singapore", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "write_jd",
        nodeType: "llm",
        title: "Write job description",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.4,
          system_message: "You are a senior HR writer who creates clear, attractive, bias-free job descriptions that top candidates want to apply to.",
          human_message: `Write a publish-ready job description for:

Role: {{role_title}} ({{seniority}})
Location/Remote: {{location}}
Skills/Stack: {{stack_or_skills}}

Key responsibilities provided:
{{responsibilities}}

Company: {{company_blurb}}

Output format:
# {{role_title}}
**Location:** {{location}}

## About the Role
[2-3 sentences selling the opportunity]

## What you'll do
[6-8 bullet responsibilities — concrete, action-led]

## What we're looking for
**Must have:**
[4-6 bullets — hard requirements]

**Nice to have:**
[3-4 bullets — differentiators, not gates]

## What we offer
[4 bullets — compensation philosophy, growth, culture; leave blanks for the hiring team to fill]

## About Us
{{company_blurb}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "security-audit-email": {
    id: "security-audit-email",
    kind: "workflow",
    complexity: 2,
    name: "Security Audit → Email Report",
    description: "Paste a list of URLs or describe a system scope; an LLM runs a surface-level security checklist and emails the findings report. Converted from n8n #10112. Rung 2 — web_retrieval probes public surfaces + LLM analysis + send_email.",
    goal: "Generate a lightweight security audit report for a given domain/scope and email it",
    useCases: [
      "weekly security posture emails to a CTO",
      "pre-launch security checklist for a new product",
      "vendor security assessment from public signals",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Security audit",
      fields: [
        { name: "target_url", title: "Target URL or domain", description: "e.g. https://yourproduct.com", required: true },
        { name: "scope", title: "Scope description", description: "What to check — e.g. 'public API endpoints, login page, headers'.", required: false },
        { name: "recipient_email", title: "Recipient email", description: "Who gets the report.", required: true },
      ],
    },
    workflowNodes: [
      {
        name: "probe",
        nodeType: "web_retrieval",
        title: "Probe public surface",
        inputConfig: {
          prompt: `Fetch the target URL and return: all HTTP response headers visible in the page source, any error messages, all form endpoints, any exposed API URLs, meta tags, and any security-relevant copy (privacy policy link, cookie notices, auth methods mentioned). Target: {{target_url}}`,
          include_google_search: false,
        },
      },
      {
        name: "audit",
        nodeType: "llm",
        title: "Run security checklist",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.1,
          system_message: "You are a security engineer writing a professional audit report. Base findings ONLY on the page content provided. Never fabricate CVEs or issues that aren't evidenced.",
          human_message: `Run a surface-level security audit of {{target_url}}.
Scope: {{scope}}

Check and report on (based on the fetched content only):

## Security Audit Report — {{target_url}}

### ✅ Passed checks
List what looks good (e.g. HTTPS enforced, HSTS visible, no stack traces, CSP header present).

### ⚠️ Warnings (investigate further)
Issues that are not confirmed vulnerabilities but warrant investigation.

### 🔴 Findings
Any definite issues visible from the public surface (exposed headers, error messages leaking info, missing security headers, mixed content, etc.). For each: severity (Low/Medium/High), description, recommendation.

### Recommendations
Top 3 actions to take this week, ordered by risk reduction.

### Disclaimer
This is a surface-level automated scan of public content only. It does not replace a professional penetration test.

FETCHED CONTENT:
{{probe.result}}`,
          chat_history_id: null,
        },
      },
      {
        name: "send",
        nodeType: "send_email",
        title: "Email report",
        inputConfig: {
          recipient_emails: ["{{recipient_email}}"],
          cc_emails: [],
          bcc_emails: [],
          subject: "Security Audit Report — {{target_url}}",
          body: "{{audit.content}}",
          body_html: null,
        },
      },
    ],
  },

  "email-classify-reply": {
    id: "email-classify-reply",
    kind: "workflow",
    complexity: 1,
    name: "Email Classify & Draft Reply",
    description: "Paste an inbound email; the workflow classifies it (support / sales / spam / billing / other) and drafts a professional reply tailored to that category. Converted from n8n #10118. Rung 1 — two chained LLM passes.",
    goal: "Classify an inbound email and draft a category-appropriate reply",
    useCases: [
      "support inbox triage and reply drafting",
      "sales team handling inbound inquiries",
      "reducing response time for high-volume email",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Email to classify",
      fields: [
        { name: "email_text", title: "Inbound email text", description: "Paste the email body.", required: true },
        { name: "sender_name", title: "Sender name (optional)", required: false },
        { name: "your_name", title: "Your name / sign-off name", required: true },
        { name: "company_name", title: "Company name", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "classify",
        nodeType: "llm",
        title: "Classify email",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.1,
          system_message: "You are an email classification engine. Output ONLY a JSON object, no prose.",
          human_message: `Classify this inbound email and output ONLY valid JSON:
{
  "category": "support | sales_inquiry | billing | partnership | spam | other",
  "urgency": "low | medium | high",
  "sentiment": "positive | neutral | negative",
  "primary_ask": "one sentence — what does the sender want?",
  "tone_for_reply": "formal | friendly | apologetic | informative"
}

EMAIL:
{{email_text}}`,
          chat_history_id: null,
        },
      },
      {
        name: "draft_reply",
        nodeType: "llm",
        title: "Draft reply",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.4,
          system_message: "You are a professional email writer. Write in the tone specified. Keep replies concise and action-oriented.",
          human_message: `Draft a professional reply to this email.

Classification: {{classify.content}}
Sender: {{sender_name}}
Reply from: {{your_name}} at {{company_name}}

Rules:
- Match the tone_for_reply from the classification
- Address the primary_ask directly in the first paragraph
- If category is "support": acknowledge the issue, outline the next step
- If category is "sales_inquiry": express interest, suggest a call, don't over-promise
- If category is "billing": be precise, offer specific resolution path
- If category is "spam": output only "SPAM — no reply recommended"
- Close with a clear next action or question
- Max 150 words

ORIGINAL EMAIL:
{{email_text}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "contract-reviewer": {
    id: "contract-reviewer",
    kind: "workflow",
    complexity: 1,
    name: "Contract Reviewer",
    description: "Paste a contract or agreement text; receive a structured review: key clauses, red flags, missing protections, and a negotiation checklist. Rung 1 — single LLM review pass.",
    goal: "Review a contract for risky clauses and missing protections",
    useCases: [
      "freelancer reviewing a client contract",
      "startup reviewing vendor agreements",
      "pre-legal-review screening of new contracts",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Contract review",
      fields: [
        { name: "contract_text", title: "Contract text", description: "Paste the full contract.", required: true },
        { name: "party_role", title: "Your role in the contract", description: "e.g. 'Service Provider', 'Licensee', 'Employee'.", required: true },
        { name: "jurisdiction", title: "Jurisdiction (optional)", description: "e.g. Singapore, California, UK.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "review",
        nodeType: "llm",
        title: "Review contract",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.1,
          system_message: "You are a paralegal assistant. Identify risks clearly. Always note: 'This is not legal advice — consult a qualified lawyer before signing.'",
          human_message: `Review this contract from the perspective of: {{party_role}}
Jurisdiction: {{jurisdiction}}

## Contract Review

### Key Clauses Summary
Bullet list of the 5-8 most important clauses (payment, termination, IP, liability, confidentiality, etc.) with a one-line plain-English explanation of each.

### 🔴 Red Flags
Clauses that are unusual, unfair, or risky for {{party_role}}. For each: clause name/location, what it says, and why it's a concern.

### ⚠️ Missing Protections
Standard clauses that are absent but should be present to protect {{party_role}}.

### Negotiation Checklist
5 specific asks to negotiate, ordered by importance.

### Plain-English Summary
2 paragraphs: what this contract commits {{party_role}} to, and what the other party commits to.

---
*Disclaimer: This is not legal advice. Consult a qualified lawyer before signing.*

CONTRACT:
{{contract_text}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "reddit-monitor": {
    id: "reddit-monitor",
    kind: "workflow",
    complexity: 2,
    name: "Reddit Topic Monitor",
    description: "Fetches a subreddit or Reddit search URL and summarises the top discussions: sentiment, trending topics, common pain points, and opportunities. Rung 2 — web_retrieval + LLM analysis.",
    goal: "Monitor Reddit discussions on a topic and extract actionable insights",
    useCases: [
      "tracking brand mentions or competitor mentions on Reddit",
      "finding product pain points from user complaints",
      "market research from organic discussion",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Reddit monitor",
      fields: [
        { name: "reddit_url", title: "Reddit URL", description: "Subreddit or search URL, e.g. https://reddit.com/r/startups/search?q=hiring&sort=new", required: true },
        { name: "topic", title: "Topic / keyword focus", description: "What you're monitoring for, e.g. 'hiring tools'.", required: true },
        { name: "your_product", title: "Your product (optional)", description: "Used to flag relevant opportunities.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "web_retrieval",
        title: "Fetch Reddit page",
        inputConfig: {
          prompt: "Fetch and return all post titles, scores, and text content visible on this Reddit page: {{reddit_url}}",
          include_google_search: false,
        },
      },
      {
        name: "analyse",
        nodeType: "llm",
        title: "Analyse discussions",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.3,
          system_message: "You are a market research analyst specialising in social listening. Be specific and cite examples from the posts.",
          human_message: `Analyse these Reddit discussions on the topic: {{topic}}
Your product (optional): {{your_product}}

## Reddit Insights Report — {{topic}}

### Overall Sentiment
Positive / Neutral / Negative — with percentage breakdown and 1-2 example quotes.

### Top 5 Trending Themes
Bullet list — what are people talking about most?

### Common Pain Points
The top 3 frustrations or problems people are expressing (with example quotes).

### Positive Signals
What are people praising or recommending?

### Opportunities for {{your_product}}
3 specific ways to engage or position based on the discussions (or "N/A" if no product specified).

### Notable Posts
2-3 specific posts worth reading in full (title + why it's notable).

FETCHED CONTENT:
{{fetch.result}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "perf-review-drafter": {
    id: "perf-review-drafter",
    kind: "workflow",
    complexity: 1,
    name: "Performance Review Drafter",
    description: "Provide employee achievements, areas to improve, and goals; receive a polished performance review ready to send. Converted from n8n #10105. Rung 1 — single structured LLM generation pass.",
    goal: "Draft a professional performance review from bullet-point inputs",
    useCases: [
      "managers writing reviews faster",
      "HR standardising review language across the org",
      "self-review drafting for employees",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Performance review",
      fields: [
        { name: "employee_name", title: "Employee name", required: true },
        { name: "role", title: "Role / position", required: true },
        { name: "review_period", title: "Review period", description: "e.g. Q1 2025 or Jan–Jun 2025", required: true },
        { name: "achievements", title: "Key achievements", description: "Bullet points of what they accomplished.", required: true },
        { name: "areas_to_improve", title: "Areas to improve", description: "Bullet points of development areas.", required: true },
        { name: "goals_next_period", title: "Goals for next period", description: "Bullet points.", required: false },
        { name: "overall_rating", title: "Overall rating (optional)", description: "e.g. Exceeds / Meets / Below expectations, or a number.", required: false },
        { name: "reviewer_name", title: "Reviewer name", required: true },
        { name: "recipient_email", title: "HR/employee email (optional)", description: "If provided, the review will be emailed.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "draft",
        nodeType: "llm",
        title: "Draft review",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.3,
          system_message: "You are an experienced HR professional. Write reviews that are specific, fair, constructive, and legally appropriate — avoid vague praise or harsh language.",
          human_message: `Draft a performance review for:

**Employee:** {{employee_name}} — {{role}}
**Review Period:** {{review_period}}
**Reviewer:** {{reviewer_name}}
**Rating:** {{overall_rating}}

**Achievements provided:**
{{achievements}}

**Areas to improve:**
{{areas_to_improve}}

**Next period goals:**
{{goals_next_period}}

Format:

# Performance Review — {{employee_name}}
**Role:** {{role}} | **Period:** {{review_period}} | **Reviewer:** {{reviewer_name}}
{{overall_rating ? "**Overall Rating:** " + overall_rating : ""}}

## Overall Assessment
[2-3 sentences — balanced, honest summary]

## Strengths & Achievements
[4-6 bullet points — specific, cite deliverables or impact where possible]

## Areas for Development
[3-4 bullet points — constructive, paired with a suggested action for each]

## Goals for {{review_period}} + 1
[3-5 bullet SMART goals]

## Manager's Note
[1 short paragraph — personal, encouraging, forward-looking]`,
          chat_history_id: null,
        },
      },
      {
        name: "send",
        nodeType: "send_email",
        title: "Email review (if recipient provided)",
        inputConfig: {
          recipient_emails: ["{{recipient_email}}"],
          cc_emails: [],
          bcc_emails: [],
          subject: "Performance Review — {{employee_name}} ({{review_period}})",
          body: "{{draft.content}}",
          body_html: null,
        },
      },
    ],
  },

  "content-brief": {
    id: "content-brief",
    kind: "workflow",
    complexity: 2,
    name: "Content Brief from URL",
    description: "Fetch a competitor article or source URL, then generate a full content brief: target audience, angle, outline, SEO keywords, and word count recommendation. Rung 2 — web_retrieval + LLM brief generation.",
    goal: "Create a content brief for a new article based on an existing source or competitor piece",
    useCases: [
      "briefing writers to cover a topic better than a competitor",
      "repurposing an existing article into a new format",
      "SEO content planning from a source URL",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Content brief",
      fields: [
        { name: "source_url", title: "Source / competitor URL", description: "Article or page to base the brief on.", required: true },
        { name: "target_audience", title: "Target audience", description: "e.g. 'CTOs at Series B startups'.", required: false },
        { name: "content_goal", title: "Content goal", description: "e.g. 'rank for keyword X', 'generate leads', 'build authority'.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "web_retrieval",
        title: "Fetch source article",
        inputConfig: {
          prompt: "Fetch the full article text, headings, and any visible metadata from this URL: {{source_url}}",
          include_google_search: false,
        },
      },
      {
        name: "brief",
        nodeType: "llm",
        title: "Generate content brief",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.4,
          system_message: "You are a senior content strategist. Produce actionable briefs that a writer can follow without further clarification.",
          human_message: `Create a content brief based on this source.

Target audience: {{target_audience}}
Content goal: {{content_goal}}
Source URL: {{source_url}}

## Content Brief

### Working Title
[Proposed title — SEO-friendly, compelling]

### Target Audience
[Specific description with pain points and knowledge level]

### Content Angle
[What makes OUR version better/different from the source? Unique angle in 1-2 sentences.]

### Recommended Format & Length
[Format: blog post / listicle / guide / comparison. Word count: X-Y words. Why.]

### SEO Keywords
- Primary: [keyword]
- Secondary: [3-5 keywords]
- LSI terms: [5 related terms]

### Outline
[H2s and H3s — full skeleton the writer follows]

### Key Points to Cover
[5-8 bullet points of must-have content — insights that outperform the source]

### Do NOT include
[What to avoid — clichés, outdated info, things the source got wrong]

### Internal Links to Add
[Placeholder — fill with your actual content URLs]

SOURCE CONTENT:
{{fetch.result}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "invoice-parser": {
    id: "invoice-parser",
    kind: "workflow",
    complexity: 1,
    name: "Invoice Text Parser",
    description: "Paste invoice text and extract structured fields: vendor, date, line items, totals, due date, and payment terms. Converted from n8n #10029. Rung 1 — single LLM extraction pass, outputs JSON.",
    goal: "Extract structured data from invoice text for accounting or ERP import",
    useCases: [
      "automating accounts-payable data entry",
      "parsing PDF invoice text for ERP import",
      "auditing invoice data before payment approval",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Invoice parser",
      fields: [
        { name: "invoice_text", title: "Invoice text", description: "Paste the extracted text from the invoice (from PDF copy-paste or OCR).", required: true },
        { name: "currency", title: "Expected currency (optional)", description: "e.g. USD, SGD. Used to validate totals.", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "parse",
        nodeType: "llm",
        title: "Parse invoice",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.05,
          system_message: "You are an accounts-payable assistant. Output ONLY valid JSON — no prose, no markdown fences. If a field is not found, set it to null.",
          human_message: `Extract all invoice data and return ONLY valid JSON:
{
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "vendor_name": "string or null",
  "vendor_address": "string or null",
  "vendor_email": "string or null",
  "bill_to_name": "string or null",
  "bill_to_address": "string or null",
  "currency": "string",
  "line_items": [
    {"description": "string", "quantity": number_or_null, "unit_price": number_or_null, "amount": number}
  ],
  "subtotal": number_or_null,
  "tax_rate": number_or_null,
  "tax_amount": number_or_null,
  "discount": number_or_null,
  "total": number,
  "payment_terms": "string or null",
  "bank_details": "string or null",
  "notes": "string or null"
}

Expected currency: {{currency}}

INVOICE TEXT:
{{invoice_text}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "changelog-writer": {
    id: "changelog-writer",
    kind: "workflow",
    complexity: 1,
    name: "Changelog Writer",
    description: "Paste raw git commit messages or release notes; receive a user-facing changelog in Keep-a-Changelog format, grouped by type (Added / Changed / Fixed / Removed). Rung 1 — single LLM reformatting pass.",
    goal: "Turn raw commits or dev notes into a polished user-facing changelog",
    useCases: [
      "writing release notes for product updates",
      "turning git log into a changelog for a SaaS product",
      "weekly dev-team updates for non-technical stakeholders",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Changelog",
      fields: [
        { name: "raw_commits", title: "Raw commits / dev notes", description: "Paste git log output or free-form dev notes.", required: true },
        { name: "version", title: "Version number", description: "e.g. v2.4.1 or 2025-06-15", required: true },
        { name: "product_name", title: "Product name", required: false },
        { name: "audience", title: "Audience", description: "e.g. 'technical users', 'end users', 'both'", required: false, defaultValue: "end users" },
      ],
    },
    workflowNodes: [
      {
        name: "write",
        nodeType: "llm",
        title: "Write changelog",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.3,
          system_message: "You are a technical writer who translates developer jargon into clear, user-friendly release notes. Write for the specified audience. Never expose internal implementation details. Each entry is one concise action sentence.",
          human_message: `Write a changelog for {{product_name}} {{version}}.
Audience: {{audience}}

Format (Keep-a-Changelog):

# {{version}} — [date if found in commits, otherwise today]

## Added
- [New features — user-facing benefit, not implementation detail]

## Changed
- [Behaviour changes, UI updates, performance improvements]

## Fixed
- [Bug fixes — describe the symptom that was fixed, not the code change]

## Removed
- [Deprecated features removed]

Rules:
- Group only sections that have entries — omit empty sections
- Each line starts with a verb in past tense (Added, Fixed, Improved, Removed)
- Translate tech jargon to user language (e.g. "Fixed N+1 query" → "Fixed slow load times on the dashboard")
- For a technical audience: keep technical precision but remove internal code references

RAW COMMITS / NOTES:
{{raw_commits}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "customer-feedback-digest": {
    id: "customer-feedback-digest",
    kind: "workflow",
    complexity: 1,
    name: "Customer Feedback Digest",
    description: "Paste a batch of raw customer feedback (reviews, support tickets, survey responses); receive a categorised digest with themes, sentiment breakdown, top complaints, and product recommendations. Rung 1 — single LLM synthesis pass.",
    goal: "Synthesise raw customer feedback into actionable insights",
    useCases: [
      "weekly voice-of-customer digest for the product team",
      "analysing App Store / G2 / Trustpilot reviews in batch",
      "summarising a support ticket backlog for a sprint planning",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Feedback digest",
      fields: [
        { name: "feedback_text", title: "Raw feedback", description: "Paste reviews, tickets, or survey responses — one per line or separated by ---.", required: true },
        { name: "product_name", title: "Product name", required: false },
        { name: "recipient_email", title: "Email to send digest (optional)", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "digest",
        nodeType: "llm",
        title: "Synthesise feedback",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.2,
          system_message: "You are a product analyst. Produce structured, evidence-based insights. Quote specific feedback where helpful.",
          human_message: `Analyse this customer feedback for {{product_name}} and produce a digest.

## Customer Feedback Digest — {{product_name}}

### Sentiment Breakdown
Positive: X% | Neutral: Y% | Negative: Z%
[2-3 sentence overall summary]

### Top 5 Themes
Ordered by frequency. For each: theme name, count/frequency signal, 1-2 representative quotes.

### Top Complaints (Priority Order)
1. [Complaint] — [frequency signal] — [example quote]
(up to 5)

### Top Praises
What customers love most (up to 3 themes with quotes).

### Product Recommendations
3 specific product/UX changes suggested by the data, with supporting evidence from the feedback.

### Anomalies / One-offs Worth Noting
Any unusual feedback that doesn't fit the main themes but is worth flagging.

RAW FEEDBACK:
{{feedback_text}}`,
          chat_history_id: null,
        },
      },
      {
        name: "send",
        nodeType: "send_email",
        title: "Email digest (if recipient provided)",
        inputConfig: {
          recipient_emails: ["{{recipient_email}}"],
          cc_emails: [],
          bcc_emails: [],
          subject: "Customer Feedback Digest — {{product_name}}",
          body: "{{digest.content}}",
          body_html: null,
        },
      },
    ],
  },

  "pricing-page-analyser": {
    id: "pricing-page-analyser",
    kind: "workflow",
    complexity: 2,
    name: "Pricing Page Analyser",
    description: "Fetches a SaaS pricing page and returns a structured breakdown: tiers, price points, positioning, anchoring strategy, missing elements, and a conversion optimisation checklist. Rung 2 — web_retrieval + LLM analysis.",
    goal: "Decode a SaaS pricing page and extract conversion insights",
    useCases: [
      "competitive pricing research",
      "auditing your own pricing page before a redesign",
      "understanding how a competitor structures value",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Pricing analysis",
      fields: [
        { name: "pricing_url", title: "Pricing page URL", description: "e.g. https://stripe.com/pricing", required: true },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "web_retrieval",
        title: "Fetch pricing page",
        inputConfig: {
          prompt: "Fetch all pricing information from this page: plan names, prices, billing periods, features per tier, CTAs, and any enterprise / custom pricing mentions. URL: {{pricing_url}}",
          include_google_search: false,
        },
      },
      {
        name: "analyse",
        nodeType: "llm",
        title: "Analyse pricing",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.3,
          system_message: "You are a SaaS pricing strategist. Be specific — cite actual prices, plan names, and feature lists from the page.",
          human_message: `Analyse this SaaS pricing page: {{pricing_url}}

## Pricing Analysis

### Tiers Overview
| Tier | Price | Billing | Target Customer |
|------|-------|---------|-----------------|
[one row per plan]

### Pricing Psychology
- Anchoring: [which plan is the anchor? How is it used?]
- Decoy effect: [is there a decoy tier? Which one and why?]
- Loss aversion: [what features are withheld to push upgrades?]
- Free tier / trial: [structure and conversion goal]

### Key Value Metrics
What is the primary value metric they charge on? (seats / usage / features / revenue share / other)

### What's Missing
3 things that could improve conversion that are absent from the current page.

### Positioning
What market segment and buyer persona is this pricing designed for?

### Conversion Optimisation Checklist
5 specific improvements (copy, structure, social proof, CTA placement, etc.) ordered by expected impact.

FETCHED CONTENT:
{{fetch.result}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "onboarding-email-sequence": {
    id: "onboarding-email-sequence",
    kind: "workflow",
    complexity: 1,
    name: "Onboarding Email Sequence",
    description: "Provide product details and user persona; generate a 5-email onboarding sequence (Day 0 to Day 14) with subject lines, body copy, and CTAs. Rung 1 — single structured LLM generation pass.",
    goal: "Generate a complete 5-email onboarding sequence for a new user persona",
    useCases: [
      "SaaS onboarding for new sign-ups",
      "e-commerce welcome sequences",
      "B2B trial nurture campaigns",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "Onboarding sequence",
      fields: [
        { name: "product_name", title: "Product name", required: true },
        { name: "product_description", title: "What the product does", description: "1-3 sentences.", required: true },
        { name: "user_persona", title: "User persona", description: "e.g. 'freelance designer who just signed up for a free trial'.", required: true },
        { name: "main_aha_moment", title: "Aha moment", description: "The single action that makes a user stick — e.g. 'first project created'.", required: false },
        { name: "sender_name", title: "Sender name", required: false, defaultValue: "The Team" },
      ],
    },
    workflowNodes: [
      {
        name: "write",
        nodeType: "llm",
        title: "Write sequence",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.5,
          system_message: "You are an email copywriter specialising in SaaS onboarding. Write in a warm, direct, benefit-led tone. Each email has one job — never cram multiple CTAs.",
          human_message: `Write a 5-email onboarding sequence for:

Product: {{product_name}} — {{product_description}}
User persona: {{user_persona}}
Aha moment to drive toward: {{main_aha_moment}}
Sender: {{sender_name}}

Write exactly 5 emails:

---
## Email 1 — Day 0: Welcome
**Subject:**
**Preview text:**
**Body:**
[150-200 words. Goal: confirm sign-up, set expectations, soft CTA to the aha moment]
**CTA:**

---
## Email 2 — Day 1: First Win
**Subject:**
**Preview text:**
**Body:**
[100-150 words. Goal: guide them to the aha moment with a specific how-to]
**CTA:**

---
## Email 3 — Day 3: Value Proof
**Subject:**
**Preview text:**
**Body:**
[100-150 words. Goal: social proof + feature highlight that advances them past aha]
**CTA:**

---
## Email 4 — Day 7: Overcome Friction
**Subject:**
**Preview text:**
**Body:**
[100-150 words. Goal: address the most common reason people don't stick at day 7]
**CTA:**

---
## Email 5 — Day 14: Commitment
**Subject:**
**Preview text:**
**Body:**
[150 words. Goal: either upgrade CTA for trial users, or deepen engagement for free users]
**CTA:**`,
          chat_history_id: null,
        },
      },
    ],
  },

  "seo-meta-writer": {
    id: "seo-meta-writer",
    kind: "workflow",
    complexity: 2,
    name: "SEO Meta Writer",
    description: "Fetch a page URL and generate optimised SEO title tags, meta descriptions, Open Graph copy, and Twitter card copy — all within character limits. Rung 2 — web_retrieval + LLM generation.",
    goal: "Generate SEO meta tags and social sharing copy from a live page URL",
    useCases: [
      "updating meta tags for an existing page",
      "generating social sharing copy for a blog post",
      "SEO audit output for a content library",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "SEO meta",
      fields: [
        { name: "page_url", title: "Page URL", required: true },
        { name: "primary_keyword", title: "Primary keyword (optional)", description: "The main keyword to target.", required: false },
        { name: "brand_name", title: "Brand name", required: false },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "web_retrieval",
        title: "Fetch page content",
        inputConfig: {
          prompt: "Fetch all visible text, headings, and existing meta tags from this URL: {{page_url}}",
          include_google_search: false,
        },
      },
      {
        name: "generate",
        nodeType: "llm",
        title: "Generate SEO meta",
        inputConfig: {
          model: "agenticflow/gemma-4-31b-it",
          temperature: 0.4,
          system_message: "You are an SEO copywriter. Write within exact character limits. Include the primary keyword naturally. Never keyword-stuff.",
          human_message: `Generate SEO meta tags for: {{page_url}}
Primary keyword: {{primary_keyword}}
Brand: {{brand_name}}

## SEO Meta Output

### Title Tags (pick the best one)
Option A [50-60 chars]: [title]
Option B [50-60 chars]: [title]
Option C [50-60 chars]: [title]

### Meta Descriptions (pick the best one)
Option A [150-160 chars]: [description]
Option B [150-160 chars]: [description]

### Open Graph
og:title [50-60 chars]: [title]
og:description [200 chars max]: [description]
og:type: website

### Twitter Card
twitter:title [50-60 chars]: [title]
twitter:description [200 chars max]: [description]

### H1 Recommendation
Current H1 (if found): [paste from content]
Suggested H1: [improved version with keyword]

PAGE CONTENT:
{{fetch.result}}`,
          chat_history_id: null,
        },
      },
    ],
  },

  "api-summary": {
    id: "api-summary",
    kind: "workflow",
    complexity: 2,
    name: "API Summary",
    description: "Calls an HTTP JSON API, parses the response, and asks an LLM to explain what it means. Demonstrates rung 2 — workflow with api_call + string_to_json + llm. Useful for quickly understanding an unfamiliar API endpoint's output.",
    goal: "Fetch a JSON API endpoint, parse it, and produce a plain-English explanation of the response",
    useCases: [
      "exploring an unfamiliar public API",
      "debugging API integrations",
      "turning JSON into a user-friendly summary",
    ],
    agents: [],
    starterTasks: [],
    workflowInputSchema: {
      title: "API Request",
      fields: [
        {
          name: "api_url",
          title: "API URL",
          description: "The GET endpoint to call (e.g. https://jsonplaceholder.typicode.com/todos/1).",
          required: true,
        },
      ],
    },
    workflowNodes: [
      {
        name: "fetch",
        nodeType: "api_call",
        title: "Call API",
        description: "Make a GET request to the provided URL. The response_body is already parsed JSON.",
        inputConfig: {
          url: "{{api_url}}",
          method: "GET",
          headers: {},
          body_type: "none",
        },
      },
      {
        name: "explain",
        nodeType: "llm",
        title: "Explain",
        description: "Summarize the parsed API response in plain English.",
        inputConfig: {
          model: "DeepSeek V3",
          temperature: 0.4,
          // fetch.response_body is already a parsed object — the llm human_message
          // renders it as JSON text via template substitution. No string_to_json
          // node needed (earlier revision used one, but api_call auto-parses JSON).
          human_message:
            "Explain what this API response represents in 2-3 sentences. Name the key fields and what they mean. Don't dump the raw JSON back.\n\nURL: {{api_url}}\n\nRESPONSE:\n{{fetch.response_body}}",
          system_message:
            "You are an API interpreter. Explain what fields mean in plain English, not what the raw JSON says verbatim.",
          chat_history_id: null,
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RUNG 3 — Single agent + AgenticFlow-native plugins (connection-free)
  // Every workspace can deploy these on day 1. No external accounts needed.
  // ═══════════════════════════════════════════════════════════════════════
  "research-assistant": {
    id: "research-assistant",
    tier: 1,
    name: "Research Assistant",
    description: "A single AI agent pre-wired with web search, web retrieval, and HTTP API-call tools. Answers research questions with cited sources. No external connections required.",
    goal: "Answer user research questions with fresh web-sourced evidence",
    useCases: ["researching a topic with citations", "answering questions that need current web info", "summarizing information from a URL", "hitting a public API and summarizing the response"],
    agents: [
      {
        role: "ceo",
        title: "Research Agent",
        description: "Answers open-ended research questions using real web search + URL retrieval. Always cites sources.",
        plugins: [
          { nodeTypeName: "web_search" },
          { nodeTypeName: "web_retrieval" },
          { nodeTypeName: "api_call" },
          { nodeTypeName: "string_to_json" },
        ],
      },
    ],
    starterTasks: [],
  },
  "content-creator": {
    id: "content-creator",
    tier: 1,
    name: "Content Creator",
    description: "A single AI agent that researches a topic, drafts written content, and generates a hero image — end to end from one prompt. No external connections required.",
    goal: "Produce a research-grounded blog post or social draft with an accompanying image",
    useCases: ["writing a blog post on a topic", "drafting social media copy with visuals", "turning a URL into a summary + thumbnail", "generating a graphic for a short piece of copy"],
    agents: [
      {
        role: "ceo",
        title: "Content Creation Agent",
        description: "Researches the topic with web search + retrieval, drafts the copy in the user's voice, and generates a hero image that matches the content.",
        plugins: [
          { nodeTypeName: "web_search" },
          { nodeTypeName: "web_retrieval" },
          { nodeTypeName: "agenticflow_generate_image" },
        ],
      },
    ],
    starterTasks: [],
  },
  "api-helper": {
    id: "api-helper",
    tier: 1,
    name: "API Helper",
    description: "A single AI agent that calls arbitrary HTTP APIs, parses JSON responses, and computes over the results. Useful for quick integrations and data pulls. No external connections required.",
    goal: "Invoke public HTTP APIs, parse the response, and answer user questions against the parsed data",
    useCases: ["calling a public REST API", "parsing JSON from an arbitrary URL", "chaining an API call through a summary", "quick data checks against a live endpoint"],
    agents: [
      {
        role: "ceo",
        title: "API Agent",
        description: "Calls HTTP APIs with the api_call tool, parses JSON output, and summarizes or transforms the result for the user.",
        plugins: [
          { nodeTypeName: "api_call" },
          { nodeTypeName: "string_to_json" },
          { nodeTypeName: "web_search" },
        ],
      },
    ],
    starterTasks: [],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 3 — Multi-agent workforces (requires MAS Workforce feature)
  // Each deploys a DAG: trigger → coordinator → worker agents → output.
  //
  // The first five are "batteries included" — every slot has `plugins[]`
  // configured with AgenticFlow-native nodes (connection-less) so the
  // deployed workforce works end-to-end with zero follow-up setup. Added
  // in v1.9.0 to demonstrate assemble-from-built-ins patterns.
  // ═══════════════════════════════════════════════════════════════════════
  "research-pair": {
    id: "research-pair",
    tier: 3,
    name: "Research Pair",
    description: "Two-agent research team: a Planner that scopes the question into a specific search plan, and a Researcher that executes web_search + web_retrieval and cites sources. Simplest useful multi-agent setup.",
    goal: "Turn a vague research question into a cited, web-grounded answer",
    useCases: [
      "researching a topic when you want planning + execution separated",
      "getting cited answers with source URLs",
      "demonstrating the simplest useful 2-agent handoff",
    ],
    agents: [
      {
        role: "ceo",
        title: "Research Planner",
        description: "Receives the user's question, identifies 2-3 specific things to look up, and delegates a concrete research plan to the Researcher.",
        plugins: [
          { nodeTypeName: "web_search" },
        ],
      },
      {
        role: "researcher",
        title: "Web Researcher",
        description: "Executes the Planner's search plan: runs web_search, uses web_retrieval on the most promising URLs, and returns a structured answer with cited sources.",
        plugins: [
          { nodeTypeName: "web_search" },
          { nodeTypeName: "web_retrieval" },
        ],
      },
    ],
    starterTasks: [],
  },
  "content-duo": {
    id: "content-duo",
    tier: 3,
    name: "Content Duo",
    description: "Writer + Illustrator: the Writer drafts a blog post or social copy (using web_search to stay grounded), and the Illustrator generates a matching hero image via agenticflow_generate_image.",
    goal: "Produce a written piece of content paired with a generated hero image",
    useCases: [
      "blog post + matching thumbnail from a single prompt",
      "social copy + visual from a topic",
      "content with generated visuals without switching tools",
    ],
    agents: [
      {
        role: "ceo",
        title: "Content Writer",
        description: "Researches the topic with web_search, drafts the copy in the requested format, and hands off to the Illustrator with a clear image-brief.",
        plugins: [
          { nodeTypeName: "web_search" },
          { nodeTypeName: "web_retrieval" },
        ],
      },
      {
        role: "designer",
        title: "Illustrator",
        description: "Reads the Writer's image-brief and generates a hero image with agenticflow_generate_image. Composes a SPECIFIC, descriptive prompt — no vague inputs.",
        plugins: [
          { nodeTypeName: "agenticflow_generate_image" },
        ],
      },
    ],
    starterTasks: [],
  },
  "api-pipeline": {
    id: "api-pipeline",
    tier: 3,
    name: "API Pipeline",
    description: "Data Fetcher + Analyst: the Fetcher hits an HTTP API via api_call and parses JSON with string_to_json; the Analyst reasons over the structured data and produces an answer or report.",
    goal: "Turn a raw HTTP API call into a user-facing answer",
    useCases: [
      "querying a public API and summarizing the response",
      "chaining data fetch → analysis in one deploy",
      "demonstrating the api_call + string_to_json pattern",
    ],
    agents: [
      {
        role: "ceo",
        title: "Data Fetcher",
        description: "Given the user's intent, builds and executes an api_call, parses the JSON response with string_to_json, and passes a clean data object to the Analyst.",
        plugins: [
          { nodeTypeName: "api_call" },
          { nodeTypeName: "string_to_json" },
        ],
      },
      {
        role: "researcher",
        title: "Data Analyst",
        description: "Reads the structured API response from the Fetcher and produces a clear, user-facing answer with specific numbers/facts. May use web_search if the API response needs contextual enrichment.",
        plugins: [
          { nodeTypeName: "web_search" },
        ],
      },
    ],
    starterTasks: [],
  },
  "fact-check-loop": {
    id: "fact-check-loop",
    tier: 3,
    name: "Fact Check Loop",
    description: "Writer + Fact Checker: the Writer drafts a claim-heavy piece; the Fact Checker runs web_search on each factual claim and flags anything unsupported. Useful for press releases, newsletters, briefings.",
    goal: "Produce a draft then verify its factual claims against the live web",
    useCases: [
      "newsletter draft + source verification",
      "press release fact-check before send",
      "reducing hallucinations in written content",
    ],
    agents: [
      {
        role: "ceo",
        title: "Writer",
        description: "Drafts the requested piece. Lists specific factual claims at the end of the draft so the Fact Checker has a verification checklist.",
        plugins: [
          { nodeTypeName: "web_search" },
        ],
      },
      {
        role: "researcher",
        title: "Fact Checker",
        description: "Takes the Writer's draft and claim list, runs web_search + web_retrieval on each claim, flags unsupported/incorrect claims with evidence URLs. Returns a verified (or annotated) version.",
        plugins: [
          { nodeTypeName: "web_search" },
          { nodeTypeName: "web_retrieval" },
        ],
      },
    ],
    starterTasks: [],
  },
  "parallel-research": {
    id: "parallel-research",
    tier: 3,
    name: "Parallel Research",
    description: "Coordinator + 2 Researchers + Synthesizer: a 4-agent fan-out pattern. The Coordinator splits a broad question into two sub-questions; Researcher A and Researcher B each tackle one (parallel web_search); the Synthesizer merges their findings into a unified answer. Showcases fan-out/fan-in.",
    goal: "Answer a broad question by parallel investigation of two sub-angles",
    useCases: [
      "comparing two options or alternatives with independent research",
      "answering multi-part questions without sequential bottleneck",
      "demonstrating fan-out in MAS workforces",
    ],
    agents: [
      {
        role: "ceo",
        title: "Research Coordinator",
        // PDCA 2026-04-14: the coordinator previously had web_search and did
        // 6 searches ITSELF before "delegating" — which prevented the
        // researchers from doing independent work. Removing the search plugin
        // forces the coordinator to split + delegate only. Its job is ONE
        // thing: emit two labeled tasks ("Researcher A: ...", "Researcher B: ...").
        description: "Your ONLY job is to split the user's question into TWO distinct angles and delegate one to each Researcher. Do not research yourself — your output format is exactly:\n\nResearcher A task: <specific investigable question about the first angle>\nResearcher B task: <specific investigable question about the second, complementary angle>\n\nKeep the split CLEAN — no overlap.",
        plugins: [],
      },
      {
        role: "researcher",
        title: "Researcher A",
        description: "You are Researcher A. Read the Coordinator's output. Find the line starting with 'Researcher A task:' — THAT is your angle. Immediately call web_search on terms from that angle. Then web_retrieval on the most promising result. Produce a focused, cited mini-report on your angle ONLY. Do NOT wait for anyone — Researcher B is working in parallel.",
        plugins: [
          { nodeTypeName: "web_search" },
          { nodeTypeName: "web_retrieval" },
        ],
      },
      {
        role: "researcher_b",
        title: "Researcher B",
        description: "You are Researcher B. Read the Coordinator's output. Find the line starting with 'Researcher B task:' — THAT is your angle. If the coordinator's output doesn't name your angle explicitly, DEDUCE it: pick the SECOND distinct angle that's complementary to Researcher A's likely focus. Immediately call web_search. Then web_retrieval. Produce a cited mini-report on your angle ONLY. You MUST call at least one tool — your first action is web_search, never 'I will await'. Runs IN PARALLEL with Researcher A — they are not sending you data.",
        plugins: [
          { nodeTypeName: "web_search" },
          { nodeTypeName: "web_retrieval" },
        ],
      },
      {
        role: "cmo",
        title: "Synthesizer",
        // PDCA round 4 (2026-04-14): previous description used IF/THEN logic
        // that caused the model to output synthesis as Python code. Rewriting
        // as direct prose — just describe the deliverable, not conditional logic.
        description: "You are a writer, not a coder. Read Researcher A's report and Researcher B's report (both provided in your input, separated by '---'). Write a clear, structured prose answer that merges both angles. Cite each fact with (Researcher A) or (Researcher B). If a researcher's section looks empty or placeholder-like (e.g. 'I will await...', short stub text), note that the angle is missing in your answer — do not fabricate content for it. Output plain markdown, no code blocks, no function definitions.",
        plugins: [],
        isSynthesizer: true,
      },
    ],
    starterTasks: [],
  },
  "dev-shop": {
    id: "dev-shop",
    tier: 3,
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
    tier: 3,
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
    tier: 3,
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
    tier: 3,
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
    tier: 3,
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
    tier: 3,
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
    tier: 3,
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
    tier: 3,
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
