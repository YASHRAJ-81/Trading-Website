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
    security_warning: "Please do not disclose passwords, SMS verification codes and other information to anyone, and customer service staff will not ask you for account information.",
    choose_language: "Choose Your Language",
    select_language: "Select a language:",
  },
  hi: {
    invite_code: "कोड आमंत्रण:",
    credit_score: "क्रेडिट स्कोर:",
    language: "🌐 भाषा",
    help_center: "❓ सहायता केंद्र",
    bind_card: "💳 बैंक कार्ड जोड़ें",
    notification: "🔔 सूचनाएं",
    change_password: "🔒 पासवर्ड बदलें",
    withdraw_password: "🔑 निकासी पासवर्ड",
    withdraw_address: "🏦 कॉइन निकासी पता",
    real_auth: "👤 असली नाम प्रमाणन",
    msb_certification: "🪪 एमएसबी प्रमाणन",
    logout: "लॉग आउट",
    security_warning: "कृपया पासवर्ड, एसएमएस सत्यापन कोड और अन्य जानकारी किसी को न दें। ग्राहक सेवा कर्मचारी आपसे कभी खाता जानकारी नहीं मांगेंगे।",
    choose_language: "अपनी भाषा चुनें",
    select_language: "एक भाषा चुनें:",
  },
  ta: { /* Tamil */
    invite_code: "அழைப்புக் குறியீடு:",
    credit_score: "கடன் மதிப்பெண்:",
    language: "🌐 மொழி",
    help_center: "❓ உதவி மையம்",
    bind_card: "💳 வங்கி அட்டை இணைக்கவும்",
    notification: "🔔 அறிவிப்புகள்",
    change_password: "🔒 கடவுச்சொல்லை மாற்று",
    withdraw_password: "🔑 பிடித்து கடவுச்சொல்",
    withdraw_address: "🏦 படிவ முகவரி",
    real_auth: "👤 உண்மையான பெயர் சான்றிதழ்",
    msb_certification: "🪪 MSB சான்றிதழ்",
    logout: "வெளியேறு",
    security_warning: "கடவுச்சொல்ல்கள், SMS சரிபார்ப்பு குறியீடுகள் மற்றும் பிற தகவல்களை யாருடையக்கும் பகிர வேண்டாம். வாடிக்கையாளர் சேவை பணியாளர் உங்கள் கணக்கு தகவலை கேட்க மாட்டார்கள்.",
    choose_language: "உங்கள் மொழியை தேர்ந்தெடுக்கவும்",
    select_language: "ஒரு மொழியைத் தேர்வு செய்யவும்:",
  },
  tl: { /* Filipino (Tagalog) */
    invite_code: "Imbitasyon Code:",
    credit_score: "Credit Score:",
    language: "🌐 Wika",
    help_center: "❓ Sentro ng Tulong",
    bind_card: "💳 Mag-link ng bank card",
    notification: "🔔 Mga Abiso",
    change_password: "🔒 Palitan ang password",
    withdraw_password: "🔑 Password sa pag-withdraw",
    withdraw_address: "🏦 Address ng pag-withdraw",
    real_auth: "👤 Real name authentication",
    msb_certification: "🪪 MSB sertipikasyon",
    logout: "Mag-logout",
    security_warning: "Huwag ibigay ang iyong password, SMS code o iba pang impormasyon sa sinuman. Hindi hihilingin ito ng customer support.",
    choose_language: "Pumili ng Wika",
    select_language: "Pumili ng wika:",
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
