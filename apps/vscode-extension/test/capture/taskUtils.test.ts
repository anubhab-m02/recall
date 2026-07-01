import { describe, expect, it } from "vitest";
import { buildTaskRunEmbeddingText } from "../../src/capture/taskUtils.js";

describe("buildTaskRunEmbeddingText", () => {
  it("includes the exit code and task name", () => {
    expect(buildTaskRunEmbeddingText("build", 0)).toBe("task_run | exit=0 | build");
  });

  it("falls back to 'unknown' when exit code is undefined", () => {
    expect(buildTaskRunEmbeddingText("watch", undefined)).toBe("task_run | exit=unknown | watch");
  });
});
