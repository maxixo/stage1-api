export const metadata = {
  title: 'Profile API',
  description: 'Name enrichment API powered by Next.js and MongoDB',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning style={styles.body}>
        {children}
      </body>
    </html>
  );
}

const styles = {
  body: {
    margin: 0,
    minHeight: '100vh',
    background:
      'radial-gradient(circle at top, #f7efe4 0%, #efe3d1 30%, #d6d8d2 100%)',
    color: '#1f2a24',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
};
