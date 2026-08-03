export function withSandboxPayment({
  checkoutService,
  paymentSandboxService,
  logger = console
} = {}) {
  if (!checkoutService || typeof checkoutService.submit !== "function") return checkoutService;

  return Object.freeze({
    enabled: checkoutService.enabled,

    async submit(input) {
      const result = await checkoutService.submit(input);
      if (!paymentSandboxService?.enabled) return { ...result, payment: null };

      try {
        const payment = await paymentSandboxService.createForCheckout(result.checkoutId);
        return { ...result, payment };
      } catch (error) {
        logger.error("El pedido se creó, pero no se pudo preparar el pago sandbox.", {
          checkoutId: result.checkoutId,
          code: typeof error?.code === "string" ? error.code : "PAYMENT_SANDBOX_CREATE_FAILED"
        });
        return {
          ...result,
          payment: {
            mode: "SANDBOX",
            status: "UNAVAILABLE",
            message: "El simulador de pago no está disponible para este pedido."
          }
        };
      }
    }
  });
}
