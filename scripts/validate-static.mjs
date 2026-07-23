import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const mustContain = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
};
const mustNotContain = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
};

const [indexHtml, layout, styles, loading, workshop, gallery, products, migration, adminRoute, mediaHelper, mediaPicker, adminPage] = await Promise.all([
  read('apps/web/index.html'),
  read('apps/web/src/components/Layout.tsx'),
  read('apps/web/src/styles.css'),
  read('apps/web/src/components/Loading.tsx'),
  read('apps/web/src/pages/WorkshopPage.tsx'),
  read('apps/web/src/pages/GalleryPage.tsx'),
  read('apps/web/src/pages/ProductsPage.tsx'),
  read('db/migrations/0010_relative_media_and_accessibility.sql'),
  read('apps/api/src/routes/admin.ts'),
  read('apps/api/src/lib/media.ts'),
  read('apps/web/src/components/MediaLibraryPicker.tsx'),
  read('apps/web/src/pages/AdminPage.tsx'),
]);

mustContain(indexHtml, 'width=device-width, initial-scale=1.0', 'viewport');
mustNotContain(indexHtml, 'user-scalable=no', 'viewport');
mustNotContain(indexHtml, 'maximum-scale=1', 'viewport');
mustContain(layout, 'skip-link', 'keyboard navigation');
mustContain(layout, 'id="main-content"', 'main landmark');
mustContain(styles, ':focus-visible', 'focus indicator');
mustContain(styles, '@media(prefers-reduced-motion:reduce)', 'reduced motion');
mustContain(styles, '--muted:#6F5961', 'AA secondary-text contrast token');
mustContain(loading, 'aria-live="polite"', 'status announcements');
mustContain(loading, 'role="alert"', 'error announcements');
mustContain(workshop, 'WorkshopAccessibility', 'workshop accessibility information');
mustContain(workshop, 'role="dialog"', 'registration modal semantics');
mustContain(workshop, 'useDialogFocusTrap', 'registration modal keyboard trap');
mustContain(gallery, 'useDialogFocusTrap', 'gallery lightbox keyboard trap');
mustContain(products, 'useDialogFocusTrap', 'product checkout keyboard trap');
mustContain(migration, "accessibility_entrance", 'venue accessibility schema');
mustContain(migration, 'טרם נמסר אישור על בדיקת נגישות מקצועית מלאה', 'truthful accessibility statement');
mustNotContain(migration, '## פטור', 'unverified exemption');
mustContain(mediaHelper, 'mediaUrlFromKey', 'canonical media helper');
mustContain(mediaHelper, 'return `/api/media/', 'relative media URL');
mustContain(adminRoute, "admin.get('/media/integrity'", 'R2 integrity checker');
mustContain(adminRoute, "admin.get('/media/library'", 'searchable media library endpoint');
mustContain(adminRoute, "admin.post('/gallery/from-asset'", 'reuse existing asset in gallery');
mustContain(mediaPicker, 'useDialogFocusTrap', 'media picker keyboard trap');
mustContain(mediaPicker, "placeholder=\"שם קובץ, כותרת, תיאור או object key\"", 'media library search');
mustContain(adminPage, 'בחירה מהגלריה / ספריית המדיה', 'image inputs reuse existing media');
mustNotContain(adminRoute, '`${c.env.PUBLIC_APP_URL}/api/media/', 'absolute uploaded-media URL');

console.log('✓ static accessibility safeguards: keyboard, focus, announcements, zoom and modal behavior');
console.log('✓ workshop venue accessibility metadata and truthful statement are present');
console.log('✓ media storage is canonical by R2 object_key and served with relative URLs');
console.log('✓ searchable reusable media library is wired to image fields and gallery management');
console.log('STATIC VALIDATION PASSED');
