import { geocoding, useGeocodingStatus } from "../src/state/geocoding";
import type { Suggestion } from "../src/api/geocoding";
import { useSavedAddresses } from "../src/state/customer-data";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
  TextInput,
  Pressable,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import MapView, { Polygon, type Region } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  Home,
  Bookmark,
  BriefcaseBusiness,
  Navigation,
  Pencil,
  Plus,
  Search,
} from "../src/design/icons";
import { LucideButton } from "../src/components/lucide-button";
import { SheetHeader } from "../src/components/sheet-header";
import { router, useLocalSearchParams } from "expo-router";
import { checkDeliveryZone } from "@dushanbe-fresh/shared";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, type DeliveryAddress } from "../src/state/app-state";
import { useZone } from "../src/api/queries";
import {
  Button,
  colors,
  ErrorState,
  Loading,
  styles,
} from "../src/components/ui";
const center = {
  latitude: 38.5737,
  longitude: 68.7864,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};
export default function Address() {
  const reducedMotion = useReducedMotion();
  const { t, locale, address, saveAddress, chooseAddress, addressReady } =
    useApp();
  const params = useLocalSearchParams<{ id?: string; fresh?: string }>();
  const saved = useSavedAddresses();
  const zone = useZone();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DeliveryAddress>(
    (params.fresh
      ? null
      : (saved.data?.find((a) => a.id === params.id) ?? address)) ?? {
      label: "home",
      housingType: "apartment",
      street: "",
      building: "",
      apartment: "",
      entrance: "",
      intercom: "",
      floor: "",
      instructions: "",
    },
  );
  const [stage, setStage] = useState<"saved" | "map" | "details">(
    params.id ? "details" : "map",
  );
  const [editingId, setEditingId] = useState(params.id);
  const initialized = useRef(false);
  const touched = useRef(false);
  useEffect(() => {
    if (initialized.current || touched.current || !addressReady) return;
    if (params.id && !saved.data) return;
    const initial = params.fresh
      ? null
      : (saved.data?.find((a) => a.id === params.id) ?? address);
    if (initial) setDraft(initial);
    if (!params.id && !params.fresh && saved.data?.length) setStage("saved");
    if (!params.id && saved.isPending && !params.fresh) return;
    initialized.current = true;
  }, [
    params.id,
    params.fresh,
    saved.data,
    saved.isPending,
    address,
    addressReady,
  ]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const map = useRef<MapView>(null);
  const operation = useRef(0);
  const interaction = useRef(false);
  const geo = useGeocodingStatus();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reverseAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    setSuggestions([]);
    if (!geo.data?.enabled || query.trim().length < 3) return;
    const version = ++operation.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setGeoBusy(true);
      void geocoding
        .search(query, locale, controller.signal)
        .then((items) => {
          if (operation.current === version) {
            setSuggestions(items);
            setGeoError(false);
          }
        })
        .catch(() => {
          if (operation.current === version) setGeoError(true);
        })
        .finally(() => {
          if (operation.current === version) setGeoBusy(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale, geo.data?.enabled]);
  useEffect(
    () => () => {
      clearTimeout(reverseTimer.current);
      reverseAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (stage !== "map") {
      operation.current++;
      clearTimeout(reverseTimer.current);
      reverseAbort.current?.abort();
      setGeoBusy(false);
      setSuggestions([]);
    }
  }, [stage]);
  const reversePoint = (point: Pick<Region, "latitude" | "longitude">) => {
    touched.current = true;
    setQuery("");
    const version = ++operation.current;
    setDraft((d) => ({ ...d, ...point, street: "", building: "" }));
    clearTimeout(reverseTimer.current);
    reverseAbort.current?.abort();
    if (!geo.data?.enabled) return;
    const controller = new AbortController();
    reverseAbort.current = controller;
    reverseTimer.current = setTimeout(() => {
      setGeoBusy(true);
      void geocoding
        .reverse(point, locale, controller.signal)
        .then((items) => {
          if (version !== operation.current) return;
          const result = items[0];
          if (result) {
            setDraft((d) => ({
              ...d,
              street: result.street,
              building: result.building,
              ...point,
            }));
            setGeoError(false);
          } else setGeoError(true);
        })
        .catch(() => {
          if (version === operation.current) setGeoError(true);
        })
        .finally(() => {
          if (version === operation.current) setGeoBusy(false);
        });
    }, 400);
  };

  const canMap =
    Platform.OS === "ios" ||
    Constants.expoConfig?.extra?.androidMapsConfigured === true;
  useEffect(
    () => () => {
      operation.current++;
    },
    [],
  );
  // Only a selected point is persisted; the initial camera center is never an address.
  const field = (key: keyof DeliveryAddress, value: string) => {
    touched.current = true;
    operation.current++;
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const gps = async () => {
    const version = ++operation.current;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (operation.current !== version) return;
      if (permission.status !== "granted") {
        Alert.alert(
          t("Геолокация отключена"),
          t("Разрешите доступ в настройках или выберите точку на карте."),
          [
            { text: t("Отмена"), style: "cancel" },
            ...(!permission.canAskAgain
              ? [
                  {
                    text: t("Открыть настройки"),
                    onPress: () => {
                      void Linking.openSettings().catch(() => {});
                    },
                  },
                ]
              : []),
          ],
        );
        return;
      }
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (operation.current !== version) return;
      interaction.current = false;
      reversePoint(point.coords);
      map.current?.animateToRegion(
        { ...center, ...point.coords },
        reducedMotion ? 0 : 500,
      );
    } catch {
      if (operation.current === version)
        Alert.alert(
          t("Не удалось определить местоположение. Укажите адрес вручную."),
        );
    } finally {
      setLocating(false);
    }
  };
  const result = zone.data ? checkDeliveryZone(zone.data, draft) : "invalid";
  const messages = {
    outside:
      "Пока не доставляем по этому адресу. Выберите точку внутри зоны доставки.",
    point_required: "Отметьте дом на карте, чтобы проверить доставку.",
    invalid: "Не удалось проверить зону доставки. Повторите попытку.",
    allowed: "",
  };
  const save = async () => {
    setBusy(true);
    try {
      await saveAddress(
        {
          ...draft,
          ...(draft.housingType === "house"
            ? { apartment: "", entrance: "", floor: "" }
            : {}),
          street: draft.street.trim(),
          building: draft.building.trim(),
        },
        editingId,
      );
      router.back();
    } catch {
      Alert.alert(t("Не удалось сохранить изменения."));
    } finally {
      setBusy(false);
    }
  };
  const canSave =
    addressReady &&
    !!draft.street.trim() &&
    !!draft.building.trim() &&
    zone.isSuccess &&
    result === "allowed";
  const zoneNotice = zone.isPending ? (
    <Loading />
  ) : zone.isError ? (
    <ErrorState
      error={zone.error}
      retry={() => {
        void zone.refetch();
      }}
    />
  ) : result !== "allowed" ? (
    <Text
      accessibilityRole="alert"
      style={{ fontSize: 13, lineHeight: 18, color: "#a13b30" }}
    >
      {t(messages[result])}
    </Text>
  ) : zone.data.enabled && draft.latitude != null ? (
    <Text style={{ fontSize: 13, color: colors.green }}>
      {t("Сюда доставляем")}
    </Text>
  ) : null;
  const editSaved = (item: DeliveryAddress & { id: string }) => {
    touched.current = true;
    setDraft(item);
    setEditingId(item.id);
    setStage("details");
  };
  const addNew = () => {
    touched.current = true;
    setEditingId(undefined);
    setDraft({
      label: "home",
      housingType: "apartment",
      street: "",
      building: "",
      apartment: "",
      entrance: "",
      intercom: "",
      floor: "",
      instructions: "",
    });
    setQuery("");
    setStage("map");
  };
  const detailField = (
    key: keyof DeliveryAddress,
    label: string,
    maxLength = 30,
  ) => (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Text style={{ fontSize: 12, lineHeight: 18, color: "#8c8c8c" }}>
        {t(label)}
      </Text>
      <TextInput
        accessibilityLabel={t(label)}
        value={String(draft[key] ?? "")}
        editable={!busy}
        onChangeText={(v) => field(key, v)}
        maxLength={maxLength}
        style={{
          minHeight: 36,
          borderBottomWidth: 1,
          borderBottomColor: "#e8e8e8",
          fontSize: 16,
          lineHeight: 22,
          color: colors.action,
          paddingVertical: 4,
          paddingBottom: 9,
        }}
      />
    </View>
  );
  return (
    <View style={styles.page}>
      <SheetHeader
        title={t(
          stage === "saved"
            ? "Выберите адрес"
            : stage === "map"
              ? "Куда доставить?"
              : editingId
                ? "Изменить адрес"
                : "Детали адреса",
        )}
        back={
          stage === "details" ? (
            <LucideButton
              icon={ArrowLeft}
              label={t("Назад")}
              onPress={() => setStage("map")}
            />
          ) : undefined
        }
      />
      {stage === "saved" ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={addNew}
            style={{
              minHeight: 68,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <Plus size={22} color={colors.muted} />
            <Text style={[styles.text, { flex: 1 }]}>
              {t("Добавить новый адрес")}
            </Text>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          {saved.data?.map((item) => {
            const LabelIcon =
              item.label === "home"
                ? Home
                : item.label === "work"
                  ? BriefcaseBusiness
                  : Bookmark;
            return (
              <View
                key={item.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: "#f1f1f1",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  disabled={!zone.isSuccess}
                  onPress={() => {
                    if (
                      zone.data &&
                      checkDeliveryZone(zone.data, item) === "allowed"
                    ) {
                      chooseAddress(item);
                      router.back();
                    } else {
                      editSaved(item);
                      setStage("map");
                    }
                  }}
                  style={{
                    flex: 1,
                    minHeight: 68,
                    paddingVertical: 16,
                    flexDirection: "row",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <LabelIcon size={21} color={colors.muted} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: colors.action,
                      }}
                    >
                      {t(
                        item.label === "home"
                          ? "Дом"
                          : item.label === "work"
                            ? "Работа"
                            : "Другое",
                      )}
                    </Text>
                    <Text
                      style={{ fontSize: 12, lineHeight: 18, color: "#999" }}
                    >
                      {item.street}, {item.building}
                      {item.apartment
                        ? `, ${t("Квартира")} ${item.apartment}`
                        : ""}
                    </Text>
                  </View>
                </Pressable>
                <LucideButton
                  icon={Pencil}
                  label={t("Изменить адрес")}
                  size={18}
                  color="#999"
                  onPress={() => editSaved(item)}
                />
              </View>
            );
          })}
          {zone.isError ? (
            <ErrorState
              error={zone.error}
              retry={() => {
                void zone.refetch();
              }}
            />
          ) : null}
        </ScrollView>
      ) : stage === "map" ? (
        <>
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 14,
              minHeight: 50,
              borderRadius: 14,
              backgroundColor: colors.soft,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              gap: 10,
            }}
          >
            <Search size={21} color={colors.muted} />
            <TextInput
              accessibilityLabel={t("Поиск адреса в Душанбе")}
              placeholder={t("Улица и номер дома")}
              value={query}
              onChangeText={(value) => {
                touched.current = true;
                operation.current++;
                reverseAbort.current?.abort();
                clearTimeout(reverseTimer.current);
                setGeoBusy(false);
                setQuery(value);
              }}
              maxLength={150}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 50,
                padding: 0,
                fontSize: 16,
                color: colors.text,
              }}
            />
          </View>
          {suggestions.length ? (
            <View
              style={{
                marginHorizontal: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              {suggestions.slice(0, 4).map((item, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  onPress={() => {
                    touched.current = true;
                    operation.current++;
                    reverseAbort.current?.abort();
                    clearTimeout(reverseTimer.current);
                    setQuery("");
                    setSuggestions([]);
                    setDraft((d) => ({
                      ...d,
                      street: item.street,
                      building: item.building,
                      latitude: item.latitude,
                      longitude: item.longitude,
                    }));
                    interaction.current = false;
                    map.current?.animateToRegion(
                      {
                        ...center,
                        latitude: item.latitude!,
                        longitude: item.longitude!,
                      },
                      reducedMotion ? 0 : 450,
                    );
                  }}
                  style={{ padding: 12, minHeight: 44 }}
                >
                  <Text style={styles.text}>
                    {item.placeName || item.street}
                    {item.building ? `, ${item.building}` : ""}
                  </Text>
                  {item.description ? (
                    <Text style={styles.muted}>{item.description}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <View
            style={{
              flex: 1,
              minHeight: 180,
              backgroundColor: canMap ? "#eef2f0" : colors.soft,
            }}
          >
            {canMap ? (
              <MapView
                ref={map}
                style={{ flex: 1 }}
                initialRegion={{
                  ...center,
                  ...(draft.latitude != null && draft.longitude != null
                    ? { latitude: draft.latitude, longitude: draft.longitude }
                    : {}),
                }}
                onTouchStart={() => {
                  setGeoBusy(false);
                  interaction.current = true;
                  touched.current = true;
                  operation.current++;
                }}
                onRegionChangeComplete={(region, details) => {
                  if (interaction.current || details.isGesture === true) {
                    interaction.current = false;
                    operation.current++;
                    reversePoint(region);
                  }
                }}
                onPress={(event) => {
                  interaction.current = false;
                  operation.current++;
                  reversePoint(event.nativeEvent.coordinate);
                  map.current?.animateToRegion(
                    { ...center, ...event.nativeEvent.coordinate },
                    reducedMotion ? 0 : 350,
                  );
                }}
              >
                {zone.data?.enabled && zone.data.polygon ? (
                  <Polygon
                    coordinates={zone.data.polygon.coordinates[0]!.map(
                      ([longitude, latitude]) => ({ latitude, longitude }),
                    )}
                    strokeColor={colors.green}
                    fillColor="rgba(23,100,59,0.10)"
                    strokeWidth={2}
                  />
                ) : null}
              </MapView>
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  padding: 24,
                  gap: 12,
                }}
              >
                <MapPin size={32} color={colors.muted} />
                <Text style={[styles.muted, { textAlign: "center" }]}>
                  {t("Карта недоступна. Адрес можно указать без точки.")}
                </Text>
                <Button
                  secondary
                  title={t("Моё местоположение")}
                  busy={locating}
                  onPress={() => {
                    void gps();
                  }}
                />
              </View>
            )}
            {canMap ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 36,
                  height: 52,
                  marginLeft: -18,
                  marginTop: -52,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    width: 34,
                    height: 34,
                    left: 1,
                    borderRadius: 17,
                    backgroundColor: colors.action,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "white",
                    }}
                  />
                </View>
                <View
                  style={{
                    position: "absolute",
                    top: 31,
                    left: 17,
                    width: 2,
                    height: 21,
                    backgroundColor: colors.action,
                  }}
                />
              </View>
            ) : null}
            {canMap ? (
              <LucideButton
                icon={Navigation}
                label={t("Моё местоположение")}
                disabled={locating}
                onPress={() => {
                  void gps();
                }}
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: 24,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#e5e5e5",
                  backgroundColor: "white",
                  boxShadow: "0 2px 12px rgba(0,0,0,.09)",
                }}
              />
            ) : null}
          </View>
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: Math.max(16, insets.bottom),
              gap: 12,
            }}
          >
            {zoneNotice}
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <MapPin size={20} color={colors.green} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 20,
                    fontWeight: "600",
                    color: colors.action,
                  }}
                >
                  {draft.street
                    ? [draft.street, draft.building].filter(Boolean).join(", ")
                    : t("Уточните улицу и номер дома")}
                </Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: "#888" }}>
                  {t("Душанбе")}
                </Text>
              </View>
            </View>
            {geoBusy ? (
              <Text style={styles.muted}>{t("Определяем адрес точки...")}</Text>
            ) : geoError ? (
              <Text style={styles.muted}>
                {t(
                  "Не удалось определить адрес точки. Можно ввести адрес вручную.",
                )}
              </Text>
            ) : !geo.data?.enabled ? (
              <Text
                style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}
              >
                {t(
                  "Поиск адреса пока недоступен. Укажите улицу и дом вручную.",
                )}
              </Text>
            ) : null}
            <Button
              title={t(
                draft.street && draft.building
                  ? "Подтвердить адрес"
                  : "Уточнить адрес",
              )}
              onPress={() => {
                touched.current = true;
                setStage("details");
              }}
              disabled={canMap && (!zone.isSuccess || result !== "allowed")}
              style={{ borderRadius: 15 }}
            />
          </View>
        </>
      ) : (
        <>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 24,
              gap: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => setStage("map")}
              style={{
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <MapPin size={19} color={colors.muted} />
              <Text style={[styles.muted, { flex: 1 }]}>
                {draft.street
                  ? [draft.street, draft.building].filter(Boolean).join(", ")
                  : t("Выбрать на карте")}
              </Text>
              <ChevronRight size={18} color={colors.muted} />
            </Pressable>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["home", "Дом"],
                  ["work", "Работа"],
                  ["other", "Другое"],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: draft.label === key }}
                  onPress={() => field("label", key)}
                  style={{
                    minHeight: 38,
                    borderWidth: draft.label === key ? 2 : 1,
                    borderColor:
                      draft.label === key ? colors.action : "#e7e7e7",
                    borderRadius: 11,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ fontSize: 14, color: colors.action }}>
                    {t(label)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 20 }}>
              <View style={{ flex: 3 }}>
                {detailField("street", "Улица", 150)}
              </View>
              {detailField("building", "Дом")}
            </View>
            <View
              style={{
                flexDirection: "row",
                borderRadius: 10,
                backgroundColor: "#f4f4f4",
                padding: 3,
              }}
            >
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
                    checked: (draft.housingType ?? "apartment") === value,
                  }}
                  onPress={() => {
                    field("housingType", value);
                    if (value === "house")
                      setDraft((d) => ({
                        ...d,
                        apartment: "",
                        entrance: "",
                        floor: "",
                      }));
                  }}
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    backgroundColor:
                      (draft.housingType ?? "apartment") === value
                        ? "white"
                        : "transparent",
                    paddingVertical: 9,
                    paddingHorizontal: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      lineHeight: 18,
                      textAlign: "center",
                      color:
                        (draft.housingType ?? "apartment") === value
                          ? colors.green
                          : colors.text,
                    }}
                  >
                    {t(label)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {draft.housingType !== "house" ? (
              <>
                <View style={{ flexDirection: "row", gap: 20 }}>
                  {detailField("apartment", "Номер квартиры")}
                  {detailField("intercom", "Домофон")}
                </View>
                <View style={{ flexDirection: "row", gap: 20 }}>
                  {detailField("entrance", "Подъезд")}
                  {detailField("floor", "Этаж")}
                </View>
              </>
            ) : (
              detailField("intercom", "Домофон")
            )}
            {detailField(
              "instructions",
              draft.housingType === "house"
                ? "Ориентир и комментарий курьеру"
                : "Комментарий курьеру",
              500,
            )}
            {zoneNotice}
          </ScrollView>
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: Math.max(16, insets.bottom),
            }}
          >
            <Button
              title={t("Сохранить адрес")}
              onPress={() => {
                void save();
              }}
              busy={busy}
              disabled={!canSave}
              style={{ borderRadius: 15 }}
            />
          </View>
        </>
      )}
    </View>
  );
}
