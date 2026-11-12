import { describe, expect, it } from "vitest";
import { isLapsed } from "./enrollments";

describe("isLapsed", () => {
  it("is false while the student still has a place on the course", () => {
    expect(isLapsed({ enrollmentId: 12 })).toBe(false);
  });

  it("is true once the student's place has been taken away", () => {
    expect(isLapsed({ enrollmentId: null })).toBe(true);
  });
});
