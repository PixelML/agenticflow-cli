/**
 * Upload-session resource helpers.
 */

import type { AgenticFlowSDK } from "../core.js";

export class UploadsResource {
  constructor(private client: AgenticFlowSDK) { }

  async inputCreate(payload: Record<string, unknown>): Promise<unknown> {
    return (await this.client.post("/v1/uploads/inputs/anonymous", { json: payload })).data;
  }

  async inputStatus(sessionId: string): Promise<unknown> {
    return (await this.client.get(`/v1/uploads/sessions/${sessionId}/anonymous`)).data;
  }
}
