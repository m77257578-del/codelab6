// ضعه في: app/admin/layout.js — يجعل لوحة الأدمن تطبيقاً مستقلاً قابلاً للتثبيت
export const metadata = {
  title: 'CodeLab Admin',
  manifest: '/admin-manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CodeLab Admin', statusBarStyle: 'black-translucent' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
