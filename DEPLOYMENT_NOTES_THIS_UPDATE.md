# GFMSC — এই আপডেটে যা করা হয়েছে ও আপনার যা করতে হবে

এই ফাইলটা এই সেশনে করা সব fix-এর সারসংক্ষেপ, এবং সবচেয়ে গুরুত্বপূর্ণ —
**আপনাকে যা করতে হবে (শুধু কোড push করলেই হবে না)।**

---

## 🔴 অংশ ১: আপনাকে অবশ্যই করতে হবে (কোড fix যথেষ্ট না)

### ১. পুরনো orphaned account পরিষ্কার করুন (একবার রান করুন)
Teacher/Staff delete করার সময় তাদের login account (User) মুছে যেত না — এই
bug-টা code-এ ফিক্স হয়ে গেছে, কিন্তু **আগে থেকে delete করা সব
teacher/staff-এর জন্য এখনও ডাটাবেজে আটকে থাকা orphaned account আছে**।
এগুলো পরিষ্কার না করলে সেই email দিয়ে আর নতুন করে কাউকে add করা যাবে না।

```bash
cd backend
node src/scripts/cleanupOrphanedAccounts.js
```

এটা শুধু broken/orphaned রেকর্ড মুছবে, বৈধ কোনো teacher/staff-এর ক্ষতি
করবে না। একবার রান করলেই যথেষ্ট।

### ২. Render/deployment-এ Environment Variables সেট করুন
নিচের env var গুলো ছাড়া email/payment related কিছু কাজ করবে না —
এগুলো কোড দিয়ে ঠিক করা সম্ভব না, deployment platform-এ (Render) গিয়ে
সেট করতে হবে:

| Variable | কী জন্য | না দিলে কী হবে |
|---|---|---|
| `RESEND_API_KEY` | Signup verification email, forgot-password email, Contact form email | Email কখনো পাঠাবে না |
| `RESEND_FROM` | উপরেরটার সাথেই লাগবে | একই |
| `CONTACT_TO` | Contact form-এর message কোথায় যাবে | না দিলে এখন default হিসেবে `ictgbsks@gmail.com`-এ যাবে (কোডে hardcode করে দিয়েছি) — চাইলে ভিন্ন email set করতে পারবেন |
| `JWT_REFRESH_SECRET` | Login session security | না দিলে একটা default ব্যবহার হবে (dev-এ ঠিক আছে, কিন্তু production-এ নিজের গোপন secret সেট করা উচিত) |
| `BKASH_APP_KEY` / `BKASH_APP_SECRET` / `BKASH_USERNAME` / `BKASH_PASSWORD` | আসল bKash payment (live) | না দিলে "Sandbox Demo" mode-এ payment flow কাজ করবে (টেস্ট করা যাবে, কিন্তু আসল টাকা কাটবে না) |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASS` | আসল SSLCommerz payment (live) | একই — sandbox demo mode |

**Payment টেস্ট করতে চাইলে**: bKash/SSLCommerz এর merchant credentials
সেট না করলেও চলবে — সিস্টেম নিজে থেকে "Sandbox Demo" mode-এ চলে যাবে,
পুরো payment flow (invoice paid হওয়া, SMS যাওয়া) টেস্ট করা যাবে টাকা
আসলে না কেটেই।

### ৩. Backend redeploy করুন
Library/Transport/Payroll-এ যে "404" error আসছিল, code-level এ আমি কোনো
bug পাইনি — route/controller সব ঠিকভাবে মেলানো আছে। সবচেয়ে বেশি সম্ভাবনা:
আপনার লাইভ Render backend পুরনো কোড চালাচ্ছে। **এই zip-এর নতুন কোড
deploy করার পর** যদি এখনও 404 আসে, আমাকে exact error message/URL
জানাবেন, আমি সরাসরি সেটা ধরব।

---

## ✅ অংশ ২: এই সেশনে যা fix করা হয়েছে (কোড-লেভেলে সম্পূর্ণ)

### Critical Security Fixes
- **Self-registration দিয়ে যে কেউ SuperAdmin বনতে পারত** — এখন fix, public
  registration সবসময় শুধু schoolAdmin বানায়।
- **`POST /api/superadmin` সম্পূর্ণ unprotected ছিল** — এখন একবার superAdmin
  তৈরি হয়ে গেলে এই endpoint চিরতরে বন্ধ হয়ে যায়।
- **Guardian IDOR** — অন্য guardian-এর প্রোফাইল/বাচ্চাদের তথ্য দেখা/এডিট করা
  যেত।
- **Student invoice/payment IDOR** — অন্য student-এর fee/dues তথ্য দেখা এবং
  তাদের হয়ে payment initiate করা যেত।
- **User suspend/activate endpoint-এ কোনো role restriction ছিল না** — যেকোনো
  logged-in account (এমনকি student-ও) অন্য কারো account suspend করতে
  পারত।
- **Password/sensitive data browser console-এ log হচ্ছিল** — login/register
  request-এর plaintext password পর্যন্ত console-এ দেখা যেত। সরানো হয়েছে।

### Data Integrity Fixes
- **Delete করলে login account থেকে যেত (orphaned account)** — Teacher/Staff
  delete করলে তাদের User login মুছত না, ফলে সেই email দিয়ে আর কখনো নতুন
  করে add করা যেত না। (উপরে ১নং দেখুন — cleanup script রান করতে হবে)
- **`roleDashboardController.js`-এ TypeScript syntax leak** ছিল যেটা পুরো
  backend server crash করাতে পারত।
- **Play/KG ক্লাস সিলেক্ট করলে validation crash** — ৪টা model (Student,
  Routine, ClassTeacher, ClassSubject) জুড়ে fix করা হয়েছে।
- **Payment gateway webhook সবসময় 401 দিয়ে reject হতো** — টাকা কাটলেও
  Invoice কখনো paid mark হতো না।
- **Attendance-এ hardcoded "1st period teacher" restriction** এখনো একটা
  জায়গায় (আসল authorization gate) রয়ে গিয়েছিল — সম্পূর্ণ সরানো হয়েছে।

### Feature/UX Fixes
- Notice Board এখন role-অনুযায়ী সঠিকভাবে filter হয় (student/teacher/
  staff/guardian প্রত্যেকে শুধু তাদের জন্য প্রযোজ্য নোটিশ দেখবে); শুধু
  schoolAdmin/superAdmin notice তৈরি করতে পারবে।
- Class Teacher-রা শুধু নিজেদের ক্লাসের attendance/marks-entry দেখবে;
  সাধারণ subject teacher-রা এগুলো দেখবে না।
- Student pagination — ২০ জন/পেজ, Previous/Next বাটন।
- Export to Excel (Students page), ID Card generation-এর আসল error
  message এখন দেখা যাবে (আগে generic message লুকিয়ে ফেলত)।
- Landing page: ভাঙা "Download Prospectus" বাটন সরানো হয়েছে, real feature
  list (১৫টা আইটেম) যোগ করা হয়েছে।
- Online Admissions page: স্পষ্ট "Open Form"/"Copy Link" বাটন।
- Contact form email এখন `ictgbsks@gmail.com`-এ যাবে (env var override
  করা যাবে)।

---

## ℹ️ অংশ ৩: Investigate করা হয়েছে, কোনো bug পাওয়া যায়নি

- **School Admin dashboard "সব 0" দেখানো**: `guardians` count missing
  ছিল, সেটা fix হয়েছে। বাকি counting logic সঠিক পাওয়া গেছে — সন্দেহ এটা
  orphaned-account bug-এর সাথেই যুক্ত ছিল (১নং দেখুন)।
- **Class Subjects "শুধু 9-10 দেখায়"**: এটা bug না — শুধু যেসব ক্লাসের
  জন্য subject তৈরি করা হয়েছে সেগুলোই দেখাবে, এটাই স্বাভাবিক আচরণ।
- **School Admin-এর student-edit field restriction**: backend logic
  schoolAdmin ও superAdmin-এর জন্য সমান — কোনো পার্থক্য পাওয়া যায়নি।

যদি এই তিনটার কোনোটা এখনও সমস্যা মনে হয়, deploy করার পর exact পরিস্থিতি/
error জানালে আরও গভীরে গিয়ে ধরব।
