import { geometry } from "../design/tokens";
// Keep quantity controls usable on compact screens and with large system text.
export function catalogLayout(width: number, fontScale: number) {
  const gap = geometry.gridGap;
  const usable = Math.max(1, width - geometry.gutter * 2);
  const minimumCard = 132 * Math.max(1, fontScale);
  const columns = Math.max(
    1,
    Math.min(3, Math.floor((usable + gap) / (minimumCard + gap))),
  );
  return { columns, cardWidth: (usable - (columns - 1) * gap) / columns };
}
