/**
 * Цвет имени участника в зависимости от роли — стандартный Discord-приём
 * для отличия Владельцев/Админов на глаз. У нас roles — фиксированный enum
 * (owner/admin/member); цвета захардкожены в стиле Discord-defaults.
 *
 * Если в будущем добавим custom roles с собственным `color`, точкой
 * расширения станет таблица `roles` — пока 3 hex-кода.
 */

import type { PublicMember } from '@quorum/shared';

/** Hex-цвет имени по роли. Для member возвращает null = использовать text-primary. */
export function roleColor(role: PublicMember['role']): string | null {
  switch (role) {
    case 'owner':
      return '#f1c40f';
    case 'admin':
      return '#3498db';
    case 'member':
      return null;
  }
}

/** Удобная обёртка: вернуть `style={{ color }}` или пустой объект. */
export function roleColorStyle(role: PublicMember['role'] | undefined): React.CSSProperties {
  if (!role) return {};
  const c = roleColor(role);
  return c ? { color: c } : {};
}
