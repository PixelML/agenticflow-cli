import type { AgenticFlowSDK } from "../core.js";

export class TriggersResource {
  constructor(private client: AgenticFlowSDK) {}

  async list(workflowId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflows/${workflowId}/triggers`)).data;
  }

  async get(workflowId: string, triggerId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflows/${workflowId}/triggers/${triggerId}`)).data;
  }

  async create(workflowId: string, payload: unknown): Promise<unknown> {
    return (await this.client.post(`/v1/workflows/${workflowId}/triggers`, { json: payload })).data;
  }

  async update(workflowId: string, triggerId: string, payload: unknown): Promise<unknown> {
    return (await this.client.put(`/v1/workflows/${workflowId}/triggers/${triggerId}`, { json: payload })).data;
  }

  async delete(workflowId: string, triggerId: string): Promise<unknown> {
    return (await this.client.delete(`/v1/workflows/${workflowId}/triggers/${triggerId}`)).data;
  }

  async invoke(path: string, body?: unknown, options?: { method?: string }): Promise<unknown> {
    const method = options?.method ?? "POST";
    return (await this.client.request(method, path, { json: body })).data;
  }
}
