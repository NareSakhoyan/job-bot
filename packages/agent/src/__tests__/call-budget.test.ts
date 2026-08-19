import { describe, expect, test } from "vitest";
import { createCallBudget } from "../llm/call-budget";

describe("createCallBudget — a hard ceiling on model calls", () => {
  test("allows exactly as many calls as the limit, then refuses forever", () => {
    // Arrange
    const budget = createCallBudget(2);

    // Act
    const outcomes = [budget.tryConsume(), budget.tryConsume(), budget.tryConsume(), budget.tryConsume()];

    // Assert
    expect(outcomes).toEqual([true, true, false, false]);
    expect(budget.spent).toBe(2);
    expect(budget.remaining).toBe(0);
  });

  test("reports remaining before anything is spent", () => {
    const budget = createCallBudget(5);

    expect(budget.limit).toBe(5);
    expect(budget.spent).toBe(0);
    expect(budget.remaining).toBe(5);
    expect(budget.exhausted).toBe(false);
  });

  test("a limit of zero refuses the first call", () => {
    const budget = createCallBudget(0);

    expect(budget.tryConsume()).toBe(false);
    expect(budget.exhausted).toBe(true);
  });

  test("rejects a limit that is not a non-negative integer", () => {
    expect(() => createCallBudget(-1)).toThrow(/non-negative/i);
    expect(() => createCallBudget(1.5)).toThrow(/integer/i);
    expect(() => createCallBudget(Number.NaN)).toThrow();
    expect(() => createCallBudget(Number.POSITIVE_INFINITY)).toThrow();
  });
});
