const formatter = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" });

export const weekdayLabels = Array.from({ length: 7 }, (_, day) =>
  formatter.format(new Date(Date.UTC(2023, 0, day + 1))),
);
