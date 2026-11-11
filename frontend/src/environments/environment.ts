export const environment = {
  production: false,
  /** Service worker is production-only; enable with a production build + HTTPS/localhost. */
  enableServiceWorker: false,
  apiUrl: 'http://localhost:3000/api',
  /** "Follow us" links shown in the top header. Leave a value empty to hide that icon. */
  social: {
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    website: 'https://schoolpro.ac.zw',
  },
};
