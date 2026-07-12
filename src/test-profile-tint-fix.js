// Test Profile Tint Fix Override Script
// Loaded after src/main.js to wrap global handlers and ensure color consistency.

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

  // 1. Wrap switchBook to apply CSS overrides dynamically
  const originalSwitchBook = window.switchBook;
  if (originalSwitchBook) {
    window.switchBook = function(bookId) {
      originalSwitchBook(bookId);
      
      // Override accent colors if it's the test book
      const isTest = window.isTestBookId && window.isTestBookId(bookId);
      if (isTest) {
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
          bodyBgTint = 'rgba(139, 92, 246, 0.03)'; // 3% purple tint
        } else {
          // Read the accent color from the dropdown dot!
          const dot = document.getElementById('book-dropdown-dot');
          if (dot && dot.style.background) {
            bodyBgTint = convertToRgbaTint(dot.style.background, 0.03); // 3% opacity tint
          }
        }
      }
      document.documentElement.style.setProperty('--body-bg-tint', bodyBgTint);
    };
  }

  // 2. Wrap renderCatalogList to color-correct the catalog dots for test profile
  const originalRenderCatalogList = window.renderCatalogList;
  if (originalRenderCatalogList) {
    window.renderCatalogList = function() {
      originalRenderCatalogList();
      const testList = document.getElementById('test-catalog-list');
      if (testList) {
        const dots = testList.querySelectorAll('.catalog-dot');
        dots.forEach(dot => {
          dot.style.background = '#8b5cf6';
        });
      }
    };
  }

  // 3. Wrap buildBookSwitcher to override the dropdown dots
  const originalBuildBookSwitcher = window.buildBookSwitcher;
  if (originalBuildBookSwitcher) {
    window.buildBookSwitcher = function() {
      originalBuildBookSwitcher();
      const menu = document.getElementById('book-dropdown-menu');
      if (menu) {
        const items = menu.querySelectorAll('.book-dd-item');
        items.forEach(item => {
          const bookId = item.dataset.id;
          if (bookId && window.isTestBookId && window.isTestBookId(bookId)) {
            const dot = item.querySelector('div[style*="width:8px"]');
            if (dot) dot.style.background = '#8b5cf6';
          }
        });
      }
    };
  }

  // 4. Wrap seedMockTestData to fix colors post-seeding
  const originalSeedMockTestData = window.seedMockTestData;
  if (originalSeedMockTestData) {
    window.seedMockTestData = async function() {
      await originalSeedMockTestData();
      if (window.activeBook && window.isTestBookId(window.activeBook)) {
        window.switchBook(window.activeBook);
      }
    };
  }

  // Run initial override on load in case catalog was already loaded
  if (window.activeBook) {
    window.switchBook(window.activeBook);
  }
})();
