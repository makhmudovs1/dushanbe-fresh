import { resolveAddressSelection } from "../src/domain/address";
import type { DeliveryAddress } from "../src/state/app-state";
import { ScreenFrame } from "../src/components/screen-frame";
import { ChoiceRow } from "../src/components/choice-row";
import { PricingSummary } from "../src/components/pricing-summary";
import { currency, decimalLabel } from "../src/design/format";
import { sessionManager, useSession } from "../src/state/session";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import type {
  CheckoutInput,
  CheckoutQuote,
  CreateOrderInput,
  OrderReceipt,
  SubstitutionPolicy,
} from "@dushanbe-fresh/shared";
import { slotUnavailableLabels } from "@dushanbe-fresh/shared";
import {
  api,
  orderSubmissionEnabled,
  assertTestOrderTarget,
} from "../src/api/config";
import { ApiError } from "../src/api/client";
import { useAuthStatus, useSlots } from "../src/api/queries";
import { useApp, useCart } from "../src/state/app-state";
import { createOrderJournal, saveTracking } from "../src/state/private-storage";
import {
  isQuote,
  normalizePhone,
  OrderSubmission,
  quoteKey,
  type PendingOrder,
} from "../src/domain/checkout";
import { checkoutItems } from "../src/domain/cart";

import { localizedName, serverMessage, slotLabel } from "../src/i18n";
import {
  Button,
  ErrorState,
  Field,
  Loading,
  Notice,
  styles,
} from "../src/components/ui";
// Coordinator instances are scoped by verified owner, and survive route remounts.
const coordinators = new Map<string, OrderSubmission>();
function coordinator(owner: string | null) {
  const key = owner ?? "guest";
  let value = coordinators.get(key);
  if (!value) {
    value = new OrderSubmission(
      createOrderJournal(owner),
      async (input) => {
        await assertTestOrderTarget();
        if ((sessionManager.getSnapshot().user?.id ?? null) !== owner)
          throw new Error("ORDER_OWNER_CHANGED");
        return owner
          ? sessionManager.request<OrderReceipt>("/mobile/checkout/orders", {
              method: "POST",
              body: input,
            })
          : api.request<OrderReceipt>("/checkout/orders", {
              method: "POST",
              body: input,
            });
      },
      { apiBaseUrl: api.baseUrl, ownerId: owner },
    );
    coordinators.set(key, value);
  }
  return value;
}
function CheckoutState() {
  const session = useSession();
  const { t } = useApp();
  if (session.phase === "restoring" || session.phase === "locked")
    return (
      <View style={styles.content}>
        <Text style={styles.text}>{t("Восстанавливаем сессию")}</Text>
        <Button
          title={t("Повторить")}
          onPress={() => {
            void sessionManager.restore();
          }}
        />
      </View>
    );
  return <Checkout key={session.user?.id ?? "guest"} />;
}
function Checkout() {
  const { t, locale, address: selectedAddress, addressRevision } = useApp();
  const [guestAddress, setGuestAddress] = useState<DeliveryAddress>(
    selectedAddress ?? {
      label: "home",
      housingType: "apartment",
      street: "",
      building: "",
      apartment: "",
      entrance: "",
      floor: "",
      intercom: "",
      instructions: "",
    },
  );
  const selectedRevision = useRef(addressRevision);
  useEffect(() => {
    const explicit = addressRevision !== selectedRevision.current;
    selectedRevision.current = addressRevision;
    setGuestAddress((current) =>
      resolveAddressSelection(current, selectedAddress, explicit),
    );
  }, [selectedAddress, addressRevision]);
  const session = useSession();
  const address = session.user ? selectedAddress : guestAddress;
  const owner = session.user?.id ?? null;
  const orderJournal = useMemo(() => createOrderJournal(owner), [owner]);
  const submission = useMemo(() => coordinator(owner), [owner]);
  const cart = useCart();
  const slots = useSlots();
  const auth = useAuthStatus();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slotId, setSlotId] = useState("");
  const [policy, setPolicy] = useState<SubstitutionPolicy>("contact_me");
  const [accepted, setAccepted] = useState(false);
  const [review, setReview] = useState<{
    key: string;
    quote: CheckoutQuote;
  } | null>(null);
  const [pending, setPending] = useState<PendingOrder | null>(null);
  const [journalReady, setJournalReady] = useState(false);
  const [failure, setFailure] = useState("");
  const prompted = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void orderJournal
      .read()
      .then((value) => {
        if (mounted.current) {
          setPending(value);
          setJournalReady(true);
        }
      })
      .catch(() => {
        if (mounted.current) setFailure("Не удалось сохранить данные заказа");
      });
    return () => {
      mounted.current = false;
    };
  }, [orderJournal]);
  const itemsKey = JSON.stringify(checkoutItems(cart.items));
  const input: CheckoutInput = useMemo(
    () => ({
      items: JSON.parse(itemsKey) as CheckoutInput["items"],
      deliverySlotId: slotId,
      ...(address ? { address } : {}),
    }),
    [itemsKey, slotId, address],
  );
  const key = quoteKey(input);
  const previewSlot =
    slotId ||
    (slots.data?.find((slot) => slot.available) ?? slots.data?.[0])?.id ||
    "";
  const pricingInput = useMemo(
    () => ({ ...input, deliverySlotId: previewSlot }),
    [input, previewSlot],
  );
  const pricingKey = quoteKey(pricingInput);
  useEffect(() => {
    if (session.user) {
      setName((old) => old || session.user!.name || "");
      setPhone(session.user.phone);
    }
  }, [session.user]);
  // Contact/policy edits also require the user to explicitly confirm the final review again.
  useEffect(() => setAccepted(false), [key, pricingKey, name, phone, policy]);
  const latestKey = useRef(pricingKey);
  latestKey.current = pricingKey;
  const validator = useMutation({
    mutationFn: async (value: CheckoutInput) => {
      const result = await api.request<unknown>("/checkout/validate", {
        method: "POST",
        body: value,
      });
      if (!isQuote(result)) throw new ApiError("response");
      return { key: quoteKey(value), quote: result };
    },
    onSuccess: (value) => {
      if (value.key === latestKey.current) {
        setReview(value);
        setAccepted(false);
      }
    },
    onError: () => setFailure("Оформление временно недоступно"),
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!orderSubmissionEnabled) throw new Error("SUBMISSION_DISABLED");
      if (
        !auth.isSuccess ||
        (auth.data.requiredForCheckout && session.phase !== "account")
      )
        throw new Error("LOGIN_REQUIRED");
      if (
        !cart.hydrated ||
        cart.syncError ||
        session.phase === "locked" ||
        session.phase === "restoring"
      )
        throw new Error("CART_NOT_READY");
      if (!(await cart.persist())) throw new Error("CART_NOT_SAVED");
      let payload: CreateOrderInput | undefined;
      if (!pending) {
        if (
          !accepted ||
          review?.key !== key ||
          !review.quote.valid ||
          !address ||
          !normalizePhone(phone) ||
          !name.trim()
        )
          throw new Error("INVALID_CHECKOUT");
        payload = {
          ...input,
          name: name.trim(),
          phone: normalizePhone(phone)!,
          address,
          substitutionPolicy: policy,
          reviewToken: review.quote.reviewToken,
          requestId: randomUUID(),
        };
      }
      const receipt = await submission.submit(payload);
      if (
        !receipt ||
        typeof receipt.orderNumber !== "string" ||
        !/^[a-f0-9]{64}$/.test(receipt.publicTrackingToken)
      )
        throw new ApiError("response");
      await saveTracking(receipt.publicTrackingToken, owner);
      const sent = (await orderJournal.read())?.input;
      // Clear only unchanged submitted lines; preserve products added after an interrupted submission.
      for (const item of cart.items)
        if (
          sent?.items.some(
            (i) =>
              i.productId === item.product.id && i.quantity === item.quantity,
          )
        )
          cart.dispatch({ type: "remove", id: item.product.id });
      if (!(await cart.persist())) throw new Error("CART_NOT_SAVED");
      await submission.acknowledge();
      return receipt;
    },
    onSuccess: () => {
      router.replace({ pathname: "/tracking", params: { placed: "1" } });
    },
    onError: async (error) => {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.data &&
        typeof error.data === "object" &&
        "quote" in error.data &&
        isQuote(error.data.quote)
      ) {
        await orderJournal.remove();
        setPending(null);
        setReview(null);
        setAccepted(false);
        setFailure("Заказ изменился. Проверьте сумму заново.");
        return;
      }
      const saved = await orderJournal.read().catch(() => null);
      setPending(saved);
      setFailure(
        saved
          ? "Результат отправки неизвестен. Повторите с тем же номером отправки."
          : "Оформление временно недоступно",
      );
    },
  });
  const quote = review?.key === pricingKey ? review.quote : null;
  const editable = !pending && !submit.isPending;
  const validate = () => {
    setFailure("");
    validator.mutate(pricingInput);
  };
  const runReview = validator.mutate;
  const hasLegacy = cart.items.some(
    (i) =>
      !!(
        i.serverSnapshot?.qualityOptionId ||
        i.serverSnapshot?.qualityOptionLabel ||
        i.serverSnapshot?.qualityOptionLabelTj
      ),
  );
  const mayReview =
    journalReady &&
    cart.hydrated &&
    !!cart.items.length &&
    !cart.syncError &&
    !cart.syncing &&
    !hasLegacy &&
    !pending &&
    editable &&
    !!previewSlot &&
    auth.isSuccess;
  useEffect(() => {
    if (
      auth.data?.requiredForCheckout &&
      session.phase === "guest" &&
      cart.hydrated &&
      cart.items.length &&
      !prompted.current
    ) {
      prompted.current = true;
      router.push("/login");
    }
  }, [
    auth.data?.requiredForCheckout,
    session.phase,
    cart.hydrated,
    cart.items.length,
  ]);
  useEffect(() => {
    if (!mayReview) return;
    const timer = setTimeout(() => runReview(pricingInput), 350);
    return () => clearTimeout(timer);
  }, [pricingInput, mayReview, runReview]);
  if (cart.hydrated && !cart.items.length && !pending && !submit.isPending)
    return (
      <Notice
        title={t("Корзина пока пустая")}
        message={t("Добавьте свежие продукты из каталога.")}
        action={t("Перейти в каталог")}
        onPress={() => router.replace("/catalog")}
      />
    );
  return (
    <View style={styles.page}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        style={styles.page}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#17643b" }}>
            {t("Вернуться в корзину")}
          </Text>
        </Pressable>
        <Text
          style={{
            fontSize: 32,
            lineHeight: 38,
            fontWeight: "700",
            color: "#1b1b1b",
          }}
        >
          {t("Оформление заказа")}
        </Text>
        <Text style={styles.muted}>
          {t("Свежие продукты с доставкой по Душанбе")}
        </Text>
        {!orderSubmissionEnabled ? (
          <Text style={styles.muted}>
            {t("Отправка заказов в этой сборке отключена")}
          </Text>
        ) : null}
        {failure ? <Text style={styles.text}>{t(failure)}</Text> : null}
        {!journalReady || !cart.hydrated ? (
          <Loading />
        ) : pending ? (
          <View style={styles.panel}>
            <Text style={styles.text}>
              {t(
                "Результат отправки неизвестен. Повторите с тем же номером отправки.",
              )}
            </Text>
            <Button
              title={t("Продолжить отправку")}
              disabled={!orderSubmissionEnabled}
              busy={submit.isPending}
              onPress={() => submit.mutate()}
            />
          </View>
        ) : null}
        <Text style={styles.heading}>{t("Контактные данные")}</Text>
        <Field
          label={t("Имя")}
          value={name}
          onChangeText={setName}
          maxLength={100}
          editable={editable}
          autoComplete="name"
        />
        <Field
          label={t(session.user ? "Подтверждённый телефон" : "Телефон")}
          value={phone}
          onChangeText={setPhone}
          maxLength={32}
          editable={editable && !session.user}
          keyboardType="phone-pad"
          placeholder="+992 900 00 00 00"
          autoComplete="tel"
        />
        <View style={styles.section}>
          <Text style={styles.heading}>{t("Адрес доставки")}</Text>
          {session.user ? (
            <Text style={styles.text}>
              {address
                ? `${address.street}, ${address.building}`
                : t("Укажите адрес доставки")}
            </Text>
          ) : null}
          <Button
            title={t(
              session.user ? "Изменить адрес" : "Выбрать адрес доставки",
            )}
            secondary
            disabled={!editable}
            onPress={() => router.push("/address")}
          />
          {!session.user ? (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(
                  [
                    ["apartment", "Квартира"],
                    ["house", "Частный дом"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: guestAddress.housingType === value,
                    }}
                    disabled={!editable}
                    onPress={() =>
                      setGuestAddress((current) => ({
                        ...current,
                        housingType: value,
                        ...(value === "house"
                          ? { apartment: "", entrance: "", floor: "" }
                          : {}),
                      }))
                    }
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderWidth: 1,
                      borderColor:
                        guestAddress.housingType === value
                          ? "#17643b"
                          : "#ededed",
                      borderRadius: 8,
                      backgroundColor:
                        guestAddress.housingType === value
                          ? "#edf4ef"
                          : "white",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        color:
                          guestAddress.housingType === value
                            ? "#17643b"
                            : "#1b1b1b",
                      }}
                    >
                      {t(label)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {(
                [
                  ["street", "Улица", 150],
                  ["building", "Дом", 30],
                  ...(guestAddress.housingType !== "house"
                    ? [
                        ["apartment", "Квартира", 30],
                        ["entrance", "Подъезд", 30],
                        ["floor", "Этаж", 30],
                      ]
                    : []),
                  ["intercom", "Домофон", 30],
                  ["instructions", "Комментарий / ориентир", 500],
                ] as [keyof DeliveryAddress, string, number][]
              ).map(([key, label, max]) => (
                <Field
                  key={key}
                  label={t(label)}
                  value={String(guestAddress[key] ?? "")}
                  editable={editable}
                  onChangeText={(value) =>
                    setGuestAddress((current) => ({ ...current, [key]: value }))
                  }
                  maxLength={max}
                  multiline={key === "instructions"}
                />
              ))}
              {guestAddress.latitude != null ? (
                <>
                  <Text style={styles.muted}>
                    {guestAddress.latitude.toFixed(5)},{" "}
                    {guestAddress.longitude?.toFixed(5)}
                  </Text>
                  <Button
                    secondary
                    title={t("Удалить точку")}
                    disabled={!editable}
                    onPress={() =>
                      setGuestAddress((current) => ({
                        ...current,
                        latitude: null,
                        longitude: null,
                      }))
                    }
                  />
                </>
              ) : null}
            </>
          ) : null}
        </View>
        <Text style={styles.heading}>{t("Окно доставки")}</Text>
        {slots.isPending ? (
          <Loading />
        ) : slots.isError ? (
          <ErrorState
            error={slots.error}
            retry={() => {
              void slots.refetch();
            }}
          />
        ) : (
          <View style={{ gap: 8 }}>
            {slots.data.map((slot) => (
              <ChoiceRow
                key={slot.id}
                label={slotLabel(locale, slot)}
                selected={slotId === slot.id}
                description={slot.unavailableReasons
                  ?.map((reason) => t(slotUnavailableLabels[reason]))
                  .join(" · ")}
                disabled={!editable || !slot.available}
                onPress={() => setSlotId(slot.id)}
              />
            ))}
            {!slots.data.some((s) => s.available) ? (
              <Text style={styles.muted}>{t("Нет доступных окон")}</Text>
            ) : null}
          </View>
        )}
        <Button
          secondary
          title={t("Обновить время доставки")}
          disabled={slots.isRefetching || !editable}
          onPress={() => {
            void slots.refetch();
          }}
        />
        <Text style={styles.heading}>{t("Если товара нет")}</Text>
        {(
          [
            ["replace_similar", "Заменить похожим товаром"],
            ["contact_me", "Связаться со мной"],
            ["remove_item", "Убрать товар из заказа"],
          ] as const
        ).map(([value, label]) => (
          <ChoiceRow
            key={value}
            label={t(label)}
            selected={policy === value}
            disabled={!editable}
            onPress={() => setPolicy(value)}
          />
        ))}
        {auth.isError ? (
          <ErrorState
            error={auth.error}
            retry={() => {
              void auth.refetch();
            }}
          />
        ) : null}
        {auth.data?.requiredForCheckout && !session.user ? (
          <Button
            title={t("Войдите, чтобы оформить заказ")}
            onPress={() => router.push("/login")}
          />
        ) : null}
        <Button
          title={t("Проверить заказ")}
          busy={validator.isPending}
          disabled={
            !editable ||
            !journalReady ||
            !cart.items.length ||
            !!cart.syncError ||
            cart.syncing ||
            cart.items.some(
              (i) =>
                !!(
                  i.serverSnapshot?.qualityOptionId ||
                  i.serverSnapshot?.qualityOptionLabel ||
                  i.serverSnapshot?.qualityOptionLabelTj
                ),
            ) ||
            !slotId ||
            !address ||
            !auth.isSuccess
          }
          onPress={validate}
        />
        <Text style={styles.heading}>{t("Проверка заказа")}</Text>
        {quote ? (
          <View style={{ gap: 14 }}>
            {quote.items.map((item) => (
              <View key={item.productId} style={styles.section}>
                <Text style={styles.text}>
                  {localizedName(locale, item)} ·{" "}
                  {item.requestedQuantity.replace(".", ",")}
                </Text>
                <Text style={styles.text}>
                  {decimalLabel(item.estimatedTotal)} {currency(locale)}
                </Text>
                {item.errors.map((error, index) => (
                  <Text key={`error-${index}`} style={styles.muted}>
                    {serverMessage(locale, error, item)}
                  </Text>
                ))}
                {item.warnings.map((warning, index) => (
                  <Text key={`warning-${index}`} style={styles.muted}>
                    {serverMessage(locale, warning, item)}
                  </Text>
                ))}
              </View>
            ))}
            {quote.errors.map((error, index) => (
              <Text key={index} style={styles.text}>
                {serverMessage(locale, error)}
              </Text>
            ))}
            <PricingSummary
              quote={quote}
              pending={validator.isPending}
              weighted={cart.items.some((i) => i.product.isWeighted)}
            />
            <Text style={styles.muted}>
              {t("Оплата наличными при получении")}
            </Text>
            <Text style={styles.muted}>
              {t("Финальный вес и стоимость уточняются при сборке.")}
            </Text>
            <ChoiceRow
              label={t("Я проверил товары, стоимость и время доставки")}
              checkbox
              selected={accepted}
              disabled={!editable || !quote.valid}
              onPress={() => setAccepted((v) => !v)}
            />
            <Button
              title={t("Подтвердить заказ")}
              busy={submit.isPending}
              disabled={
                !orderSubmissionEnabled ||
                !auth.isSuccess ||
                (auth.data?.requiredForCheckout &&
                  session.phase !== "account") ||
                !editable ||
                !accepted ||
                !slotId ||
                review?.key !== key ||
                !quote.valid ||
                !normalizePhone(phone) ||
                !name.trim()
              }
              onPress={() => {
                if (!normalizePhone(phone))
                  Alert.alert(t("Проверьте имя и телефон +992"));
                else submit.mutate();
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function CheckoutRoute() {
  return (
    <ScreenFrame title="" active="cart">
      <CheckoutState />
    </ScreenFrame>
  );
}
