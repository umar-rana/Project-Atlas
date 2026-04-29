export function formatEstimatedTime(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = totalMinutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${hours.toFixed(1)} hours`;
}

export function sumEstimatedMinutes(
  tasks: { estimated_minutes?: number | null; status?: string }[],
  incompleteOnly = false,
): number {
  return tasks.reduce((acc, t) => {
    if (incompleteOnly && t.status === "completed") return acc;
    return acc + (t.estimated_minutes ?? 0);
  }, 0);
}
