'use client';
// ضعه في: app/admin/page.js  — يفتح المنصة مباشرة على لوحة الأدمن (تطبيق الأدمن)
import CodeLab from '../page';

export default function AdminPage() {
  return <CodeLab startScreen="admin" />;
}
