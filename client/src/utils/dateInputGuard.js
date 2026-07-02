// ─── Global date-input guard ──────────────────────────────────────────────────
// Native <input type="date"> fields default to a maximum year of 275760, which is
// why the year segment happily accepts 6 digits. Giving every date input a
// 4-digit-year `max` caps the year at 4 digits while keeping the native calendar
// popup. We only set bounds when the input hasn't already defined its own, so any
// intentional min/max elsewhere is left untouched.
const MAX_DATE = '9999-12-31';
const MIN_DATE = '1900-01-01';

function applyBounds(el) {
  if (!el || el.tagName !== 'INPUT' || el.type !== 'date') return;
  if (!el.getAttribute('max')) el.setAttribute('max', MAX_DATE);
  if (!el.getAttribute('min')) el.setAttribute('min', MIN_DATE);
}

function scan(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('input[type="date"]').forEach(applyBounds);
}

export function installDateInputGuard() {
  if (typeof document === 'undefined') return;
  scan(document);
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'INPUT') applyBounds(node);
        else scan(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
