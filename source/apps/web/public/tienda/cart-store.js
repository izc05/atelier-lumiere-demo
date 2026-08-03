(() => {
  const STORAGE_KEY = "atelier_lumiere_pilot_cart_v2";
  const MAX_LINES = 20;
  const MAX_QUANTITY = 10;
  const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

  function cleanLine(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (!UUID_PATTERN.test(value.productId ?? "")) return null;
    const providerSlug = String(value.providerSlug ?? "").trim().slice(0, 180);
    if (!providerSlug) return null;
    const quantity = Number(value.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null;
    const personalization = value.personalization && typeof value.personalization === "object" && !Array.isArray(value.personalization)
      ? Object.fromEntries(Object.entries(value.personalization).slice(0, 20).map(([key, selected]) => [String(key), String(selected).slice(0, 500)]))
      : {};
    const personalizationLabels = Array.isArray(value.personalizationLabels)
      ? value.personalizationLabels.slice(0, 20).map((item) => ({
          name: String(item?.name ?? "").slice(0, 120),
          value: String(item?.value ?? "").slice(0, 500),
          priceDeltaCents: Number.isSafeInteger(Number(item?.priceDeltaCents)) ? Number(item.priceDeltaCents) : 0
        }))
      : [];
    const customRequest = value.customRequest && typeof value.customRequest === "object"
      ? {
          title: String(value.customRequest.title ?? "").slice(0, 180),
          brief: String(value.customRequest.brief ?? "").slice(0, 12000),
          desiredDate: String(value.customRequest.desiredDate ?? "").slice(0, 10)
        }
      : null;
    return {
      lineId: typeof value.lineId === "string" && value.lineId.length <= 80 ? value.lineId : crypto.randomUUID(),
      productId: value.productId.toLowerCase(),
      productSlug: String(value.productSlug ?? "").slice(0, 180),
      productName: String(value.productName ?? "Artículo").slice(0, 180),
      providerSlug,
      providerName: String(value.providerName ?? "Taller").slice(0, 140),
      quantity,
      basePriceCents: Number.isSafeInteger(Number(value.basePriceCents)) ? Math.max(0, Number(value.basePriceCents)) : 0,
      currency: /^[A-Z]{3}$/.test(value.currency ?? "") ? value.currency : "EUR",
      personalization,
      personalizationLabels,
      customRequest
    };
  }

  function read() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (!Array.isArray(parsed)) return [];
      const cleaned = parsed.map(cleanLine).filter(Boolean).slice(0, MAX_LINES);
      const providerSlug = cleaned[0]?.providerSlug;
      return providerSlug ? cleaned.filter((line) => line.providerSlug === providerSlug) : [];
    } catch {
      return [];
    }
  }

  function write(lines) {
    const cleaned = Array.isArray(lines)
      ? lines.map(cleanLine).filter(Boolean).slice(0, MAX_LINES)
      : [];
    const providerSlug = cleaned[0]?.providerSlug;
    const singleProviderLines = providerSlug
      ? cleaned.filter((line) => line.providerSlug === providerSlug)
      : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(singleProviderLines));
    window.dispatchEvent(new CustomEvent("atelier:cart-change", { detail: { count: count(singleProviderLines) } }));
    return singleProviderLines;
  }

  function count(lines = read()) {
    return lines.reduce((total, line) => total + line.quantity, 0);
  }

  function add(line) {
    const cleaned = cleanLine(line);
    if (!cleaned) throw new Error("El artículo no es válido.");
    const lines = read();
    const currentProvider = lines[0];
    if (currentProvider && currentProvider.providerSlug !== cleaned.providerSlug) {
      throw new Error(
        `Tu carrito pertenece a ${currentProvider.providerName}. Finaliza o vacía ese pedido antes de comprar a otro taller.`
      );
    }
    if (lines.length >= MAX_LINES) throw new Error("El carrito ya tiene veinte líneas.");
    lines.push(cleaned);
    write(lines);
    return cleaned;
  }

  function remove(lineId) {
    return write(read().filter((line) => line.lineId !== lineId));
  }

  function updateQuantity(lineId, nextQuantity) {
    const quantity = Number(nextQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new Error("La cantidad debe estar entre 1 y 10.");
    }
    return write(read().map((line) => line.lineId === lineId ? { ...line, quantity } : line));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("atelier:cart-change", { detail: { count: 0 } }));
  }

  function estimatedUnitPrice(line) {
    return line.basePriceCents + line.personalizationLabels.reduce(
      (total, option) => total + Math.max(0, Number(option.priceDeltaCents) || 0),
      0
    );
  }

  function wireCount(element) {
    if (!element) return;
    const refresh = () => { element.textContent = String(count()); };
    refresh();
    window.addEventListener("atelier:cart-change", refresh);
    window.addEventListener("storage", refresh);
  }

  window.AtelierCart = Object.freeze({
    MAX_LINES,
    MAX_QUANTITY,
    read,
    write,
    count,
    add,
    remove,
    updateQuantity,
    clear,
    estimatedUnitPrice,
    wireCount
  });
})();
