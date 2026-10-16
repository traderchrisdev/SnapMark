// Google Analytics 4, loaded only after the visitor accepts (EU cookie rules). The choice is kept in
// localStorage; "Cookie settings" in the footer asks again. Download clicks are sent as an event.
(function () {
  var ID = 'G-43QDEM7LZJ';
  var KEY = 'analytics-consent';
  var loaded = false;

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function load() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
  }

  var banner = document.createElement('div');
  banner.className = 'consent';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookies');
  banner.innerHTML =
    '<p>May this site use Google Analytics cookies to count visits? It helps me see what people read. Nothing is sold or shared for ads.</p>' +
    '<div class="consent-actions"><button type="button" class="btn primary" data-choice="granted">Accept</button>' +
    '<button type="button" class="btn" data-choice="denied">Decline</button></div>';
  banner.hidden = true;
  document.body.appendChild(banner);

  banner.addEventListener('click', function (e) {
    var choice = e.target && e.target.getAttribute('data-choice');
    if (!choice) return;
    set(choice);
    banner.hidden = true;
    if (choice === 'granted') load();
  });

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('[data-event], .cookie-settings');
    if (!link) return;
    if (link.classList.contains('cookie-settings')) {
      e.preventDefault();
      banner.hidden = false;
      return;
    }
    if (loaded && window.gtag) {
      window.gtag('event', link.getAttribute('data-event'), { link_url: link.href, location: link.getAttribute('data-where') || '' });
    }
  });

  var choice = get();
  if (choice === 'granted') load();
  else if (choice !== 'denied') banner.hidden = false;
})();
