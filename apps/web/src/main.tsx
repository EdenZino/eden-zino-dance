import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { PublicLayout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { WorkshopsPage } from './pages/WorkshopsPage';
import { WorkshopPage } from './pages/WorkshopPage';
import { PaymentMockPage, PaymentResultPage } from './pages/PaymentPages';
import { PortalPage } from './pages/PortalPage';
import { ContactPage, LegalPage } from './pages/StaticPages';
import { AdminPage } from './pages/AdminPage';
import { WaitlistInvitePage } from './pages/WaitlistInvitePage';
import { ProductsPage, ProductResultPage } from './pages/ProductsPage';
import { GalleryPage } from './pages/GalleryPage';
import { LanguageProvider, useLanguage } from './lib/language';
import './styles.css';

function NotFoundPage(){const {t}=useLanguage();return <div className="center-page"><h1>{t('העמוד לא נמצא','Page not found')}</h1><a href="/">{t('חזרה לבית','Back home')}</a></div>}

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
const router = createBrowserRouter([
  { element: <PublicLayout />, children: [
    { path: '/', element: <HomePage /> }, { path: '/workshops', element: <WorkshopsPage /> },
    { path: '/w/:code', element: <WorkshopPage /> }, { path: '/my-registration', element: <PortalPage /> },
    { path: '/payment/mock', element: <PaymentMockPage /> }, { path: '/payment/result', element: <PaymentResultPage /> },
    { path: '/products', element: <ProductsPage /> }, { path: '/products/result', element: <ProductResultPage /> },
    { path: '/gallery', element: <GalleryPage /> },
    { path: '/contact', element: <ContactPage /> }, { path: '/waitlist/:token', element: <WaitlistInvitePage /> }, { path: '/legal/:type', element: <LegalPage /> },
  ]},
  { path: '/admin/*', element: <AdminPage /> },
  { path: '*', element: <NotFoundPage /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><LanguageProvider><QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider></LanguageProvider></React.StrictMode>);
