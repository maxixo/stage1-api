const endpoint = '/api/profiles';
const filterExample = '/api/profiles?gender=male&country_id=NG';
const idExample = '/api/profiles/b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12';

export default function HomePage() {
  return (
    <main style={styles.main}>
      <section style={styles.hero}>
        <p style={styles.kicker}>Profile API</p>
        <h1 style={styles.title}>Spec-compliant profile enrichment and retrieval.</h1>
        <p style={styles.description}>
          This service accepts a name, enriches it with gender, age, and
          nationality signals, classifies the age group, stores the result
          idempotently in MongoDB, and exposes list, fetch, and delete routes.
        </p>
        <div style={styles.actions}>
          <a href={endpoint} style={styles.link}>
            Endpoint
          </a>
          <a href={filterExample} style={styles.secondaryLink}>
            Filtered GET
          </a>
          <span style={styles.badge}>GET, POST, DELETE</span>
        </div>
      </section>

      <section style={styles.grid}>
        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>List</h2>
          <pre style={styles.code}>{`GET ${filterExample}`}</pre>
        </article>

        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>Create</h2>
          <pre style={styles.code}>{`POST ${endpoint}
Content-Type: application/json

{
  "name": "ella"
}`}</pre>
        </article>
      </section>

      <section style={styles.grid}>
        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>Fetch By ID</h2>
          <pre style={styles.code}>{`GET ${idExample}`}</pre>
        </article>

        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>Delete</h2>
          <pre style={styles.code}>{`DELETE ${idExample}`}</pre>
        </article>
      </section>

      <section style={styles.grid}>
        <article style={styles.panel}>
          <h2 style={styles.sectionTitle}>Behavior</h2>
          <ul style={styles.list}>
            <li>Enriches from three external APIs concurrently</li>
            <li>Classifies age as child, teenager, adult, or senior</li>
            <li>Lists stored profiles with optional case-insensitive filters</li>
            <li>Prevents duplicates with MongoDB uniqueness and idempotent POST</li>
          </ul>
        </article>

        <article style={styles.panel}>
          <h2 style={styles.sectionTitle}>Responses</h2>
          <ul style={styles.list}>
            <li>`200` for successful GET list, GET by id, or repeated POST</li>
            <li>`201` for a new stored profile</li>
            <li>`204` for a successful delete</li>
            <li>`400`, `422`, `404`, `502`, or `500` for error paths</li>
          </ul>
        </article>
      </section>
    </main>
  );
}

const styles = {
  main: {
    display: 'grid',
    gap: '1.5rem',
    maxWidth: '960px',
    margin: '0 auto',
    padding: '3rem 1.25rem 4rem',
  },
  hero: {
    padding: '2rem',
    borderRadius: '28px',
    background: 'rgba(255, 252, 246, 0.84)',
    boxShadow: '0 24px 70px rgba(58, 47, 31, 0.12)',
    border: '1px solid rgba(69, 53, 30, 0.12)',
  },
  kicker: {
    margin: 0,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    fontSize: '0.8rem',
    color: '#7b5b34',
  },
  title: {
    margin: '0.75rem 0 1rem',
    fontSize: 'clamp(2.2rem, 5vw, 4.4rem)',
    lineHeight: 1.02,
  },
  description: {
    maxWidth: '44rem',
    margin: 0,
    fontSize: '1.05rem',
    lineHeight: 1.7,
    color: '#3e483f',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
    marginTop: '1.5rem',
  },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.8rem 1.2rem',
    borderRadius: '999px',
    background: '#233329',
    color: '#f8f3ea',
    textDecoration: 'none',
    fontWeight: 600,
  },
  secondaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.8rem 1.2rem',
    borderRadius: '999px',
    background: 'rgba(35, 51, 41, 0.08)',
    color: '#233329',
    textDecoration: 'none',
    fontWeight: 600,
  },
  badge: {
    padding: '0.6rem 0.9rem',
    borderRadius: '999px',
    background: 'rgba(35, 51, 41, 0.08)',
    color: '#233329',
    fontSize: '0.92rem',
  },
  card: {
    padding: '1.5rem',
    borderRadius: '24px',
    background: 'rgba(255, 251, 244, 0.88)',
    boxShadow: '0 18px 50px rgba(58, 47, 31, 0.1)',
    border: '1px solid rgba(69, 53, 30, 0.1)',
    minWidth: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1.25rem',
  },
  panel: {
    padding: '1.5rem',
    borderRadius: '24px',
    background: 'rgba(255, 251, 244, 0.88)',
    boxShadow: '0 18px 50px rgba(58, 47, 31, 0.1)',
    border: '1px solid rgba(69, 53, 30, 0.1)',
  },
  sectionTitle: {
    margin: '0 0 1rem',
    fontSize: '1.25rem',
  },
  code: {
    margin: 0,
    overflowX: 'auto',
    padding: '1rem',
    borderRadius: '16px',
    background: '#1f2a24',
    color: '#f4ecde',
    fontSize: '0.95rem',
    lineHeight: 1.6,
  },
  list: {
    margin: 0,
    paddingLeft: '1.25rem',
    lineHeight: 1.8,
    color: '#3e483f',
  },
};
