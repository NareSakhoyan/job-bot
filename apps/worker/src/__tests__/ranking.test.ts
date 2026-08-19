import { describe, expect, test } from "vitest";
import { rankByMatchScore } from "../ranking";

const app = (name: string, score: number | null) => ({
  name,
  job: { matches: score === null ? [] : [{ score }] },
});

describe("rankByMatchScore — preparation spends on the strongest matches", () => {
  test("orders by match score, strongest first", () => {
    // Arrange
    const applications = [app("middle", 72), app("best", 95), app("worst", 66)];

    // Act
    const ranked = rankByMatchScore(applications);

    // Assert
    expect(ranked.map((entry) => entry.name)).toEqual(["best", "middle", "worst"]);
  });

  test("leaves the input array untouched", () => {
    const applications = [app("a", 70), app("b", 90)];

    rankByMatchScore(applications);

    expect(applications.map((entry) => entry.name)).toEqual(["a", "b"]);
  });

  test("ranks an application with no recorded match last rather than dropping it", () => {
    const applications = [app("unscored", null), app("scored", 10)];

    const ranked = rankByMatchScore(applications);

    expect(ranked.map((entry) => entry.name)).toEqual(["scored", "unscored"]);
    expect(ranked).toHaveLength(2);
  });

  test("keeps the original order among equal scores", () => {
    const applications = [app("first", 80), app("second", 80), app("third", 80)];

    const ranked = rankByMatchScore(applications);

    expect(ranked.map((entry) => entry.name)).toEqual(["first", "second", "third"]);
  });
});
