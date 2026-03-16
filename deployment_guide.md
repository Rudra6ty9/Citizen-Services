# 🚀 Vercel Deployment Guide for Vadodara Connect

Follow these steps to host your project on Vercel:

## 1. Push to GitHub
If you haven't already, push your code to a GitHub repository:
```powershell
git init
git add .
git commit -m "Prepare for Vercel deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## 2. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **"Add New..."** → **"Project"**.
3. **Import** your repository.
4. In the **Environment Variables** section, add the following:
   - `DATABASE_URL`: (Your Neon PostgreSQL connection string from `.env`)
   - `PORT`: `3000`
5. Click **Deploy**.

## 3. Important Notes
- **Static Files**: Vercel is configured to serve your frontend files from the `project/` folder.
- **Database**: Your `server.js` will automatically run the schema initialization on startup.
- **Serverless**: Vercel runs your Express app as a serverless function. Large file uploads may be subject to Vercel's body size limits.

Your site should be live at `https://YOUR_PROJECT_NAME.vercel.app`!
