type MessageSubstitutions = string | string[];

export const t = (key: string, substitutions?: MessageSubstitutions) =>
  chrome.i18n.getMessage(key, substitutions) || key;

export const localizeDocument = () => {
  const locale = chrome.i18n.getMessage("@@ui_locale") || chrome.i18n.getUILanguage();
  document.documentElement.lang = locale.replace(/_/g, "-");
  document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";

  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key) {
      element.textContent = t(key);
    }
  }

  for (const element of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    const key = element.dataset.i18nPlaceholder;
    if (key) {
      element.placeholder = t(key);
    }
  }
};
