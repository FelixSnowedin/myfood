// ponytail: temporary style switcher to compare the three prototypes on real devices;
// delete this file (and the header select) once a style is chosen.
export type Theme = 'a' | 'b' | 'c';
export const THEMES: [Theme, string][] = [['a', 'Stil A'], ['b', 'Stil B'], ['c', 'Stil C']];

const KEY = 'myfood-theme';

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'b' || saved === 'c' ? saved : 'a';
  } catch {
    return 'a';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode: the choice just isn't remembered
  }
}
