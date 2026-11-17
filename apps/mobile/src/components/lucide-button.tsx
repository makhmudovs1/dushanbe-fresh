import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "../design/native-icon";
import { colors } from "../design/tokens";
export function LucideButton({
  icon: Icon,
  label,
  onPress,
  color = colors.text,
  size = 23,
  filled = false,
  selected,
  disabled = false,
  style,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  filled?: boolean;
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled,
        ...(selected === undefined ? {} : { selected }),
      }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
        },
        style,
      ]}
    >
      <Icon
        size={size}
        strokeWidth={2}
        color={color}
        fill={filled ? color : "none"}
      />
    </Pressable>
  );
}
