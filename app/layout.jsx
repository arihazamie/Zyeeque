import "@/app/globals.css";

export const metadata = {
  title: "Zyeeque",
  description: "Professional Zyeeque real-time charting terminal."
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
