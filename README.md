# Zyeeque

A modern cryptocurrency charting application built with Next.js, Tailwind CSS, and Lightweight Charts.

## Features

- Real-time or historical charting data.
- Interactive charting using TradingView's lightweight-charts.
- Responsive and modern UI with Tailwind CSS.
- Secure dashboard with authentication.

## Getting Started

### Environment Variables

Before running the application, you need to set up your environment variables for authentication. 
Copy the provided `.env.example` file to create a `.env.local` file:

```bash
cp .env.example .env.local
```
Or manually create `.env.local` and copy the contents from `.env.example`.

Update the variables in `.env.local` with your own secure values:
- `AUTH_USERNAME`: Username for dashboard login
- `AUTH_PASSWORD`: Password for dashboard login
- `AUTH_SECRET`: Secret key for session cookies (generate a secure random sequence, e.g., using `openssl rand -base64 32`)

### Installation

First, install the dependencies if you haven't already:

```bash
npm install
```

### Running the App

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Charts:** [Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- **Icons:** [Lucide React](https://lucide.dev/)
