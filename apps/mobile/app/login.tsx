import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStatus } from "../src/api/queries";
import { api } from "../src/api/config";
import { ApiError } from "../src/api/client";
import { loginChallengeKey } from "../src/domain/storage-scope";
import {
  formatNationalPhone,
  nationalPhone,
  validNameParts,
} from "../src/domain/customer";
import { useApp } from "../src/state/app-state";
import { secrets, sessionManager, useSession } from "../src/state/session";
import { useFavoriteMutation } from "../src/state/favorites";
import { ArrowLeft, X } from "../src/design/icons";
import { LucideButton } from "../src/components/lucide-button";
import {
  Button,
  ErrorState,
  Field,
  Loading,
  colors,
  errorLabel,
  styles,
} from "../src/components/ui";
type Challenge = {
  phone: string;
  challengeId: string;
  retryAt: number;
  expiresAt: number;
};
const CHALLENGE = loginChallengeKey(api.baseUrl);
export default function Login() {
  const { t } = useApp();
  const status = useAuthStatus();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const action = useLocalSearchParams<{ favoriteId?: string }>();
  const favorite = useFavoriteMutation();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [now, setNow] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const lock = useRef(false);
  const attempted = useRef("");
  const step =
    session.user && !session.user.name?.trim()
      ? "name"
      : challenge && !session.user
        ? "code"
        : "phone";
  useEffect(() => {
    let active = true;
    void secrets
      .getItem(CHALLENGE)
      .then((raw) => {
        if (!raw || !active) return;
        const value = JSON.parse(raw) as Challenge;
        if (
          value.expiresAt > Date.now() &&
          /^\+992\d{9}$/.test(value.phone) &&
          typeof value.challengeId === "string"
        ) {
          setPhone(nationalPhone(value.phone));
          setChallenge(value);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const fail = (error: unknown) =>
    setFailure(
      t(
        error instanceof ApiError && error.status === 401 && step === "code"
          ? "Код неверен или истёк. Запросите новый код."
          : errorLabel(error),
      ),
    );
  const finish = async () => {
    if (action.favoriteId)
      await favorite.mutateAsync({ id: action.favoriteId, active: true });
    await secrets.removeItem(CHALLENGE);
    router.back();
  };
  const send = async () => {
    if (
      lock.current ||
      phone.length !== 9 ||
      !status.data?.enabled ||
      (challenge && challenge.retryAt > Date.now())
    )
      return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      // A paid SMS only originates from this explicit press. Never retry automatically.
      const response = await api.request<{
        challengeId: string;
        retryAfter: number;
        expiresIn: number;
      }>("/mobile/auth/code", {
        method: "POST",
        body: { phone: `+992${phone}` },
      });
      if (
        typeof response.challengeId !== "string" ||
        !Number.isFinite(response.retryAfter) ||
        response.retryAfter < 0 ||
        !Number.isFinite(response.expiresIn) ||
        response.expiresIn <= 0
      )
        throw new ApiError("response");
      const next = {
        phone: `+992${phone}`,
        challengeId: response.challengeId,
        retryAt: Date.now() + response.retryAfter * 1000,
        expiresAt: Date.now() + response.expiresIn * 1000,
      };
      await secrets.setItem(CHALLENGE, JSON.stringify(next));
      setChallenge(next);
      setCode("");
      attempted.current = "";
    } catch (error) {
      fail(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const verify = async (value = code) => {
    if (
      lock.current ||
      !challenge ||
      value.length !== 6 ||
      challenge.expiresAt <= Date.now()
    )
      return;
    const key = `${challenge.challengeId}:${value}`;
    if (attempted.current === key) return;
    attempted.current = key;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      const user = await sessionManager.login(challenge.challengeId, value);
      setCode("");
      if (user.name?.trim()) await finish();
    } catch (error) {
      fail(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const saveName = async () => {
    if (lock.current || !validNameParts(firstName, lastName)) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      await sessionManager.updateProfile(
        { firstName: firstName.trim(), lastName: lastName.trim() },
        session.user?.id,
      );
      await finish();
    } catch (error) {
      fail(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const back = () => {
    if (busy) return;
    if (step === "code") {
      setChallenge(null);
      setCode("");
      setFailure("");
      attempted.current = "";
      void secrets.removeItem(CHALLENGE).catch(() => {});
    } else router.back();
  };
  if (!ready || status.isPending) return <Loading />;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <LucideButton
          icon={ArrowLeft}
          label={t(step === "code" ? "Изменить номер" : "Закрыть форму")}
          onPress={back}
          disabled={busy}
        />
        <Image
          source={require("../assets/wordmark.png")}
          contentFit="contain"
          accessibilityLabel="Dushanbe Fresh"
          style={{ width: 152, height: 54 }}
        />
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 24,
          gap: 20,
          paddingBottom: Math.max(24, insets.bottom),
        }}
      >
        {status.isError ? (
          <ErrorState
            error={status.error}
            retry={() => {
              void status.refetch();
            }}
          />
        ) : !status.data?.enabled ? (
          <>
            <Text style={styles.heading}>{t("Вход пока недоступен")}</Text>
            <Text style={styles.muted}>
              {t(
                status.data?.requiredForCheckout
                  ? "Вход по SMS пока недоступен. Пожалуйста, попробуйте позже."
                  : "Вход по SMS пока недоступен. Можно оформить заказ без входа.",
              )}
            </Text>
            <Button title={t("Продолжить покупки")} onPress={back} />
          </>
        ) : session.user?.name?.trim() ? (
          <Button
            title={t("Продолжить")}
            busy={busy}
            onPress={() => {
              void finish().catch(fail);
            }}
          />
        ) : (
          <>
            <View style={{ gap: 12, marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 30,
                  lineHeight: 36,
                  fontWeight: "700",
                  color: colors.text,
                }}
              >
                {t(
                  step === "name"
                    ? "Как к вам обращаться?"
                    : step === "code"
                      ? "Введите код"
                      : "Введите номер телефона",
                )}
              </Text>
              {step === "phone" ? (
                <Text style={styles.muted}>
                  {t("Чтобы войти или зарегистрироваться")}
                </Text>
              ) : step === "code" ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.muted}>
                    {t("Отправили SMS на номер")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={back}
                  >
                    <Text style={styles.text}>
                      +992 {formatNationalPhone(phone)}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {failure ? (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.red, fontSize: 14, lineHeight: 20 }}
              >
                {failure}
              </Text>
            ) : null}
            {step === "name" ? (
              <>
                <Field
                  dialog
                  label={t("Имя")}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoComplete="given-name"
                  textContentType="givenName"
                  maxLength={50}
                  editable={!busy}
                  autoFocus
                />
                <Field
                  dialog
                  label={t("Фамилия")}
                  value={lastName}
                  onChangeText={setLastName}
                  autoComplete="family-name"
                  textContentType="familyName"
                  maxLength={50}
                  editable={!busy}
                />
                <Button
                  title={t("Продолжить")}
                  busy={busy}
                  disabled={!validNameParts(firstName, lastName)}
                  onPress={() => {
                    void saveName();
                  }}
                />
              </>
            ) : step === "phone" ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    height: 60,
                    borderWidth: 1,
                    borderColor: "#e0e5e2",
                    borderRadius: 16,
                    paddingLeft: 14,
                    gap: 10,
                  }}
                >
              <Text accessibilityLabel={t("Таджикистан")} style={{ width: 28, fontSize: 23 }}>🇹🇯</Text>
              <Text style={{ fontSize: 18, color: colors.text }}>+992</Text>
                  <TextInput
                    accessibilityLabel={t("Телефон")}
                placeholder="00 000 00 00"
                    placeholderTextColor={colors.muted}
                    value={formatNationalPhone(phone)}
                    onChangeText={(v) => setPhone(nationalPhone(v))}
                    autoFocus
                    editable={!busy}
                    keyboardType="phone-pad"
                    autoComplete="tel-national"
                    textContentType="telephoneNumber"
                    maxLength={24}
                    style={{
                      flex: 1,
                      fontSize: 18,
                      height: 56,
                      color: colors.text,
                    }}
                  />
                  <LucideButton
                    icon={X}
                    label={t("Очистить номер")}
                    disabled={busy || !phone}
                    onPress={() => setPhone("")}
                  />
                </View>
                <Button
              title={t("Продолжить")}
                  busy={busy}
                  disabled={phone.length !== 9}
                  onPress={() => {
                    void send();
                  }}
                  style={{ minHeight: 56 }}
                />
              </>
            ) : (
              <>
                <View style={{ height: 68 }}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{ flexDirection: "row", gap: 7, flex: 1 }}
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <View
                        key={i}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor:
                            i === Math.min(code.length, 5)
                              ? colors.green
                              : "#e0e5e2",
                          borderRadius: 12,
                          backgroundColor: "#fafbfa",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 28,
                            fontWeight: "600",
                            color: code[i] ? colors.text : "#bdc5c0",
                          }}
                        >
                          {code[i] ?? "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <TextInput
                    accessibilityLabel={t("Код из SMS")}
                    value={code}
                    onChangeText={(v) => {
                      const next = v.replace(/\D/g, "").slice(0, 6);
                      setCode(next);
                      if (next.length === 6) void verify(next);
                    }}
                    autoFocus
                    editable={!busy}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    maxLength={6}
                    caretHidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      color: "transparent",
                      fontSize: 28,
                    }}
                  />
                </View>
                {busy ? <Loading /> : null}
                {challenge && challenge.expiresAt <= now ? (
                  <Text style={styles.muted}>
                    {t("Код неверен или истёк. Запросите новый код.")}
                  </Text>
                ) : null}
                <Button
                  secondary
                  title={
                    challenge && challenge.retryAt > now
                      ? `${t("Отправить повторно через")} ${Math.max(0, Math.ceil((challenge.retryAt - now) / 1000))} ${t("сек.")}`
                      : t("Отправить код повторно")
                  }
                  disabled={!!challenge && challenge.retryAt > now}
                  busy={busy}
                  onPress={() => {
                    void send();
                  }}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
