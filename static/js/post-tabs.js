(() => {
  const storageKey = 'blog-tab';
  const lists = document.querySelectorAll('[data-posts-tab]');
  const links = document.querySelectorAll('.post-tabs [data-tab]');

  function showTab() {
    let tab = new URL(window.location.href).searchParams.get('tab') || document.body.dataset.defaultTab;
    if (tab !== 'tech' && tab !== 'life') {
      try {
        tab = localStorage.getItem(storageKey);
      } catch {
        // 浏览器禁用存储时，仍可通过 URL 切换。
      }
    }
    tab = tab === 'life' ? 'life' : 'tech';

    for (const list of lists) {
      list.hidden = list.dataset.postsTab !== tab;
    }
    for (const link of links) {
      if (link.dataset.tab === tab) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    try {
      localStorage.setItem(storageKey, tab);
    } catch {
      // 记忆失败不影响当前内容。
    }
  }

  showTab();
  window.addEventListener('pageshow', event => {
    if (event.persisted) showTab();
  });
})();
