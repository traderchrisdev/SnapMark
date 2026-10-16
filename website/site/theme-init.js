// Apply a saved theme before the first paint, so the page never flashes the wrong one.
try { var t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
