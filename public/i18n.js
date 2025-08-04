// public/i18n.js
const TRANSLATIONS = {
  en: {
    invite_code: "Invite Code:",
    credit_score: "Credit Score:",
    language: "🌐 Language",
    help_center: "❓ Help center",
    bind_card: "💳 Bind bank card",
    notification: "🔔 Notification",
    change_password: "🔒 Change password",
    withdraw_password: "🔑 Withdraw password",
    withdraw_address: "🏦 Withdraw coins address",
    real_auth: "👤 Real name authentication",
    msb_certification: "🪪 MSB certification",
    logout: "Logout",
    security_warning:
      "Please do not disclose passwords, SMS verification codes and other information to anyone, and customer service staff will not ask you for account information.",
    choose_language: "Choose Your Language",
    select_language: "Select a language to continue:",
  },
};

function applyTranslations() {
  const lang = localStorage.getItem("selectedLanguage") || "en";
  if (!TRANSLATIONS[lang]) return;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const txt = TRANSLATIONS[lang][key];
    if (txt) el.innerText = txt;
  });
}

function initI18n() {
  document.addEventListener("DOMContentLoaded", applyTranslations);
}
initI18n();
