/**
 * Куда покупатель переводит деньги.
 *
 * Реквизиты счёта площадки живут в одной переменной окружения, а не
 * размазаны по страницам: когда появятся настоящие реквизиты, их впишут в
 * одном месте, а не поиском по коду. Пока переменной нет, страница заказа
 * честно ведёт через поддержку, а не показывает пустое место под реквизиты.
 */
export function platformPayment(): { supportEmail: string; account: string | null } {
  const account = (process.env.PLATFORM_ACCOUNT_DETAILS ?? "").trim();

  return {
    supportEmail: process.env.SUPPORT_EMAIL ?? "support@beatdesk.ru",
    account: account.length > 0 ? account : null,
  };
}
