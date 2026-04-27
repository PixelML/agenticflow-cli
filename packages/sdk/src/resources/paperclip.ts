/**
 * Paperclip integration resource.
 *
 * Full control-plane client for a Paperclip instance — companies, agents,
 * goals, issues, approvals, and dashboard.  Used by the CLI to publish
 * AgenticFlow agents to Paperclip and manage them afterwards.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface PaperclipConfig {
  baseUrl: string;
}

export interface PaperclipCompany {
  id: string;
  name: string;
  description: string | null;
  status: string;
  issuePrefix: string;
  issueCounter: number;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  requireBoardApprovalForNewAgents: boolean;
  brandColor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperclipAgent {
  id: string;
  companyId: string;
  name: string;
  urlKey: string;
  role: string;
  title: string | null;
  icon: string | null;
  status: string;
  reportsTo: string | null;
  capabilities: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  permissions: { canCreateAgents: boolean };
  lastHeartbeatAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperclipGoal {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  parentId: string | null;
  ownerAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperclipIssue {
  id: string;
  companyId: string;
  issueNumber: number;
  identifier: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  goalId: string | null;
  projectId: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperclipComment {
  id: string;
  issueId: string;
  body: string;
  actorType: string;
  actorId: string;
  createdAt: string;
}

export interface PaperclipApproval {
  id: string;
  companyId: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  requestedByAgentId: string | null;
  decisionNote: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface PaperclipHeartbeatRun {
  id: string;
  companyId: string;
  agentId: string;
  invocationSource: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface PaperclipDashboard {
  [key: string]: unknown;
}

// ── Transport ──────────────────────────────────────────────────────

async function paperclipFetch<T>(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Paperclip API ${method} ${path} failed (${response.status}): ${text}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  return { ok: true } as T;
}

// ── Resource ───────────────────────────────────────────────────────

export class PaperclipResource {
  constructor(private config: PaperclipConfig) {}

  private fetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    return paperclipFetch<T>(this.config.baseUrl, method, path, body);
  }

  // ── Health ──────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl.replace(/\/+$/, "")}/api/health`;
      const resp = await fetch(url, { method: "GET" });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // ── Companies ───────────────────────────────────────────────────

  async listCompanies(): Promise<PaperclipCompany[]> {
    return this.fetch("GET", "/api/companies/");
  }

  async getCompany(companyId: string): Promise<PaperclipCompany> {
    return this.fetch("GET", `/api/companies/${companyId}`);
  }

  async createCompany(payload: {
    name: string;
    description?: string;
    budgetMonthlyCents?: number;
  }): Promise<PaperclipCompany> {
    return this.fetch("POST", "/api/companies/", payload);
  }

  async updateCompany(
    companyId: string,
    payload: Record<string, unknown>,
  ): Promise<PaperclipCompany> {
    return this.fetch("PATCH", `/api/companies/${companyId}`, payload);
  }

  async archiveCompany(companyId: string): Promise<PaperclipCompany> {
    return this.fetch("POST", `/api/companies/${companyId}/archive`);
  }

  async deleteCompany(companyId: string): Promise<unknown> {
    return this.fetch("DELETE", `/api/companies/${companyId}`);
  }

  // ── Agents ──────────────────────────────────────────────────────

  async listAgents(companyId: string): Promise<PaperclipAgent[]> {
    return this.fetch("GET", `/api/companies/${companyId}/agents`);
  }

  async getAgent(agentId: string): Promise<PaperclipAgent> {
    return this.fetch("GET", `/api/agents/${agentId}`);
  }

  async createAgent(
    companyId: string,
    payload: {
      name: string;
      role?: string;
      title?: string;
      icon?: string;
      capabilities?: string;
      adapterType: string;
      adapterConfig: Record<string, unknown>;
      runtimeConfig?: Record<string, unknown>;
      budgetMonthlyCents?: number;
      reportsTo?: string;
      permissions?: { canCreateAgents?: boolean };
      metadata?: Record<string, unknown>;
      desiredSkills?: string[];
    },
  ): Promise<PaperclipAgent> {
    return this.fetch("POST", `/api/companies/${companyId}/agents`, payload);
  }

  async updateAgent(
    agentId: string,
    payload: Record<string, unknown>,
  ): Promise<PaperclipAgent> {
    return this.fetch("PATCH", `/api/agents/${agentId}`, payload);
  }

  async pauseAgent(agentId: string): Promise<PaperclipAgent> {
    return this.fetch("POST", `/api/agents/${agentId}/pause`);
  }

  async resumeAgent(agentId: string): Promise<PaperclipAgent> {
    return this.fetch("POST", `/api/agents/${agentId}/resume`);
  }

  async terminateAgent(agentId: string): Promise<PaperclipAgent> {
    return this.fetch("POST", `/api/agents/${agentId}/terminate`);
  }

  async wakeupAgent(
    agentId: string,
    payload?: {
      source?: string;
      triggerDetail?: string;
      reason?: string;
      payload?: Record<string, unknown>;
      forceFreshSession?: boolean;
    },
  ): Promise<PaperclipHeartbeatRun> {
    return this.fetch("POST", `/api/agents/${agentId}/wakeup`, payload ?? {});
  }

  async deleteAgent(agentId: string): Promise<unknown> {
    return this.fetch("DELETE", `/api/agents/${agentId}`);
  }

  // ── Goals ───────────────────────────────────────────────────────

  async listGoals(companyId: string): Promise<PaperclipGoal[]> {
    return this.fetch("GET", `/api/companies/${companyId}/goals`);
  }

  async getGoal(goalId: string): Promise<PaperclipGoal> {
    return this.fetch("GET", `/api/goals/${goalId}`);
  }

  async createGoal(
    companyId: string,
    payload: {
      title: string;
      description?: string;
      level?: string;
      status?: string;
      parentId?: string;
      ownerAgentId?: string;
    },
  ): Promise<PaperclipGoal> {
    return this.fetch("POST", `/api/companies/${companyId}/goals`, payload);
  }

  async updateGoal(
    goalId: string,
    payload: Record<string, unknown>,
  ): Promise<PaperclipGoal> {
    return this.fetch("PATCH", `/api/goals/${goalId}`, payload);
  }

  async deleteGoal(goalId: string): Promise<unknown> {
    return this.fetch("DELETE", `/api/goals/${goalId}`);
  }

  // ── Issues ──────────────────────────────────────────────────────

  async listIssues(
    companyId: string,
    query?: string,
  ): Promise<PaperclipIssue[]> {
    const qs = query ? `?${query}` : "";
    return this.fetch("GET", `/api/companies/${companyId}/issues${qs}`);
  }

  async getIssue(issueId: string): Promise<PaperclipIssue> {
    return this.fetch("GET", `/api/issues/${issueId}`);
  }

  async createIssue(
    companyId: string,
    payload: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeAgentId?: string;
      goalId?: string;
      projectId?: string;
      parentId?: string;
    },
  ): Promise<PaperclipIssue> {
    return this.fetch("POST", `/api/companies/${companyId}/issues`, payload);
  }

  async updateIssue(
    issueId: string,
    payload: Record<string, unknown>,
  ): Promise<PaperclipIssue> {
    return this.fetch("PATCH", `/api/issues/${issueId}`, payload);
  }

  async deleteIssue(issueId: string): Promise<unknown> {
    return this.fetch("DELETE", `/api/issues/${issueId}`);
  }

  async addComment(
    issueId: string,
    payload: { body: string },
  ): Promise<PaperclipComment> {
    return this.fetch("POST", `/api/issues/${issueId}/comments`, payload);
  }

  async listComments(issueId: string): Promise<PaperclipComment[]> {
    return this.fetch("GET", `/api/issues/${issueId}/comments`);
  }

  // ── Approvals ───────────────────────────────────────────────────

  async listApprovals(
    companyId: string,
    status?: string,
  ): Promise<PaperclipApproval[]> {
    const qs = status ? `?status=${status}` : "";
    return this.fetch("GET", `/api/companies/${companyId}/approvals${qs}`);
  }

  async approveApproval(
    approvalId: string,
    decisionNote?: string,
  ): Promise<PaperclipApproval> {
    return this.fetch("POST", `/api/approvals/${approvalId}/approve`, {
      decisionNote: decisionNote ?? null,
    });
  }

  async rejectApproval(
    approvalId: string,
    decisionNote?: string,
  ): Promise<PaperclipApproval> {
    return this.fetch("POST", `/api/approvals/${approvalId}/reject`, {
      decisionNote: decisionNote ?? null,
    });
  }

  // ── Dashboard ───────────────────────────────────────────────────

  async getDashboard(companyId: string): Promise<PaperclipDashboard> {
    return this.fetch("GET", `/api/companies/${companyId}/dashboard`);
  }
}
