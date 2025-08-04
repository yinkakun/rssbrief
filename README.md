# RSSBrief

A personalized RSS feed reader that generates AI-powered summaries of feeds you follow and delivers them on your schedule.

## Features

### AI Powered Summaries

- **Concise Mode**: Brief, focused summaries highlighting essential information
- **Detailed Mode**: Comprehensive summaries with context and explanations
- Powered by OpenAI GPT-4o-mini

### Scheduled Delivery

- Customizable delivery schedule (hour, day of week, timezone)
- Automatic feed updates every 6 hours
- Weekly digest emails for users with email notifications enabled

### Topic Management

- Organize RSS feeds into custom topics
- Filter briefs by topic
- Bookmark topics for quick access

## Stack

### Backend

- **Convex**: Real-time database and backend platform
- **TypeScript**: Type-safe development
- **OpenAI API**: AI-powered content summarization
- **Resend**: Email delivery service
- **Jina AI**: Content extraction from web pages

### Frontend

- **TanStack Router**: Type-safe routing
- **TanStack Query**: Server state management
- **Tailwind CSS**: Utility-first styling
- **Radix UI**: Accessible component primitives

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Convex account and project
- OpenAI API key
- Resend API key (for email notifications)

### Installation

1. **Clone the repository**

   ```bash
   git clone github.com/yinkakun/rssbrief
   cd rssbrief
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file with:

   ```env
   VITE_CONVEX_URL=your_convex_url
   OPENAI_API_KEY=your_openai_key
   RESEND_API_KEY=your_resend_key
   ```

4. **Start development server**

   ```bash
   pnpm dev
   ```

### Development Scripts

- `pnpm dev`: Start development environment
- `pnpm build`: Build for production
- `pnpm format`: Format code with Prettier
