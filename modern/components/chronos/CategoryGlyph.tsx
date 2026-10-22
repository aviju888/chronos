import { Atom, Bank, Church, Circle, Coins, Fire, Palette, Sword } from "@phosphor-icons/react";
import type { Category } from "@/modern/lib/chronos/types";

/* Stand-in for events without a Wikipedia image. */
export function CategoryGlyph({ category, size = 18 }: { category: Category; size?: number }) {
  const props = { size, weight: "duotone" as const };
  switch (category) {
    case "War":
      return <Sword {...props} />;
    case "Politics":
      return <Bank {...props} />;
    case "Religion":
      return <Church {...props} />;
    case "Economy":
      return <Coins {...props} />;
    case "Science":
      return <Atom {...props} />;
    case "Culture":
      return <Palette {...props} />;
    case "Disaster":
      return <Fire {...props} />;
    default:
      return <Circle {...props} />;
  }
}
