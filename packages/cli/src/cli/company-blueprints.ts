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
