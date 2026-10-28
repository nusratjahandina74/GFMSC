# GFMSC Frontend Deployment Guide for Vercel

## 📋 Step-by-Step Checklist for Global Deployment on Vercel

1. **Prepare Your Repository**
   - Push your frontend code (including `vercel.json` and `src/services/api.js`) to your preferred Git repository (GitHub, GitLab, or Bitbucket).

2. **Import Project into Vercel**
   - Log into [Vercel Dashboard](https://vercel.com/).
   - Click "Add New Project".
   - Select your Git repository and click "Import".

3. **Configure Build Settings**
   - In the Vercel project setup:
     - Leave **Framework Preset** as Vite (auto-detected).
     - **Root Directory**: If your frontend is in a subdirectory (like `/frontend`), set it here. Otherwise, keep as `.`.
     - **Build Command**: `npm run build`
     - **Output Directory**: `dist`

4. **Add Environment Variables**
   - In the Vercel project setup, under **Environment Variables**:
     - Add a new variable:
       - Name: `VITE_API_BASE_URL`
       - Value: Your deployed backend API URL (e.g., `https://your-backend-domain.com`)
     - Click "Add".

5. **Deploy the Project**
   - Click "Deploy" to start your first build!
   - Vercel will build your project and provide a deployment URL (like `https://gfmsc.vercel.app`).

6. **Test Your Deployment**
   - After deployment completes, open the provided URL to verify that:
     - All pages load correctly.
     - Navigating to different routes and refreshing the page doesn't show a 404.
     - All buttons (Add New, Edit, Delete, Submit) are visible and functional in both light and dark modes.
     - API calls to your backend work correctly.

## 📄 Key Files Created/Updated
1. `vercel.json`: Configures SPA routing for Vercel
2. `src/services/api.js`: Dynamic API base URL using Vite environment variables
