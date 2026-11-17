import { Pressable, Text, View } from "react-native";
import { Check } from "../design/icons";
import { colors } from "../design/tokens";
export function ChoiceRow({
  label,
  description,
  selected,
  onPress,
  disabled = false,
  checkbox = false,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  checkbox?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={checkbox ? "checkbox" : "radio"}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 10,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          marginTop: 2,
          width: 20,
          height: 20,
          borderRadius: checkbox ? 4 : 10,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.green : colors.muted,
          backgroundColor: checkbox && selected ? colors.green : colors.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? (
          checkbox ? (
            <Check size={14} color="white" />
          ) : (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.green,
              }}
            />
          )
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 16, lineHeight: 24, color: colors.text }}>
          {label}
        </Text>
        {description ? (
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
