/** `1836.1.1` as the game writes it: year, month, day, no padding. */
export function compareDates(left: string, right: string): number {
  const [leftParts, rightParts] = [left, right].map((date) => date.split('.').map(Number));
  for (let index = 0; index < 3; index++) {
    const difference = (leftParts?.[index] ?? 0) - (rightParts?.[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}
