import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MarketplaceResource,
  AgentTemplatesResource,
  WorkflowTemplatesResource,
  MasTemplatesResource,
} from "../src/resources/marketplace.js";
import type { AgenticFlowSDK } from "../src/core.js";

function makeMockSDK(): AgenticFlowSDK {
  return {
    baseUrl: "https://api.agenticflow.com",
    apiKey: "test-key",
    workspaceId: "ws-1",
    projectId: "proj-1",
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

describe("MarketplaceResource", () => {
  let sdk: AgenticFlowSDK;
  let resource: MarketplaceResource;

  beforeEach(() => {
    sdk = makeMockSDK();
    resource = new MarketplaceResource(sdk);
    vi.resetAllMocks();
  });

  it("list() calls /v1/marketplace/items", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: [] } });

    await resource.list();

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items", {
      queryParams: {},
    });
  });

  it("list() passes type filter", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: [] } });

    await resource.list({ type: "agent_template" });

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items", {
      queryParams: { type: "agent_template" },
    });
  });

  it("list() maps featured to is_featured", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: [] } });

    await resource.list({ featured: true });

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items", {
      queryParams: { is_featured: true },
    });
  });

  it("list() maps isFree to is_free", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: [] } });

    await resource.list({ isFree: true });

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items", {
      queryParams: { is_free: true },
    });
  });

  it("list() passes extra query params", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: [] } });

    await resource.list({ extra: { custom: "value", num: 42 } });

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items", {
      queryParams: { custom: "value", num: 42 },
    });
  });

  it("list() filters null extra params", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: [] } });

    await resource.list({ extra: { valid: "ok", invalid: undefined, alsoInvalid: null } });

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items", {
      queryParams: { valid: "ok" },
    });
  });

  it("get() calls /v1/marketplace/items/:id", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: "item-1" } });

    await resource.get("item-1");

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items/item-1");
  });

  it("get() encodes item id", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await resource.get("item/with/slashes");

    expect(sdk.get).toHaveBeenCalledWith("/v1/marketplace/items/item%2Fwith%2Fslashes");
  });
});

describe("AgentTemplatesResource", () => {
  let sdk: AgenticFlowSDK;
  let resource: AgentTemplatesResource;

  beforeEach(() => {
    sdk = makeMockSDK();
    resource = new AgentTemplatesResource(sdk);
    vi.resetAllMocks();
  });

  it("listPublic() calls /v1/agent-templates/public", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.listPublic();

    expect(sdk.get).toHaveBeenCalledWith("/v1/agent-templates/public", {
      queryParams: {},
    });
  });

  it("listPublic() passes limit and offset", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.listPublic({ limit: 10, offset: 5 });

    expect(sdk.get).toHaveBeenCalledWith("/v1/agent-templates/public", {
      queryParams: { limit: 10, offset: 5 },
    });
  });

  it("get() calls /v1/agent-templates/:id", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: "at-1" } });

    await resource.get("at-1");

    expect(sdk.get).toHaveBeenCalledWith("/v1/agent-templates/at-1");
  });
});

describe("WorkflowTemplatesResource", () => {
  let sdk: AgenticFlowSDK;
  let resource: WorkflowTemplatesResource;

  beforeEach(() => {
    sdk = makeMockSDK();
    resource = new WorkflowTemplatesResource(sdk);
    vi.resetAllMocks();
  });

  it("list() always includes sort_order=desc by default", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.list();

    expect(sdk.get).toHaveBeenCalledWith("/v1/workflow_templates", {
      queryParams: { sort_order: "desc" },
    });
  });

  it("list() respects custom sort order", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.list({ sortOrder: "asc" });

    expect(sdk.get).toHaveBeenCalledWith("/v1/workflow_templates", {
      queryParams: { sort_order: "asc" },
    });
  });

  it("list() passes limit and offset", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.list({ limit: 20, offset: 10 });

    expect(sdk.get).toHaveBeenCalledWith("/v1/workflow_templates", {
      queryParams: { sort_order: "desc", limit: 20, offset: 10 },
    });
  });

  it("get() calls /v1/workflow_templates/:id", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: "wt-1" } });

    await resource.get("wt-1");

    expect(sdk.get).toHaveBeenCalledWith("/v1/workflow_templates/wt-1");
  });

  it("listByCategory() calls correct path", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.listByCategory("automation");

    expect(sdk.get).toHaveBeenCalledWith("/v1/workflow_templates/category/automation", {
      queryParams: {},
    });
  });

  it("listByCategory() encodes category name", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.listByCategory("my-category/sub");

    expect(sdk.get).toHaveBeenCalledWith("/v1/workflow_templates/category/my-category%2Fsub", {
      queryParams: {},
    });
  });
});

describe("MasTemplatesResource", () => {
  let sdk: AgenticFlowSDK;
  let resource: MasTemplatesResource;

  beforeEach(() => {
    sdk = makeMockSDK();
    resource = new MasTemplatesResource(sdk);
    vi.resetAllMocks();
  });

  it("listVersions() includes workforce_id", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.listVersions("wf-1");

    expect(sdk.get).toHaveBeenCalledWith("/v1/mas-templates", {
      queryParams: { workforce_id: "wf-1" },
    });
  });

  it("listVersions() passes limit and offset", async () => {
    (sdk.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await resource.listVersions("wf-1", { limit: 10, offset: 5 });

    expect(sdk.get).toHaveBeenCalledWith("/v1/mas-templates", {
      queryParams: { workforce_id: "wf-1", limit: 10, offset: 5 },
    });
  });
});
