/** Минимальное описание API расширения, которым пользуется сайт. */
export {};

declare global {
  namespace chrome {
    namespace runtime {
      /** Отправка сообщения расширению с сайта. */
      function sendMessage(extensionId: string, message: unknown, callback?: (response?: unknown) => void): void;

      /** Последняя ошибка доставки. Chrome бросает её, если расширения нет. */
      const lastError: { message?: string } | undefined;
    }
  }
}
