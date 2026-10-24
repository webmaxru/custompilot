// Runs before stylesheets so a saved preference is applied before the first paint.
(() => {
  const key = 'custompilot-theme';
  const modes = ['light', 'dark', 'system'];
  let preference = 'system';
  let storage;

  function apply(value) {
    if (value != null && !modes.includes(value)) {
      console.warn('Custompilot: unsupported saved theme; using the system theme.');
    }
    preference = modes.includes(value) ? value : 'system';
    document.documentElement.dataset.theme = preference;
    document.querySelectorAll('[data-theme-control]').forEach((control) => {
      control.value = preference;
    });
  }

  function restore() {
    if (!storage) return;
    try {
      apply(storage.getItem(key));
    } catch (error) {
      console.warn('Custompilot: unable to read the saved theme preference.', error);
    }
  }

  apply(preference);
  try {
    storage = window.localStorage;
  } catch (error) {
    console.warn('Custompilot: browser storage is unavailable; theme changes will apply to this page only.', error);
  }
  restore();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-control]').forEach((control) => {
      control.value = preference;
      control.disabled = false;
      control.addEventListener('change', () => {
        apply(control.value);
        if (!storage) return;
        try {
          storage.setItem(key, preference);
        } catch (error) {
          console.warn('Custompilot: theme applied, but the preference could not be saved.', error);
        }
      });
    });
  }, { once: true });

  window.addEventListener('storage', (event) => {
    if (storage && event.storageArea === storage && (event.key === key || event.key === null)) {
      apply(event.newValue);
    }
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) restore();
    apply(preference);
  });
})();
