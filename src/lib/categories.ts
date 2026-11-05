export const CATEGORIES = [
  { id: 'stay', label: 'Stay' },
  { id: 'food', label: 'Food' },
  { id: 'sight', label: 'Sight' },
  { id: 'activity', label: 'Activity' },
  { id: 'shop', label: 'Shop' },
  { id: 'transport', label: 'Transport' },
  { id: 'other', label: 'Other' },
] as const

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? ''
