// Test Profile Tint Fix Override Script
// Loaded after src/main.js to dynamically enforce UI theme consistency.

(function() {
  // Helper to convert rgb(r, g, b) or hex to rgba(r, g, b, alpha)
  function convertToRgbaTint(colorStr, alpha) {
    if (!colorStr) return 'transparent';
    colorStr = colorStr.trim();
    if (colorStr.startsWith('rgb')) {
      const match = colorStr.match(/\d+/g);
      if (match && match.length >= 3) {
        return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
      }
    }
    let hex = colorStr.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // 1. Observer for theme variables on documentElement (style attribute)
  const styleObserver = new MutationObserver(() => {
    if (typeof window.getBook === 'function') {
      const book = window.getBook();
      if (book) {
        const bookId = book.id;
        const isTest = window.isTestBookId && window.isTestBookId(bookId);

        // Temporarily pause observation during updates to prevent recursive loops
        styleObserver.disconnect();

        if (isTest) {
          // Enforce purple variables when test book is active
          document.documentElement.style.setProperty('--book-accent', '#8b5cf6');
          document.documentElement.style.setProperty('--book-accent-bg', 'rgba(139, 92, 246, 0.1)');
          if (typeof window.lightenColor === 'function') {
            document.documentElement.style.setProperty('--book-accent-light', window.lightenColor('#8b5cf6', 0.25));
          }
          if (typeof window.getContrastSafeText === 'function') {
            document.documentElement.style.setProperty('--book-accent-text', window.getContrastSafeText('#8b5cf6'));
          }
          if (typeof window.getContrastColor === 'function') {
            document.documentElement.style.setProperty('--book-accent-contrast', window.getContrastColor('#8b5cf6'));
          }
          const dot = document.getElementById('book-dropdown-dot');
          if (dot) dot.style.background = '#8b5cf6';
        }

        // Apply dynamic body background tint
        let bodyBgTint = 'transparent';
        if (bookId !== 'all') {
          if (isTest) {
            bodyBgTint = 'rgba(139, 92, 246, 0.06)'; // 6% purple tint
          } else {
            const dot = document.getElementById('book-dropdown-dot');
            if (dot && dot.style.background) {
              bodyBgTint = convertToRgbaTint(dot.style.background, 0.06); // 6% opacity tint
            }
          }
        }
        document.documentElement.style.setProperty('--body-bg-tint', bodyBgTint);

        // Resume observation
        styleObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style']
        });
      }
    }
  });

  // Start style observation
  styleObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style']
  });

  // 2. Observer for DOM changes to enforce switcher and catalog list dot colors
  const domObserver = new MutationObserver(() => {
    // Color correct switcher dropdown dots
    const menu = document.getElementById('book-dropdown-menu');
    if (menu && menu.style.display === 'block') {
      const items = menu.querySelectorAll('.book-dd-item');
      items.forEach(item => {
        const bookId = item.dataset.id;
        if (bookId && window.isTestBookId && window.isTestBookId(bookId)) {
          const dot = item.querySelector('div[style*="width:8px"]');
          if (dot && dot.style.background !== 'rgb(139, 92, 246)' && dot.style.background !== '#8b5cf6') {
            dot.style.background = '#8b5cf6';
          }
        }
      });
    }

    // Color correct catalog manager list dots
    const testList = document.getElementById('test-catalog-list');
    if (testList) {
      const dots = testList.querySelectorAll('.catalog-dot');
      dots.forEach(dot => {
        if (dot.style.background !== 'rgb(139, 92, 246)' && dot.style.background !== '#8b5cf6') {
          dot.style.background = '#8b5cf6';
        }
      });
    }
  });

  // Start DOM child observation
  domObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Run once immediately on load
  if (typeof window.getBook === 'function') {
    const book = window.getBook();
    if (book && window.isTestBookId && window.isTestBookId(book.id)) {
      document.documentElement.style.setProperty('--book-accent', '#8b5cf6');
      document.documentElement.style.setProperty('--book-accent-bg', 'rgba(139, 92, 246, 0.1)');
      document.documentElement.style.setProperty('--body-bg-tint', 'rgba(139, 92, 246, 0.06)');
      const dot = document.getElementById('book-dropdown-dot');
      if (dot) dot.style.background = '#8b5cf6';
    }
  }
})();
