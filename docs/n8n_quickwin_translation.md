# n8n Quick-Win Translation Baseline

## Scope
- Scraped first **100** workflows from n8n public catalog endpoint.
- Learned current AgenticFlow public capability coverage from public workflow templates.
- Translated only workflows that can be represented using currently observed runnable node types/actions.
- Validated generated workflow payloads with `POST /v1/workflows/utils/validate_create_workflow_model`.

## Results
- n8n sampled workflows: **100**
- AgenticFlow public templates analyzed: **243**
- Runnable quick-win translations found: **25**
- Validation pass: **25/25**

## Supported Quick-Win Mapping
- `@n8n/n8n-nodes-langchain.*` chat/agent -> `llm`
- `n8n-nodes-base.httpRequest` -> `api_call`
- `n8n-nodes-base.googleSheets` -> `mcp_run_action` (`google_sheets-upsert-row`)
- `n8n-nodes-base.gmail` -> `mcp_run_action` (`gmail-send-email` or `gmail-create-draft`)
- `n8n-nodes-base.googleDocs` -> `mcp_run_action` (`google_docs-insert-text`)
- `n8n-nodes-base.linkedIn` -> `mcp_run_action` (`linkedin-create-text-post-user`)
- `n8n-nodes-base.emailSend` -> `send_email`

## Top Runnable Quick Wins
- `4968` Automated LinkedIn Content Creation with GPT-4 and DALL-E for Scheduled Posts | mapped `5/6` | validation `200`
- `5541` Track AI Agent token usage and estimate costs in Google Sheets | mapped `5/6` | validation `200`
- `5691` Generate Personalized Sales Emails with LinkedIn Data & Claude 3.7 via OpenRouter | mapped `5/6` | validation `200`
- `5035` Generate & Auto-post AI Videos to Social Media with Veo3 and Blotato | mapped `4/6` | validation `200`
- `7163` Automate Hyper-Personalized Email Outreach with AI, Gmail & Google Sheets | mapped `4/4` | validation `200`
- `5796` Create AI News Avatar Videos with Dumpling AI, GPT-4o and HeyGen | mapped `4/4` | validation `200`
- `6287` Email Support Agent w/ Gemini & GPT fallback using Gmail + Google Sheets | mapped `4/5` | validation `200`
- `5832` Qualify & Reach Out to B2B Leads with Groq AI, Apollo, Gmail & Sheets | mapped `4/5` | validation `200`
- `6841` Automate weekly Hollywood film briefing via Tavily and Gemini | mapped `4/5` | validation `200`
- `4484` Build a Voice AI Chatbot with ElevenLabs and InfraNodus Knowledge Experts | mapped `3/4` | validation `200`
- `4722` Gmail AI Email Manager | mapped `3/4` | validation `200`
- `7156` Get Started with Google Sheets in n8n | mapped `3/4` | validation `200`
- `8093` AI-Powered Degree Audit System with Google Sheets and GPT-5 | mapped `3/4` | validation `200`
- `5906` Automated Job Applications & Status Tracking with LinkedIn, Indeed & Google Sheets | mapped `3/3` | validation `200`
- `5948` Automated Competitor Pricing Monitor with Bright Data MCP & OpenAI | mapped `3/5` | validation `200`
- `9814` Personalized Email Outreach with LinkedIn & Crunchbase Data and Gemini AI Review | mapped `3/4` | validation `200`
- `6270` Build Your First AI Agent | mapped `2/3` | validation `200`
- `7639` Talk to Your Google Sheets Using ChatGPT-5 | mapped `2/3` | validation `200`
- `5683` One-Click YouTube Shorts Generator with Leonardo AI, GPT and ElevenLabs | mapped `2/2` | validation `200`
- `5690` Extract and Store YouTube Video Comments in Google Sheets | mapped `2/2` | validation `200`

## Highest-Gap n8n Nodes (Top 10)
- `n8n-nodes-base.code`: 44
- `n8n-nodes-base.googleDrive`: 18
- `n8n-nodes-base.telegram`: 15
- `@n8n/n8n-nodes-langchain.embeddingsOpenAi`: 6
- `n8n-nodes-base.whatsApp`: 5
- `n8n-nodes-base.slack`: 4
- `n8n-nodes-base.facebookGraphApi`: 4
- `@n8n/n8n-nodes-langchain.toolWorkflow`: 3
- `n8n-nodes-base.twitter`: 3
- `@n8n/n8n-nodes-langchain.mcpClientTool`: 2

## Artifacts
- `/tmp/n8n_workflows_100.json`
- `/tmp/af_quickwin_translations.json`
- `/tmp/af_quickwin_validation.json`

## Translator v2 follow-up

The mapping logic in this baseline is now tracked as v2 in `scripts/module/translator_v2.py`.
It adds explicit capability states (`equivalent`, `partial`, `unsupported`) and a hard
failure mode for translation paths that would silently drop required tooling/memory semantics.
See [`docs/n8n_translator_v2.md`](./n8n_translator_v2.md).
