# אתר WEBRIX

אתר סטטי (HTML אחד + תמונות), מוכן להעלאה ל-Vercel. אין צורך בבנייה או בהתקנת חבילות.

## העלאה ל-Vercel

**הדרך הקלה, דרך האתר:**
0. ב-Vercel: **Add New → Project** → בוחרים את המאגר `Webrix`, ובשדה **Root Directory** בוחרים `website`.
1. נכנסים ל-https://vercel.com ומתחברים (אפשר עם חשבון GitHub).
2. **Add New → Project**.
3. גוררים את התיקייה `webrix-site` לחלון, או מעלים אותה ל-GitHub ובוחרים אותה מהרשימה.
4. Framework Preset: **Other**. לא משנים שום הגדרה אחרת ולוחצים **Deploy**.

**דרך שורת הפקודה:**
```bash
cd webrix-site
npx vercel          # פעם ראשונה: התחברות ושאלות הגדרה (Enter לכל ברירות המחדל)
npx vercel --prod   # העלאה לכתובת הקבועה
```

## קישורי ההורדה
כפתורי ההורדה מפנים ל-https://github.com/alonweizpro/Webrix/releases/latest (הגדרה באובייקט `DOWNLOADS` בתחתית `index.html`).

**איך מכינים את קבצי ההתקנה:**
1. בתיקיית הדפדפן מריצים `npm run dist:win`. הקובץ נוצר בתיקייה `dist`.
2. במאגר `alonweizpro/Webrix` ב-GitHub → **Releases** → **Draft a new release** → מעלים את קובץ ה-`.exe`.

את קבצי ההתקנה לא שמים ב-Vercel עצמו, כי הם גדולים (כ-90MB). GitHub Releases מיועד בדיוק לזה, וההורדה ממנו חינמית.

## מבנה
```
index.html     כל האתר (עיצוב וקוד בתוך הקובץ)
vercel.json    הגדרות Vercel (כתובות נקיות, מטמון לתמונות)
img/           צילומי מסך ולוגו
```
