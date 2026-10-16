// Theme switch with an e-ink style full refresh: the screen goes black, then white, then shows the
// page in the other theme. The choice is remembered (if storage is available).
(function () {
  var root = document.documentElement;
  var button = document.querySelector('.theme');
  var flash = document.querySelector('.refresh');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function current() {
    if (root.dataset.theme) return root.dataset.theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }

  button.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    if (still) { apply(next); return; }
    flash.className = 'refresh black';
    setTimeout(function () {
      apply(next);
      flash.className = 'refresh white';
      setTimeout(function () { flash.className = 'refresh'; }, 90);
    }, 110);
  });
})();
