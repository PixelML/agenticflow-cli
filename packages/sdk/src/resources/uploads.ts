/**
 * Upload-session resource helpers.
 */

import type { AgenticFlowSDK } from "../core.js";
import type { APIResponse } from "../types.js";

export class UploadsResource {
  constructor(private client: AgenticFlowSDK) { }

  async inputCreate(payload: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post("/v1/uploads/inputs/anonymous", { json: payload });
  }

  async inputStatus(sessionId: string): Promise<APIResponse> {
    return this.client.get(`/v1/uploads/sessions/${sessionId}/anonymous`);
  }
}
