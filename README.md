# AI SiteBuilder 🚀

AI SiteBuilder is a modern, full-stack MERN application that allows users to generate complete, production-ready, single-page websites instantly using AI. Built with performance and reliability in mind, it features a robust multi-provider AI fallback system, Stripe integration for credits, and a seamless revision workflow.

## ✨ Features

- **Instant AI Website Generation**: Describe your website, and AI will build it using HTML and Tailwind CSS.
- **Smart Prompt Enhancement**: Automatically expands simple user requests into detailed, actionable design prompts.
- **Multi-Provider AI Fallback**: 
  - **Google Gemini** (Primary)
  - **OpenRouter** (Secondary fallback with auto-model selection)
  - **Groq** (Tertiary fallback for ultra-fast Llama 3 models)
- **Interactive Preview & Revisions**: Preview generated sites in real-time and request specific changes via chat.
- **Stripe Integration**: Secure credit purchase system with automated webhook handling.
- **Modern Tech Stack**: React 19, Express 5, Prisma (Neon/PostgreSQL), and Better-Auth.
- **Vercel Optimized**: Built-in support for Vercel Serverless Functions with `waitUntil` for long-running AI tasks.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS 4
- **Routing**: React Router 7
- **Icons**: Lucide React
- **Notifications**: Sonner

### Backend
- **Runtime**: Node.js (Express 5)
- **Database**: PostgreSQL (Neon DB)
- **ORM**: Prisma
- **Authentication**: Better-Auth
- **Payment**: Stripe

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database (Neon.tech recommended)
- API Keys: Google AI (Gemini), Stripe, OpenRouter (Optional), Groq (Optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/ai-sitebuilder.git
   cd ai-sitebuilder
   ```

2. **Server Setup**
   ```bash
   cd server
   npm install
   ```
   Create a `.env` file in the `server` directory:
   ```env
   DATABASE_URL="your_postgresql_url"
   BETTER_AUTH_SECRET="your_auth_secret"
   BETTER_AUTH_URL="http://localhost:3000"
   GOOGLE_GENERATIVE_AI_API_KEY="your_gemini_key"
   STRIPE_SECRET_KEY="your_stripe_secret"
   STRIPE_WEBHOOK_SECRET="your_webhook_secret"
   OPENROUTER_API_KEY="optional"
   GROQ_API_KEY="optional"
   TRUSTED_ORIGINS="http://localhost:5173"
   ```
   Initialize database:
   ```bash
   npx prisma db push
   ```

3. **Client Setup**
   ```bash
   cd ../client
   npm install
   ```
   Create a `.env` file in the `client` directory:
   ```env
   VITE_API_URL="http://localhost:3000"
   ```

4. **Run the Application**
   - **Server**: `npm run server` (starts on port 3000)
   - **Client**: `npm run dev` (starts on port 5173)

## 🏗️ Architecture

- **Polling Logic**: The frontend polls the server every 3 seconds during generation to provide a real-time status updates.
- **Optimistic UI**: Chat messages are reflected instantly to ensure a smooth user experience.
- **Vercel Functions**: Uses `waitUntil` in production to bypass serverless execution timeouts for heavy AI generation.

## 📄 License

This project is licensed under the ISC License.

---
Built with ❤️ using the MERN stack.
