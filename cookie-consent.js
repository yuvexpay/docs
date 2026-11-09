(function () {
  var NAME = "yvx_cookie_consent";
  var ACCEPTED = "accepted";
  var MAX_AGE = 365 * 24 * 60 * 60;
  var SHARED_DOMAIN = "yuvexpay.com";
  var LEGACY_NAME = "yvx_consent";
  var ID = "yvx-cookie-banner";

  function accepted() {
    return document.cookie.split(";").some(function (part) {
      var separator = part.indexOf("=");
      return (
        separator !== -1 &&
        part.slice(0, separator).trim() === NAME &&
        part.slice(separator + 1).trim() === ACCEPTED
      );
    });
  }

  function sharedDomain() {
    var host = window.location.hostname.toLowerCase();
    var suffix = "." + SHARED_DOMAIN;
    return host === SHARED_DOMAIN ||
      host.slice(-suffix.length) === suffix
      ? suffix
      : null;
  }

  function accept() {
    var domain = sharedDomain();
    document.cookie =
      NAME +
      "=" +
      ACCEPTED +
      "; Path=/; Max-Age=" +
      MAX_AGE +
      "; SameSite=Lax" +
      (window.location.protocol === "https:" ? "; Secure" : "") +
      (domain ? "; Domain=" + domain : "");
    render();
  }

  function forgetLegacy() {
    var expired = LEGACY_NAME + "=; Path=/; Max-Age=0; SameSite=Lax";
    var domain = sharedDomain();
    document.cookie = expired;
    if (domain) document.cookie = expired + "; Domain=" + domain;
  }

  function build() {
    var banner = document.createElement("section");
    banner.id = ID;
    banner.className = "yvx-cookie-banner";
    banner.setAttribute("aria-label", "Aviso de cookies");

    var box = document.createElement("div");
    box.className = "yvx-cookie-banner__box";

    var text = document.createElement("p");
    text.className = "yvx-cookie-banner__text";
    text.appendChild(
      document.createTextNode(
        "Usamos cookies essenciais para o funcionamento do YuvexPay e para atribuir indicações de parceiros. Cookies não essenciais só são usados depois do seu aceite. "
      )
    );
    var link = document.createElement("a");
    link.href = "https://yuvexpay.com/cookies";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Política de Cookies";
    text.appendChild(link);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "yvx-cookie-banner__accept";
    button.textContent = "Aceitar";
    button.addEventListener("click", accept);

    box.appendChild(text);
    box.appendChild(button);
    banner.appendChild(box);
    return banner;
  }

  function render() {
    var current = document.getElementById(ID);
    if (accepted()) {
      if (current) current.remove();
      return;
    }
    if (!current && document.body) document.body.appendChild(build());
  }

  forgetLegacy();
  render();
  window.addEventListener("mintlify:navigate", render);
  window.addEventListener("focus", render);
  document.addEventListener("visibilitychange", render);
})();
