// Test Profile Tint Fix Override Script
// Loaded after src/main.js to wrap global handlers and ensure color consistency.

(function() {
  // Hex to RGBA converter helper
  function hexToRgba(hex, alpha) {
    if (!hex) return 'transparent';
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Helper to ensure test books are always violet/purple
  function applyTestBookOverrides() {
    if (window.BOOKS) {
      Object.keys(window.BOOKS).forEach(id => {
        if (window.isTestBookId && window.isTestBookId(id)) {
          window.BOOKS[id].accent = '#8b5cf6';
          window.BOOKS[id].accentBg = 'rgba(139, 92, 246, 0.1)';
        }
      });
      if (typeof window.BOOK_LIST !== 'undefined') {
        window.BOOK_LIST = Object.values(window.BOOKS);
      }
    }
  }

  // 1. Wrap loadCatalog
  const originalLoadCatalog = window.loadCatalog;
  if (originalLoadCatalog) {
    window.loadCatalog = async function() {
      const res = await originalLoadCatalog();
      applyTestBookOverrides();
      return res;
    };
  }

  // 2. Wrap saveCatalogWithDeletions
  const originalSaveCatalogWithDeletions = window.saveCatalogWithDeletions;
  if (originalSaveCatalogWithDeletions) {
    window.saveCatalogWithDeletions = async function() {
      applyTestBookOverrides();
      return await originalSaveCatalogWithDeletions();
    };
  }

  // 3. Wrap switchBook to apply CSS overrides dynamically
  const originalSwitchBook = window.switchBook;
  if (originalSwitchBook) {
    window.switchBook = function(bookId) {
      originalSwitchBook(bookId);
      
      // Override accent colors if it's the test book
      if (window.isTestBookId && window.isTestBookId(bookId)) {
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
        const isTest = window.isTestBookId && window.isTestBookId(bookId);
        if (isTest) {
          bodyBgTint = 'rgba(139, 92, 246, 0.03)';
        } else if (window.BOOKS && window.BOOKS[bookId]) {
          const accent = window.BOOKS[bookId].accent;
          if (accent) {
            bodyBgTint = hexToRgba(accent, 0.03);
          }
        }
      }
      document.documentElement.style.setProperty('--body-bg-tint', bodyBgTint);
    };
  }

  // 4. Wrap seedMockTestData to fix colors post-seeding
  const originalSeedMockTestData = window.seedMockTestData;
  if (originalSeedMockTestData) {
    window.seedMockTestData = async function() {
      await originalSeedMockTestData();
      applyTestBookOverrides();
      if (window.activeBook && window.isTestBookId(window.activeBook)) {
        window.switchBook(window.activeBook);
      }
      if (typeof window.renderCatalogList === 'function') {
        window.renderCatalogList();
      }
    };
  }

  // Run initial override in case catalog was already loaded
  applyTestBookOverrides();
  if (window.activeBook) {
    window.switchBook(window.activeBook);
  }
})();
