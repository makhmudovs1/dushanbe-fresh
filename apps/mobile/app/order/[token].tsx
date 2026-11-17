import { useSession } from "../../src/state/session";
import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useApp } from "../../src/state/app-state";
import { saveTracking } from "../../src/state/private-storage";
import { Loading, Notice } from "../../src/components/ui";
export default function TrackingLink() {
  const { token = "" } = useLocalSearchParams<{ token: string }>();
  const { t } = useApp();
  const session = useSession();
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (session.phase !== "account" && session.phase !== "guest") return;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setInvalid(true);
      return;
    }
    void saveTracking(token, session.user?.id ?? null)
      .then(() => router.replace("/tracking"))
      .catch(() => setInvalid(true));
  }, [token, session.phase, session.user?.id]);
  return invalid ? <Notice title={t("Заказ не найден")} /> : <Loading />;
}
