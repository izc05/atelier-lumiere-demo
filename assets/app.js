(() => {
  "use strict";

  const BASE = "/atelier-lumiere-demo";
  const KEYS = {
    cart: "alma_cart_v3",
    orders: "alma_orders_v3",
    commissions: "alma_commissions_v3",
    customer: "alma_customer_v3"
  };

  const PROVIDERS = [
    { id: "brisa-azahar", name: "Brisa y Azahar", specialty: "Tocados artesanales", status: "active", image: `${BASE}/images/tocado-azahar.webp` },
    { id: "taller-lucia", name: "El Taller de Lucía", specialty: "Papelería de autor", status: "active", image: `${BASE}/images/papeleria-lucia.webp` },
    { id: "tierra-serena", name: "Tierra Serena", specialty: "Cerámica artesanal", status: "invited", image: `${BASE}/images/ceramica-serena.webp` }
  ];

  const PRODUCTS = [
    { id: "tocado-azahar-borgona", slug: "tocado-azahar-borgona", name: "Tocado Azahar Borgoña", providerId: "brisa-azahar", provider: "Brisa y Azahar", price: 185, image: `${BASE}/images/tocado-azahar.webp`, category: "Tocados", events: ["Boda", "Celebración"], description: "Flores de seda, porcelana y alambre dorado moldeadas una a una.", story: "Azahar nace de los jardines al caer la tarde. Cada flor se modela y monta a mano, buscando equilibrio, ligereza y una presencia orgánica.", shipping: "Preparación artesanal en 12–15 días", customizable: true },
    { id: "peineta-jardin-antiguo", slug: "peineta-jardin-antiguo", name: "Peineta Jardín Antiguo", providerId: "brisa-azahar", provider: "Brisa y Azahar", price: 98, image: `${BASE}/images/tocado-azahar.webp`, category: "Tocados", events: ["Boda", "Comunión", "Celebración"], description: "Una pieza ligera con pequeñas flores de seda en tonos empolvados.", story: "Una interpretación íntima de los jardines heredados, preparada para recogidos o cabello suelto.", shipping: "Preparación artesanal en 8–12 días", customizable: true },
    { id: "invitaciones-jardin-secreto", slug: "invitaciones-jardin-secreto", name: "Invitaciones Jardín Secreto", providerId: "taller-lucia", provider: "El Taller de Lucía", price: 94, image: `${BASE}/images/papeleria-lucia.webp`, category: "Papelería", events: ["Boda", "Comunión", "Bautizo"], description: "Pack de 25 invitaciones en papel de algodón con relieve botánico.", story: "El relieve se prensa hoja a hoja y cada sello conserva pequeñas variaciones propias del trabajo manual.", shipping: "Prueba digital en 3 días · envío en 15–20 días", customizable: true },
    { id: "recordatorios-algodon", slug: "recordatorios-algodon", name: "Recordatorios de Algodón", providerId: "taller-lucia", provider: "El Taller de Lucía", price: 68, image: `${BASE}/images/papeleria-lucia.webp`, category: "Papelería", events: ["Comunión", "Bautizo"], description: "Pack de 25 recordatorios con bordes naturales y estampación en seco.", story: "Papeles suaves, fibras visibles y una composición serena pensada para guardar.", shipping: "Prueba digital en 3 días · envío en 12–18 días", customizable: true },
    { id: "platillo-alianzas-olivo", slug: "platillo-alianzas-olivo", name: "Platillo de Alianzas Olivo", providerId: "tierra-serena", provider: "Tierra Serena", price: 42, image: `${BASE}/images/ceramica-serena.webp`, category: "Cerámica", events: ["Boda"], description: "Gres marfil modelado a mano con rama en relieve y borde dorado.", story: "La forma se crea sin molde rígido para conservar el gesto de las manos y la singularidad de cada pieza.", shipping: "Preparación artesanal en 10–14 días", customizable: true },
    { id: "platillo-recuerdo-botanico", slug: "platillo-recuerdo-botanico", name: "Platillo Recuerdo Botánico", providerId: "tierra-serena", provider: "Tierra Serena", price: 36, image: `${BASE}/images/ceramica-serena.webp`, category: "Cerámica", events: ["Comunión", "Bautizo", "Celebración"], description: "Pequeño plato de gres para joyas, arras o recuerdos especiales.", story: "Cada ramita se imprime sobre la arcilla húmeda y el acabado marfil deja ver las motas naturales del gres.", shipping: "Preparación artesanal en 8–12 días", customizable: true }
  ];

  const SHIPPING = [
    { id: "standard", name: "Envío estándar", description: "Entrega estimada 3–5 días después de la preparación", cost: 5.9 },
    { id: "priority", name: "Envío prioritario", description: "Entrega estimada 24/48 h después de la preparación", cost: 9.9 }
  ];

  const euro = value => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const getCart = () => read(KEYS.cart, []);
  const setCart = cart => { write(KEYS.cart, cart); updateCartCount(); };
  const getProduct = idOrSlug => PRODUCTS.find(item => item.id === idOrSlug || item.slug === idOrSlug);

  function updateCartCount() {
    const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach(node => {
      node.textContent = String(count);
      node.hidden = count === 0;
    });
  }

  function toast(message) {
    document.querySelectorAll(".toast").forEach(node => node.remove());
    const node = document.createElement("div");
    node.className = "toast";
    node.setAttribute("role", "status");
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 3500);
  }

  function addToCart(productId) {
    const product = getProduct(productId);
    if (!product) return;
    const cart = getCart();
    const currentProvider = cart[0]?.providerId;
    if (currentProvider && currentProvider !== product.providerId) {
      toast(`El carrito ya contiene piezas de ${cart[0].provider}. Finaliza o vacía ese pedido antes de comprar a otro taller.`);
      return;
    }
    const existing = cart.find(item => item.productId === product.id);
    if (existing) existing.quantity += 1;
    else cart.push({ productId: product.id, providerId: product.providerId, provider: product.provider, quantity: 1 });
    setCart(cart);
    toast(`${product.name} se ha añadido al carrito.`);
  }

  function wireAddButtons(root = document) {
    root.querySelectorAll("[data-add-product]").forEach(button => {
      button.addEventListener("click", () => addToCart(button.dataset.addProduct));
    });
  }

  function customDesignModal() {
    let opener = null;
    let backdrop = null;
    const close = () => {
      if (!backdrop) return;
      backdrop.remove();
      backdrop = null;
      document.body.classList.remove("modal-open");
      opener?.focus();
    };
    const open = source => {
      opener = source instanceof HTMLElement ? source : document.activeElement;
      const options = PROVIDERS.map(provider => `<option value="${provider.id}">${provider.name} · ${provider.specialty}</option>`).join("");
      backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="custom-title">
          <button class="modal-close" type="button" aria-label="Cerrar formulario">×</button>
          <p class="eyebrow">Creado solo para ti</p>
          <h2 id="custom-title">Cuéntanos tu idea</h2>
          <p>La solicitud se asignará a un único taller. En esta demostración se guarda únicamente en tu navegador.</p>
          <form id="custom-form" class="form-grid">
            <label class="field field-wide"><span>Taller</span><select name="providerId" required>${options}</select></label>
            <label class="field"><span>Nombre</span><input name="name" autocomplete="name" required></label>
            <label class="field"><span>Correo electrónico</span><input name="email" type="email" autocomplete="email" required></label>
            <label class="field"><span>Evento</span><select name="event"><option>Boda</option><option>Comunión</option><option>Bautizo</option><option>Celebración</option></select></label>
            <label class="field"><span>Fecha del evento</span><input name="eventDate" type="date" required></label>
            <label class="field"><span>Cantidad</span><input name="quantity" type="number" min="1" value="1" required></label>
            <label class="field"><span>Presupuesto orientativo</span><input name="budget" placeholder="Ej. Hasta 200 €"></label>
            <label class="field field-wide"><span>¿Qué te gustaría crear?</span><textarea name="idea" rows="4" minlength="20" required></textarea></label>
            <label class="field field-wide"><span>Colores, materiales o texto</span><textarea name="preferences" rows="3" required></textarea></label>
            <label class="field field-wide"><span>Fotografías de referencia</span><input name="references" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>La demo conserva solo el número de archivos seleccionados.</small></label>
            <div class="modal-actions field-wide"><button class="button button-ghost" type="button" data-close>Cancelar</button><button class="button button-primary" type="submit">Guardar solicitud</button></div>
          </form>
        </section>`;
      document.body.append(backdrop);
      document.body.classList.add("modal-open");
      backdrop.querySelector("input,select,textarea,button")?.focus();
      backdrop.addEventListener("mousedown", event => { if (event.target === backdrop) close(); });
      backdrop.querySelector(".modal-close").addEventListener("click", close);
      backdrop.querySelector("[data-close]").addEventListener("click", close);
      backdrop.querySelector("form").addEventListener("submit", event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const provider = PROVIDERS.find(item => item.id === data.get("providerId"));
        const files = data.getAll("references").filter(file => file instanceof File && file.size > 0);
        const commission = {
          id: `ENC-${Date.now().toString().slice(-6)}`,
          created: new Date().toISOString(),
          providerId: provider?.id,
          provider: provider?.name,
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          event: String(data.get("event") || "Celebración"),
          eventDate: String(data.get("eventDate") || ""),
          quantity: Math.max(1, Number(data.get("quantity") || 1)),
          budget: String(data.get("budget") || "").trim(),
          idea: String(data.get("idea") || "").trim(),
          preferences: String(data.get("preferences") || "").trim(),
          referenceFiles: files.length,
          status: "Pendiente de estudio"
        };
        const list = read(KEYS.commissions, []);
        list.unshift(commission);
        write(KEYS.commissions, list);
        write(KEYS.customer, { name: commission.name, email: commission.email });
        backdrop.querySelector(".modal").innerHTML = `<div class="empty"><p class="eyebrow">Solicitud guardada</p><h2>Tu idea ya está preparada</h2><p>${provider?.name || "El taller"} aparece ahora en “Mis encargos”. No se ha enviado información fuera de este navegador.</p><button class="button button-primary" type="button" data-finish>Volver a la tienda</button></div>`;
        backdrop.querySelector("[data-finish]").addEventListener("click", close);
      });
    };
    document.querySelectorAll("[data-custom-design]").forEach(button => button.addEventListener("click", () => open(button)));
    document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    const params = new URLSearchParams(location.search);
    if (params.get("encargo") === "1") {
      setTimeout(() => open(document.querySelector("[data-custom-design]")), 80);
      params.delete("encargo");
      history.replaceState({}, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`);
    }
  }

  function initStore() {
    const cards = [...document.querySelectorAll("[data-product-card]")];
    if (!cards.length) return;
    let eventFilter = "Todos";
    let categoryFilter = "Todas";
    const params = new URLSearchParams(location.search);
    const providerFilter = params.get("proveedor");
    const apply = () => {
      let visible = 0;
      cards.forEach(card => {
        const events = card.dataset.events.split("|");
        const show = (!providerFilter || card.dataset.provider === providerFilter) && (eventFilter === "Todos" || events.includes(eventFilter)) && (categoryFilter === "Todas" || card.dataset.category === categoryFilter);
        card.hidden = !show;
        if (show) visible += 1;
      });
      document.querySelector("[data-results]").textContent = `${visible} piezas encontradas`;
      document.querySelector("[data-empty-results]").hidden = visible !== 0;
    };
    document.querySelectorAll("[data-event-filter]").forEach(button => button.addEventListener("click", () => {
      eventFilter = button.dataset.eventFilter;
      document.querySelectorAll("[data-event-filter]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      apply();
    }));
    document.querySelector("[data-category-filter]")?.addEventListener("change", event => { categoryFilter = event.target.value; apply(); });
    const provider = PROVIDERS.find(item => item.id === providerFilter);
    if (provider) {
      const note = document.querySelector("[data-provider-note]");
      note.hidden = false;
      note.querySelector("strong").textContent = provider.name;
    }
    apply();
  }

  function initProduct() {
    const mount = document.querySelector("[data-product-detail]");
    if (!mount) return;
    const slug = new URLSearchParams(location.search).get("slug") || "tocado-azahar-borgona";
    const product = getProduct(slug);
    if (!product) {
      mount.innerHTML = `<div class="empty"><h2>Esta pieza no está disponible</h2><a class="button button-primary" href="${BASE}/tienda/">Volver a la tienda</a></div>`;
      return;
    }
    document.title = `${product.name} · Alma de Fiesta`;
    mount.innerHTML = `<div class="product-detail-grid" style="display:grid;grid-template-columns:1.05fr .95fr;gap:60px;align-items:center"><div class="media" style="min-height:650px"><img src="${product.image}" alt="${product.name}" style="width:100%;height:650px;object-fit:cover"></div><div><p class="eyebrow">${product.provider}</p><h1 class="page-title" style="font-size:clamp(3.3rem,6vw,5.8rem)">${product.name}</h1><p style="font-size:1.25rem;font-weight:800">${euro(product.price)}</p><p class="page-intro">${product.description}</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin:28px 0"><button class="button button-primary" data-add-product="${product.id}">Añadir al carrito</button><button class="button button-outline" data-custom-design>Pedir un diseño propio</button></div><div class="notice"><strong>Historia de la pieza</strong><p>${product.story}</p><p><strong>Plazo:</strong> ${product.shipping}</p></div></div></div>`;
    wireAddButtons(mount);
  }

  function initCart() {
    const mount = document.querySelector("[data-cart]");
    if (!mount) return;
    const render = () => {
      const cart = getCart();
      if (!cart.length) {
        mount.innerHTML = `<div class="empty"><p class="eyebrow">Tu carrito</p><h2>Aún no has elegido ninguna pieza</h2><p>Los artículos de cada taller se compran y envían por separado.</p><a class="button button-primary" href="${BASE}/tienda/">Descubrir la tienda</a></div>`;
        return;
      }
      const items = cart.map(item => ({ ...item, product: getProduct(item.productId) })).filter(item => item.product);
      const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      mount.innerHTML = `<div class="cart-layout"><section><div class="cart-list">${items.map(item => `<article class="cart-item"><img src="${item.product.image}" alt="${item.product.name}"><div><p class="provider-name">${item.product.provider}</p><h3>${item.product.name}</h3><p>${item.product.description}</p><div class="qty"><button type="button" data-qty="-1" data-id="${item.product.id}" aria-label="Reducir cantidad">−</button><span>${item.quantity}</span><button type="button" data-qty="1" data-id="${item.product.id}" aria-label="Aumentar cantidad">+</button></div></div><div><strong>${euro(item.product.price * item.quantity)}</strong><br><button class="remove" type="button" data-remove="${item.product.id}">Eliminar</button></div></article>`).join("")}</div><button class="remove" type="button" data-clear>Vaciar carrito</button></section><aside class="summary"><p class="eyebrow">Resumen</p><h2>${items[0].provider}</h2><div class="summary-row"><span>Subtotal</span><strong>${euro(subtotal)}</strong></div><div class="summary-row"><span>Envío</span><span>Se elige después</span></div><div class="summary-row summary-total"><span>Total provisional</span><strong>${euro(subtotal)}</strong></div><a class="button button-primary" href="${BASE}/checkout/">Continuar</a><p style="font-size:.75rem;color:var(--muted)">Todos los artículos pertenecen al mismo taller y compartirán envío.</p></aside></div>`;
      mount.querySelectorAll("[data-qty]").forEach(button => button.addEventListener("click", () => {
        const next = getCart();
        const item = next.find(entry => entry.productId === button.dataset.id);
        if (!item) return;
        item.quantity += Number(button.dataset.qty);
        setCart(next.filter(entry => entry.quantity > 0));
        render();
      }));
      mount.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => { setCart(getCart().filter(item => item.productId !== button.dataset.remove)); render(); }));
      mount.querySelector("[data-clear]")?.addEventListener("click", () => { setCart([]); render(); });
    };
    render();
  }

  function initCheckout() {
    const mount = document.querySelector("[data-checkout]");
    if (!mount) return;
    const cart = getCart();
    if (!cart.length) {
      mount.innerHTML = `<div class="empty"><p class="eyebrow">Finalizar compra</p><h2>Primero elige una pieza</h2><a class="button button-primary" href="${BASE}/tienda/">Ir a la tienda</a></div>`;
      return;
    }
    const items = cart.map(item => ({ ...item, product: getProduct(item.productId) }));
    const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    let step = 0;
    let customer = read(KEYS.customer, {});
    let shippingId = "standard";
    const render = () => {
      const shipping = SHIPPING.find(item => item.id === shippingId);
      const steps = ["Tus datos", "Envío", "Bizum"];
      const content = step === 0 ? `<form class="form-grid" data-customer-form><label class="field"><span>Nombre y apellidos</span><input name="name" autocomplete="name" value="${customer.name || ""}" required></label><label class="field"><span>Correo electrónico</span><input name="email" type="email" autocomplete="email" value="${customer.email || ""}" required></label><label class="field"><span>Teléfono</span><input name="phone" autocomplete="tel" value="${customer.phone || ""}" required></label><label class="field field-wide"><span>Dirección</span><input name="address" autocomplete="street-address" value="${customer.address || ""}" required></label><label class="field"><span>Código postal</span><input name="postalCode" pattern="[0-9]{5}" inputmode="numeric" value="${customer.postalCode || ""}" required></label><label class="field"><span>Localidad</span><input name="city" value="${customer.city || ""}" required></label><label class="field field-wide"><span>Provincia</span><input name="province" value="${customer.province || ""}" required></label><div class="checkout-actions field-wide"><span></span><button class="button button-primary" type="submit">Elegir envío</button></div></form>` : step === 1 ? `<form data-shipping-form>${SHIPPING.map(option => `<label class="shipping-option ${shippingId === option.id ? "selected" : ""}"><input type="radio" name="shipping" value="${option.id}" ${shippingId === option.id ? "checked" : ""}> <strong>${option.name}</strong><br><small>${option.description} · ${euro(option.cost)}</small></label>`).join("")}<div class="checkout-actions"><button class="button button-outline" type="button" data-back>Volver</button><button class="button button-primary" type="submit">Revisar y pagar</button></div></form>` : `<div><div class="notice warning"><strong>Pago de demostración</strong><p>No introduzcas claves ni códigos de Bizum. El botón simula una confirmación correcta y no realiza ningún cargo.</p></div><div class="summary-row"><span>Entrega</span><strong>${customer.name}</strong></div><div class="summary-row"><span>Dirección</span><span>${customer.address}, ${customer.postalCode} ${customer.city}</span></div><div class="summary-row"><span>Envío</span><strong>${shipping.name}</strong></div><div class="checkout-actions"><button class="button button-outline" type="button" data-back>Volver</button><button class="button button-primary" type="button" data-pay>Simular pago Bizum correcto</button></div></div>`;
      mount.innerHTML = `<div class="checkout-layout"><section class="form-card"><div class="stepper">${steps.map((label, index) => `<div class="step ${index === step ? "active" : index < step ? "complete" : ""}">${index + 1}. ${label}</div>`).join("")}</div>${content}</section><aside class="summary"><p class="eyebrow">Tu pedido</p><h2>${items[0].provider}</h2>${items.map(item => `<div class="summary-row"><span>${item.quantity} × ${item.product.name}</span><strong>${euro(item.quantity * item.product.price)}</strong></div>`).join("")}<div class="summary-row"><span>Subtotal</span><strong>${euro(subtotal)}</strong></div><div class="summary-row"><span>Envío</span><strong>${step ? euro(shipping.cost) : "Por elegir"}</strong></div><div class="summary-row summary-total"><span>Total</span><strong>${euro(subtotal + (step ? shipping.cost : 0))}</strong></div></aside></div>`;
      mount.querySelector("[data-customer-form]")?.addEventListener("submit", event => {
        event.preventDefault();
        customer = Object.fromEntries(new FormData(event.currentTarget));
        write(KEYS.customer, customer);
        step = 1; render();
      });
      mount.querySelector("[data-shipping-form]")?.addEventListener("change", event => { shippingId = event.target.value; render(); });
      mount.querySelector("[data-shipping-form]")?.addEventListener("submit", event => { event.preventDefault(); step = 2; render(); });
      mount.querySelector("[data-back]")?.addEventListener("click", () => { step = Math.max(0, step - 1); render(); });
      mount.querySelector("[data-pay]")?.addEventListener("click", () => {
        const order = { id: `AF-${Date.now().toString().slice(-5)}`, created: new Date().toISOString(), provider: items[0].provider, providerId: items[0].providerId, status: "Confirmado en demo", items: items.map(item => ({ name: item.product.name, quantity: item.quantity, unitPrice: item.product.price })), shipping: shipping.name, shippingCost: shipping.cost, total: subtotal + shipping.cost, customer };
        const orders = read(KEYS.orders, []); orders.unshift(order); write(KEYS.orders, orders); setCart([]);
        mount.innerHTML = `<div class="empty"><p class="eyebrow">Pedido confirmado en la demo</p><h2>Tu historia ya está en manos de ${order.provider}</h2><p>Hemos creado el pedido <strong>${order.id}</strong>. No se ha realizado ningún cargo ni enviado información personal.</p><a class="button button-primary" href="${BASE}/cuenta/">Ver mis pedidos</a></div>`;
      });
    };
    render();
  }

  function initAccount() {
    const mount = document.querySelector("[data-account]");
    if (!mount) return;
    const orders = read(KEYS.orders, []);
    const commissions = read(KEYS.commissions, []);
    let tab = "orders";
    const render = () => {
      const list = tab === "orders" ? orders : commissions;
      mount.innerHTML = `<div class="tabs" role="tablist"><button role="tab" aria-selected="${tab === "orders"}" data-tab="orders">Mis pedidos (${orders.length})</button><button role="tab" aria-selected="${tab === "commissions"}" data-tab="commissions">Mis encargos (${commissions.length})</button></div><div>${list.length ? list.map(item => tab === "orders" ? `<article class="history-card"><p class="provider-name">${item.provider}</p><h3>${item.id}</h3><p>${item.status} · ${euro(item.total)}</p><small>${new Date(item.created).toLocaleString("es-ES")}</small></article>` : `<article class="history-card"><p class="provider-name">${item.provider}</p><h3>${item.id} · ${item.event}</h3><p>${item.status}</p><p>${item.idea}</p><small>Contacto: ${item.name} · ${item.email} · ${item.referenceFiles} referencias</small></article>`).join("") : `<div class="notice">Todavía no hay actividad en esta sección. La demo guarda los datos únicamente en este navegador.</div>`}</div>`;
      mount.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => { tab = button.dataset.tab; render(); }));
    };
    render();
  }

  function initAdmin() {
    const mount = document.querySelector("[data-admin]");
    if (!mount) return;
    const active = PROVIDERS.filter(item => item.status === "active").length;
    const invited = PROVIDERS.filter(item => item.status === "invited").length;
    const orders = read(KEYS.orders, []);
    const commissions = read(KEYS.commissions, []);
    mount.innerHTML = `<header><p class="eyebrow">Resumen coherente de demostración</p><h1 class="admin-title">Control de la tienda</h1><p>Los indicadores y las tarjetas utilizan ahora una única fuente de datos.</p></header><section class="metric-grid"><article class="metric"><span>Proveedores activos</span><strong>${active}</strong><small>${invited} invitación pendiente</small></article><article class="metric"><span>Artículos publicados</span><strong>${PRODUCTS.length}</strong><small>Catálogo de demostración</small></article><article class="metric"><span>Pedidos del navegador</span><strong>${orders.length}</strong><small>Sin datos reales</small></article><article class="metric"><span>Encargos del navegador</span><strong>${commissions.length}</strong><small>Pendientes de estudiar</small></article></section><div class="admin-grid"><section class="panel"><h2>Estado de los proveedores</h2><div class="provider-list">${PROVIDERS.map(provider => `<article class="provider-row"><img src="${provider.image}" alt="Trabajo de ${provider.name}"><div><h3>${provider.name}</h3><p>${provider.specialty} · ${PRODUCTS.filter(product => product.providerId === provider.id).length} artículos</p></div><span class="status status-${provider.status}">${provider.status === "active" ? "Activo" : "Invitado"}</span></article>`).join("")}</div></section><aside class="panel"><h2>Prioridades</h2><ol><li>Activar el acceso del taller invitado.</li><li>Revisar las fichas y fotografías definitivas.</li><li>Conectar autenticación, base de datos y pagos reales.</li></ol><div class="notice warning"><strong>Zona pública de demostración</strong><p>No contiene credenciales ni permite administrar datos reales.</p></div></aside></div>`;
  }

  updateCartCount();
  wireAddButtons();
  initStore();
  initProduct();
  initCart();
  initCheckout();
  initAccount();
  initAdmin();
  customDesignModal();
})();