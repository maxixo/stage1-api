const endpoint = '/api/profiles';
const listExample =
  '/api/profiles?gender=female&country_id=NG&min_age=20&max_age=35&sort_by=gender_probability&order=desc&page=1&limit=10';
const searchExample =
  '/api/profiles/search?q=young%20females%20from%20nigeria&page=1&limit=5';
const idExample = '/api/profiles/018f4f5c-6a90-7a33-b9d8-3c4f0e8b9f7a';
const seedCommand = `npm run seed\n\n# optional custom source\nnpm run seed -- "https://drive.google.com/uc?export=download&id=1Up06dcS9OfUEnDj_u6OV_xTRntupFhPH"`;
const listResponseExample = `{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [
    {
      "id": "018f4f5c-6a90-7a33-b9d8-3c4f0e8b9f7a",
      "name": "ella",
      "gender": "female",
      "gender_probability": 0.98,
      "age": 28,
      "age_group": "adult",
      "country_id": "NG",
      "country_name": "Nigeria",
      "country_probability": 0.64,
      "created_at": "2026-04-15T08:00:00Z"
    }
  ]
}`;

export default function HomePage() {
  return (
    <main style={styles.main}>
      <section style={styles.hero}>
        <p style={styles.kicker}>Profile API</p>
        <h1 style={styles.title}>Spec-compliant profile enrichment and retrieval.</h1>
        <p style={styles.description}>
          This service enriches names into spec-compliant stored profiles,
          supports advanced AND-style filtering, validated sorting and
          pagination, deterministic natural-language search, and idempotent
          seeding into MongoDB.
        </p>
        <div style={styles.actions}>
          <a href={endpoint} style={styles.link}>
            List Endpoint
          </a>
          <a href={searchExample} style={styles.secondaryLink}>
            Search Example
          </a>
          <span style={styles.badge}>GET, POST, DELETE, SEARCH</span>
        </div>
      </section>

      <section style={styles.grid}>
        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>Advanced List</h2>
          <pre style={styles.code}>{`GET ${listExample}`}</pre>
        </article>

        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>Natural-Language Search</h2>
          <pre style={styles.code}>{`GET ${searchExample}`}</pre>
        </article>
      </section>

      <section style={styles.grid}>
        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>Create</h2>
          <pre style={styles.code}>{`POST ${endpoint}
Content-Type: application/json

{
  "name": "ella"
}`}</pre>
        </article>

        <article style={styles.card}>
          <h2 style={styles.sectionTitle}>Seed Pipeline</h2>
          <pre style={styles.code}>{seedCommand}</pre>
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
          <h2 style={styles.sectionTitle}>Capabilities</h2>
          <ul style={styles.list}>
            <li>Enriches from three external APIs concurrently</li>
            <li>Classifies age as child, teenager, adult, or senior</li>
            <li>Supports combined filters, validated sort fields, and capped pagination</li>
            <li>Parses rule-based search phrases like `young females from nigeria`</li>
            <li>Seeds the 2026 dataset idempotently by normalized name</li>
          </ul>
        </article>

        <article style={styles.panel}>
          <h2 style={styles.sectionTitle}>Response Shape</h2>
          <pre style={styles.code}>{listResponseExample}</pre>
        </article>
      </section>

      <section style={styles.grid}>
        <article style={styles.panel}>
          <h2 style={styles.sectionTitle}>Validation</h2>
          <ul style={styles.list}>
            <li>List and search queries return `Invalid query parameters` on bad filters</li>
            <li>Uninterpretable search phrases return `Unable to interpret query`</li>
            <li>Prevents duplicates with MongoDB uniqueness and idempotent POST</li>
          </ul>
        </article>

        <article style={styles.panel}>
          <h2 style={styles.sectionTitle}>Responses</h2>
          <ul style={styles.list}>
            <li>`200` for successful list, search, fetch by id, or repeated POST</li>
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
