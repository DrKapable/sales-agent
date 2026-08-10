(() => {
  if (window.__medmindsChatWidgetLoaded) return;
  window.__medmindsChatWidgetLoaded = true;

  const script = document.currentScript || Array.from(document.scripts).reverse().find((item) => item.src && item.src.includes("/medminds-chat.js"));
  if (!script || !script.src) return;
  const origin = new URL(script.src, window.location.href).origin;
  const iframe = document.createElement("iframe");
  iframe.src = `${origin}/widget`;
  iframe.title = "Chat with MedMinds";
  iframe.setAttribute("aria-label", "Chat with MedMinds");
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.position = "fixed";
  iframe.style.right = "16px";
  iframe.style.bottom = "16px";
  iframe.style.width = "72px";
  iframe.style.height = "72px";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.zIndex = "2147483000";
  iframe.style.overflow = "hidden";
  iframe.style.transition = "width .2s ease, height .2s ease, right .2s ease, bottom .2s ease";

  let open = false;
  function sizeWidget() {
    if (!open) {
      iframe.style.width = "72px";
      iframe.style.height = "72px";
      iframe.style.right = "16px";
      iframe.style.bottom = "16px";
      return;
    }
    if (window.innerWidth <= 480) {
      iframe.style.width = "calc(100vw - 20px)";
      iframe.style.height = "calc(100dvh - 20px)";
      iframe.style.right = "10px";
      iframe.style.bottom = "10px";
    } else {
      iframe.style.width = "390px";
      iframe.style.height = "640px";
      iframe.style.right = "18px";
      iframe.style.bottom = "18px";
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== origin || event.source !== iframe.contentWindow || event.data?.type !== "medminds-chat-resize") return;
    open = Boolean(event.data.open);
    sizeWidget();
  });

  window.addEventListener("resize", sizeWidget);
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-medminds-open-chat]") : null;
    if (!target) return;
    event.preventDefault();
    open = true;
    sizeWidget();
    iframe.contentWindow?.postMessage({ type: "medminds-chat-open" }, origin);
  });

  window.addEventListener("medminds:open-chat", () => {
    open = true;
    sizeWidget();
    iframe.contentWindow?.postMessage({ type: "medminds-chat-open" }, origin);
  });

  const mount = () => document.body.appendChild(iframe);
  if (document.body) mount(); else window.addEventListener("DOMContentLoaded", mount, { once: true });
})();
