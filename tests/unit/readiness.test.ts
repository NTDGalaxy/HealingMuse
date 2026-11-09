import { afterEach, describe, expect, it } from "vitest";
import {
  markOnce,
  primaryControl,
  primaryControlRef,
  readinessMarks,
} from "../../src/lib/perf/readiness";

afterEach(() => performance.clearMarks());

describe("readiness contract", () => {
  it("records each mark once", () => {
    markOnce(readinessMarks.shell);
    markOnce(readinessMarks.shell);
    expect(performance.getEntriesByName(readinessMarks.shell, "mark")).toHaveLength(1);
  });

  it("renders data-primary only when active and proves hydration on the element", () => {
    expect(primaryControl(false)).toEqual({});
    const props = primaryControl();
    expect(props).toMatchObject({ "data-primary": "" });
    const node = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    primaryControlRef(node);
    expect(node.dataset.hydrated).toBe("");
    expect(performance.getEntriesByName(readinessMarks.primary, "mark")).toHaveLength(1);
    primaryControlRef(null);
  });
});
