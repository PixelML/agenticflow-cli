import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadSkillDefinition,
  findSkillsInPack,
  buildWorkflowFromSkill,
  resolveSkillByName,
  type SkillDefinition,
} from "../src/cli/skill.js";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeYaml(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, "utf-8");
}

describe("skill loader", () => {
  it("loads an atomic skill from skill.yaml", () => {
    const dir = makeTempDir("skill-load-");
    try {
      writeYaml(dir, "skill.yaml", `
apiVersion: pixelml.ai/skill/v1
kind: Skill
name: test-skill
version: 1.0.0
description: A test skill
node_type: llm
connection_category: pixelml
defaults:
  model: gpt-4o-mini
inputs:
  prompt:
    field: human_message
    required: true
    description: The prompt
  temperature:
    field: temperature
    required: false
    default: 0.7
outputs:
  result:
    field: generated_text
`);
      const skill = loadSkillDefinition(dir);
      expect(skill.kind).toBe("Skill");
      expect(skill.name).toBe("test-skill");
      expect(skill.version).toBe("1.0.0");
      expect(skill.node_type).toBe("llm");
      expect(skill.connection_category).toBe("pixelml");
      expect(skill.defaults).toEqual({ model: "gpt-4o-mini" });
      expect(skill.inputs?.prompt.field).toBe("human_message");
      expect(skill.inputs?.prompt.required).toBe(true);
      expect(skill.inputs?.temperature.required).toBe(false);
      expect(skill.inputs?.temperature.default).toBe(0.7);
      expect(skill.outputs?.result.field).toBe("generated_text");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads a composed skill from compose.yaml", () => {
    const dir = makeTempDir("skill-compose-");
    try {
      writeYaml(dir, "compose.yaml", `
apiVersion: pixelml.ai/skill/v1
kind: ComposedSkill
name: pipeline
version: 1.0.0
steps:
  - id: step1
    skill: ask-ai
    inputs:
      prompt: "{{topic}}"
  - id: step2
    skill: summarize
    inputs:
      text: "{{step1.generated_text}}"
  - id: step3
    local: true
    script: scripts/format.sh
    inputs:
      data: "{{step2.summary}}"
outputs:
  result: "{{step2.summary}}"
`);
      const skill = loadSkillDefinition(dir);
      expect(skill.kind).toBe("ComposedSkill");
      expect(skill.name).toBe("pipeline");
      expect(skill.steps).toHaveLength(3);
      expect(skill.steps![0].skill).toBe("ask-ai");
      expect(skill.steps![0].inputs?.prompt).toBe("{{topic}}");
      expect(skill.steps![1].inputs?.text).toBe("{{step1.generated_text}}");
      expect(skill.steps![2].local).toBe(true);
      expect(skill.steps![2].script).toBe("scripts/format.sh");
      expect(skill.composed_outputs?.result).toBe("{{step2.summary}}");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws on missing skill file", () => {
    const dir = makeTempDir("skill-missing-");
    try {
      expect(() => loadSkillDefinition(dir)).toThrow("No skill.yaml or compose.yaml found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws on invalid kind", () => {
    const dir = makeTempDir("skill-invalid-kind-");
    try {
      writeYaml(dir, "skill.yaml", `
kind: InvalidKind
name: bad
`);
      expect(() => loadSkillDefinition(dir)).toThrow("Invalid skill kind");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws on missing name", () => {
    const dir = makeTempDir("skill-no-name-");
    try {
      writeYaml(dir, "skill.yaml", `
kind: Skill
`);
      expect(() => loadSkillDefinition(dir)).toThrow("Skill name is required");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findSkillsInPack", () => {
  it("finds all skills in a pack's skills/ directory", () => {
    const packDir = makeTempDir("pack-skills-");
    try {
      const skillsDir = join(packDir, "skills");
      mkdirSync(join(skillsDir, "skill-a"), { recursive: true });
      mkdirSync(join(skillsDir, "skill-b"), { recursive: true });
      mkdirSync(join(skillsDir, "not-a-skill"), { recursive: true });

      writeYaml(join(skillsDir, "skill-a"), "skill.yaml", `
kind: Skill
name: skill-a
node_type: llm
`);
      writeYaml(join(skillsDir, "skill-b"), "skill.yaml", `
kind: Skill
name: skill-b
node_type: llm
`);
      // not-a-skill has no skill.yaml — should be skipped

      const skills = findSkillsInPack(packDir);
      expect(skills).toHaveLength(2);
      expect(skills.map((s) => s.name).sort()).toEqual(["skill-a", "skill-b"]);
    } finally {
      rmSync(packDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when skills/ directory is missing", () => {
    const packDir = makeTempDir("pack-no-skills-");
    try {
      expect(findSkillsInPack(packDir)).toEqual([]);
    } finally {
      rmSync(packDir, { recursive: true, force: true });
    }
  });
});

describe("buildWorkflowFromSkill", () => {
  const baseSkill: SkillDefinition = {
    apiVersion: "pixelml.ai/skill/v1",
    kind: "Skill",
    name: "test-skill",
    version: "1.0.0",
    node_type: "llm",
    defaults: { model: "gpt-4o-mini", system_message: "You are helpful." },
    inputs: {
      prompt: { field: "human_message", required: true, description: "The prompt" },
      temperature: { field: "temperature", required: false, default: 0.7 },
    },
    outputs: {
      result: { field: "generated_text" },
    },
  };

  it("builds a valid workflow payload", () => {
    const workflow = buildWorkflowFromSkill(baseSkill);
    expect(workflow["name"]).toBe("skill-test-skill-run");
    expect(workflow["description"]).toBe("Auto-generated workflow for skill 'test-skill'.");
    const nodes = workflow["nodes"] as Record<string, unknown>[];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]["name"]).toBe("main");
    expect(nodes[0]["node_type_name"]).toBe("llm");
  });

  it("templates required inputs and bakes optional defaults", () => {
    const workflow = buildWorkflowFromSkill(baseSkill);
    const nodes = workflow["nodes"] as Record<string, unknown>[];
    const inputConfig = nodes[0]["input_config"] as Record<string, unknown>;

    // Required input → template variable
    expect(inputConfig["human_message"]).toBe("{{prompt}}");
    // Optional input with default → baked default value
    expect(inputConfig["temperature"]).toBe(0.7);
    // Defaults merged
    expect(inputConfig["model"]).toBe("gpt-4o-mini");
    expect(inputConfig["system_message"]).toBe("You are helpful.");
  });

  it("builds correct input_schema", () => {
    const workflow = buildWorkflowFromSkill(baseSkill);
    const schema = workflow["input_schema"] as Record<string, unknown>;
    expect(schema["type"]).toBe("object");
    const required = schema["required"] as string[];
    expect(required).toContain("prompt");
    expect(required).not.toContain("temperature");
    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    expect(props["prompt"]["description"]).toBe("The prompt");
    expect(props["temperature"]["default"]).toBe(0.7);
  });

  it("builds correct output_mapping", () => {
    const workflow = buildWorkflowFromSkill(baseSkill);
    const outputMapping = workflow["output_mapping"] as Record<string, string>;
    expect(outputMapping["result"]).toBe("${main.generated_text}");
  });

  it("attaches connectionId when provided", () => {
    const workflow = buildWorkflowFromSkill(baseSkill, undefined, "conn-123");
    const nodes = workflow["nodes"] as Record<string, unknown>[];
    expect(nodes[0]["connection"]).toBe("conn-123");
  });

  it("does not attach connection when not provided", () => {
    const workflow = buildWorkflowFromSkill(baseSkill);
    const nodes = workflow["nodes"] as Record<string, unknown>[];
    expect(nodes[0]["connection"]).toBeUndefined();
  });

  it("attaches projectId when provided", () => {
    const workflow = buildWorkflowFromSkill(baseSkill, "proj-456");
    expect(workflow["project_id"]).toBe("proj-456");
  });

  it("throws for composed skills", () => {
    const composed: SkillDefinition = {
      apiVersion: "pixelml.ai/skill/v1",
      kind: "ComposedSkill",
      name: "composed",
      version: "1.0.0",
      steps: [],
    };
    expect(() => buildWorkflowFromSkill(composed)).toThrow("only supports atomic skills");
  });

  it("throws for skills without node_type", () => {
    const noNodeType: SkillDefinition = {
      apiVersion: "pixelml.ai/skill/v1",
      kind: "Skill",
      name: "bad",
      version: "1.0.0",
    };
    expect(() => buildWorkflowFromSkill(noNodeType)).toThrow("missing node_type");
  });
});

describe("resolveSkillByName", () => {
  it("finds a skill by exact directory match", () => {
    const packDir = makeTempDir("resolve-skill-");
    try {
      const skillDir = join(packDir, "skills", "my-skill");
      mkdirSync(skillDir, { recursive: true });
      writeYaml(skillDir, "skill.yaml", `
kind: Skill
name: my-skill
node_type: llm
`);
      const resolved = resolveSkillByName("my-skill", [packDir]);
      expect(resolved).not.toBeNull();
      expect(resolved!.skill.name).toBe("my-skill");
    } finally {
      rmSync(packDir, { recursive: true, force: true });
    }
  });

  it("finds a skill by scanning all directories", () => {
    const packDir = makeTempDir("resolve-scan-");
    try {
      const skillDir = join(packDir, "skills", "dir-name-differs");
      mkdirSync(skillDir, { recursive: true });
      writeYaml(skillDir, "skill.yaml", `
kind: Skill
name: actual-name
node_type: llm
`);
      const resolved = resolveSkillByName("actual-name", [packDir]);
      expect(resolved).not.toBeNull();
      expect(resolved!.skill.name).toBe("actual-name");
    } finally {
      rmSync(packDir, { recursive: true, force: true });
    }
  });

  it("returns null when skill not found", () => {
    const packDir = makeTempDir("resolve-missing-");
    try {
      mkdirSync(join(packDir, "skills"), { recursive: true });
      const resolved = resolveSkillByName("nonexistent", [packDir]);
      expect(resolved).toBeNull();
    } finally {
      rmSync(packDir, { recursive: true, force: true });
    }
  });

  it("searches across multiple pack roots", () => {
    const pack1 = makeTempDir("resolve-multi-1-");
    const pack2 = makeTempDir("resolve-multi-2-");
    try {
      mkdirSync(join(pack1, "skills", "s1"), { recursive: true });
      mkdirSync(join(pack2, "skills", "s2"), { recursive: true });
      writeYaml(join(pack1, "skills", "s1"), "skill.yaml", `
kind: Skill
name: s1
node_type: llm
`);
      writeYaml(join(pack2, "skills", "s2"), "skill.yaml", `
kind: Skill
name: s2
node_type: llm
`);

      const r1 = resolveSkillByName("s1", [pack1, pack2]);
      const r2 = resolveSkillByName("s2", [pack1, pack2]);
      expect(r1).not.toBeNull();
      expect(r1!.skill.name).toBe("s1");
      expect(r2).not.toBeNull();
      expect(r2!.skill.name).toBe("s2");
    } finally {
      rmSync(pack1, { recursive: true, force: true });
      rmSync(pack2, { recursive: true, force: true });
    }
  });
});
