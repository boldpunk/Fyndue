import { z } from "zod";

/**
 * Russian wording for zod's built-in checks (`.max(60)`, `.int()`, …).
 * Messages given explicitly on a schema still take precedence. Imported by
 * every validation module so it applies on the server and in the browser.
 */
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "too_small":
        if (issue.origin === "string") return Number(issue.minimum) <= 1 ? "Заполните поле" : `Не меньше ${issue.minimum} символов`;
        if (issue.origin === "array") return `Выберите хотя бы ${issue.minimum}`;
        return `Не меньше ${issue.minimum}`;
      case "too_big":
        if (issue.origin === "string") return `Не больше ${issue.maximum} символов`;
        if (issue.origin === "array") return `Не больше ${issue.maximum}`;
        return `Не больше ${issue.maximum}`;
      case "invalid_type":
        return issue.input === undefined || issue.input === "" ? "Заполните поле" : "Неверное значение";
      case "invalid_value":
        return "Выберите значение из списка";
      case "invalid_format":
        return issue.format === "email" ? "Введите корректный email" : "Неверный формат";
      default:
        return "Проверьте значение";
    }
  },
});
