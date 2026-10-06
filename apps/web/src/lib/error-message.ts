export function errorMessage(message: unknown, fallback = "Не удалось выполнить запрос. Повторите попытку.") {
  return typeof message === "string" && /[А-Яа-яЁё]/.test(message) ? message : fallback;
}
