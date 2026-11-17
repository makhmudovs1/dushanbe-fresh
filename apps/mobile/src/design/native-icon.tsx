import type { ComponentType } from "react";
import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
} from "react-native-svg";
export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};
export type LucideIcon = ComponentType<IconProps>;
const elements = {
  circle: Circle,
  ellipse: Ellipse,
  line: Line,
  path: Path,
  polygon: Polygon,
  polyline: Polyline,
  rect: Rect,
};
export function makeIcon(
  nodes: [keyof typeof elements, Record<string, string | number>][],
): LucideIcon {
  return function Icon({
    size = 24,
    color = "#1b1b1b",
    strokeWidth = 2,
    fill = "none",
  }: IconProps) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {nodes.map(([tag, { key, ...attrs }], index) => {
          const Element = elements[tag];
          return <Element key={key ?? index} {...attrs} />;
        })}
      </Svg>
    );
  };
}
