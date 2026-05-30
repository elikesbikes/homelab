export function buildItemList(items) {
  return items
    .map(i => `- ${i.quantity || 1}${i.unit ? ' ' + i.unit : ''} ${i.name}${i.notes ? ` (${i.notes})` : ''}`)
    .join('\n')
}
