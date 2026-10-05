import { describe, expect, it } from "vitest";
import { CATEGORY_ICON_COMPONENTS } from "@/components/finance/category-icon";
import { CATEGORY_ICONS, suggestCategoryIcon } from "@/lib/constants/categories";

describe("category icons", () => {
  it("every allowed icon has a component", () => {
    for (const key of CATEGORY_ICONS) expect(CATEGORY_ICON_COMPONENTS[key], key).toBeTruthy();
  });

  it("suggests an icon from the name", () => {
    expect(suggestCategoryIcon("Парковка")).toBe("square-parking");
    expect(suggestCategoryIcon("Аптека")).toBe("pill");
    expect(suggestCategoryIcon("Барбершоп")).toBe("scissors");
    expect(suggestCategoryIcon("Садака")).toBe("hand-heart");
    expect(suggestCategoryIcon("Что-то своё")).toBeNull();
  });
});
