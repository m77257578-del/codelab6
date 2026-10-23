# CodeLab | كود لاب

## التشغيل محلياً
npm install
npm run dev

## النشر على Vercel
1. ارفع مجلد المشروع إلى GitHub (أو شغّل `npx vercel` من داخله).
2. في Vercel: Add New > Project > اختر المستودع (Framework: Next.js يُكتشف تلقائياً).
3. Settings > Environment Variables: أضف المتغيرات من ملف .env.example (كلها اختيارية).
4. Deploy.

بدون أي متغيرات تعمل المنصة بالكامل محلياً على جهاز المستخدم.
لتفعيل الحسابات الحقيقية والرفع: أنشئ مشروع Supabase وشغّل supabase-setup.sql.
