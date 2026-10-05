import { describe, expect, it } from "vitest";
import { orderTree, rollUpToParents } from "@/lib/categories/tree";

const cats = [
  { id: "car", parentId: null },
  { id: "food", parentId: null },
  { id: "parking", parentId: "car" },
  { id: "wash", parentId: "car" },
];

describe("category tree", () => {
  it("orders children right after their parent", () => {
    expect(orderTree(cats).map((c) => c.id)).toEqual(["car", "parking", "wash", "food"]);
    // A child whose parent is archived (missing) shows as a root.
    expect(orderTree(cats.filter((c) => c.id !== "car")).map((c) => c.id)).toEqual(["food", "parking", "wash"]);
  });

  it("rolls amounts up to the parent", () => {
    const totals = rollUpToParents(
      [
        { categoryId: "car", amount: "100.00" },
        { categoryId: "parking", amount: "5000.00" },
        { categoryId: "wash", amount: "30000.50" },
        { categoryId: "food", amount: "1.00" },
        { categoryId: null, amount: "7.00" },
      ],
      cats,
    );
    expect(totals.get("car")?.toFixed(2)).toBe("35100.50");
    expect(totals.get("food")?.toFixed(2)).toBe("1.00");
    expect(totals.get(null)?.toFixed(2)).toBe("7.00");
    expect(totals.has("parking")).toBe(false);
  });
});
