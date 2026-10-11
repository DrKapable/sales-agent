export function previousLusakaDay(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid report date.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  const deliveryDate = `${value("year")}-${value("month")}-${value("day")}`;
  // Zambia is UTC+02:00 throughout the year. End is exclusive: today's midnight.
  const end = new Date(`${deliveryDate}T00:00:00+02:00`);
  const start = new Date(end.getTime() - 86_400_000);
  const reportDate = new Date(start.getTime() + 7_200_000).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka", day: "numeric", month: "long", year: "numeric"
  }).format(start);
  return { deliveryDate, reportDate, label, start: start.toISOString(), end: end.toISOString(), timeZone: "Africa/Lusaka" };
}
