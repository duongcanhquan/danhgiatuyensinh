/** Chỉ tự ghi khi điểm lệch — không ghi đè nhãn tay khi điểm đã khớp. */
export function leadNeedsAutoScorePersist(
  lead: { calculatedScore: number },
  evaluated: { calculatedScore: number },
): boolean {
  return evaluated.calculatedScore !== lead.calculatedScore
}
