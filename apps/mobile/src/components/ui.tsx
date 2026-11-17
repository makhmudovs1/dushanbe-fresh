import { ApiError } from "../api/client";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useApp } from "../state/app-state";
import { colors, type } from "../design/tokens";
export { colors } from "../design/tokens";
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  title: {
    ...type.title,
    color: colors.text,
    letterSpacing: 0,
  },
  heading: {
    ...type.section,
    color: colors.text,
    letterSpacing: 0,
  },
  text: { fontSize: 16, color: colors.text, lineHeight: 23 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 21 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 12,
  },
  panel: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.soft,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    minHeight: 46,
  },
});
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  busy = false,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor:
            disabled || busy
              ? "#e9e9e9"
              : secondary
                ? "#f1f1f1"
                : colors.action,
          borderRadius: 16,
          paddingVertical: 12,
          paddingHorizontal: 18,
          minHeight: 52,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.text : colors.white} />
      ) : (
        <Text
          style={{
            fontWeight: "600",
            fontSize: 16,
            color:
              disabled || busy
                ? "#777777"
                : secondary
                  ? colors.text
                  : colors.white,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Loading() {
  return (
    <View accessibilityRole="progressbar" style={{ padding: 40 }}>
      <ActivityIndicator size="large" color={colors.green} />
    </View>
  );
}
export function Notice({
  title,
  message,
  action,
  onPress,
}: {
  title: string;
  message?: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={{ padding: 24, gap: 14 }}>
      <Text style={styles.heading}>{title}</Text>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
      {action && onPress ? (
        <Button title={action} onPress={onPress} secondary />
      ) : null}
    </View>
  );
}
export function errorLabel(error: unknown) {
  if (!(error instanceof ApiError))
    return "Не удалось получить данные. Повторите попытку.";
  if (error.status === 401) return "Сессия истекла. Войдите снова.";
  if (error.status === 403) return "Недостаточно прав для этого действия.";
  if (error.status === 429) return "Слишком много попыток. Попробуйте позже.";
  if (error.status >= 500)
    return "Магазин временно недоступен. Попробуйте позже.";
  if (error.code === "timeout")
    return "Сервер отвечает слишком долго. Повторите попытку.";
  return "Не удалось связаться с магазином. Проверьте соединение и попробуйте снова.";
}
export function ErrorState({
  retry,
  error,
}: {
  retry: () => void;
  error?: unknown;
}) {
  const { t } = useApp();
  return (
    <Notice
      title={t(
        error instanceof ApiError && error.code === "network"
          ? "Нет соединения"
          : "Не удалось загрузить данные",
      )}
      message={t(errorLabel(error))}
      action={t("Повторить")}
      onPress={retry}
    />
  );
}
export function Field({
  label,
  dialog = false,
  ...props
}: TextInputProps & { label: string; dialog?: boolean }) {
  return (
    <View style={{ gap: 7 }}>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          color: colors.text,
          fontWeight: dialog ? "400" : "600",
        }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          dialog
            ? { minHeight: 52, borderRadius: 14, backgroundColor: "#f6f6f6" }
            : undefined,
        ]}
        {...props}
      />
    </View>
  );
}
