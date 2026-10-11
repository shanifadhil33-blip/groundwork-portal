export const fields=['title','description','client','site','priority','due_on','scheduled_for','external_ref'] as const;
export type Field=typeof fields[number];
export type Mapping=Partial<Record<Field,string>>;
