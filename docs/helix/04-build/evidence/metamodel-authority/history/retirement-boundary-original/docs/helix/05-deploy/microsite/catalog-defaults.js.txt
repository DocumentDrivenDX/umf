// The site starts with a compact catalog. Later navigation and search use the
// released browser's normal expansion behavior.
const catalog = document.getElementById('catalog');
const status = document.getElementById('status');
if (catalog && status) {
  const initialStatus = status.textContent;
  const observer = new MutationObserver(() => {
    for (const group of catalog.querySelectorAll('details[open]')) group.open = false;
    if (status.textContent !== initialStatus) observer.disconnect();
  });
  observer.observe(catalog, {childList: true, subtree: true});
  observer.observe(status, {childList: true, subtree: true, characterData: true});
  window.addEventListener('pagehide', () => observer.disconnect(), {once: true});
}
